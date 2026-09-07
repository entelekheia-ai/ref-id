// SPDX-License-Identifier: Apache-2.0
//
// Assembles a `ref:` identifier string from its parts. A part the grammar cannot carry is refused
// with `RefIdError::Build` naming it — the builder never emits a string that means something else,
// which is proven at the end by parsing what was built and comparing it with what was asked.

use crate::encoding::{contains_any, encode, table_for};
use crate::grammar::{scheme_prefix, Grammar, FIELD, FRAGMENT_INTRODUCER, LINE_BREAKS, PAIR};
use crate::parse::parse;
use crate::spec::{load_spec, Spec};
use crate::types::{BuildParts, FragmentParts, Pair, QualifierValue, RefIdError};
use crate::validators::folds_type;
use serde_json::Value;

fn nesting_form<'a>(spec: &'a Spec, key: &str) -> Option<&'a Value> {
    let declared = spec.object(&["qualifiers"])?.get(key)?;
    let forms = spec.object(&["forms"])?;
    declared
        .get("forms")?
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .filter_map(|name| forms.get(name))
        .find(|form| form.get("nested").and_then(Value::as_bool) == Some(true))
}

fn refuse(spec: &Spec, part: &str, why: &str) -> RefIdError {
    match spec.part(part) {
        Ok(part) => RefIdError::Build { part, message: format!("cannot build: {why}") },
        Err(e) => e,
    }
}

/// Builds a `ref:` identifier string.
pub fn build(parts: &BuildParts) -> Result<String, RefIdError> {
    let spec = load_spec()?;
    let grammar = Grammar::of(spec)?;
    let state_separator = spec.string(&["grammar", "state", "separator"]);
    let fragment_separator = spec.string(&["grammar", "fragment", "separator"]);
    let mut separators: Vec<char> = state_separator.chars().chain(FRAGMENT_INTRODUCER.chars()).collect();
    separators.extend(LINE_BREAKS);
    let fragment_reserved: Vec<char> = fragment_separator.chars().chain(LINE_BREAKS).collect();

    let mut locator = parts.locator.clone();
    let fold = format!("{}{FIELD}", parts.r#type);
    if folds_type(spec, &parts.r#type) {
        if let Some(rest) = locator.strip_prefix(&fold) {
            locator = rest.to_string();
        }
    }
    if locator.is_empty() || contains_any(&locator, &separators) {
        return Err(refuse(spec, "locator", "a locator is handed to its validator verbatim and cannot carry a reserved character"));
    }

    let mut out = format!("{}{}{FIELD}{locator}", scheme_prefix(spec), parts.r#type);

    if !parts.qualifiers.is_empty() {
        let mut rendered = Vec::new();
        for (key, value) in &parts.qualifiers {
            let encoded = match value {
                QualifierValue::Plain(plain) => {
                    if plain.starts_with(&scheme_prefix(spec)) || contains_any(plain, &separators) {
                        return Err(refuse(spec, key, "a nested identifier is passed as Nested, never as a plain string"));
                    }
                    plain.clone()
                }
                QualifierValue::Nested(inner) => {
                    let Some(form) = nesting_form(spec, key) else { return Err(refuse(spec, key, "this qualifier declares no nesting form")) };
                    encode(inner, &table_for(spec, form))
                }
            };
            let rendering = format!("{key}{PAIR}{encoded}");
            if !grammar.state_pair.is_match(&rendering) {
                return Err(refuse(spec, key, "the key does not fit the pair grammar"));
            }
            rendered.push(rendering);
        }
        out.push_str(state_separator);
        out.push_str(&rendered.join(state_separator));
    }

    let mut wanted_path: Option<String> = None;
    let mut wanted_refinements: Vec<Pair> = Vec::new();
    if let Some(fragment) = &parts.fragment {
        let path = match fragment {
            FragmentParts::Path(path) => path.clone(),
            FragmentParts::Full { path, refinements } => {
                wanted_refinements = refinements.clone();
                path.clone()
            }
        };
        if path.is_empty() || contains_any(&path, &fragment_reserved) {
            return Err(refuse(spec, "fragment", "a declared-name path cannot be empty or carry the refinement separator"));
        }
        for pair in &wanted_refinements {
            if contains_any(&pair.value, &fragment_reserved) {
                return Err(refuse(spec, &pair.key, "a refinement value cannot carry the separator"));
            }
        }
        out.push_str(FRAGMENT_INTRODUCER);
        out.push_str(&path);
        if !wanted_refinements.is_empty() {
            out.push_str(fragment_separator);
            out.push_str(&wanted_refinements.iter().map(|p| format!("{}{PAIR}{}", p.key, p.value)).collect::<Vec<_>>().join(fragment_separator));
        }
        wanted_path = Some(path);
    }

    // The last word is the grammar's: what was built must decompose to exactly what was asked.
    if !grammar.top.is_match(&out) {
        return Err(refuse(spec, "grammar", "the assembled string does not match the grammar"));
    }
    let check = parse(&out)?;
    if check.status == spec.status("malformed")? {
        return Err(refuse(spec, check.part.as_deref().unwrap_or("grammar"), "the assembled string is malformed"));
    }
    if check.explicit_version || check.r#type != parts.r#type {
        return Err(refuse(spec, "type", "the type re-split into other parts"));
    }
    if check.locator != locator {
        return Err(refuse(spec, "locator", "the locator re-split into other parts"));
    }
    if check.qualifiers.len() != parts.qualifiers.len() {
        return Err(refuse(spec, "state", "a qualifier re-split into other parts"));
    }
    let check_path = check.fragment.as_ref().map(|f| f.path.clone());
    let check_refinements = check.fragment.as_ref().map(|f| f.refinements.len()).unwrap_or(0);
    if check_path != wanted_path || check_refinements != wanted_refinements.len() {
        return Err(refuse(spec, "fragment", "the fragment re-split into other parts"));
    }
    Ok(out)
}
