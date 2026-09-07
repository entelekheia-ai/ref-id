// SPDX-License-Identifier: Apache-2.0
//
// Percent-encode/decode helpers driven by an `encoding.<name>.table` from the spec — never a
// hardcoded character list. Which table applies to a form is the form's own `encoding` field.

use crate::spec::Spec;
use serde_json::Value;

/// The encoding table a form declares, or none when the form declares no encoding.
pub(crate) fn table_for(spec: &Spec, form: &Value) -> Vec<(String, String)> {
    match form.get("encoding").and_then(Value::as_str) {
        Some(name) => spec.table(&["encoding", name, "table"]),
        None => Vec::new(),
    }
}

pub(crate) fn contains_any(raw: &str, characters: &[char]) -> bool {
    raw.chars().any(|c| characters.contains(&c))
}

/// One left-to-right pass over the source characters; a produced percent-form is never re-scanned.
pub(crate) fn encode(raw: &str, table: &[(String, String)]) -> String {
    if table.is_empty() {
        return raw.to_string();
    }
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        match table.iter().find(|(k, _)| k.chars().next() == Some(c) && k.chars().count() == 1) {
            Some((_, form)) => out.push_str(form),
            None => out.push(c),
        }
    }
    out
}

/// One left-to-right pass over the encoded text; decoding `%2523` yields `%23`, never `#`.
pub(crate) fn decode(encoded: &str, table: &[(String, String)]) -> String {
    if table.is_empty() {
        return encoded.to_string();
    }
    let mut out = String::with_capacity(encoded.len());
    let mut rest = encoded;
    while !rest.is_empty() {
        if let Some((character, form)) = table.iter().find(|(_, form)| rest.starts_with(form.as_str())) {
            out.push_str(character);
            rest = &rest[form.len()..];
        } else {
            let c = rest.chars().next().unwrap();
            out.push(c);
            rest = &rest[c.len_utf8()..];
        }
    }
    out
}

/// True when every `%` in the value begins one of the table's percent-forms — the strict nested encoding.
pub(crate) fn strictly_encoded(value: &str, table: &[(String, String)]) -> bool {
    value.match_indices('%').all(|(at, _)| table.iter().any(|(_, form)| value[at..].starts_with(form.as_str())))
}
