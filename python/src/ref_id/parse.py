# SPDX-License-Identifier: Apache-2.0
"""Decomposes a `ref:` identifier string against the loaded spec. Order, and the precedence it
produces: grammar -> version -> state and fragment decomposition, including the repeated-key policy ->
(unsupported version stops here, decomposed and unvalidated) -> the two sides must not trade keys ->
qualifier values against their forms -> refinement values against their patterns and range constraints ->
dispatch: unknown type is `uncovered`, else the locator goes to its validator.

Ported from `crates/ref-id/src/parse.rs`.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Any

from .encoding import decode, strictly_encoded, table_for
from .grammar import Grammar, scheme_prefix
from .spec import Spec, load_spec
from .types import Fragment, ParseResult
from .validators import (
    assert_implemented,
    delegated_string,
    range_holds,
    validate_locator,
)

__all__ = ["parse"]


def _bounded_int(text: str, maximum: int) -> int:
    """A digit-only literal capped at `maximum`, without ever handing CPython's `int()` a literal longer
    than `maximum` itself can be — which keeps this independent of `sys.get_int_max_str_digits()`. Leading
    zeros are stripped first (`"007"` and `"7"` must compare the same); a literal whose stripped digit
    count exceeds `str(maximum)`'s is above `maximum` on digit count alone, so it is never converted.
    Whatever survives to `int()` is no longer than `maximum`'s own digit count, which is always small."""
    stripped = text.lstrip("0") or "0"
    if len(stripped) > len(str(maximum)):
        return maximum
    return min(int(stripped), maximum)


class _Parser:
    def __init__(self, spec: Spec, grammar: Grammar) -> None:
        self.spec = spec
        self.grammar = grammar

    def _malformed(self, input_: str, part: str, head: ParseResult | None) -> ParseResult:
        return self._malformed_at(input_, self.spec.part(part), head)

    def _malformed_at(self, input_: str, part: str, head: ParseResult | None) -> ParseResult:
        """Malformed at a key the identifier itself carries — reported verbatim, not checked against the
        vocabulary this package names, because an undeclared key is carried through by policy."""
        base = head if head is not None else ParseResult(
            input="",
            status="",
            version=self.spec.get_int("version", "default"),
            explicit_version=False,
            type="",
            locator="",
        )
        return replace(
            base,
            input=input_,
            status=self.spec.status("malformed"),
            delegated=None,
            canonical=None,
            nested=None,
            part=part,
        )

    def _pairs(self, pattern: Any, segments: list[str], failed_part: str) -> tuple[str, Any]:
        """Splits `key=value` segments with the given pair grammar; a repeated key is malformed at that
        key. Returns `("ok", tuple[Pair, ...])`, `("failed", part)` or `("repeated", key)`."""
        out: list[tuple[str, str]] = []
        seen: set[str] = set()
        for segment in segments:
            match = pattern.fullmatch(segment)
            if match is None:
                return "failed", failed_part
            key = match.group("key") or ""
            if key in seen:
                return "repeated", key
            seen.add(key)
            out.append((key, match.group("value") or ""))
        return "ok", tuple(out)

    def _state(self, raw: str) -> tuple[str, Any]:
        segments = raw.split(self.spec.get_str("grammar", "state", "separator"))
        return self._pairs(self.grammar.state_pair, segments, "state")

    def _fragment(self, raw: str) -> tuple[str, Any]:
        segments = raw.split(self.spec.get_str("grammar", "fragment", "separator"))
        path = segments[0] if segments else ""
        if not path:
            return "failed", "fragment"
        kind, value = self._pairs(self.grammar.fragment_pair, segments[1:], "fragment")
        if kind == "ok":
            return "ok", Fragment(path=path, refinements=value)
        return kind, value

    def _try_nested(self, form: dict[str, Any], value: str, depth: int) -> str | None:
        """A qualifier value that nests an identifier: strictly encoded, decoded with the form's table,
        parsed one level down."""
        max_depth = form.get("depth", 0)
        if not isinstance(max_depth, int) or depth >= max_depth or not value.startswith(scheme_prefix(self.spec)):
            return None
        table = table_for(self.spec, form)
        if not strictly_encoded(value, table):
            return None
        decoded = decode(value, table)
        inner = self.parse(decoded, depth + 1)
        return None if inner.status == self.spec.status("malformed") else decoded

    def _match_forms(self, names: list[str], value: str, depth: int) -> tuple[bool, str | None]:
        forms = self.spec.get_object("forms") or {}
        for name in names:
            form = forms.get(name)
            if not isinstance(form, dict):
                continue
            if form.get("nested") is True:
                nested = self._try_nested(form, value, depth)
                if nested is not None:
                    return True, nested
                continue
            pattern = form.get("pattern")
            if isinstance(pattern, str) and self.grammar.matches(self.spec, pattern, value):
                return True, None
        return False, None

    def parse(self, input_: str, depth: int) -> ParseResult:
        match = self.grammar.top.fullmatch(input_)
        if match is None:
            return self._malformed(input_, "grammar", None)

        def opt(name: str) -> str | None:
            return match.groupdict().get(name)

        version_text = opt("version")
        type_ = opt("type") or ""
        locator = opt("locator") or ""
        explicit_version = version_text is not None
        # `[0-9]+` guarantees a digit-only literal, but `int()` on one long enough hits CPython's
        # int-conversion digit-count guard (`sys.get_int_max_str_digits()`, 4300 by default and settable
        # as low as 640) — a literal that long is already far above `version.maximum`, so `_bounded_int`
        # decides by digit count before ever converting; `versionText` below keeps the literal exactly as
        # written regardless.
        version = self.spec.get_int("version", "default")
        if version_text is not None:
            maximum = self.spec.get_int("version", "maximum")
            version = _bounded_int(version_text, maximum)

        head = ParseResult(
            input=input_,
            status="",
            version=version,
            explicit_version=explicit_version,
            type=type_,
            locator=locator,
            version_text=version_text,
        )

        state_raw = opt("state")
        if state_raw is not None:
            kind, value = self._state(state_raw)
            if kind == "failed":
                return self._malformed(input_, value, head)
            if kind == "repeated":
                return self._malformed_at(input_, value, head)
            head = replace(head, qualifiers=value)

        fragment_raw = opt("fragment")
        if fragment_raw is not None:
            kind, value = self._fragment(fragment_raw)
            if kind == "failed":
                return self._malformed(input_, value, head)
            if kind == "repeated":
                return self._malformed_at(input_, value, head)
            head = replace(head, fragment=value)

        base = replace(head, status=self.spec.status("ok"), delegated=delegated_string(self.spec, type_, locator))

        if version not in self.spec.get_ints("version", "supported"):
            return replace(base, status=self.spec.status("unsupported"))

        refinements_table = self.spec.get_object("refinements") or {}
        qualifiers_table = self.spec.get_object("qualifiers") or {}
        for key, _value in head.qualifiers:
            if key in refinements_table:
                return self._malformed(input_, key, head)
        if head.fragment is not None:
            for key, _value in head.fragment.refinements:
                if key in qualifiers_table:
                    return self._malformed(input_, key, head)

        nested: list[tuple[str, str]] = []
        for key, value in head.qualifiers:
            declared = qualifiers_table.get(key)
            if not isinstance(declared, dict):
                continue  # unknownKey: carry-through
            forms = [name for name in declared.get("forms", []) if isinstance(name, str)]
            matches, inner = self._match_forms(forms, value, depth)
            if not matches:
                return self._malformed(input_, key, head)
            if inner is not None:
                nested.append((key, inner))
        if nested:
            base = replace(base, nested=tuple(nested))

        if head.fragment is not None:
            for key, value in head.fragment.refinements:
                declared = refinements_table.get(key)
                if not isinstance(declared, dict):
                    continue  # unknownRefinement: carry-through
                pattern = declared.get("pattern", "")
                if not self.grammar.matches(self.spec, pattern, value) or not range_holds(declared, value):
                    return self._malformed(input_, key, head)

        dispatch = self.spec.get_object("dispatch") or {}
        entry = dispatch.get(type_)
        if not isinstance(entry, dict) or base.delegated is None:
            return replace(base, status=self.spec.unknown_type())
        validation = validate_locator(self.spec, entry, base.delegated)
        if validation is None:
            return replace(base, status=self.spec.unknown_type())
        if not validation.ok:
            return self._malformed(input_, "locator", head)
        return replace(base, canonical=validation.canonical)


def parse(input_: str, /) -> ParseResult:
    """Parses a `ref:` identifier string against the embedded spec. Never raises for an identifier
    problem; it raises only when the embedded specification itself cannot be honoured."""
    if not isinstance(input_, str):
        raise TypeError("parse() takes a string")
    spec = load_spec()
    assert_implemented(spec)
    return _Parser(spec, spec.grammar()).parse(input_, 0)
