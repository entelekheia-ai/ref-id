# SPDX-License-Identifier: Apache-2.0
"""Loads the embedded `spec/ref-id.json`, verifies its digest against the sidecar, and checks the
`specVersion` major. The specification's own data is never restated here: it is read dynamically from
the parsed JSON through the accessors below.

Ported from `crates/ref-id/src/spec.rs`.
"""
from __future__ import annotations

import hashlib
import json
import os
from importlib import resources
from typing import TYPE_CHECKING, Any

from .canonical import canonicalise
from .errors import SpecIntegrityError, SpecVersionError

if TYPE_CHECKING:
    from .grammar import Grammar

__all__ = ["Spec", "embedded_spec_text", "load_spec", "load_spec_from"]

# The major version this package was built against. Not spec data — the package's own contract.
_SUPPORTED_SPEC_MAJOR = "1"


class Spec:
    """The `ref:` specification, read dynamically. Every table the code consults is looked up here."""

    def __init__(self, root: dict[str, Any]) -> None:
        self._root = root
        self._grammar: Grammar | None = None

    def value(self, *path: str) -> Any | None:
        current: Any = self._root
        for key in path:
            if not isinstance(current, dict) or key not in current:
                return None
            current = current[key]
        return current

    def get_str(self, *path: str) -> str:
        value = self.value(*path)
        return value if isinstance(value, str) else ""

    def get_int(self, *path: str) -> int:
        value = self.value(*path)
        return value if isinstance(value, int) and not isinstance(value, bool) else 0

    def get_strings(self, *path: str) -> list[str]:
        value = self.value(*path)
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, str)]

    def get_object(self, *path: str) -> dict[str, Any] | None:
        value = self.value(*path)
        return value if isinstance(value, dict) else None

    def get_ints(self, *path: str) -> list[int]:
        value = self.value(*path)
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, int) and not isinstance(item, bool)]

    def get_table(self, *path: str) -> list[tuple[str, str]]:
        obj = self.get_object(*path)
        if obj is None:
            return []
        return [(key, value) for key, value in obj.items() if isinstance(value, str)]

    def spec_version(self) -> str:
        return self.get_str("specVersion")

    def scheme(self) -> str:
        return self.get_str("scheme")

    def unknown_type(self) -> str:
        return self.get_str("unknownType")

    def status(self, name: str) -> str:
        """A status name this code needs, checked against the vocabulary the spec declares."""
        if name in self.get_strings("statuses"):
            return name
        raise SpecVersionError(f'this package names the status "{name}", which spec {self.spec_version()} does not declare')

    def part(self, name: str) -> str:
        """A part name this code needs: one of `spec.parts`, or a declared qualifier or refinement key."""
        qualifiers = self.get_object("qualifiers") or {}
        refinements = self.get_object("refinements") or {}
        if name in self.get_strings("parts") or name in qualifiers or name in refinements:
            return name
        raise SpecVersionError(f'this package names the part "{name}", which spec {self.spec_version()} does not declare')

    def vectors(self, group: str) -> list[Any]:
        """The vectors of one group, for a conformance runner."""
        value = self.value("vectors", group)
        return value if isinstance(value, list) else []

    def vector_classes(self) -> list[str]:
        """Every vector group name `spec.vectors` declares, so a runner can prove it executes all of them."""
        groups = self.get_object("vectors") or {}
        return list(groups.keys())

    def grammar_expression(self) -> str:
        """The canonical grammar expression, for a dialect measurement."""
        return self.get_str("grammar", "expression")

    def grammar(self) -> Grammar:
        """The patterns this spec compiles to, lazily compiled and cached — every reader shares one
        instance per loaded spec."""
        from .grammar import Grammar

        if self._grammar is None:
            self._grammar = Grammar.compile_for(self)
        return self._grammar


def _validate(text: str, sidecar: str) -> Spec:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as error:
        raise SpecIntegrityError(f"spec/ref-id.json is not JSON: {error}") from error
    except (ValueError, RecursionError) as error:
        # `json.loads` itself converts a number literal to `int`/`float` and recurses per nesting level:
        # a literal long enough hits CPython's int-conversion digit-count guard (`ValueError`, not
        # `json.JSONDecodeError`), and nesting deep enough hits its call-stack limit (`RecursionError`).
        # Both are the document's shape being unreadable, reported the same way as malformed JSON rather
        # than surfacing CPython's own exception kinds to a caller who would have to know to expect them.
        raise SpecIntegrityError(f"spec/ref-id.json cannot be parsed: {error}") from error
    canonical = canonicalise(parsed)
    computed = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    expected = sidecar.strip()
    if computed != expected:
        raise SpecIntegrityError(f"spec/ref-id.json does not match its sidecar digest (expected {expected}, computed {computed})")
    spec = Spec(parsed)
    major = spec.spec_version().split(".")[0]
    if major != _SUPPORTED_SPEC_MAJOR:
        raise SpecVersionError(f"spec/ref-id.json declares specVersion {spec.spec_version()}; this package supports major {_SUPPORTED_SPEC_MAJOR}")
    return spec


def load_spec_from(directory: str | os.PathLike[str], /) -> Spec:
    """Loads and validates a spec + sidecar pair from a directory; the integrity tests use this."""
    directory = os.fspath(directory)
    try:
        with open(os.path.join(directory, "ref-id.json"), encoding="utf-8") as handle:
            text = handle.read()
        with open(os.path.join(directory, "ref-id.json.sha256"), encoding="utf-8") as handle:
            sidecar = handle.read()
    except (OSError, UnicodeDecodeError) as error:
        # A missing file or directory raises `OSError`; a file that is not valid UTF-8 raises
        # `UnicodeDecodeError` from `handle.read()` — neither belongs on a caller who was promised
        # `SpecIntegrityError` for every way this pair can fail to be the specification it claims to be.
        raise SpecIntegrityError(str(error)) from error
    return _validate(text, sidecar)


def embedded_spec_text() -> tuple[str, str]:
    """The embedded specification's bytes, so a runner can prove them byte-identical to the repository's file."""
    # `ref_id.spec` carries no `__init__.py` of its own — it is a byte-identical copy of `spec/`, not a
    # subpackage — so the anchor is `ref_id` and `spec/` is addressed as a resource path under it.
    # `Traversable.read_text` opens in text mode, which performs universal-newline translation; the
    # digest covers the file's actual bytes, so this reads them raw and decodes them itself instead.
    package = resources.files("ref_id").joinpath("spec")
    json_text = package.joinpath("ref-id.json").read_bytes().decode("utf-8")
    sidecar_text = package.joinpath("ref-id.json.sha256").read_bytes().decode("utf-8")
    return json_text, sidecar_text


_CACHED: Spec | None = None


def load_spec() -> Spec:
    """The validated spec this package embeds, loaded once."""
    global _CACHED
    if _CACHED is None:
        json_text, sidecar_text = embedded_spec_text()
        _CACHED = _validate(json_text, sidecar_text)
    return _CACHED
