// SPDX-License-Identifier: Apache-2.0
//
// The canonical serialisation `spec.canonicalisation.rules` fix: object keys sorted by UTF-16 code
// unit, no whitespace outside strings, strings escaped exactly as ECMAScript JSON.stringify does,
// integers only.

use crate::types::RefIdError;
use serde_json::Value;

/// ECMAScript JSON.stringify's string escaping: quote, backslash and control characters only.
pub(crate) fn escape(string: &str, out: &mut String) {
    out.push('"');
    for c in string.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write(value: &Value, out: &mut String) -> Result<(), RefIdError> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                out.push_str(&i.to_string());
            } else if let Some(u) = n.as_u64() {
                out.push_str(&u.to_string());
            } else {
                return Err(RefIdError::SpecIntegrity(format!("canonicalisation covers integers only, got {n}")));
            }
        }
        Value::String(s) => escape(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(item, out)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                escape(key, out);
                out.push(':');
                write(&map[*key], out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

/// The canonical serialisation this crate computes the specification digest over.
pub fn canonicalise(value: &Value) -> Result<String, RefIdError> {
    let mut out = String::new();
    write(value, &mut out)?;
    Ok(out)
}
