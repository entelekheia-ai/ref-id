# SPDX-License-Identifier: Apache-2.0
"""Compiles every pattern the specification declares through this dialect's declared adaptations, and
holds the only structural literals this package writes.

Ported from `crates/ref-id/src/grammar.rs`.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .errors import SpecVersionError

if TYPE_CHECKING:
    from .spec import Spec

__all__: list[str] = []

# The dialect this port compiles for. Its adaptation list, when the spec declares one, is applied to
# every pattern.
_DIALECT = "python-re"

# The structural literals of the scheme, each written exactly once, here. Their sources are
# `spec.grammar.expression` (the field separator, the fragment introducer, the line breaks the character
# classes exclude) and the two pair grammars (the key/value separator).
FIELD = ":"
FRAGMENT_INTRODUCER = "#"
PAIR = "="
LINE_BREAKS = ("\r", "\n")


def scheme_prefix(spec: Spec) -> str:
    return f"{spec.scheme()}{FIELD}"


def _assert_structure(spec: Spec) -> None:
    expression = spec.grammar_expression()
    for literal in (f"^{scheme_prefix(spec)}", FRAGMENT_INTRODUCER, "\\r", "\\n"):
        if literal not in expression:
            raise SpecVersionError(f"spec.grammar.expression does not carry {literal!r}; this package's structural literals do not match")
    for pair in (spec.get_str("grammar", "state", "pair"), spec.get_str("grammar", "fragment", "pair")):
        if f"){PAIR}(" not in pair:
            raise SpecVersionError(f"a pair grammar does not separate key and value with {PAIR!r}; this package's structural literals do not match")


def compile_pattern(spec: Spec, pattern: str) -> re.Pattern[str]:
    """Applies this dialect's declared adaptations, in order, then compiles."""
    adapted = pattern
    replacements = spec.value("grammar", "adaptations", _DIALECT, "replace") or []
    for pair in replacements:
        if not (isinstance(pair, list) and len(pair) == 2):
            continue
        source, target = pair
        if isinstance(source, str) and isinstance(target, str):
            adapted = adapted.replace(source, target)
    try:
        return re.compile(adapted)
    except re.error as error:
        raise SpecVersionError(f"pattern {pattern} does not compile in {_DIALECT}: {error}") from error


class Grammar:
    """The compiled patterns every parse and build step needs, plus a lazily-compiled cache for every
    other pattern the specification declares (a form, a dispatch entry, a refinement)."""

    def __init__(self, top: re.Pattern[str], state_pair: re.Pattern[str], fragment_pair: re.Pattern[str]) -> None:
        self.top = top
        self.state_pair = state_pair
        self.fragment_pair = fragment_pair
        self._others: dict[str, re.Pattern[str]] = {}

    @classmethod
    def compile_for(cls, spec: Spec) -> Grammar:
        _assert_structure(spec)
        return cls(
            top=compile_pattern(spec, spec.grammar_expression()),
            state_pair=compile_pattern(spec, spec.get_str("grammar", "state", "pair")),
            fragment_pair=compile_pattern(spec, spec.get_str("grammar", "fragment", "pair")),
        )

    def matches(self, spec: Spec, source: str, value: str) -> bool:
        """Whether any other pattern the spec declares (a form, a dispatch entry, a refinement) matches
        the whole value."""
        compiled = self._others.get(source)
        if compiled is None:
            compiled = compile_pattern(spec, source)
            self._others[source] = compiled
        return compiled.fullmatch(value) is not None
