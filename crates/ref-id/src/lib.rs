// SPDX-License-Identifier: Apache-2.0
//! The `ref:` identifier scheme — a Rust port held to the specification's conformance vectors.
//!
//! The specification is data (`spec/ref-id.json`, embedded at compile time); this crate implements
//! the behaviour the specification binds with vectors: parse, serialise, build, digest and the
//! envelope invariant. It restates none of the specification's tables.

mod build;
mod canonical;
mod digest;
mod encoding;
mod envelope;
mod grammar;
mod parse;
mod serialise;
mod spec;
mod types;
mod validators;

pub use build::build;
pub use canonical::canonicalise;
pub use digest::digest;
pub use envelope::validate_envelope;
pub use parse::parse;
pub use serialise::serialise;
pub use spec::{embedded_spec_text, load_spec, load_spec_from, Spec};
pub use types::{BuildParts, EnvelopeResult, Fragment, FragmentParts, Pair, ParseResult, QualifierValue, RefIdError};
