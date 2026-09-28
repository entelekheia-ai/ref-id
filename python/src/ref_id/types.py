# SPDX-License-Identifier: Apache-2.0
"""The value types `parse`, `serialise`, `build` and `validate_envelope` exchange — frozen, slotted
dataclasses with snake_case attributes. `to_json()` on `ParseResult` and `EnvelopeResult` returns the
`openRPC` keys exactly (camelCase, optional keys omitted when unset); `BuildParts.from_json` reads the
vector shape.

Ported from `crates/ref-id/src/types.rs`.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from .errors import BuildError

__all__ = [
    "BuildParts",
    "EnvelopeResult",
    "Fragment",
    "NestedValue",
    "ParseResult",
    "QualifierRelation",
    "RelateResult",
    "Relation",
    "VerdictContent",
    "VerdictDecidedBy",
    "VerdictIdentity",
    "VerdictResult",
]

Pair = tuple[str, str]

# `comparison.relate.relations` — one relation between two identifiers in one dimension.
Relation = Literal["equal", "covers", "coveredBy", "differ"]

# `comparison.verdict.axes.identity` and `.content`.
VerdictIdentity = Literal["same", "covers", "coveredBy", "distinct", "undetermined"]
VerdictContent = Literal["same", "different", "unknown"]


def _pairs_json(pairs: tuple[Pair, ...]) -> list[list[str]]:
    return [[key, value] for key, value in pairs]


@dataclass(frozen=True, slots=True)
class Fragment:
    """The `#path;refinements` a parsed identifier carries, or the parts a producer hands `build`."""

    path: str
    refinements: tuple[Pair, ...] = ()

    def to_json(self) -> dict[str, Any]:
        return {"path": self.path, "refinements": _pairs_json(self.refinements)}


@dataclass(frozen=True, slots=True)
class NestedValue:
    """`BuildParts`' `{"nested": <identifier>}` qualifier value."""

    nested: str


# The value a `BuildParts` qualifier carries: a plain string, or a nested identifier not yet encoded.
QualifierValue = str | NestedValue

# The fragment a producer hands `build`: a bare path, or the path with its refinements.
FragmentParts = str | Fragment


@dataclass(frozen=True, slots=True)
class ParseResult:
    """What `parse()` returns. `status` is one of `spec.statuses`; `part` one of `spec.parts` on
    `malformed`."""

    input: str
    status: str
    version: int
    explicit_version: bool
    type: str
    locator: str
    qualifiers: tuple[Pair, ...] = ()
    fragment: Fragment | None = None
    version_text: str | None = None
    delegated: str | None = None
    canonical: str | None = None
    nested: tuple[Pair, ...] | None = None
    part: str | None = None

    def to_json(self) -> dict[str, Any]:
        """The result as the JSON shape the specification's vectors describe — what a conformance test
        compares."""
        out: dict[str, Any] = {
            "input": self.input,
            "status": self.status,
            "version": self.version,
            "explicitVersion": self.explicit_version,
            "type": self.type,
            "locator": self.locator,
            "qualifiers": _pairs_json(self.qualifiers),
            "fragment": self.fragment.to_json() if self.fragment is not None else None,
        }
        if self.version_text is not None:
            out["versionText"] = self.version_text
        if self.delegated is not None:
            out["delegated"] = self.delegated
        if self.canonical is not None:
            out["canonical"] = self.canonical
        if self.nested is not None:
            out["nested"] = {key: value for key, value in self.nested}
        if self.part is not None:
            out["part"] = self.part
        return out


def _refusal(part: str, why: str) -> BuildError:
    """A `BuildError` whose part the specification names, through the same path `build()` refuses by."""
    from .build import _refuse
    from .spec import load_spec

    return _refuse(load_spec(), part, why)


@dataclass(frozen=True, slots=True)
class BuildParts:
    """What `build()` takes. `location` never reaches the identifier, so it is read by `from_json` and
    discarded rather than carried as a field."""

    type: str
    locator: str
    qualifiers: tuple[tuple[str, QualifierValue], ...] = ()
    fragment: FragmentParts | None = None

    @classmethod
    def from_json(cls, obj: Mapping[str, Any], /) -> BuildParts:
        """Reads the vector shape: `qualifiers` a list of `[key, value]` pairs whose value is a string or
        `{"nested": <identifier>}`; `fragment` a string or `{path, refinements}`. A shape this cannot
        read raises `BuildError` naming the part, never `IndexError`/`KeyError`/`TypeError` — the same
        kind `build()` itself raises for a badly typed part (`crates/ref-id/src/build.rs` has no
        equivalent step; the TypeScript reference takes the JSON shape directly as `BuildParts`, so this
        naming is this port's own)."""
        type_ = obj.get("type")
        if not isinstance(type_, str):
            raise _refusal("type", "parts must have a string type")
        locator = obj.get("locator")
        if not isinstance(locator, str):
            raise _refusal("locator", "parts must have a string locator")

        qualifiers: list[tuple[str, QualifierValue]] = []
        for pair in obj.get("qualifiers", []):
            if not isinstance(pair, (list, tuple)) or len(pair) != 2 or not isinstance(pair[0], str):
                raise _refusal("state", "a qualifier is a [key, value] pair with a string key")
            key, raw_value = pair[0], pair[1]
            value: QualifierValue
            if isinstance(raw_value, str):
                value = raw_value
            elif isinstance(raw_value, Mapping) and "nested" in raw_value:
                # `build()` raises `BuildError` at this same key if `nested` is not a string.
                value = NestedValue(raw_value["nested"])
            else:
                raise _refusal(key, 'a qualifier value is a string or {"nested": string}')
            qualifiers.append((key, value))

        fragment_json = obj.get("fragment")
        fragment: FragmentParts | None
        if fragment_json is None:
            fragment = None
        elif isinstance(fragment_json, str):
            fragment = fragment_json
        elif isinstance(fragment_json, Mapping) and isinstance(fragment_json.get("path"), str):
            refinements = tuple((pair[0], pair[1]) for pair in fragment_json.get("refinements", []))
            fragment = Fragment(path=fragment_json["path"], refinements=refinements)
        else:
            raise _refusal("fragment", "a fragment is a string or {path, refinements}")

        return cls(
            type=type_,
            locator=locator,
            qualifiers=tuple(qualifiers),
            fragment=fragment,
        )


@dataclass(frozen=True, slots=True)
class EnvelopeResult:
    """Whether an envelope is admissible for the identifier it was requested under."""

    admissible: bool
    reason: str | None = None

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {"admissible": self.admissible}
        if self.reason is not None:
            out["reason"] = self.reason
        return out


@dataclass(frozen=True, slots=True)
class QualifierRelation:
    """One qualifier member of a `RelateResult`: its own relation, and — only where both sides' values are
    a nested `ref:` identifier this operation accepts — the nested pair's own `RelateResult`."""

    relation: Relation
    nested: RelateResult | None = None

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {"relation": self.relation}
        if self.nested is not None:
            out["nested"] = self.nested.to_json()
        return out


@dataclass(frozen=True, slots=True)
class RelateResult:
    """What `relate()` returns for a pair it accepts — `comparison.relate.result`: the five fixed
    dimensions always, and a keyed dimension (`fragment_refinements`, `qualifiers`) only for the keys at
    least one side declares."""

    type: Relation
    version: Relation
    locator_stem: Relation
    locator_version: Relation
    fragment_path: Relation
    fragment_refinements: tuple[tuple[str, Relation], ...] = ()
    qualifiers: tuple[tuple[str, QualifierRelation], ...] = ()

    def to_json(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "version": self.version,
            "locatorStem": self.locator_stem,
            "locatorVersion": self.locator_version,
            "fragmentPath": self.fragment_path,
            "fragmentRefinements": {key: value for key, value in self.fragment_refinements},
            "qualifiers": {key: value.to_json() for key, value in self.qualifiers},
        }


@dataclass(frozen=True, slots=True)
class VerdictDecidedBy:
    """Which members of `relate`'s result decided each axis, by their `decidedBy` path —
    `comparison.verdict.result.decidedBy`."""

    identity: tuple[str, ...] = ()
    content: tuple[str, ...] = ()

    def to_json(self) -> dict[str, Any]:
        return {"identity": list(self.identity), "content": list(self.content)}


@dataclass(frozen=True, slots=True)
class VerdictResult:
    """What `verdict()` returns for a pair `relate` accepts — `comparison.verdict.result`."""

    identity: VerdictIdentity
    content: VerdictContent
    decided_by: VerdictDecidedBy

    def to_json(self) -> dict[str, Any]:
        return {
            "identity": self.identity,
            "content": self.content,
            "decidedBy": self.decided_by.to_json(),
        }
