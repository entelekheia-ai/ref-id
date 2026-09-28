# SPDX-License-Identifier: Apache-2.0
"""`canonicalise` against `/canonicalisation` — no vector group binds it, so the review focus items in
the task dossier (project/tasks/045) are pinned here directly.
"""
from __future__ import annotations

import pytest

import ref_id
from ref_id.canonical import canonicalise
from ref_id.errors import SpecIntegrityError


def test_compact_no_whitespace() -> None:
    assert canonicalise({"a": 1, "b": [1, 2, 3]}) == '{"a":1,"b":[1,2,3]}'


def test_keys_sorted_by_utf16_code_unit_outside_the_bmp() -> None:
    # "｡" (U+FF61) sorts after "\U0001f600" (a surrogate pair, so a *smaller* leading code unit) in
    # UTF-16 order, even though its own code point is smaller — the reversal the review focus names.
    result = canonicalise({"｡": 1, "\U0001f600": 2})
    assert result == '{"😀":2,"｡":1}'


def test_lone_surrogate_and_control_character_match_json_stringify() -> None:
    # Expected string taken from `node -e 'console.log(JSON.stringify(...))'` (2026-09-27):
    # `console.log(JSON.stringify({"a": "\ud800 \x1f"}))` -> `{"a":"\ud800 \u001f"}`
    result = canonicalise({"a": "\ud800 \x1f"})
    assert result == '{"a":"\\ud800 \\u001f"}'


def test_float_is_refused() -> None:
    with pytest.raises(SpecIntegrityError):
        canonicalise({"a": 1.5})


def test_nan_is_refused() -> None:
    with pytest.raises(SpecIntegrityError):
        canonicalise({"a": float("nan")})


def test_bool_serialises_as_json_bool_not_as_a_number() -> None:
    assert canonicalise({"a": True, "b": False}) == '{"a":true,"b":false}'


def test_reexported_from_package() -> None:
    assert ref_id.canonicalise({"a": 1}) == '{"a":1}'
