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
from typing import Any

__all__ = [
    "BuildParts",
    "EnvelopeResult",
    "Fragment",
    "NestedValue",
    "ParseResult",
]

Pair = tuple[str, str]


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
        `{"nested": <identifier>}`; `fragment` a string or `{path, refinements}`."""
        qualifiers: list[tuple[str, QualifierValue]] = []
        for pair in obj.get("qualifiers", []):
            key, raw_value = pair[0], pair[1]
            value: QualifierValue = raw_value if isinstance(raw_value, str) else NestedValue(raw_value["nested"])
            qualifiers.append((key, value))

        fragment_json = obj.get("fragment")
        fragment: FragmentParts | None
        if fragment_json is None:
            fragment = None
        elif isinstance(fragment_json, str):
            fragment = fragment_json
        else:
            refinements = tuple((pair[0], pair[1]) for pair in fragment_json.get("refinements", []))
            fragment = Fragment(path=fragment_json["path"], refinements=refinements)

        return cls(
            type=obj["type"],
            locator=obj["locator"],
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
