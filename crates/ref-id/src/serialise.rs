// SPDX-License-Identifier: Apache-2.0
//
// Reassembles a ParseResult into the exact bytes it was parsed from. Every part is emitted verbatim.

use crate::grammar::{scheme_prefix, FIELD, FRAGMENT_INTRODUCER, PAIR};
use crate::spec::load_spec;
use crate::types::{Pair, ParseResult, RefIdError};

fn pairs(entries: &[Pair], separator: &str) -> String {
    entries.iter().map(|p| format!("{}{PAIR}{}", p.key, p.value)).collect::<Vec<_>>().join(separator)
}

/// `serialise(parse(s)) == s` for every parseable input, including uncovered and unsupported ones.
/// A malformed result has no faithful form and is refused.
pub fn serialise(parsed: &ParseResult) -> Result<String, RefIdError> {
    let spec = load_spec()?;
    if parsed.status == spec.status("malformed")? {
        return Err(RefIdError::Serialise {
            part: spec.part(parsed.part.as_deref().unwrap_or("grammar"))?,
            message: "a malformed identifier cannot be serialised without losing the part that failed".into(),
        });
    }
    let mut out = scheme_prefix(spec);
    if parsed.explicit_version {
        out.push_str(parsed.version_text.as_deref().unwrap_or(&parsed.version.to_string()));
        out.push_str(FIELD);
    }
    out.push_str(&parsed.r#type);
    out.push_str(FIELD);
    out.push_str(&parsed.locator);
    if !parsed.qualifiers.is_empty() {
        let separator = spec.string(&["grammar", "state", "separator"]);
        out.push_str(separator);
        out.push_str(&pairs(&parsed.qualifiers, separator));
    }
    if let Some(fragment) = &parsed.fragment {
        out.push_str(FRAGMENT_INTRODUCER);
        out.push_str(&fragment.path);
        if !fragment.refinements.is_empty() {
            let separator = spec.string(&["grammar", "fragment", "separator"]);
            out.push_str(separator);
            out.push_str(&pairs(&fragment.refinements, separator));
        }
    }
    Ok(out)
}
