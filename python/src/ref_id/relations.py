# SPDX-License-Identifier: Apache-2.0
"""The three questions equality cannot answer. `same_identifier` says whether two strings name one thing,
which is deliberately strict. `same_package` says whether two identifiers name the same released thing at
whatever version each declares; `covers` says whether a partial identifier stands for a whole family of
complete ones. `relate` reports the relation in every dimension instead of reducing it to one boolean;
`covers`, `coveredBy` and `same_package` are stated as reductions of that same result, so they are
implemented as reductions here too, rather than as three computations that could disagree.

Ported from `crates/ref-id/src/relations.rs` — read that file's comments for the full rationale; this
restates none of the spec's own tables.
"""
from __future__ import annotations

from .errors import RefIdError
from .parse import parse
from .serialise import canonical_identifier
from .spec import Spec, load_spec
from .types import (
    Pair,
    ParseResult,
    QualifierRelation,
    RelateResult,
    Relation,
    VerdictContent,
    VerdictDecidedBy,
    VerdictIdentity,
    VerdictResult,
)

__all__ = ["covers", "relate", "same_identifier", "same_package", "verdict"]

# The specification's `IdentifierOrParsed`: a bare string, read with `parse`, or an already-parsed
# `ParseResult`, used as is. A pair may mix them freely.
IdentifierOrParsed = str | ParseResult

# The fixed dimensions `verdict`'s step one and step five walk, in the order `decidedBy` fixes them
# (`comparison.verdict.result.decidedBy`).
_FIXED_DIMENSIONS: tuple[str, ...] = ("type", "version", "locatorStem", "locatorVersion", "fragmentPath")


def _version_tail(spec: Spec, type_: str) -> bool:
    """Whether `dispatch.<type>.versionTail` is set. Read from the spec, never guessed from punctuation."""
    dispatch = spec.get_object("dispatch") or {}
    entry = dispatch.get(type_)
    return isinstance(entry, dict) and entry.get("versionTail") is True


def _split(spec: Spec, type_: str, locator: str) -> tuple[str, str | None]:
    """The locator without its version, and the version it carried — only for a type whose dispatch entry
    declares `versionTail`.

    **Whether a locator carries a version at all is the type's business**, read from `versionTail` rather
    than guessed from punctuation. Within a type that does carry one, an `@` that opens a segment —
    preceded by `/`, or first — belongs to a namespace (`npm/@acme/x` has no version). An `@` inside a
    segment closes the name: the version runs from it to the next `/`, and whatever follows that `/` is a
    path inside the named thing. **The path stays in the stem, and only the version leaves it** — a file
    at two releases is one file, so `npm/x@1.0.0/docs/guide.md` and `npm/x@2.0.0/docs/guide.md` share the
    stem `npm/x/docs/guide.md`. Ported from `crates/ref-id/src/relations.rs`'s `split`.
    """
    if not _version_tail(spec, type_):
        return locator, None
    for index in range(1, len(locator)):
        if locator[index] != "@" or locator[index - 1] == "/":
            continue
        slash = locator.find("/", index)
        if slash < 0:
            return locator[:index], locator[index + 1 :]
        return locator[:index] + locator[slash:], locator[index + 1 : slash]
    return locator, None


def _stem_reaches(general: str, specific: str) -> bool:
    """Whether the general identifier's stem reaches the specific one's — equal, or a whole **segment**
    prefix of it. Ported from `crates/ref-id/src/relations.rs`'s `stem_reaches`."""
    return general == specific or specific.startswith(f"{general}/")


def _read(spec: Spec, identifier: IdentifierOrParsed) -> ParseResult | None:
    """The identifier, when this package vouches for how it was decomposed — `ok` or `uncovered` only.
    `malformed` has no decomposition to compare, and `unsupported` has one read by the wrong grammar."""
    parsed = identifier if isinstance(identifier, ParseResult) else parse(identifier)
    if parsed.status in (spec.status("ok"), spec.status("uncovered")):
        return parsed
    return None


def _nested_value(parsed: ParseResult, key: str) -> str | None:
    """The decoded nested identifier behind a qualifier's raw value, keyed by qualifier key — `None` when
    this key's value is not one, on this side."""
    if parsed.nested is None:
        return None
    for candidate_key, value in parsed.nested:
        if candidate_key == key:
            return value
    return None


def _optional_relation(a: str | None, b: str | None) -> Relation:
    """The four-case relation between two optional raw values: equal when both agree or neither declares;
    covers when only the second declares; coveredBy for the mirror; differ when both declare and
    disagree."""
    if a is None and b is None:
        return "equal"
    if a is None:
        return "covers"
    if b is None:
        return "coveredBy"
    return "equal" if a == b else "differ"


def _segment_relation(a: str, b: str) -> Relation:
    """The locator-stem relation: equal, a whole-segment prefix either way (`covers`/`coveredBy`), or
    differ."""
    if a == b:
        return "equal"
    if _stem_reaches(a, b):
        return "covers"
    if _stem_reaches(b, a):
        return "coveredBy"
    return "differ"


def _qualifier_relation(
    spec: Spec, x: ParseResult, y: ParseResult, key: str, xv: str | None, yv: str | None
) -> QualifierRelation:
    """One qualifier's relation: raw-value comparison, except where both sides' value is a nested `ref:`
    identifier this relation accepts, where the nested pair is related the same way, one level deep, and
    this member's own relation is that nested result reduced (`_reduce`)."""
    if xv is not None and yv is not None:
        xa = _nested_value(x, key)
        ya = _nested_value(y, key)
        if xa is not None and ya is not None:
            xp = _read(spec, xa)
            yp = _read(spec, ya)
            if xp is not None and yp is not None:
                nested = _relate_result(spec, xp, yp)
                return QualifierRelation(relation=_reduce(nested), nested=nested)
    return QualifierRelation(relation=_optional_relation(xv, yv))


def _declared_keys(x: tuple[Pair, ...], y: tuple[Pair, ...]) -> list[str]:
    """The keys of two pair tuples, each once, in first-seen order across both sides.

    `pair_key not in keys` against a growing list is quadratic in the qualifier count; a set kept beside
    the ordered list turns that membership check constant while `keys` still carries the order."""
    keys: list[str] = []
    seen: set[str] = set()
    for pair_key, _pair_value in x + y:
        if pair_key not in seen:
            seen.add(pair_key)
            keys.append(pair_key)
    return keys


def _relate_result(spec: Spec, x: ParseResult, y: ParseResult) -> RelateResult:
    """`comparison.relate.result`: every dimension computed on its own, whatever the others found."""
    type_relation: Relation = "equal" if x.type == y.type else "differ"
    version_relation: Relation = "equal" if x.version == y.version else "differ"

    x_stem, x_version = _split(spec, x.type, x.locator)
    y_stem, y_version = _split(spec, y.type, y.locator)
    locator_stem = _segment_relation(x_stem, y_stem)
    locator_version = _optional_relation(x_version, y_version)

    x_path = x.fragment.path if x.fragment is not None else None
    y_path = y.fragment.path if y.fragment is not None else None
    fragment_path = _optional_relation(x_path, y_path)

    xr = x.fragment.refinements if x.fragment is not None else ()
    yr = y.fragment.refinements if y.fragment is not None else ()
    xr_map = dict(xr)
    yr_map = dict(yr)
    fragment_refinements = tuple(
        (key, _optional_relation(xr_map.get(key), yr_map.get(key))) for key in _declared_keys(xr, yr)
    )

    x_map = dict(x.qualifiers)
    y_map = dict(y.qualifiers)
    qualifiers = tuple(
        (key, _qualifier_relation(spec, x, y, key, x_map.get(key), y_map.get(key)))
        for key in _declared_keys(x.qualifiers, y.qualifiers)
    )

    return RelateResult(
        type=type_relation,
        version=version_relation,
        locator_stem=locator_stem,
        locator_version=locator_version,
        fragment_path=fragment_path,
        fragment_refinements=fragment_refinements,
        qualifiers=qualifiers,
    )


def _reduce(result: RelateResult) -> Relation:
    """`comparison.relate.reduction`: a result reduces to one relation across the five fixed dimensions,
    each refinement, and each qualifier's own relation (which, for a nested qualifier, is already that
    nested result reduced by this same rule)."""
    relations: list[Relation] = [
        result.type,
        result.version,
        result.locator_stem,
        result.locator_version,
        result.fragment_path,
    ]
    relations.extend(relation for _key, relation in result.fragment_refinements)
    relations.extend(qualifier.relation for _key, qualifier in result.qualifiers)
    if all(relation == "equal" for relation in relations):
        return "equal"
    if all(relation in ("equal", "covers") for relation in relations):
        return "covers"
    if all(relation in ("equal", "coveredBy") for relation in relations):
        return "coveredBy"
    return "differ"


def _same_package_reduces(result: RelateResult) -> bool:
    """`comparison.relate.reductions.samePackage`: type, version, locator stem, fragment path and every
    refinement equal; the locator version ignored entirely; each qualifier equal, or — where it carries a
    nested result — `samePackage` holding on that nested result instead of its own (possibly `differ`)
    relation, so one engine at two releases is one engine even though `by=` itself reports `differ`."""
    if result.type != "equal" or result.version != "equal" or result.locator_stem != "equal" or result.fragment_path != "equal":
        return False
    if any(relation != "equal" for _key, relation in result.fragment_refinements):
        return False
    for _key, qualifier in result.qualifiers:
        if qualifier.nested is not None:
            if not _same_package_reduces(qualifier.nested):
                return False
        elif qualifier.relation != "equal":
            return False
    return True


def same_identifier(a: IdentifierOrParsed, b: IdentifierOrParsed, /) -> bool:
    """Whether two identifiers name one thing: their canonical spellings are equal byte for byte
    (`identifierEquivalence.comparison`). An identifier with no canonical form — malformed, or at a scheme
    version this package does not support — names nothing here, so it is never the same as anything,
    including itself; the same status check `_read` uses (`ok` or `uncovered` only) gates this before
    `canonical_identifier` ever runs."""
    spec = load_spec()
    x = _read(spec, a)
    y = _read(spec, b)
    if x is None or y is None:
        return False
    try:
        return canonical_identifier(x) == canonical_identifier(y)
    except RefIdError:
        return False


def relate(a: IdentifierOrParsed, b: IdentifierOrParsed, /) -> RelateResult | None:
    """How two identifiers relate in each dimension the specification names — `comparison.relate`. `None`
    for a pair this relation refuses: malformed, or at a scheme version this package does not support, on
    either side. `covers`, `same_package` and `covers(b, a)` (`coveredBy`) are reductions of this result."""
    spec = load_spec()
    x = _read(spec, a)
    y = _read(spec, b)
    if x is None or y is None:
        return None
    return _relate_result(spec, x, y)


def same_package(a: IdentifierOrParsed, b: IdentifierOrParsed, /) -> bool:
    """Whether two identifiers name the same released thing, at whatever version each declares.

    Symmetric, and version-blind in exactly one place: the locator of a type whose dispatch entry declares
    `versionTail`. Everything else still distinguishes. A malformed identifier, and one at an identifier
    version this package does not implement, name nothing here and so are the same as nothing, including
    themselves. Implemented as `comparison.relate.reductions.samePackage` on `relate`'s result, so it
    cannot disagree with `relate` about the same pair."""
    spec = load_spec()
    x = _read(spec, a)
    y = _read(spec, b)
    if x is None or y is None:
        return False
    return _same_package_reduces(_relate_result(spec, x, y))


def covers(general: IdentifierOrParsed, specific: IdentifierOrParsed, /) -> bool:
    """Whether the first identifier is the second with less declared — the general covering the specific.

    Asymmetric, and the direction is the whole point. Implemented as `comparison.relate.reductions.covers`
    on `relate`'s result, so it cannot disagree with `relate` about the same pair."""
    spec = load_spec()
    x = _read(spec, general)
    y = _read(spec, specific)
    if x is None or y is None:
        return False
    return _reduce(_relate_result(spec, x, y)) in ("equal", "covers")


def _qualifier_verdict_axis(spec: Spec, key: str) -> str | None:
    """A qualifier's `verdict.axis`, read from `spec.qualifiers.<key>.verdict` — never restated
    (`.agents/rules/repo-guardrails.md`). `None` for a key with no `verdict` member."""
    value = spec.value("qualifiers", key, "verdict", "axis")
    return value if isinstance(value, str) else None


def _qualifier_verdict_conflict(spec: Spec, key: str) -> str | None:
    """A qualifier's `verdict.conflict`, or `None` when the key has no `verdict` member at all."""
    value = spec.value("qualifiers", key, "verdict", "conflict")
    return value if isinstance(value, str) else None


def _qualifier_verdict_fallback(spec: Spec, key: str) -> tuple[list[str], str] | None:
    """A qualifier's `verdict.conflictWhenNeitherSideDeclares` (`keys`, `then`), when declared."""
    node = spec.value("qualifiers", key, "verdict", "conflictWhenNeitherSideDeclares")
    if not isinstance(node, dict):
        return None
    keys = node.get("keys")
    then = node.get("then")
    if not isinstance(keys, list) or not isinstance(then, str):
        return None
    return [key for key in keys if isinstance(key, str)], then


def _fixed_relation(result: RelateResult, dimension: str) -> Relation:
    """One of the five fixed dimensions of a `RelateResult`, read by its `decidedBy` path name rather than
    by attribute — the path names are the specification's vocabulary, the dataclass fields are Python's."""
    if dimension == "type":
        return result.type
    if dimension == "version":
        return result.version
    if dimension == "locatorStem":
        return result.locator_stem
    if dimension == "locatorVersion":
        return result.locator_version
    if dimension == "fragmentPath":
        return result.fragment_path
    raise AssertionError(f"_fixed_relation called with a non-fixed dimension: {dimension}")


def _by_key(path: str) -> bytes:
    return path.encode("utf-16-be", "surrogatepass")


def _order_decided(paths: list[str]) -> tuple[str, ...]:
    """`decidedBy`'s fixed order: the five dimensions in `_FIXED_DIMENSIONS`'s order, then refinement
    keys, then qualifier keys, each of the latter two groups sorted by UTF-16 code unit order."""
    fixed = [dimension for dimension in _FIXED_DIMENSIONS if dimension in paths]
    refinements = sorted((path for path in paths if path.startswith("fragmentRefinements.")), key=_by_key)
    qualifiers = sorted((path for path in paths if path.startswith("qualifiers.")), key=_by_key)
    return tuple(fixed + refinements + qualifiers)


def verdict(a: IdentifierOrParsed, b: IdentifierOrParsed, /) -> VerdictResult | None:
    """What two identifiers mean together once location qualifiers are hints rather than identity —
    `relate`'s result reduced onto an identity axis and a content axis, per `comparison.verdict.rule`.

    `None` for a pair `relate` refuses. Mirrored: `verdict(b, a)` is this result with `covers` and
    `coveredBy` exchanged on the identity axis; the content axis and `decidedBy` are unchanged
    (`comparison.verdict.symmetry`). Ported from `crates/ref-id/src/relations.rs`'s `verdict`.
    """
    spec = load_spec()
    related = relate(a, b)
    if related is None:
        return None
    x = _read(spec, a)
    y = _read(spec, b)
    if x is None or y is None:
        return None
    x_keys = {key for key, _value in x.qualifiers}
    y_keys = {key for key, _value in y.qualifiers}

    # The content axis: each qualifier whose verdict.axis is "content" (spec.qualifiers.*.verdict).
    content_equal: list[str] = []
    content_differ: list[str] = []
    content_one_side: list[str] = []
    for key, qualifier in related.qualifiers:
        if _qualifier_verdict_axis(spec, key) != "content":
            continue
        path = f"qualifiers.{key}"
        if qualifier.relation == "equal":
            content_equal.append(path)
        elif qualifier.relation == "differ":
            content_differ.append(path)
        else:  # covers or coveredBy: declared on one side only
            content_one_side.append(path)

    content: VerdictContent
    content_decided: list[str]
    if content_differ:
        content, content_decided = "different", content_differ
    elif content_equal:
        content, content_decided = "same", content_equal
    else:
        content, content_decided = "unknown", content_one_side

    # The identity axis. Step one: the five fixed dimensions that relate as "differ".
    distinct: list[str] = [dimension for dimension in _FIXED_DIMENSIONS if _fixed_relation(related, dimension) == "differ"]

    # Step two: each identity-axis qualifier with a declared conflict, whose relation is "differ", decides
    # by its conflict — or by conflictWhenNeitherSideDeclares.then when none of its listed keys is
    # declared on either side ("declared" meaning present among that side's own parsed qualifiers).
    # Step three: a qualifier with no verdict member, or a fragment refinement (which never has one),
    # relating as "differ" makes identity distinct outright.
    undetermined: list[str] = []
    for key, qualifier in related.qualifiers:
        if _qualifier_verdict_axis(spec, key) == "content":
            continue
        path = f"qualifiers.{key}"
        if qualifier.relation != "differ":
            continue
        conflict = _qualifier_verdict_conflict(spec, key)
        if conflict is None:
            distinct.append(path)  # step three
            continue
        decision = conflict  # step two, default
        fallback = _qualifier_verdict_fallback(spec, key)
        if fallback is not None:
            fallback_keys, then = fallback
            if not any(fallback_key in x_keys or fallback_key in y_keys for fallback_key in fallback_keys):
                decision = then
        if decision == "distinct":
            distinct.append(path)
        else:
            undetermined.append(path)
    for key, relation in related.fragment_refinements:
        if relation == "differ":
            distinct.append(f"fragmentRefinements.{key}")

    identity: VerdictIdentity
    identity_decided: list[str]
    if distinct:
        identity, identity_decided = "distinct", distinct
    elif undetermined:
        # Step four: an undetermined from step two, failing a distinct, makes identity undetermined —
        # decided by the conflicting location keys alone.
        identity, identity_decided = "undetermined", undetermined
    else:
        # Step five: relate's result reduced with the content-axis qualifiers set aside. Every member
        # reaching here relates as "equal", "covers" or "coveredBy" — a "differ" would already have been
        # caught by steps one through three.
        members: list[tuple[str, Relation]] = [(dimension, _fixed_relation(related, dimension)) for dimension in _FIXED_DIMENSIONS]
        members.extend((f"fragmentRefinements.{key}", relation) for key, relation in related.fragment_refinements)
        for key, qualifier in related.qualifiers:
            if _qualifier_verdict_axis(spec, key) == "content":
                continue
            members.append((f"qualifiers.{key}", qualifier.relation))
        has_covers = any(relation == "covers" for _path, relation in members)
        has_covered_by = any(relation == "coveredBy" for _path, relation in members)
        if not has_covers and not has_covered_by:
            identity, identity_decided = "same", []
        elif has_covers and not has_covered_by:
            identity = "covers"
            identity_decided = [path for path, relation in members if relation == "covers"]
        elif has_covered_by and not has_covers:
            identity = "coveredBy"
            identity_decided = [path for path, relation in members if relation == "coveredBy"]
        else:
            # Neither reaches the other: one side declares what the other leaves open in one place and
            # the reverse in another, so nothing separates them.
            identity = "undetermined"
            identity_decided = [path for path, relation in members if relation != "equal"]

    return VerdictResult(
        identity=identity,
        content=content,
        decided_by=VerdictDecidedBy(
            identity=_order_decided(identity_decided),
            content=_order_decided(content_decided),
        ),
    )
