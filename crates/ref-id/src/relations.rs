// SPDX-License-Identifier: Apache-2.0
//
// The two questions equality cannot answer. `samePackage` says whether two identifiers name the same
// released thing at whatever version each declares; `covers` says whether a partial identifier stands
// for a whole family of complete ones. Neither is equality, and neither can be expressed by relaxing
// it, because they disagree with each other on direction. Ported from packages/ref-id/src/relations.ts
// — read that file's comments for the full rationale; this restates none of the spec's own tables.

use crate::parse::parse;
use crate::spec::{load_spec, Spec};
use crate::serialise::serialise;
use crate::types::{Pair, ParseResult, RefIdError};
use serde_json::Value;
use std::collections::HashMap;

/// Whether `dispatch.<type>.versionTail` is set. Read from the spec, never guessed from punctuation.
fn version_tail(spec: &Spec, r#type: &str) -> bool {
    spec.object(&["dispatch"])
        .and_then(|m| m.get(r#type))
        .and_then(|entry| entry.get("versionTail"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

struct Split {
    stem: String,
    version: Option<String>,
}

/// The locator without its version, and the version it carried — only for a type whose dispatch entry
/// declares `versionTail`.
///
/// **Whether a locator carries a version at all is the type's business**, read from `versionTail` rather
/// than guessed from punctuation. Within a type that does carry one, an `@` that opens a segment —
/// preceded by `/`, or first — belongs to a namespace (`npm/@acme/x` has no version). An `@` inside a
/// segment closes the name: the version runs from it to the next `/`, and whatever follows that `/` is a
/// path inside the named thing. **The path stays in the stem, and only the version leaves it** — a file
/// at two releases is one file, so `npm/x@1.0.0/docs/guide.md` and `npm/x@2.0.0/docs/guide.md` share the
/// stem `npm/x/docs/guide.md`. Ported from `packages/ref-id/src/relations.ts:30` (`split`).
fn split(spec: &Spec, r#type: &str, locator: &str) -> Split {
    if !version_tail(spec, r#type) {
        return Split { stem: locator.to_string(), version: None };
    }
    let chars: Vec<(usize, char)> = locator.char_indices().collect();
    for i in 1..chars.len() {
        let (byte_idx, c) = chars[i];
        if c != '@' || chars[i - 1].1 == '/' {
            continue;
        }
        return match locator[byte_idx..].find('/') {
            None => Split {
                stem: locator[..byte_idx].to_string(),
                version: Some(locator[byte_idx + 1..].to_string()),
            },
            Some(rel) => {
                let slash = byte_idx + rel;
                Split {
                    stem: format!("{}{}", &locator[..byte_idx], &locator[slash..]),
                    version: Some(locator[byte_idx + 1..slash].to_string()),
                }
            }
        };
    }
    Split { stem: locator.to_string(), version: None }
}

/// The identifier, when this crate vouches for how it was decomposed — `ok` or `uncovered` only.
/// `malformed` has no decomposition to compare, and `unsupported` has one read by the wrong grammar.
fn read(spec: &Spec, identifier: &str) -> Option<ParseResult> {
    let parsed = parse(identifier).ok()?;
    let ok = spec.status("ok").ok()?;
    let uncovered = spec.status("uncovered").ok()?;
    if parsed.status == ok || parsed.status == uncovered {
        Some(parsed)
    } else {
        None
    }
}

/// Whether the general identifier's stem reaches the specific one's.
///
/// Equal stems name one thing. Otherwise the general one covers the specific when its stem is a whole
/// **segment** prefix of it — `acme-tools` reaching `acme-tools/docs/guide.md`. The segment boundary is
/// the whole of the rule: a bare string prefix would make `acme-tools` cover `acme-tools-extra`, two
/// corpora that share nothing but their first characters. Ported from
/// `packages/ref-id/src/relations.ts:49` (`stemReaches`).
fn stem_reaches(general: &str, specific: &str) -> bool {
    general == specific || specific.starts_with(&format!("{general}/"))
}

/// Whether every pair the first declares appears identically in the second.
fn subsumes(theirs: &[Pair], mine: &[Pair]) -> bool {
    let map: HashMap<&str, &str> = theirs.iter().map(|p| (p.key.as_str(), p.value.as_str())).collect();
    mine.iter().all(|p| map.get(p.key.as_str()) == Some(&p.value.as_str()))
}

/// Whether two pair lists hold the same pairs, order aside.
fn equal(a: &[Pair], b: &[Pair]) -> bool {
    a.len() == b.len() && subsumes(b, a)
}

/// Whether two identifiers name the same released thing, at whatever version each declares.
///
/// Symmetric, and version-blind in exactly one place: the locator of a type whose dispatch entry
/// declares `versionTail`. Everything else still distinguishes. A malformed identifier, and one at an
/// identifier version this crate does not implement, name nothing here and so are the same as nothing,
/// including themselves.
pub fn same_package(a: &str, b: &str) -> bool {
    let Ok(spec) = load_spec() else { return false };
    let (Some(x), Some(y)) = (read(spec, a), read(spec, b)) else { return false };
    if x.r#type != y.r#type || x.version != y.version {
        return false;
    }
    if split(spec, &x.r#type, &x.locator).stem != split(spec, &y.r#type, &y.locator).stem {
        return false;
    }
    let (fx, fy) = (x.fragment.as_ref().map(|f| f.path.as_str()), y.fragment.as_ref().map(|f| f.path.as_str()));
    if fx != fy {
        return false;
    }
    let (rx, ry) = (x.fragment.as_ref().map(|f| f.refinements.as_slice()).unwrap_or(&[]), y.fragment.as_ref().map(|f| f.refinements.as_slice()).unwrap_or(&[]));
    if !equal(rx, ry) {
        return false;
    }
    equal(&x.qualifiers, &y.qualifiers)
}

/// Whether the first identifier is the second with less declared — the general covering the specific.
///
/// Asymmetric, and the direction is the whole point: `pkg:npm/x` covers `pkg:npm/x@1.0.0`, and the
/// reverse does not hold. What the first leaves unsaid, the second may say freely; what the first says,
/// the second must say identically. Every identifier this crate vouches for covers itself; one it does
/// not — malformed, or at an identifier version it does not implement — covers nothing, itself included.
pub fn covers(general: &str, specific: &str) -> bool {
    let Ok(spec) = load_spec() else { return false };
    let (Some(x), Some(y)) = (read(spec, general), read(spec, specific)) else { return false };
    if x.r#type != y.r#type || x.version != y.version {
        return false;
    }
    let (gen, spe) = (split(spec, &x.r#type, &x.locator), split(spec, &y.r#type, &y.locator));
    if !stem_reaches(&gen.stem, &spe.stem) {
        return false;
    }
    if let Some(gv) = &gen.version {
        if Some(gv) != spe.version.as_ref() {
            return false;
        }
    }
    let path = x.fragment.as_ref().map(|f| f.path.as_str());
    if let Some(path) = path {
        if Some(path) != y.fragment.as_ref().map(|f| f.path.as_str()) {
            return false;
        }
    }
    let xr = x.fragment.as_ref().map(|f| f.refinements.as_slice()).unwrap_or(&[]);
    let yr = y.fragment.as_ref().map(|f| f.refinements.as_slice()).unwrap_or(&[]);
    if !subsumes(yr, xr) {
        return false;
    }
    subsumes(&y.qualifiers, &x.qualifiers)
}

/// The canonical form of an identifier: the same identifier with its qualifiers sorted by key.
///
/// Sorting is by UTF-16 code unit, the order this specification already uses for its own file. What is
/// load-bearing is that one deterministic order exists, so any two implementations reach the same answer
/// about whether two identifiers are one. Every other part is left exactly as parsed — refinements sit on
/// the fragment side and are positional, so reordering them would change what is named.
///
/// A malformed identifier has no canonical form: `serialise` refuses it, naming the part that failed.
pub fn canonical_identifier(identifier: &str) -> Result<String, RefIdError> {
    let mut parsed = parse(identifier)?;
    parsed
        .qualifiers
        .sort_by(|a, b| a.key.encode_utf16().cmp(b.key.encode_utf16()));
    serialise(&parsed)
}
