# SPDX-License-Identifier: Apache-2.0
"""`canonicalise` against `/canonicalisation` — no vector group binds it, so the review focus items in
the task dossier (project/tasks/045) are pinned here directly.
"""
from __future__ import annotations

from typing import Any

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


def test_every_c0_char_del_line_separators_and_a_lone_surrogate_match_the_typescript_reference() -> None:
    # Expected output taken from `packages/ref-id/src/spec.ts`'s `canonicalise`, run with:
    #   node --experimental-strip-types -e '
    #     import("./src/spec.ts").then(async (mod) => {
    #       let s = ""; for (let i = 0; i < 32; i++) s += String.fromCharCode(i);
    #       s += "\u007f  \ud800";
    #       console.log(JSON.stringify([...mod.canonicalise({s})].map(c => c.charCodeAt(0))));
    #     });'
    # from `packages/ref-id`, on 2026-09-28. DEL (U+007F) and the line separators U+2028/U+2029 are not
    # among `JSON.stringify`'s mandatory escapes and pass through literally, exactly as this port's own
    # escaper leaves them.
    every_c0 = "".join(chr(i) for i in range(0x20))
    value = every_c0 + "\x7f" + " " + " " + "\ud800"
    expected = '{"s":"\\u0000\\u0001\\u0002\\u0003\\u0004\\u0005\\u0006\\u0007\\b\\t\\n\\u000b\\f\\r\\u000e\\u000f\\u0010\\u0011\\u0012\\u0013\\u0014\\u0015\\u0016\\u0017\\u0018\\u0019\\u001a\\u001b\\u001c\\u001d\\u001e\\u001f\x7f  \\ud800"}'
    assert canonicalise({"s": value}) == expected


def test_split_surrogate_pair_canonicalises_the_same_as_the_joined_character() -> None:
    # A high surrogate and a low surrogate held as two separate Python `str` characters name one
    # character in JavaScript's UTF-16 representation; canonicalising them separately must equal
    # canonicalising the single joined character, or the two ports would digest different bytes for
    # data that came from a JavaScript producer as one string.
    split = chr(0xD83D) + chr(0xDE00)
    joined = "\U0001F600"
    assert len(split) == 2
    assert len(joined) == 1
    assert canonicalise(split) == canonicalise(joined)
    assert canonicalise(joined) == '"😀"'


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


class TestCanonicaliseRaisesOnlySpecIntegrityError:
    """Security review finding 5: `canonicalise` must refuse deep or cyclic input, a non-string key and a
    magnitude far beyond `version.maximum` with `SpecIntegrityError` alone — never `RecursionError`,
    `AttributeError` or a bare `ValueError` a caller would have to know to special-case."""

    def test_a_non_string_key(self) -> None:
        with pytest.raises(SpecIntegrityError):
            canonicalise({1: 2})

    def test_a_ten_thousand_digit_integer(self) -> None:
        with pytest.raises(SpecIntegrityError):
            canonicalise(10**5000)

    def test_deeply_nested_lists(self) -> None:
        value: list[Any] = []
        cursor = value
        for _ in range(100_000):
            nxt: list[Any] = []
            cursor.append(nxt)
            cursor = nxt
        with pytest.raises(SpecIntegrityError):
            canonicalise(value)

    def test_a_cyclic_object(self) -> None:
        value: dict[str, Any] = {}
        value["a"] = value
        with pytest.raises(SpecIntegrityError):
            canonicalise(value)
