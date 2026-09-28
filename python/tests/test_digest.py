# SPDX-License-Identifier: Apache-2.0
"""`digest` against `spec.digest` — review focus item 5: a member carrying the join character, and the
empty sequence. The full `digest` vector group runs in `test_conformance.py`.
"""
from __future__ import annotations

import pytest

import ref_id
from ref_id.errors import DigestError


def test_empty_sequence_is_the_digest_of_the_empty_string() -> None:
    assert ref_id.digest([]) == "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def test_member_carrying_the_join_character_is_refused() -> None:
    with pytest.raises(DigestError) as excinfo:
        ref_id.digest(["a\nb"])
    assert excinfo.value.part == "member"


def test_order_and_repetition_are_preserved() -> None:
    assert ref_id.digest(["a", "b"]) != ref_id.digest(["b", "a"])
    assert ref_id.digest(["a", "a"]) != ref_id.digest(["a"])


def test_a_bare_str_is_refused_though_it_satisfies_sequence_str() -> None:
    # A `str` is itself a `Sequence[str]` (of its own characters), which is never the caller's intent;
    # the TypeScript reference refuses it the same way (packages/ref-id/src/digest.ts:15).
    with pytest.raises(DigestError) as excinfo:
        ref_id.digest("ref:npm:left-pad")
    assert excinfo.value.part == "member"


def test_a_generator_is_refused() -> None:
    with pytest.raises(DigestError) as excinfo:
        ref_id.digest(x for x in ["a", "b"])  # type: ignore[arg-type]
    assert excinfo.value.part == "member"


def test_a_set_is_refused() -> None:
    with pytest.raises(DigestError) as excinfo:
        ref_id.digest({"a", "b"})  # type: ignore[arg-type]
    assert excinfo.value.part == "member"


def test_a_non_string_member_is_refused() -> None:
    with pytest.raises(DigestError) as excinfo:
        ref_id.digest([1])  # type: ignore[list-item]
    assert excinfo.value.part == "member"


def test_a_none_member_is_refused() -> None:
    with pytest.raises(DigestError) as excinfo:
        ref_id.digest([None])  # type: ignore[list-item]
    assert excinfo.value.part == "member"


def test_a_lone_surrogate_member_is_refused() -> None:
    # A lone surrogate cannot be encoded as UTF-8 — the digest covers UTF-8 bytes, so a member that
    # cannot become one is refused rather than silently mangled.
    with pytest.raises(DigestError) as excinfo:
        ref_id.digest(["\ud800"])
    assert excinfo.value.part == "member"
