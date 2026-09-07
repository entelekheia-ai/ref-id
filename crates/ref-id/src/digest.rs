// SPDX-License-Identifier: Apache-2.0
//
// sha256 over the UTF-8 bytes of the joined identifier strings, per `spec.digest`: declared order,
// no deduplication, and a refusal for a member that carries the join character.

use crate::grammar::FIELD;
use crate::spec::load_spec;
use crate::types::RefIdError;
use sha2::{Digest as _, Sha256};

/// Digests an ordered, non-deduplicated sequence of identifier strings.
pub fn digest(members: &[String]) -> Result<String, RefIdError> {
    let spec = load_spec()?;
    let join = spec.string(&["digest", "join"]);
    if members.iter().any(|m| m.contains(join)) {
        return Err(RefIdError::Digest { part: spec.part("member")?, message: "a member must be a string that does not carry the join character".into() });
    }
    let algorithm = spec.string(&["digest", "algorithm"]);
    if algorithm != "sha256" {
        return Err(RefIdError::SpecVersion(format!("spec.digest.algorithm declares {algorithm}; this crate implements sha256 only")));
    }
    let joined = members.join(join);
    Ok(format!("{algorithm}{FIELD}{:x}", Sha256::digest(joined.as_bytes())))
}
