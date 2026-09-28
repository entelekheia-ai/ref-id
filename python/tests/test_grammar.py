# SPDX-License-Identifier: Apache-2.0
"""The grammar compiled in the `python-re` dialect — the adaptation declared for it: the replace pair
`(?<` -> `(?P<`, then the anchor `\\Z` in place of the `$` that ends each pattern.
"""
from __future__ import annotations

import pytest

from ref_id.errors import SpecVersionError
from ref_id.grammar import Grammar, compile_pattern
from ref_id.spec import Spec, load_spec


def test_top_expression_compiles_and_matches_a_minimal_identifier() -> None:
    spec = load_spec()
    grammar = Grammar.compile_for(spec)
    match = grammar.top.match("ref:npm:left-pad")
    assert match is not None
    assert match.group("type") == "npm"
    assert match.group("locator") == "left-pad"


def test_dollar_anchor_refuses_a_trailing_line_break() -> None:
    spec = load_spec()
    grammar = Grammar.compile_for(spec)
    # `\Z` (unlike a bare `$`) does not match just before a final "\n" — the reason the python-re
    # adaptation replaces `$`.
    assert grammar.top.match("ref:npm:left-pad\n") is None


def test_named_group_syntax_was_adapted_to_python_re() -> None:
    spec = load_spec()
    grammar = Grammar.compile_for(spec)
    assert "type" in grammar.top.groupindex


def test_state_and_fragment_pair_grammars_compile() -> None:
    spec = load_spec()
    grammar = Grammar.compile_for(spec)
    state_match = grammar.state_pair.match("key=value")
    assert state_match is not None
    assert state_match.group("key") == "key"
    assert state_match.group("value") == "value"
    fragment_match = grammar.fragment_pair.match("key=value")
    assert fragment_match is not None


def test_a_pair_grammar_not_shaped_key_equals_value_is_refused() -> None:
    # `_assert_structure` checks every declared pair grammar separates its key and value with `=`
    # (`grammar.py:42`); a spec whose `state.pair` uses a different separator names a dialect this
    # package's structural literals no longer match, and must be refused rather than silently compiled.
    root = {
        "scheme": "ref",
        "grammar": {
            "expression": "^ref:(?P<type>[a-z]+):(?P<locator>[^#\\r\\n]+)#(?P<fragment>.*)$",
            "state": {"pair": "^(?P<key>[a-z]+)-(?P<value>[a-z]+)$"},
            "fragment": {"pair": "^(?P<key>[a-z]+)=(?P<value>[a-z]+)$"},
        },
    }
    with pytest.raises(SpecVersionError):
        Grammar.compile_for(Spec(root))


def _declared_patterns(value: object, path: str = "") -> list[tuple[str, str]]:
    """Every string in the specification outside its vectors and openRPC that ends in `$` — a pattern."""
    found: list[tuple[str, str]] = []
    if isinstance(value, str):
        if value.endswith("$"):
            found.append((path, value))
    elif isinstance(value, dict):
        for key, child in value.items():
            if key not in ("vectors", "openRPC"):
                found.extend(_declared_patterns(child, f"{path}/{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_declared_patterns(child, f"{path}/{index}"))
    return found


def test_every_declared_pattern_compiles() -> None:
    spec = load_spec()
    patterns = _declared_patterns(spec.value())
    assert patterns, "the specification declares patterns"
    failures = []
    for path, pattern in patterns:
        try:
            compile_pattern(spec, pattern)
        except SpecVersionError as error:
            failures.append(f"{path}: {error}")
    assert not failures, failures


def test_the_anchor_leaves_a_dollar_inside_a_class_alone() -> None:
    spec = load_spec()
    origin = compile_pattern(spec, spec.get_str("forms", "origin-url", "pattern"))
    assert origin.match("https://example.com/$repo") is not None
    assert origin.match("https://example.com/repo\n") is None
