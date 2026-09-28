# SPDX-License-Identifier: Apache-2.0
"""The grammar compiled in the `python-re` dialect — the two adaptations declared for it: `(?<` -> `(?P<`
and `$` -> `\\Z`.
"""
from __future__ import annotations

from ref_id.grammar import Grammar
from ref_id.spec import load_spec


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
