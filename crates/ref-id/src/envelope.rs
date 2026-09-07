// SPDX-License-Identifier: Apache-2.0
//
// The envelope invariant from spec.envelope: an identifier carrying a digest is admissible only
// with an object whose sets entry for that qualifier recomputes to it, served under its own id.

use crate::digest::digest;
use crate::grammar::Grammar;
use crate::parse::parse;
use crate::spec::load_spec;
use crate::types::{EnvelopeResult, RefIdError};
use serde_json::Value;

fn refused(reason: String) -> EnvelopeResult {
    EnvelopeResult { admissible: false, reason: Some(reason) }
}

/// Refuses an envelope whose self-reference or recomputed digests do not hold.
pub fn validate_envelope(requested_id: &str, envelope: &Value) -> Result<EnvelopeResult, RefIdError> {
    let spec = load_spec()?;
    let self_reference = spec.string(&["envelope", "selfReference"]);
    let sets_field = spec.string(&["envelope", "setsField"]);
    let Some(record) = envelope.as_object() else { return Ok(refused("envelope is not an object".into())) };
    if record.get(self_reference).and_then(Value::as_str) != Some(requested_id) {
        return Ok(refused(format!("envelope.{self_reference} does not match the requested identifier")));
    }

    let parsed = parse(requested_id)?;
    if parsed.status == spec.status("malformed")? || parsed.status == spec.status("unsupported")? {
        return Ok(refused(format!("the requested identifier is {}", parsed.status)));
    }

    let grammar = Grammar::of(spec)?;
    let mut digest_patterns: Vec<String> = Vec::new();
    if let Some(forms) = spec.object(&["forms"]) {
        for (name, form) in forms {
            if form.get("digest").and_then(Value::as_bool) != Some(true) {
                continue;
            }
            match form.get("pattern").and_then(Value::as_str) {
                Some(pattern) => digest_patterns.push(pattern.to_string()),
                None => return Err(RefIdError::SpecVersion(format!("spec.forms.{name} declares digest: true without a pattern; this crate cannot recognise it"))),
            }
        }
    }
    let sets = record.get(sets_field).and_then(Value::as_object);

    for pair in &parsed.qualifiers {
        let mut is_digest = false;
        for pattern in &digest_patterns {
            if grammar.matches(spec, pattern, &pair.value)? {
                is_digest = true;
                break;
            }
        }
        if !is_digest {
            continue;
        }
        let members: Option<Vec<String>> = sets
            .and_then(|s| s.get(&pair.key))
            .and_then(Value::as_array)
            .and_then(|a| a.iter().map(|v| v.as_str().map(String::from)).collect());
        let Some(members) = members else {
            return Ok(refused(format!("{sets_field}.{} is missing or is not an array of strings", pair.key)));
        };
        let recomputed = match digest(&members) {
            Ok(d) => d,
            Err(RefIdError::Digest { .. }) => return Ok(refused(format!("{sets_field}.{} carries a member with the join character", pair.key))),
            Err(e) => return Err(e),
        };
        if recomputed != pair.value {
            return Ok(refused(format!("{sets_field}.{} does not recompute to the declared digest", pair.key)));
        }
    }
    Ok(EnvelopeResult { admissible: true, reason: None })
}
