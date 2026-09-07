// SPDX-License-Identifier: Apache-2.0

use serde_json::{json, Value};
use std::fmt;

/// A `key=value` pair, in the order it appeared in the input, value kept verbatim.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pair {
    pub key: String,
    pub value: String,
}

impl Pair {
    pub fn new(key: impl Into<String>, value: impl Into<String>) -> Self {
        Pair { key: key.into(), value: value.into() }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fragment {
    pub path: String,
    pub refinements: Vec<Pair>,
}

/// What `parse` returns. `status` is one of `spec.statuses`; `part` one of `spec.parts` on `malformed`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseResult {
    pub input: String,
    pub status: String,
    pub version: i64,
    pub explicit_version: bool,
    /// The version token as written, when explicit — so that serialising returns the same bytes.
    pub version_text: Option<String>,
    pub r#type: String,
    /// The captured group, verbatim.
    pub locator: String,
    /// The string handed to the owning validator, formed per `dispatch.<type>.delegate`; absent when the type is not dispatched.
    pub delegated: Option<String>,
    /// The validator's own canonical spelling of `delegated`, when the format defines one.
    pub canonical: Option<String>,
    pub qualifiers: Vec<Pair>,
    /// The decoded identifier behind each qualifier value that nests one, keyed by qualifier key.
    pub nested: Option<Vec<(String, String)>>,
    pub fragment: Option<Fragment>,
    pub part: Option<String>,
}

fn pairs_json(pairs: &[Pair]) -> Value {
    Value::Array(pairs.iter().map(|p| json!([p.key, p.value])).collect())
}

impl ParseResult {
    /// The result as the JSON shape the specification's vectors describe — what a conformance test compares.
    pub fn to_json(&self) -> Value {
        let mut out = serde_json::Map::new();
        out.insert("input".into(), Value::String(self.input.clone()));
        out.insert("status".into(), Value::String(self.status.clone()));
        out.insert("version".into(), json!(self.version));
        out.insert("explicitVersion".into(), Value::Bool(self.explicit_version));
        out.insert("type".into(), Value::String(self.r#type.clone()));
        out.insert("locator".into(), Value::String(self.locator.clone()));
        out.insert("qualifiers".into(), pairs_json(&self.qualifiers));
        out.insert(
            "fragment".into(),
            match &self.fragment {
                Some(f) => json!({ "path": f.path, "refinements": pairs_json(&f.refinements) }),
                None => Value::Null,
            },
        );
        if let Some(v) = &self.version_text {
            out.insert("versionText".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.delegated {
            out.insert("delegated".into(), Value::String(v.clone()));
        }
        if let Some(v) = &self.canonical {
            out.insert("canonical".into(), Value::String(v.clone()));
        }
        if let Some(nested) = &self.nested {
            let map: serde_json::Map<String, Value> = nested.iter().map(|(k, v)| (k.clone(), Value::String(v.clone()))).collect();
            out.insert("nested".into(), Value::Object(map));
        }
        if let Some(v) = &self.part {
            out.insert("part".into(), Value::String(v.clone()));
        }
        Value::Object(out)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QualifierValue {
    Plain(String),
    Nested(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FragmentParts {
    Path(String),
    Full { path: String, refinements: Vec<Pair> },
}

/// The parts a producer hands to `build`. A location never reaches the identifier, so none is carried.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BuildParts {
    pub r#type: String,
    /// For a type-prefixed dispatch, either the bare group (`npm/x@1.0.0`) or the intact format string (`pkg:npm/x@1.0.0`).
    pub locator: String,
    pub qualifiers: Vec<(String, QualifierValue)>,
    pub fragment: Option<FragmentParts>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvelopeResult {
    pub admissible: bool,
    pub reason: Option<String>,
}

/// Every error this crate raises. `parse` raises none for an identifier problem.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefIdError {
    /// `build` was given a part the grammar cannot carry.
    Build { part: String, message: String },
    /// `digest` was given a member that is not one identifier string.
    Digest { part: String, message: String },
    /// `serialise` was given a result that has no faithful string form.
    Serialise { part: String, message: String },
    /// The embedded specification does not match its sidecar digest.
    SpecIntegrity(String),
    /// The embedded specification declares a version or vocabulary this crate does not support.
    SpecVersion(String),
}

impl RefIdError {
    pub fn part(&self) -> Option<&str> {
        match self {
            RefIdError::Build { part, .. } | RefIdError::Digest { part, .. } | RefIdError::Serialise { part, .. } => Some(part),
            _ => None,
        }
    }
}

impl fmt::Display for RefIdError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RefIdError::Build { part, message } => write!(f, "BuildError at {part}: {message}"),
            RefIdError::Digest { part, message } => write!(f, "DigestError at {part}: {message}"),
            RefIdError::Serialise { part, message } => write!(f, "SerialiseError at {part}: {message}"),
            RefIdError::SpecIntegrity(m) => write!(f, "SpecIntegrityError: {m}"),
            RefIdError::SpecVersion(m) => write!(f, "SpecVersionError: {m}"),
        }
    }
}

impl std::error::Error for RefIdError {}
