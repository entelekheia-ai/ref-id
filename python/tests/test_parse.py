# SPDX-License-Identifier: Apache-2.0
"""Review focus items of project/tasks/046-python-parse-serialise-build-and-the-envelope.md not pinned
by a vector alone.
"""
from __future__ import annotations

import sys

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


def test_a_version_literal_far_longer_than_the_cpython_int_conversion_limit_does_not_raise() -> None:
    """`int(version_text)` used to hit CPython's digit-count guard on a literal this long; the version
    is above `version.maximum` either way, so this reports the maximum and `unsupported`, never a
    `ValueError` — Security review finding 1. The digit count is well above the default limit (4300) and
    above the minimum a caller may configure (640), so this is independent of the guard's current value
    rather than merely under today's default."""
    original = sys.get_int_max_str_digits()
    sys.set_int_max_str_digits(640)
    try:
        result = ref_id.parse("ref:" + "1" * 4301 + ":folder:a")
    finally:
        sys.set_int_max_str_digits(original)
    maximum = ref_id.load_spec().get_int("version", "maximum")
    assert result.status == "unsupported"
    assert result.version == maximum
    assert result.version_text == "1" * 4301


def test_a_refinement_bound_far_longer_than_the_cpython_int_conversion_limit_does_not_raise() -> None:
    """`_as_u64` in `validators.py` hit the same CPython guard converting a `lines=` bound this long —
    Security review finding 1's second half. A value this large cannot be ascending-checked meaningfully
    either way (the port already diverges from `u64`-bounded Rust for values this size, per the open
    refinement-bounds question), so the only requirement here is that it does not raise."""
    original = sys.get_int_max_str_digits()
    sys.set_int_max_str_digits(640)
    try:
        nines = "9" * 4301
        result = ref_id.parse(f"ref:folder:a#x;lines={nines},1")
    finally:
        sys.set_int_max_str_digits(original)
    assert result.status in ("ok", "malformed")
