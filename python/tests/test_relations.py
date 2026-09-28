# SPDX-License-Identifier: Apache-2.0
"""Review-focus pins for Track 4's comparison operations, beyond the vectors `test_conformance.py`
already replays: a mixed `str`/`ParseResult` pair, asymmetry pinned as its own call, a nested identifier
descent, a pair of malformed/uncovered identifiers, and `decidedBy`'s fixed order.
"""
from __future__ import annotations

from typing import Any

import pytest

import ref_id
from ref_id.spec import load_spec


def _as(identifier: str, as_parsed: bool) -> str | ref_id.ParseResult:
    return ref_id.parse(identifier) if as_parsed else identifier


def _comparison_vectors() -> list[dict[str, Any]]:
    return load_spec().vectors("comparison")


@pytest.mark.parametrize("vector", _comparison_vectors(), ids=lambda v: v["name"])
@pytest.mark.parametrize("a_parsed", [False, True], ids=["a=str", "a=parsed"])
@pytest.mark.parametrize("b_parsed", [False, True], ids=["b=str", "b=parsed"])
def test_mixed_pair_matches_str_pair(vector: dict[str, Any], a_parsed: bool, b_parsed: bool) -> None:
    """Every operation called with `(str, ParseResult)`, `(ParseResult, str)` or `(ParseResult,
    ParseResult)` returns exactly what `(str, str)` returns — Review focus 1."""
    a_str, b_str, expect = vector["a"], vector["b"], vector["expect"]
    a, b = _as(a_str, a_parsed), _as(b_str, b_parsed)
    if "samePackage" in expect:
        assert ref_id.same_package(a, b) == ref_id.same_package(a_str, b_str)
    if "covers" in expect:
        assert ref_id.covers(a, b) == ref_id.covers(a_str, b_str)
    if "coversReversed" in expect:
        assert ref_id.covers(b, a) == ref_id.covers(b_str, a_str)
    if "sameIdentifier" in expect:
        assert ref_id.same_identifier(a, b) == ref_id.same_identifier(a_str, b_str)


def test_covers_asymmetry_is_its_own_call() -> None:
    """`covers(a, b)` and `covers(b, a)` differ where the vectors say so — asserted as two independent
    calls, never as a negation of one another (Review focus 2)."""
    general = "ref:pkg:npm/x"
    specific = "ref:pkg:npm/x@1.0.0"
    forward = ref_id.covers(general, specific)
    backward = ref_id.covers(specific, general)
    assert forward is True
    assert backward is False


def test_covers_reversed_matches_vectors_as_its_own_call() -> None:
    """Every `comparison` vector's `coversReversed` is `covers(b, a)`, computed as its own call rather
    than derived from `covers(a, b)`."""
    for vector in _comparison_vectors():
        if "coversReversed" not in vector["expect"]:
            continue
        a, b = vector["a"], vector["b"]
        assert ref_id.covers(b, a) == vector["expect"]["coversReversed"], vector["name"]


# Review focus 3: a nested identifier inside a qualifier — `relate` descends and fills `nested`. Beyond
# the spec's own `relate` vectors: two engines behind `by=` that additionally differ in a fragment
# refinement, so the nested `RelateResult` itself carries a non-trivial dimension. Expected values taken
# from the TypeScript reference:
#   node --experimental-strip-types -e "import('./packages/ref-id/src/index.ts').then(m =>
#     console.log(JSON.stringify(m.relate(A, B))))"
_NESTED_A = "ref:folder:acme-tools;by=ref:pkg:npm/engine@1.0.0%23Model%3Bprecision=fp16"
_NESTED_B = "ref:folder:acme-tools;by=ref:pkg:npm/engine@1.0.0%23Model%3Bprecision=fp32"


def test_relate_descends_into_nested_qualifier_value() -> None:
    result = ref_id.relate(_NESTED_A, _NESTED_B)
    assert result is not None
    assert result.to_json() == {
        "type": "equal",
        "version": "equal",
        "locatorStem": "equal",
        "locatorVersion": "equal",
        "fragmentPath": "equal",
        "fragmentRefinements": {},
        "qualifiers": {
            "by": {
                "relation": "differ",
                "nested": {
                    "type": "equal",
                    "version": "equal",
                    "locatorStem": "equal",
                    "locatorVersion": "equal",
                    "fragmentPath": "equal",
                    "fragmentRefinements": {"precision": "differ"},
                    "qualifiers": {},
                },
            }
        },
    }
    assert ref_id.same_package(_NESTED_A, _NESTED_B) is False
    assert ref_id.covers(_NESTED_A, _NESTED_B) is False
    assert ref_id.covers(_NESTED_B, _NESTED_A) is False
    verdict = ref_id.verdict(_NESTED_A, _NESTED_B)
    assert verdict is not None
    assert verdict.to_json() == {
        "identity": "distinct",
        "content": "unknown",
        "decidedBy": {"identity": ["qualifiers.by"], "content": []},
    }


def test_a_malformed_nested_value_refuses_the_pair_rather_than_crashing() -> None:
    """A `by=` value that is not itself an accepted nested form (`ref:` or `sha256:`) makes the whole
    outer identifier malformed at that key — `relate`/`verdict` then refuse the pair rather than crashing
    while trying to read a `nested` that was never produced (Review focus 3, second half)."""
    malformed_nested = "ref:folder:acme-tools;by=rumdl"
    assert ref_id.parse(malformed_nested).status == "malformed"
    assert ref_id.relate(malformed_nested, _NESTED_A) is None
    assert ref_id.verdict(malformed_nested, _NESTED_A) is None
    assert ref_id.same_package(malformed_nested, _NESTED_A) is False
    assert ref_id.covers(malformed_nested, _NESTED_A) is False
    assert ref_id.same_identifier(malformed_nested, _NESTED_A) is False


# Review focus 4: two malformed or uncovered identifiers, drawn from the `parse` group's own vectors
# (status other than "ok"), never raise and never return anything but `None`/`False`.
_NON_OK_INPUTS = [vector["input"] for vector in load_spec().vectors("parse") if vector["expect"].get("status") not in (None, "ok")]


@pytest.mark.parametrize("input_", _NON_OK_INPUTS)
def test_non_ok_pair_never_raises(input_: str) -> None:
    other = "ref:folder:acme-tools"
    assert ref_id.relate(input_, other) is None or ref_id.parse(input_).status == "uncovered"
    assert ref_id.verdict(input_, other) is None or ref_id.parse(input_).status == "uncovered"
    assert isinstance(ref_id.same_package(input_, other), bool)
    assert isinstance(ref_id.covers(input_, other), bool)
    assert isinstance(ref_id.covers(other, input_), bool)
    assert isinstance(ref_id.same_identifier(input_, other), bool)
    if ref_id.parse(input_).status not in ("ok", "uncovered"):
        assert ref_id.relate(input_, other) is None
        assert ref_id.verdict(input_, other) is None
        assert ref_id.same_package(input_, other) is False
        assert ref_id.covers(input_, other) is False
        assert ref_id.covers(other, input_) is False
        assert ref_id.same_identifier(input_, other) is False


def test_two_malformed_identifiers_together() -> None:
    a = "ref:folder:acme-tools;"  # empty qualifier — malformed
    b = "ref:folder:acme-tools#"  # empty fragment — malformed
    assert ref_id.parse(a).status == "malformed"
    assert ref_id.parse(b).status == "malformed"
    assert ref_id.relate(a, b) is None
    assert ref_id.verdict(a, b) is None
    assert ref_id.same_package(a, b) is False
    assert ref_id.covers(a, b) is False
    assert ref_id.covers(b, a) is False
    assert ref_id.same_identifier(a, b) is False


# Review focus 5: `decidedBy`'s lists follow the crate's `order_decided` — the five fixed dimensions in
# their declared order, then refinement keys, then qualifier keys, each of the latter two groups sorted by
# UTF-16 code unit order — never insertion order. Pinned with a pair whose `content` axis is decided by
# two qualifier keys that would sort differently from the order they were declared in the identifier.
def test_decided_by_follows_fixed_order_not_insertion_order() -> None:
    # "zzz" is declared before "aaa" in both identifiers' qualifier state, so insertion order would list
    # "zzz" first; the fixed order sorts qualifier keys by UTF-16 code unit order instead.
    a = "ref:folder:acme-tools;zzz=one;aaa=two"
    b = "ref:folder:acme-tools;zzz=three;aaa=four"
    spec = load_spec()
    qualifiers = spec.get_object("qualifiers") or {}
    assert "zzz" not in qualifiers and "aaa" not in qualifiers  # unknown keys — carried through, differ
    result = ref_id.relate(a, b)
    assert result is not None
    assert dict(result.qualifiers)["zzz"].relation == "differ"
    assert dict(result.qualifiers)["aaa"].relation == "differ"
    verdict = ref_id.verdict(a, b)
    assert verdict is not None
    assert verdict.decided_by.identity == ("qualifiers.aaa", "qualifiers.zzz")


def test_relate_with_forty_thousand_qualifiers_completes_well_under_a_second() -> None:
    """Security review finding 3: `_declared_keys`' `if pair_key not in keys` searched a growing list —
    quadratic in the qualifier count. 40k qualifiers on one side must relate in well under a second, not
    the many seconds the list-membership scan took."""
    import time

    a = "ref:folder:acme-tools;" + ";".join(f"k{i}=v" for i in range(40000))
    b = "ref:folder:acme-tools"
    start = time.perf_counter()
    result = ref_id.relate(a, b)
    elapsed = time.perf_counter() - start
    assert result is not None
    assert len(result.qualifiers) == 40000
    assert elapsed < 1.0, f"relate took {elapsed:.2f}s for 40k qualifiers — still quadratic?"
