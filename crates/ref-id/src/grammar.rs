// SPDX-License-Identifier: Apache-2.0
//
// Compiles every pattern the spec declares through this engine's declared adaptations, and holds the
// only structural literals this crate writes.

use crate::spec::Spec;
use crate::types::RefIdError;
use regex::Regex;
use std::collections::HashMap;
use std::sync::Mutex;

/// The dialect this port compiles for. Its adaptation list, when the spec declares one, is applied to every pattern.
pub(crate) const DIALECT: &str = "rust-regex";

/// The structural literals of the scheme, each written exactly once, here. Their sources are
/// `spec.grammar.expression` (the field separator, the fragment introducer, the line breaks the
/// character classes exclude) and the two pair grammars (the key/value separator).
/// `assert_structure` checks the patterns really carry them.
pub(crate) const FIELD: &str = ":";
pub(crate) const FRAGMENT_INTRODUCER: &str = "#";
pub(crate) const PAIR: &str = "=";
pub(crate) const LINE_BREAKS: [char; 2] = ['\r', '\n'];

pub(crate) fn scheme_prefix(spec: &Spec) -> String {
    format!("{}{FIELD}", spec.scheme())
}

#[derive(Debug)]
pub(crate) struct Grammar {
    pub top: Regex,
    pub state_pair: Regex,
    pub fragment_pair: Regex,
    others: Mutex<HashMap<String, Regex>>,
}

fn assert_structure(spec: &Spec) -> Result<(), RefIdError> {
    let expression = spec.string(&["grammar", "expression"]);
    for literal in [format!("^{}", scheme_prefix(spec)), FRAGMENT_INTRODUCER.to_string(), "\\r".to_string(), "\\n".to_string()] {
        if !expression.contains(&literal) {
            return Err(RefIdError::SpecVersion(format!("spec.grammar.expression does not carry {literal:?}; this crate's structural literals do not match")));
        }
    }
    for pair in [spec.string(&["grammar", "state", "pair"]), spec.string(&["grammar", "fragment", "pair"])] {
        if !pair.contains(&format!("){PAIR}(")) {
            return Err(RefIdError::SpecVersion(format!("a pair grammar does not separate key and value with {PAIR:?}; this crate's structural literals do not match")));
        }
    }
    Ok(())
}

/// Applies this dialect's declared adaptations, in order, then compiles.
pub(crate) fn compile(spec: &Spec, pattern: &str) -> Result<Regex, RefIdError> {
    let mut adapted = pattern.to_string();
    if let Some(replacements) = spec.value(&["grammar", "adaptations", DIALECT, "replace"]).and_then(|v| v.as_array()) {
        for pair in replacements {
            if let (Some(from), Some(to)) = (pair.get(0).and_then(|v| v.as_str()), pair.get(1).and_then(|v| v.as_str())) {
                adapted = adapted.replace(from, to);
            }
        }
    }
    Regex::new(&adapted).map_err(|e| RefIdError::SpecVersion(format!("pattern {pattern} does not compile in {DIALECT}: {e}")))
}

impl Grammar {
    fn new(spec: &Spec) -> Result<Grammar, RefIdError> {
        assert_structure(spec)?;
        Ok(Grammar {
            top: compile(spec, spec.string(&["grammar", "expression"]))?,
            state_pair: compile(spec, spec.string(&["grammar", "state", "pair"]))?,
            fragment_pair: compile(spec, spec.string(&["grammar", "fragment", "pair"]))?,
            others: Mutex::new(HashMap::new()),
        })
    }

    pub(crate) fn of(spec: &Spec) -> Result<&Grammar, RefIdError> {
        if let Some(grammar) = spec.grammar.get() {
            return Ok(grammar);
        }
        let grammar = Grammar::new(spec)?;
        let _ = spec.grammar.set(grammar);
        Ok(spec.grammar.get().expect("just set"))
    }

    /// Whether any other pattern the spec declares (a form, a dispatch entry, a refinement) matches the whole value.
    pub(crate) fn matches(&self, spec: &Spec, source: &str, value: &str) -> Result<bool, RefIdError> {
        let mut cache = self.others.lock().map_err(|_| RefIdError::SpecVersion("grammar cache poisoned".into()))?;
        if !cache.contains_key(source) {
            let compiled = compile(spec, source)?;
            cache.insert(source.to_string(), compiled);
        }
        Ok(cache[source].is_match(value))
    }
}
