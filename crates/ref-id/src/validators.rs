// SPDX-License-Identifier: Apache-2.0
//
// The one registry that maps a NAME the spec uses to behaviour: the owning validators (by
// `dispatch.<type>.validator`), the ways a delegated string is formed (by `dispatch.<type>.delegate`),
// the refinement range constraints (by `refinements.<key>.range`) and the policies this crate
// implements. A validator or delegate name the spec uses and this file does not know degrades to
// `uncovered`; a range or policy name it does not know is a version mismatch, refused loudly.

use crate::grammar::{Grammar, FIELD};
use crate::spec::Spec;
use crate::types::RefIdError;
use serde_json::Value;
use std::str::FromStr;

pub(crate) struct Validation {
    pub ok: bool,
    pub canonical: Option<String>,
}

fn package_url(_spec: &Spec, _entry: &Value, delegated: &str) -> Result<Validation, RefIdError> {
    Ok(match packageurl::PackageUrl::from_str(delegated) {
        Ok(purl) => Validation { ok: true, canonical: Some(purl.to_string()) },
        Err(_) => Validation { ok: false, canonical: None },
    })
}

fn declared_name(spec: &Spec, entry: &Value, delegated: &str) -> Result<Validation, RefIdError> {
    let pattern = entry.get("pattern").and_then(Value::as_str).unwrap_or("");
    Ok(Validation { ok: Grammar::of(spec)?.matches(spec, pattern, delegated)?, canonical: None })
}

type Validator = fn(&Spec, &Value, &str) -> Result<Validation, RefIdError>;

fn validator(name: &str) -> Option<Validator> {
    match name {
        "package-url" => Some(package_url),
        "declared-name" => Some(declared_name),
        _ => None,
    }
}

struct Delegator {
    form: fn(&str, &str) -> String,
    folds_type: bool,
}

fn delegator(mode: &str) -> Option<Delegator> {
    match mode {
        "type-prefixed" => Some(Delegator { form: |t, l| format!("{t}{FIELD}{l}"), folds_type: true }),
        "verbatim" => Some(Delegator { form: |_, l| l.to_string(), folds_type: false }),
        _ => None,
    }
}

fn range(name: &str) -> Option<fn(&str, &str) -> bool> {
    match name {
        "ascending" => Some(|value, separator| {
            let bounds: Vec<&str> = if separator.is_empty() { vec![value] } else { value.split(separator).collect() };
            match (bounds.first().and_then(|b| b.parse::<u64>().ok()), bounds.get(1).and_then(|b| b.parse::<u64>().ok())) {
                (Some(first), Some(second)) => first <= second,
                _ => true,
            }
        }),
        _ => None,
    }
}

const UNKNOWN_KEY_POLICY: &str = "carry-through";
const REPEATED_KEY_POLICY: &str = "malformed";

/// Refuses a spec whose declared policies or range names are ones this crate does not implement.
pub(crate) fn assert_implemented(spec: &Spec) -> Result<(), RefIdError> {
    spec.implemented
        .get_or_init(|| {
            let declared = [
                ("grammar.state.unknownKey", spec.string(&["grammar", "state", "unknownKey"]), UNKNOWN_KEY_POLICY),
                ("unknownRefinement", spec.string(&["unknownRefinement"]), UNKNOWN_KEY_POLICY),
                ("grammar.state.repeatedKey", spec.string(&["grammar", "state", "repeatedKey"]), REPEATED_KEY_POLICY),
                ("grammar.fragment.repeatedKey", spec.string(&["grammar", "fragment", "repeatedKey"]), REPEATED_KEY_POLICY),
            ];
            for (field, value, implemented) in declared {
                if value != implemented {
                    return Err(RefIdError::SpecVersion(format!("spec.{field} declares {value:?}; this crate implements only {implemented:?}")));
                }
            }
            if let Some(refinements) = spec.object(&["refinements"]) {
                for (key, refinement) in refinements {
                    if let Some(name) = refinement.get("range").and_then(Value::as_str) {
                        if range(name).is_none() {
                            return Err(RefIdError::SpecVersion(format!("spec.refinements.{key}.range declares {name:?}, which this crate does not implement")));
                        }
                    }
                }
            }
            Ok(())
        })
        .clone()
}

fn dispatch_entry<'a>(spec: &'a Spec, r#type: &str) -> Option<&'a Value> {
    spec.object(&["dispatch"]).and_then(|m| m.get(r#type))
}

pub(crate) fn delegated_string(spec: &Spec, r#type: &str, locator: &str) -> Option<String> {
    let entry = dispatch_entry(spec, r#type)?;
    let mode = entry.get("delegate").and_then(Value::as_str)?;
    Some((delegator(mode)?.form)(r#type, locator))
}

pub(crate) fn folds_type(spec: &Spec, r#type: &str) -> bool {
    dispatch_entry(spec, r#type)
        .and_then(|e| e.get("delegate").and_then(Value::as_str))
        .and_then(delegator)
        .map(|d| d.folds_type)
        .unwrap_or(false)
}

/// Runs the owning validator, or None when the spec names one this crate does not implement.
pub(crate) fn validate_locator(spec: &Spec, entry: &Value, delegated: &str) -> Result<Option<Validation>, RefIdError> {
    match entry.get("validator").and_then(Value::as_str).and_then(validator) {
        Some(validate) => validate(spec, entry, delegated).map(Some),
        None => Ok(None),
    }
}

pub(crate) fn range_holds(refinement: &Value, value: &str) -> bool {
    match refinement.get("range").and_then(Value::as_str).and_then(range) {
        Some(check) => check(value, refinement.get("boundSeparator").and_then(Value::as_str).unwrap_or("")),
        None => true,
    }
}
