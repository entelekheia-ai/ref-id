# SPDX-License-Identifier: Apache-2.0
"""Review focus items of project/tasks/046-python-parse-serialise-build-and-the-envelope.md not pinned
by a vector alone.
"""
from __future__ import annotations

import pytest

import ref_id


def test_unknown_locator_type_is_uncovered_never_raised() -> None:
    result = ref_id.parse("ref:zzz:a;q=1")
    assert result.status == "uncovered"
    assert result.type == "zzz"
    assert result.locator == "a"
    assert result.qualifiers == (("q", "1"),)


def test_roundtrip_keeps_an_unknown_qualifier_key_byte_for_byte() -> None:
    identifier = "ref:zzz:a;q=1"
    assert ref_id.serialise(ref_id.parse(identifier)) == identifier


def test_parse_of_non_string_raises_type_error() -> None:
    with pytest.raises(TypeError):
        ref_id.parse(None)  # type: ignore[arg-type]
