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

/// Where a Package URL locator stops being the package and starts being a path inside it.
///
/// An `@` that opens a segment — preceded by `/`, or first in the string — belongs to a namespace and is
/// part of the name. An `@` inside a segment closes the name: the version runs from it to the next `/`,
/// and whatever follows that `/` is the subpath. Without a version there is no marker at all, so
/// `npm/a/b/c` stays a namespaced package and carries no subpath — a file inside a corpus nobody
/// versioned is named through `folder`.
///
/// The subpath leaves here as the Package URL's own `#subpath` component, which is what that component
/// means; the scheme's `#` is the declared name one level below the file and has no purl equivalent.
/// Ported from `packages/ref-id/src/validators.ts:52` (`splitSubpath`).
fn split_subpath(delegated: &str) -> (&str, Option<&str>) {
    let chars: Vec<(usize, char)> = delegated.char_indices().collect();
    for i in 1..chars.len() {
        let (byte_idx, c) = chars[i];
        if c != '@' || chars[i - 1].1 == '/' {
            continue;
        }
        return match delegated[byte_idx..].find('/') {
            None => (delegated, None),
            Some(rel) => {
                let slash = byte_idx + rel;
                (&delegated[..slash], Some(&delegated[slash + 1..]))
            }
        };
    }
    (delegated, None)
}

fn package_url(_spec: &Spec, _entry: &Value, delegated: &str) -> Result<Validation, RefIdError> {
    let (base, subpath) = split_subpath(delegated);
    Ok(match packageurl::PackageUrl::from_str(base) {
        Ok(mut purl) => {
            if let Some(path) = subpath {
                if purl.with_subpath(path).is_err() {
                    return Ok(Validation { ok: false, canonical: None });
                }
            }
            Validation { ok: true, canonical: Some(purl.to_string()) }
        }
        Err(_) => Validation { ok: false, canonical: None },
    })
}

fn declared_name(spec: &Spec, entry: &Value, delegated: &str) -> Result<Validation, RefIdError> {
    let pattern = entry.get("pattern").and_then(Value::as_str).unwrap_or("");
    Ok(Validation { ok: Grammar::of(spec)?.matches(spec, pattern, delegated)?, canonical: None })
}

/// The check digit of a registered article number.
///
/// A ten-character book number weights its digits 10..1 and is correct when the sum is divisible by
/// eleven, which is why its last character may be `X` for the value ten. Every other length is a GS1
/// trade item number: the digits before the last are weighted 3 and 1 alternately from the right, and the
/// last is whatever brings the total up to a multiple of ten. Ported from
/// `packages/ref-id/src/validators.ts:44` (`checkDigitHolds`).
fn check_digit_holds(value: &str) -> bool {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() == 10 {
        let weighted: u64 = chars
            .iter()
            .enumerate()
            .map(|(index, &c)| {
                let digit = if c == 'X' { 10 } else { c.to_digit(10).unwrap_or(0) as u64 };
                digit * (10 - index as u64)
            })
            .sum();
        return weighted % 11 == 0;
    }
    let digits: Vec<u64> = chars.iter().map(|c| c.to_digit(10).unwrap_or(0) as u64).collect();
    let declared = match digits.last() {
        Some(&d) => d,
        None => return false,
    };
    let weighted: u64 = digits[..digits.len() - 1]
        .iter()
        .rev()
        .enumerate()
        .map(|(index, &digit)| digit * if index % 2 == 0 { 3 } else { 1 })
        .sum();
    (10 - (weighted % 10)) % 10 == declared
}

fn check_digit(spec: &Spec, entry: &Value, delegated: &str) -> Result<Validation, RefIdError> {
    let pattern = entry.get("pattern").and_then(Value::as_str).unwrap_or("");
    let matches = Grammar::of(spec)?.matches(spec, pattern, delegated)?;
    Ok(Validation { ok: matches && check_digit_holds(delegated), canonical: None })
}

type Validator = fn(&Spec, &Value, &str) -> Result<Validation, RefIdError>;

fn validator(name: &str) -> Option<Validator> {
    match name {
        "package-url" => Some(package_url),
        "declared-name" => Some(declared_name),
        "check-digit" => Some(check_digit),
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
