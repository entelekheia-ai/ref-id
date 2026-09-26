// SPDX-License-Identifier: Apache-2.0
//
// The three questions equality cannot answer. `sameIdentifier` says whether two strings name one thing,
// which is deliberately strict. `samePackage` says whether two identifiers name the same released thing
// at whatever version each declares; `covers` says whether a partial identifier stands for a whole
// family of complete ones. `relate` reports the relation in every dimension instead of reducing it to
// one boolean; `covers`, `coveredBy` and `samePackage` are stated as reductions of that same result, so
// they are implemented as reductions here too, rather than as three computations that could disagree.
// Ported from packages/ref-id/src/relations.ts and packages/ref-id/src/canonical.ts — read those files'
// comments for the full rationale; this restates none of the spec's own tables.

use crate::encoding::{encode, table_for};
use crate::parse::parse;
use crate::serialise::serialise;
use crate::spec::{load_spec, Spec};
use crate::types::{Pair, ParseResult, RefIdError};
use serde_json::Value;

/// An identifier taken as `&str` or as an already-`parse`d `&ParseResult`, mixed freely — the
/// specification's `IdentifierOrParsed`. `&str` is read with `parse`; a `&ParseResult` is used as is.
///
/// Implemented on the bare type (`str`, `ParseResult`) rather than on the reference, and every function
/// below takes `&T` rather than a bare `T: IdentifierArg` — a generic function whose type parameter IS a
/// reference (`T = &str`) does not coerce to the higher-ranked function pointer
/// `for<'a> fn(&'a str) -> _` that `tests/surface.rs` binds against (measured: `error[E0308]: one type is
/// more general than the other`); a generic function whose parameter is `&T` for a plain `T` does.
pub trait IdentifierArg {
    fn resolve(&self) -> Result<ParseResult, RefIdError>;
}

impl IdentifierArg for str {
    fn resolve(&self) -> Result<ParseResult, RefIdError> {
        parse(self)
    }
}

impl IdentifierArg for ParseResult {
    fn resolve(&self) -> Result<ParseResult, RefIdError> {
        Ok(self.clone())
    }
}

/// `String` deref-coerces to `&str` when a function's parameter type IS `&str`, but not when it is `&T`
/// for a generic `T: IdentifierArg + ?Sized` — the coercion the bare-`str` impl above does not reach on
/// its own. Measured: `covers(&a, &b)` with `a, b: String` is `E0277` without this impl.
impl IdentifierArg for String {
    fn resolve(&self) -> Result<ParseResult, RefIdError> {
        self.as_str().resolve()
    }
}

/// Costs nothing beyond the impl itself: a `Box<str>` derefs to `str` for free.
impl IdentifierArg for Box<str> {
    fn resolve(&self) -> Result<ParseResult, RefIdError> {
        (**self).resolve()
    }
}

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

/// The identifier, when this crate vouches for how it was decomposed — `ok` or `uncovered` only.
/// `malformed` has no decomposition to compare, and `unsupported` has one read by the wrong grammar.
fn read<T: IdentifierArg + ?Sized>(spec: &Spec, identifier: &T) -> Option<ParseResult> {
    let parsed = identifier.resolve().ok()?;
    let ok = spec.status("ok").ok()?;
    let uncovered = spec.status("uncovered").ok()?;
    if parsed.status == ok || parsed.status == uncovered {
        Some(parsed)
    } else {
        None
    }
}

/// The decoded nested identifier behind a qualifier's raw value, keyed by qualifier key — `None` when
/// this key's value is not one, on this side.
fn nested_value<'a>(parsed: &'a ParseResult, key: &str) -> Option<&'a str> {
    parsed.nested.as_ref()?.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

/// One relation between two identifiers in one dimension — `comparison.relate.relations`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Relation {
    Equal,
    Covers,
    CoveredBy,
    Differ,
}

impl Relation {
    fn as_str(self) -> &'static str {
        match self {
            Relation::Equal => "equal",
            Relation::Covers => "covers",
            Relation::CoveredBy => "coveredBy",
            Relation::Differ => "differ",
        }
    }
}

/// One qualifier member of a `RelateResult`: its own relation, and — only where both sides' values are a
/// nested `ref:` identifier this operation accepts — the nested pair's own `RelateResult`.
#[derive(Debug, Clone, PartialEq)]
pub struct QualifierRelation {
    pub relation: Relation,
    pub nested: Option<Box<RelateResult>>,
}

/// What `relate` returns for a pair it accepts — `comparison.relate.result` — carrying the five fixed
/// dimensions always, and a keyed dimension (`fragment_refinements`, `qualifiers`) only for the keys at
/// least one side declares.
#[derive(Debug, Clone, PartialEq)]
pub struct RelateResult {
    pub r#type: Relation,
    pub version: Relation,
    pub locator_stem: Relation,
    pub locator_version: Relation,
    pub fragment_path: Relation,
    pub fragment_refinements: Vec<(String, Relation)>,
    pub qualifiers: Vec<(String, QualifierRelation)>,
}

impl RelateResult {
    /// The JSON shape the specification's `relate` vectors describe.
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "type": self.r#type.as_str(),
            "version": self.version.as_str(),
            "locatorStem": self.locator_stem.as_str(),
            "locatorVersion": self.locator_version.as_str(),
            "fragmentPath": self.fragment_path.as_str(),
            "fragmentRefinements": self.fragment_refinements.iter().map(|(k, r)| (k.clone(), Value::String(r.as_str().to_string()))).collect::<serde_json::Map<_, _>>(),
            "qualifiers": self.qualifiers.iter().map(|(k, qr)| {
                let mut member = serde_json::Map::new();
                member.insert("relation".into(), Value::String(qr.relation.as_str().to_string()));
                if let Some(nested) = &qr.nested {
                    member.insert("nested".into(), nested.to_json());
                }
                (k.clone(), Value::Object(member))
            }).collect::<serde_json::Map<_, _>>(),
        })
    }
}

/// The four-case relation between two optional raw values (a locator version, a fragment path, a
/// refinement, a plain qualifier value): equal when both agree or neither declares; covers when only the
/// second declares; coveredBy for the mirror; differ when both declare and disagree.
fn optional_relation(a: Option<&str>, b: Option<&str>) -> Relation {
    match (a, b) {
        (None, None) => Relation::Equal,
        (Some(x), Some(y)) => {
            if x == y {
                Relation::Equal
            } else {
                Relation::Differ
            }
        }
        (None, Some(_)) => Relation::Covers,
        (Some(_), None) => Relation::CoveredBy,
    }
}

/// The locator-stem relation: equal, a whole-segment prefix either way (`covers`/`coveredBy`), or differ.
fn segment_relation(a: &str, b: &str) -> Relation {
    if a == b {
        Relation::Equal
    } else if stem_reaches(a, b) {
        Relation::Covers
    } else if stem_reaches(b, a) {
        Relation::CoveredBy
    } else {
        Relation::Differ
    }
}

/// One qualifier's relation: raw-value comparison, except where both sides' value is a nested `ref:`
/// identifier this relation accepts, where the nested pair is related the same way, one level deep, and
/// this member's own relation is that nested result reduced (`reduce`).
fn qualifier_relation(spec: &Spec, x: &ParseResult, y: &ParseResult, key: &str, xv: Option<&str>, yv: Option<&str>) -> QualifierRelation {
    if xv.is_some() && yv.is_some() {
        if let (Some(xa), Some(ya)) = (nested_value(x, key), nested_value(y, key)) {
            if let (Some(xp), Some(yp)) = (read(spec, xa), read(spec, ya)) {
                let nested = relate_result(spec, &xp, &yp);
                let relation = reduce(&nested);
                return QualifierRelation { relation, nested: Some(Box::new(nested)) };
            }
        }
    }
    QualifierRelation { relation: optional_relation(xv, yv), nested: None }
}

/// The keys of a Pair slice, each once, in first-seen order across both sides.
fn declared_keys<'a>(x: &'a [Pair], y: &'a [Pair]) -> Vec<&'a str> {
    let mut keys: Vec<&str> = Vec::new();
    for pair in x.iter().chain(y.iter()) {
        if !keys.contains(&pair.key.as_str()) {
            keys.push(&pair.key);
        }
    }
    keys
}

/// `comparison.relate.result`: every dimension computed on its own, whatever the others found.
fn relate_result(spec: &Spec, x: &ParseResult, y: &ParseResult) -> RelateResult {
    let r#type = if x.r#type == y.r#type { Relation::Equal } else { Relation::Differ };
    let version = if x.version == y.version { Relation::Equal } else { Relation::Differ };

    let (sx, sy) = (split(spec, &x.r#type, &x.locator), split(spec, &y.r#type, &y.locator));
    let locator_stem = segment_relation(&sx.stem, &sy.stem);
    let locator_version = optional_relation(sx.version.as_deref(), sy.version.as_deref());

    let fragment_path = optional_relation(x.fragment.as_ref().map(|f| f.path.as_str()), y.fragment.as_ref().map(|f| f.path.as_str()));

    let xr = x.fragment.as_ref().map(|f| f.refinements.as_slice()).unwrap_or(&[]);
    let yr = y.fragment.as_ref().map(|f| f.refinements.as_slice()).unwrap_or(&[]);
    let fragment_refinements = declared_keys(xr, yr)
        .into_iter()
        .map(|key| {
            let xv = xr.iter().find(|p| p.key == key).map(|p| p.value.as_str());
            let yv = yr.iter().find(|p| p.key == key).map(|p| p.value.as_str());
            (key.to_string(), optional_relation(xv, yv))
        })
        .collect();

    let qualifiers = declared_keys(&x.qualifiers, &y.qualifiers)
        .into_iter()
        .map(|key| {
            let xv = x.qualifiers.iter().find(|p| p.key == key).map(|p| p.value.as_str());
            let yv = y.qualifiers.iter().find(|p| p.key == key).map(|p| p.value.as_str());
            (key.to_string(), qualifier_relation(spec, x, y, key, xv, yv))
        })
        .collect();

    RelateResult { r#type, version, locator_stem, locator_version, fragment_path, fragment_refinements, qualifiers }
}

/// `comparison.relate.reduction`: a result reduces to one relation across the five fixed dimensions,
/// each refinement, and each qualifier's own relation (which, for a nested qualifier, is already that
/// nested result reduced by this same rule).
fn reduce(result: &RelateResult) -> Relation {
    let mut relations: Vec<Relation> = vec![result.r#type, result.version, result.locator_stem, result.locator_version, result.fragment_path];
    relations.extend(result.fragment_refinements.iter().map(|(_, r)| *r));
    relations.extend(result.qualifiers.iter().map(|(_, qr)| qr.relation));
    if relations.iter().all(|r| *r == Relation::Equal) {
        Relation::Equal
    } else if relations.iter().all(|r| matches!(r, Relation::Equal | Relation::Covers)) {
        Relation::Covers
    } else if relations.iter().all(|r| matches!(r, Relation::Equal | Relation::CoveredBy)) {
        Relation::CoveredBy
    } else {
        Relation::Differ
    }
}

/// `comparison.relate.reductions.samePackage`: type, version, locator stem, fragment path and every
/// refinement equal; the locator version ignored entirely; each qualifier equal, or — where it carries a
/// nested result — `samePackage` holding on that nested result instead of its own (possibly `differ`)
/// relation, so one engine at two releases is one engine even though `by=` itself reports `differ`.
fn same_package_reduces(result: &RelateResult) -> bool {
    if result.r#type != Relation::Equal || result.version != Relation::Equal || result.locator_stem != Relation::Equal || result.fragment_path != Relation::Equal {
        return false;
    }
    if result.fragment_refinements.iter().any(|(_, r)| *r != Relation::Equal) {
        return false;
    }
    result.qualifiers.iter().all(|(_, qr)| match &qr.nested {
        Some(nested) => same_package_reduces(nested),
        None => qr.relation == Relation::Equal,
    })
}

fn by_key(a: &str, b: &str) -> std::cmp::Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// The qualifier's declared form that nests an identifier, if it declares one — ported from
/// `packages/ref-id/src/build.ts`'s `nestingForm`: the qualifier's `forms` list, resolved against
/// `spec.forms`, the first entry whose own `nested` is `true`.
fn nesting_form(spec: &Spec, key: &str) -> Option<Value> {
    let declared = spec.object(&["qualifiers"])?.get(key)?;
    let names = declared.get("forms")?.as_array()?;
    let forms = spec.object(&["forms"])?;
    names.iter().filter_map(Value::as_str).find_map(|name| {
        let form = forms.get(name)?;
        (form.get("nested").and_then(Value::as_bool) == Some(true)).then(|| form.clone())
    })
}

/// `identifierEquivalence.canonicalForm`: qualifiers and the fragment's refinements sorted by key (UTF-16
/// code unit order, the order this specification already uses for its own file); a nested `ref:`
/// identifier inside a qualifier value re-written in its own canonical form (decode, canonicalise,
/// re-encode); the version slot omitted when it holds `version.default` — `ref:1:` and `ref:` are one
/// version, so writing it or not must not distinguish. Every other part is left exactly as parsed.
///
/// A malformed identifier has no canonical form: `serialise` refuses it, naming the part that failed.
/// Ported from `packages/ref-id/src/canonical.ts`'s `canonicalIdentifier`.
fn canonical_form(spec: &Spec, parsed: &ParseResult) -> Result<String, RefIdError> {
    let mut out = parsed.clone();
    out.qualifiers.sort_by(|a, b| by_key(&a.key, &b.key));
    if let Some(fragment) = &mut out.fragment {
        fragment.refinements.sort_by(|a, b| by_key(&a.key, &b.key));
    }
    if let Some(nested) = &parsed.nested {
        for (key, raw) in nested {
            let Some(form) = nesting_form(spec, key) else { continue };
            let inner = parse(raw)?;
            let canonical_inner = canonical_form(spec, &inner)?;
            let encoded = encode(&canonical_inner, &table_for(spec, &form));
            if let Some(pair) = out.qualifiers.iter_mut().find(|p| &p.key == key) {
                pair.value = encoded;
            }
        }
    }
    if out.version == spec.int(&["version", "default"]) {
        out.explicit_version = false;
    }
    serialise(&out)
}

/// The canonical form of an identifier — `identifierEquivalence.canonicalForm`, computed by
/// [`canonical_form`].
pub fn canonical_identifier<T: IdentifierArg + ?Sized>(identifier: &T) -> Result<String, RefIdError> {
    let parsed = identifier.resolve()?;
    let spec = load_spec()?;
    canonical_form(spec, &parsed)
}

/// Whether two identifiers name one thing: their canonical spellings are equal byte for byte
/// (`identifierEquivalence.comparison`). An identifier with no canonical form — malformed, or at a
/// scheme version this crate does not support — names nothing here, so it is never the same as anything,
/// including itself; the same status check `read` uses (`ok` or `uncovered` only) gates this before
/// `canonical_form` ever runs, so an unsupported-version identifier cannot reach it by accident (a
/// `canonical_form` call alone would not refuse one: `serialise` only refuses `malformed`). This mirrors
/// how `covers` and `same_package` treat such an identifier below.
pub fn same_identifier<A: IdentifierArg + ?Sized, B: IdentifierArg + ?Sized>(a: &A, b: &B) -> bool {
    let Ok(spec) = load_spec() else { return false };
    let (Some(x), Some(y)) = (read(spec, a), read(spec, b)) else { return false };
    match (canonical_form(spec, &x), canonical_form(spec, &y)) {
        (Ok(cx), Ok(cy)) => cx == cy,
        _ => false,
    }
}

/// How two identifiers relate in each dimension the specification names — `comparison.relate`. `None`
/// for a pair this relation refuses: malformed, or at a scheme version this crate does not support, on
/// either side. `covers`, `same_package` and `covers(b, a)` (`coveredBy`) are reductions of this result.
pub fn relate<A: IdentifierArg + ?Sized, B: IdentifierArg + ?Sized>(a: &A, b: &B) -> Option<RelateResult> {
    let spec = load_spec().ok()?;
    let x = read(spec, a)?;
    let y = read(spec, b)?;
    Some(relate_result(spec, &x, &y))
}

/// Whether two identifiers name the same released thing, at whatever version each declares.
///
/// Symmetric, and version-blind in exactly one place: the locator of a type whose dispatch entry
/// declares `versionTail`. Everything else still distinguishes. A malformed identifier, and one at an
/// identifier version this crate does not implement, name nothing here and so are the same as nothing,
/// including themselves. Implemented as `comparison.relate.reductions.samePackage` on `relate`'s result,
/// so it cannot disagree with `relate` about the same pair.
pub fn same_package<A: IdentifierArg + ?Sized, B: IdentifierArg + ?Sized>(a: &A, b: &B) -> bool {
    let Ok(spec) = load_spec() else { return false };
    let (Some(x), Some(y)) = (read(spec, a), read(spec, b)) else { return false };
    same_package_reduces(&relate_result(spec, &x, &y))
}

/// Whether the first identifier is the second with less declared — the general covering the specific.
///
/// Asymmetric, and the direction is the whole point: `pkg:npm/x` covers `pkg:npm/x@1.0.0`, and the
/// reverse does not hold. What the first leaves unsaid, the second may say freely; what the first says,
/// the second must say identically. One exception: a qualifier whose value on both sides is a nested
/// `ref:` identifier is compared with this same relation on the decoded pair, one level deep. Every
/// identifier this crate vouches for covers itself; one it does not — malformed, or at an identifier
/// version it does not implement — covers nothing, itself included. Implemented as
/// `comparison.relate.reductions.covers` on `relate`'s result, so it cannot disagree with `relate` about
/// the same pair.
pub fn covers<A: IdentifierArg + ?Sized, B: IdentifierArg + ?Sized>(general: &A, specific: &B) -> bool {
    let Ok(spec) = load_spec() else { return false };
    let (Some(x), Some(y)) = (read(spec, general), read(spec, specific)) else { return false };
    matches!(reduce(&relate_result(spec, &x, &y)), Relation::Equal | Relation::Covers)
}

/// The fixed dimensions `verdict`'s step one and step five walk, in the order `decidedBy` fixes them
/// (`comparison.verdict.result.decidedBy`).
const FIXED_DIMENSIONS: [&str; 5] = ["type", "version", "locatorStem", "locatorVersion", "fragmentPath"];

/// One of the five fixed dimensions of a [`RelateResult`], read by its `decidedBy` path name rather than
/// by field — the path names are the specification's vocabulary, the struct fields are Rust's.
fn fixed_relation(result: &RelateResult, dimension: &str) -> Relation {
    match dimension {
        "type" => result.r#type,
        "version" => result.version,
        "locatorStem" => result.locator_stem,
        "locatorVersion" => result.locator_version,
        "fragmentPath" => result.fragment_path,
        _ => unreachable!("fixed_relation called with a non-fixed dimension: {dimension}"),
    }
}

/// A qualifier's `verdict.axis`, read from `spec.qualifiers.<key>.verdict` — never restated
/// (`.agents/rules/repo-guardrails.md`). `None` for a key with no `verdict` member, exactly
/// `comparison.verdict.rule`'s "step three" population.
fn qualifier_verdict_axis<'a>(spec: &'a Spec, key: &str) -> Option<&'a str> {
    spec.value(&["qualifiers", key, "verdict", "axis"]).and_then(Value::as_str)
}

/// A qualifier's `verdict.conflict`, or `None` when the key has no `verdict` member at all (step three:
/// any qualifier or refinement relating as `differ` with no `conflict` to consult makes identity
/// distinct outright).
fn qualifier_verdict_conflict<'a>(spec: &'a Spec, key: &str) -> Option<&'a str> {
    spec.value(&["qualifiers", key, "verdict", "conflict"]).and_then(Value::as_str)
}

/// A qualifier's `verdict.conflictWhenNeitherSideDeclares` (`keys`, `then`), when declared.
fn qualifier_verdict_fallback(spec: &Spec, key: &str) -> Option<(Vec<String>, String)> {
    let node = spec.value(&["qualifiers", key, "verdict", "conflictWhenNeitherSideDeclares"])?;
    let keys = node.get("keys")?.as_array()?.iter().filter_map(Value::as_str).map(String::from).collect();
    let then = node.get("then")?.as_str()?.to_string();
    Some((keys, then))
}

/// `decidedBy`'s fixed order: the five dimensions in [`FIXED_DIMENSIONS`]'s order, then refinement keys,
/// then qualifier keys, each of the latter two groups sorted by UTF-16 code unit order.
fn order_decided(paths: &[String]) -> Vec<String> {
    let fixed: Vec<String> = FIXED_DIMENSIONS.iter().filter(|dimension| paths.iter().any(|path| path == *dimension)).map(|s| s.to_string()).collect();
    let mut refinements: Vec<String> = paths.iter().filter(|path| path.starts_with("fragmentRefinements.")).cloned().collect();
    refinements.sort_by(|a, b| by_key(a, b));
    let mut qualifiers: Vec<String> = paths.iter().filter(|path| path.starts_with("qualifiers.")).cloned().collect();
    qualifiers.sort_by(|a, b| by_key(a, b));
    let mut out = fixed;
    out.extend(refinements);
    out.extend(qualifiers);
    out
}

/// Identity axis outcome — `comparison.verdict.axes.identity`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerdictIdentity {
    Same,
    Covers,
    CoveredBy,
    Distinct,
    Undetermined,
}

impl VerdictIdentity {
    fn as_str(self) -> &'static str {
        match self {
            VerdictIdentity::Same => "same",
            VerdictIdentity::Covers => "covers",
            VerdictIdentity::CoveredBy => "coveredBy",
            VerdictIdentity::Distinct => "distinct",
            VerdictIdentity::Undetermined => "undetermined",
        }
    }
}

/// Content axis outcome — `comparison.verdict.axes.content`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerdictContent {
    Same,
    Different,
    Unknown,
}

impl VerdictContent {
    fn as_str(self) -> &'static str {
        match self {
            VerdictContent::Same => "same",
            VerdictContent::Different => "different",
            VerdictContent::Unknown => "unknown",
        }
    }
}

/// Which members of `relate`'s result decided each axis, by their `decidedBy` path —
/// `comparison.verdict.result.decidedBy`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct VerdictDecidedBy {
    pub identity: Vec<String>,
    pub content: Vec<String>,
}

/// What `verdict` returns for a pair `relate` accepts — `comparison.verdict.result`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerdictResult {
    pub identity: VerdictIdentity,
    pub content: VerdictContent,
    pub decided_by: VerdictDecidedBy,
}

impl VerdictResult {
    /// The JSON shape the specification's `verdict` vectors describe.
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "identity": self.identity.as_str(),
            "content": self.content.as_str(),
            "decidedBy": {
                "identity": self.decided_by.identity,
                "content": self.decided_by.content,
            },
        })
    }
}

/// What two identifiers mean together once location qualifiers are hints rather than identity —
/// `relate`'s result reduced onto an identity axis and a content axis, per `comparison.verdict.rule`.
///
/// `None` for a pair `relate` refuses. Every qualifier fact this reduction needs — which keys carry a
/// `content` axis, which carry `identity`, each one's `conflict`, and `conflictWhenNeitherSideDeclares`
/// with its `keys` and `then` — is read from `spec.qualifiers[key].verdict`; a key with no `verdict`
/// member follows the rule's step three (any qualifier or refinement that relates as `differ` makes
/// identity `distinct`, exactly as it does for `covers`).
///
/// Mirrored: `verdict(b, a)` is this result with `covers` and `coveredBy` exchanged on the identity axis;
/// the content axis and `decidedBy` are unchanged (`comparison.verdict.symmetry`). Ported from
/// `packages/ref-id/src/relations.ts`'s `verdict`.
pub fn verdict<A: IdentifierArg + ?Sized, B: IdentifierArg + ?Sized>(a: &A, b: &B) -> Option<VerdictResult> {
    let spec = load_spec().ok()?;
    let related = relate(a, b)?;
    let x = read(spec, a)?;
    let y = read(spec, b)?;

    // The content axis: each qualifier whose verdict.axis is "content" (spec.qualifiers.*.verdict).
    let mut content_equal: Vec<String> = Vec::new();
    let mut content_differ: Vec<String> = Vec::new();
    let mut content_one_side: Vec<String> = Vec::new();
    for (key, relation) in &related.qualifiers {
        if qualifier_verdict_axis(spec, key) != Some("content") {
            continue;
        }
        let path = format!("qualifiers.{key}");
        match relation.relation {
            Relation::Equal => content_equal.push(path),
            Relation::Differ => content_differ.push(path),
            _ => content_one_side.push(path), // covers or coveredBy: declared on one side only
        }
    }
    let (content, content_decided) = if !content_differ.is_empty() {
        (VerdictContent::Different, content_differ)
    } else if !content_equal.is_empty() {
        (VerdictContent::Same, content_equal)
    } else {
        (VerdictContent::Unknown, content_one_side)
    };

    // The identity axis. Step one: the five fixed dimensions that relate as "differ".
    let mut distinct: Vec<String> = Vec::new();
    for dimension in FIXED_DIMENSIONS {
        if fixed_relation(&related, dimension) == Relation::Differ {
            distinct.push(dimension.to_string());
        }
    }

    // Step two: each identity-axis qualifier with a declared conflict, whose relation is "differ",
    // decides by its conflict — or by conflictWhenNeitherSideDeclares.then when none of its listed keys
    // is declared on either side ("declared" meaning present among that side's own parsed qualifiers).
    // Step three: a qualifier with no verdict member, or a fragment refinement (which never has one),
    // relating as "differ" makes identity distinct outright.
    let mut undetermined: Vec<String> = Vec::new();
    for (key, relation) in &related.qualifiers {
        if qualifier_verdict_axis(spec, key) == Some("content") {
            continue;
        }
        let path = format!("qualifiers.{key}");
        if relation.relation != Relation::Differ {
            continue;
        }
        let Some(conflict) = qualifier_verdict_conflict(spec, key) else {
            distinct.push(path); // step three
            continue;
        };
        let mut decision = conflict.to_string(); // step two, default
        if let Some((fallback_keys, then)) = qualifier_verdict_fallback(spec, key) {
            let declared = fallback_keys
                .iter()
                .any(|fallback_key| x.qualifiers.iter().any(|p| &p.key == fallback_key) || y.qualifiers.iter().any(|p| &p.key == fallback_key));
            if !declared {
                decision = then;
            }
        }
        if decision == "distinct" {
            distinct.push(path);
        } else {
            undetermined.push(path);
        }
    }
    for (key, relation) in &related.fragment_refinements {
        if *relation == Relation::Differ {
            distinct.push(format!("fragmentRefinements.{key}"));
        }
    }

    let (identity, identity_decided) = if !distinct.is_empty() {
        (VerdictIdentity::Distinct, distinct)
    } else if !undetermined.is_empty() {
        // Step four: an undetermined from step two, failing a distinct, makes identity undetermined —
        // decided by the conflicting location keys alone.
        (VerdictIdentity::Undetermined, undetermined)
    } else {
        // Step five: relate's result reduced with the content-axis qualifiers set aside. Every member
        // reaching here relates as "equal", "covers" or "coveredBy" — a "differ" would already have been
        // caught by steps one through three.
        let mut members: Vec<(String, Relation)> = FIXED_DIMENSIONS.iter().map(|dimension| (dimension.to_string(), fixed_relation(&related, dimension))).collect();
        for (key, relation) in &related.fragment_refinements {
            members.push((format!("fragmentRefinements.{key}"), *relation));
        }
        for (key, relation) in &related.qualifiers {
            if qualifier_verdict_axis(spec, key) == Some("content") {
                continue;
            }
            members.push((format!("qualifiers.{key}"), relation.relation));
        }
        let has_covers = members.iter().any(|(_, relation)| *relation == Relation::Covers);
        let has_covered_by = members.iter().any(|(_, relation)| *relation == Relation::CoveredBy);
        if !has_covers && !has_covered_by {
            (VerdictIdentity::Same, Vec::new())
        } else if has_covers && !has_covered_by {
            (VerdictIdentity::Covers, members.iter().filter(|(_, relation)| *relation == Relation::Covers).map(|(path, _)| path.clone()).collect())
        } else if has_covered_by && !has_covers {
            (VerdictIdentity::CoveredBy, members.iter().filter(|(_, relation)| *relation == Relation::CoveredBy).map(|(path, _)| path.clone()).collect())
        } else {
            // Neither reaches the other: one side declares what the other leaves open in one place and
            // the reverse in another, so nothing separates them.
            (VerdictIdentity::Undetermined, members.iter().filter(|(_, relation)| *relation != Relation::Equal).map(|(path, _)| path.clone()).collect())
        }
    };

    Some(VerdictResult {
        identity,
        content,
        decided_by: VerdictDecidedBy {
            identity: order_decided(&identity_decided),
            content: order_decided(&content_decided),
        },
    })
}
