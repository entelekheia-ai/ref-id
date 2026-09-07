// SPDX-License-Identifier: Apache-2.0
//
// Loads the embedded spec/ref-id.json, verifies its digest against the sidecar, and checks the
// specVersion major. The spec's own data is never restated here: it is read dynamically from the
// parsed JSON through the accessors below.

use crate::canonical::canonicalise;
use crate::types::RefIdError;
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::path::Path;
use std::sync::OnceLock;

// The path form binds this crate to the repository it lives in: a git dependency resolves it, a
// crates.io package would not (files outside the crate root are not packaged) and will need a
// build.rs copy when publication comes.
const EMBEDDED_JSON: &str = include_str!("../../../spec/ref-id.json");
const EMBEDDED_SIDECAR: &str = include_str!("../../../spec/ref-id.json.sha256");

/// The major version this crate was built against. Not spec data — the crate's own contract.
const SUPPORTED_SPEC_MAJOR: &str = "1";

/// The `ref:` specification, read dynamically. Every table the code consults is looked up here.
#[derive(Debug)]
pub struct Spec {
    root: Value,
    pub(crate) grammar: OnceLock<crate::grammar::Grammar>,
    pub(crate) implemented: OnceLock<Result<(), RefIdError>>,
}

impl Spec {
    pub(crate) fn value(&self, path: &[&str]) -> Option<&Value> {
        let mut current = &self.root;
        for key in path {
            current = current.get(key)?;
        }
        Some(current)
    }

    pub(crate) fn string(&self, path: &[&str]) -> &str {
        self.value(path).and_then(Value::as_str).unwrap_or("")
    }

    pub(crate) fn int(&self, path: &[&str]) -> i64 {
        self.value(path).and_then(Value::as_i64).unwrap_or(0)
    }

    pub(crate) fn strings(&self, path: &[&str]) -> Vec<String> {
        self.value(path)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
            .unwrap_or_default()
    }

    pub(crate) fn ints(&self, path: &[&str]) -> Vec<i64> {
        self.value(path)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_i64).collect())
            .unwrap_or_default()
    }

    pub(crate) fn object(&self, path: &[&str]) -> Option<&serde_json::Map<String, Value>> {
        self.value(path).and_then(Value::as_object)
    }

    pub(crate) fn table(&self, path: &[&str]) -> Vec<(String, String)> {
        self.object(path)
            .map(|m| m.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect())
            .unwrap_or_default()
    }

    pub fn spec_version(&self) -> &str {
        self.string(&["specVersion"])
    }

    pub fn scheme(&self) -> &str {
        self.string(&["scheme"])
    }

    pub(crate) fn unknown_type(&self) -> &str {
        self.string(&["unknownType"])
    }

    /// A status name this code needs, checked against the vocabulary the spec declares.
    pub(crate) fn status(&self, name: &str) -> Result<String, RefIdError> {
        if self.strings(&["statuses"]).iter().any(|s| s == name) {
            Ok(name.to_string())
        } else {
            Err(RefIdError::SpecVersion(format!("this crate names the status \"{name}\", which spec {} does not declare", self.spec_version())))
        }
    }

    /// A part name this code needs: one of `spec.parts`, or a declared qualifier or refinement key.
    pub(crate) fn part(&self, name: &str) -> Result<String, RefIdError> {
        let declared = self.strings(&["parts"]).iter().any(|s| s == name)
            || self.object(&["qualifiers"]).is_some_and(|m| m.contains_key(name))
            || self.object(&["refinements"]).is_some_and(|m| m.contains_key(name));
        if declared {
            Ok(name.to_string())
        } else {
            Err(RefIdError::SpecVersion(format!("this crate names the part \"{name}\", which spec {} does not declare", self.spec_version())))
        }
    }

    /// The vectors of one class, for a conformance runner.
    pub fn vectors(&self, class: &str) -> Vec<Value> {
        self.value(&["vectors", class]).and_then(Value::as_array).cloned().unwrap_or_default()
    }

    /// The canonical grammar expression, for a dialect measurement.
    pub fn grammar_expression(&self) -> &str {
        self.string(&["grammar", "expression"])
    }
}

fn validate(json: &str, sidecar: &str) -> Result<Spec, RefIdError> {
    let parsed: Value = serde_json::from_str(json).map_err(|e| RefIdError::SpecIntegrity(format!("spec/ref-id.json is not JSON: {e}")))?;
    let canonical = canonicalise(&parsed)?;
    let computed = format!("{:x}", Sha256::digest(canonical.as_bytes()));
    let expected = sidecar.trim();
    if computed != expected {
        return Err(RefIdError::SpecIntegrity(format!("spec/ref-id.json does not match its sidecar digest (expected {expected}, computed {computed})")));
    }
    let spec = Spec { root: parsed, grammar: OnceLock::new(), implemented: OnceLock::new() };
    let major = spec.spec_version().split('.').next().unwrap_or("");
    if major != SUPPORTED_SPEC_MAJOR {
        return Err(RefIdError::SpecVersion(format!("spec/ref-id.json declares specVersion {}; this crate supports major {SUPPORTED_SPEC_MAJOR}", spec.spec_version())));
    }
    Ok(spec)
}

/// Loads and validates a spec + sidecar pair from a directory; the integrity tests use this.
pub fn load_spec_from(dir: &Path) -> Result<Spec, RefIdError> {
    let json = std::fs::read_to_string(dir.join("ref-id.json")).map_err(|e| RefIdError::SpecIntegrity(e.to_string()))?;
    let sidecar = std::fs::read_to_string(dir.join("ref-id.json.sha256")).map_err(|e| RefIdError::SpecIntegrity(e.to_string()))?;
    validate(&json, &sidecar)
}

/// The embedded specification's bytes, so a runner can prove them byte-identical to the repository's file.
pub fn embedded_spec_text() -> (&'static str, &'static str) {
    (EMBEDDED_JSON, EMBEDDED_SIDECAR)
}

static EMBEDDED: OnceLock<Result<Spec, RefIdError>> = OnceLock::new();

/// The validated spec this crate embeds, loaded once.
pub fn load_spec() -> Result<&'static Spec, RefIdError> {
    EMBEDDED.get_or_init(|| validate(EMBEDDED_JSON, EMBEDDED_SIDECAR)).as_ref().map_err(Clone::clone)
}
