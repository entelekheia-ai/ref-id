# SPDX-License-Identifier: Apache-2.0
"""`decode`/`strictly_encoded` against pathological input — Security review finding 2:
`encoding.py`'s `decode` (`rest = rest[1:]`) and `strictly_encoded` (`value[at:]`) built a new string
slice per character/`%`, which is quadratic in the input length. The other three ports decode a
1M-character value in 0.2-1s; this pins the same budget for Python, generously bounded to stay clear of
slower CI hardware while still failing hard against the old quadratic behaviour (which measured several
seconds on this machine)."""
from __future__ import annotations

import time

from ref_id.encoding import decode, strictly_encoded

_TABLE = [(";", "%3B"), ("#", "%23"), ("%", "%25")]


def test_decode_of_a_one_million_character_value_completes_in_about_a_second() -> None:
    value = "%25" * (1_000_000 // 3)
    start = time.perf_counter()
    decode(value, _TABLE)
    elapsed = time.perf_counter() - start
    assert elapsed < 2.0, f"decode took {elapsed:.2f}s for a 1M-character value — still quadratic?"


def test_strictly_encoded_of_a_one_million_character_value_completes_in_about_a_second() -> None:
    value = "%25" * (1_000_000 // 3)
    start = time.perf_counter()
    assert strictly_encoded(value, _TABLE) is True
    elapsed = time.perf_counter() - start
    assert elapsed < 2.0, f"strictly_encoded took {elapsed:.2f}s for a 1M-character value — still quadratic?"


def test_decode_result_unchanged_for_a_representative_nested_value() -> None:
    # %2523 must decode to %23, never all the way to # — the strict two-level guarantee `decode`'s own
    # docstring names, preserved by the index-scanning rewrite.
    assert decode("%2523", _TABLE) == "%23"
    assert decode("a%3Bb%23c%25d", _TABLE) == "a;b#c%d"
