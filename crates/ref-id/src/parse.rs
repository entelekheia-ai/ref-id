// SPDX-License-Identifier: Apache-2.0
//
// Decomposes a `ref:` identifier string against the loaded spec. Order, and the precedence it
// produces: grammar → version → state and fragment decomposition, including the repeated-key policy
// → (unsupported version stops here, decomposed and unvalidated) → the two sides must not trade keys
// → qualifier values against their forms → refinement values against their patterns and range
// constraints → dispatch: unknown type is `uncovered`, else the locator goes to its validator.

use crate::encoding::{decode, strictly_encoded, table_for};
use crate::grammar::{scheme_prefix, Grammar};
use crate::spec::{load_spec, Spec};
use crate::types::{Fragment, Pair, ParseResult, RefIdError};
use crate::validators::{assert_implemented, delegated_string, range_holds, validate_locator};
use regex::Regex;
use serde_json::Value;
use std::collections::HashSet;

enum Decomposed<T> {
    Ok(T),
    Failed(String),
}

struct Parser<'a> {
    spec: &'a Spec,
    grammar: &'a Grammar,
}

impl<'a> Parser<'a> {
    fn malformed(&self, input: &str, part: &str, head: Option<&ParseResult>) -> Result<ParseResult, RefIdError> {
        let mut result = head.cloned().unwrap_or(ParseResult {
            input: String::new(),
            status: String::new(),
            version: self.spec.int(&["version", "default"]),
            explicit_version: false,
            version_text: None,
            r#type: String::new(),
            locator: String::new(),
            delegated: None,
            canonical: None,
            qualifiers: Vec::new(),
            nested: None,
            fragment: None,
            part: None,
        });
        result.input = input.to_string();
        result.status = self.spec.status("malformed")?;
        result.delegated = None;
        result.canonical = None;
        result.nested = None;
        result.part = Some(self.spec.part(part)?);
        Ok(result)
    }

    /// Splits `key=value` segments with the given pair grammar; a repeated key is malformed at that key.
    fn pairs(&self, regex: &Regex, segments: &[&str], failed_part: &str) -> Decomposed<Vec<Pair>> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for segment in segments {
            let Some(captures) = regex.captures(segment) else { return Decomposed::Failed(failed_part.to_string()) };
            let key = captures.name("key").map(|m| m.as_str()).unwrap_or("").to_string();
            if !seen.insert(key.clone()) {
                return Decomposed::Failed(key);
            }
            out.push(Pair::new(key, captures.name("value").map(|m| m.as_str()).unwrap_or("")));
        }
        Decomposed::Ok(out)
    }

    fn state(&self, raw: &str) -> Decomposed<Vec<Pair>> {
        let segments: Vec<&str> = raw.split(self.spec.string(&["grammar", "state", "separator"])).collect();
        self.pairs(&self.grammar.state_pair, &segments, "state")
    }

    fn fragment(&self, raw: &str) -> Decomposed<Fragment> {
        let segments: Vec<&str> = raw.split(self.spec.string(&["grammar", "fragment", "separator"])).collect();
        let path = segments.first().copied().unwrap_or("");
        if path.is_empty() {
            return Decomposed::Failed("fragment".into());
        }
        match self.pairs(&self.grammar.fragment_pair, &segments[1..], "fragment") {
            Decomposed::Failed(part) => Decomposed::Failed(part),
            Decomposed::Ok(refinements) => Decomposed::Ok(Fragment { path: path.to_string(), refinements }),
        }
    }

    /// A qualifier value that nests an identifier: strictly encoded, decoded with the form's table, parsed one level down.
    fn try_nested(&self, form: &Value, value: &str, depth: i64) -> Result<Option<String>, RefIdError> {
        let max_depth = form.get("depth").and_then(Value::as_i64).unwrap_or(0);
        if depth >= max_depth || !value.starts_with(&scheme_prefix(self.spec)) {
            return Ok(None);
        }
        let table = table_for(self.spec, form);
        if !strictly_encoded(value, &table) {
            return Ok(None);
        }
        let decoded = decode(value, &table);
        let inner = self.parse(&decoded, depth + 1)?;
        Ok(if inner.status == self.spec.status("malformed")? { None } else { Some(decoded) })
    }

    fn match_forms(&self, names: &[String], value: &str, depth: i64) -> Result<(bool, Option<String>), RefIdError> {
        let forms = self.spec.object(&["forms"]);
        for name in names {
            let Some(form) = forms.and_then(|m| m.get(name)) else { continue };
            if form.get("nested").and_then(Value::as_bool) == Some(true) {
                if let Some(nested) = self.try_nested(form, value, depth)? {
                    return Ok((true, Some(nested)));
                }
                continue;
            }
            if let Some(pattern) = form.get("pattern").and_then(Value::as_str) {
                if self.grammar.matches(self.spec, pattern, value)? {
                    return Ok((true, None));
                }
            }
        }
        Ok((false, None))
    }

    fn parse(&self, input: &str, depth: i64) -> Result<ParseResult, RefIdError> {
        let Some(captures) = self.grammar.top.captures(input) else { return self.malformed(input, "grammar", None) };
        let group = |name: &str| captures.name(name).map(|m| m.as_str().to_string());
        let version_text = group("version");
        let r#type = group("type").unwrap_or_default();
        let locator = group("locator").unwrap_or_default();
        let explicit_version = version_text.is_some();
        let version = version_text.as_deref().and_then(|v| v.parse::<i64>().ok()).unwrap_or_else(|| self.spec.int(&["version", "default"]));

        let mut head = ParseResult {
            input: input.to_string(),
            status: String::new(),
            version,
            explicit_version,
            version_text: version_text.clone(),
            r#type: r#type.clone(),
            locator: locator.clone(),
            delegated: None,
            canonical: None,
            qualifiers: Vec::new(),
            nested: None,
            fragment: None,
            part: None,
        };

        if let Some(state) = group("state") {
            match self.state(&state) {
                Decomposed::Failed(part) => return self.malformed(input, &part, Some(&head)),
                Decomposed::Ok(qualifiers) => head.qualifiers = qualifiers,
            }
        }
        if let Some(fragment) = group("fragment") {
            match self.fragment(&fragment) {
                Decomposed::Failed(part) => return self.malformed(input, &part, Some(&head)),
                Decomposed::Ok(fragment) => head.fragment = Some(fragment),
            }
        }

        let mut base = head.clone();
        base.status = self.spec.status("ok")?;
        base.delegated = delegated_string(self.spec, &r#type, &locator);

        if !self.spec.ints(&["version", "supported"]).contains(&version) {
            base.status = self.spec.status("unsupported")?;
            return Ok(base);
        }

        let refinements_table = self.spec.object(&["refinements"]);
        let qualifiers_table = self.spec.object(&["qualifiers"]);
        for pair in &head.qualifiers {
            if refinements_table.is_some_and(|m| m.contains_key(&pair.key)) {
                return self.malformed(input, &pair.key, Some(&head));
            }
        }
        if let Some(fragment) = &head.fragment {
            for pair in &fragment.refinements {
                if qualifiers_table.is_some_and(|m| m.contains_key(&pair.key)) {
                    return self.malformed(input, &pair.key, Some(&head));
                }
            }
        }

        let mut nested: Vec<(String, String)> = Vec::new();
        for pair in &head.qualifiers {
            let Some(declared) = qualifiers_table.and_then(|m| m.get(&pair.key)) else { continue }; // unknownKey: carry-through
            let forms: Vec<String> = declared.get("forms").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect()).unwrap_or_default();
            let (matches, inner) = self.match_forms(&forms, &pair.value, depth)?;
            if !matches {
                return self.malformed(input, &pair.key, Some(&head));
            }
            if let Some(inner) = inner {
                nested.push((pair.key.clone(), inner));
            }
        }
        if !nested.is_empty() {
            base.nested = Some(nested);
        }

        if let Some(fragment) = &head.fragment {
            for pair in &fragment.refinements {
                let Some(declared) = refinements_table.and_then(|m| m.get(&pair.key)) else { continue }; // unknownRefinement: carry-through
                let pattern = declared.get("pattern").and_then(Value::as_str).unwrap_or("");
                if !self.grammar.matches(self.spec, pattern, &pair.value)? || !range_holds(declared, &pair.value) {
                    return self.malformed(input, &pair.key, Some(&head));
                }
            }
        }

        let entry = self.spec.object(&["dispatch"]).and_then(|m| m.get(&r#type));
        let (Some(entry), Some(delegated)) = (entry, base.delegated.clone()) else {
            base.status = self.spec.unknown_type().to_string();
            return Ok(base);
        };
        let Some(validation) = validate_locator(self.spec, entry, &delegated)? else {
            base.status = self.spec.unknown_type().to_string();
            return Ok(base);
        };
        if !validation.ok {
            return self.malformed(input, "locator", Some(&head));
        }
        base.canonical = validation.canonical;
        Ok(base)
    }
}

/// Parses a `ref:` identifier string against the embedded spec. Never errs for an identifier problem;
/// it errs only when the embedded specification itself cannot be honoured.
pub fn parse(input: &str) -> Result<ParseResult, RefIdError> {
    let spec = load_spec()?;
    assert_implemented(spec)?;
    Parser { spec, grammar: Grammar::of(spec)? }.parse(input, 0)
}
