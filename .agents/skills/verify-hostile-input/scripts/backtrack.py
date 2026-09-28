# SPDX-License-Identifier: Apache-2.0
"""Backtracking search through the Python port's own compile path (`ref_id.grammar.compile_pattern`),
so the `python-re` adaptation is applied exactly as the port applies it. Same pumps and verdict as
`backtrack.mjs`.

    uv run --directory python python ../.agents/skills/verify-hostile-input/scripts/backtrack.py
"""

from __future__ import annotations

import sys
import time
from typing import Any

from ref_id.grammar import compile_pattern
from ref_id.spec import load_spec

spec = load_spec()
patterns: list[tuple[str, str]] = []


def walk(value: Any, path: str) -> None:
    if isinstance(value, str):
        if value.startswith("^") and value.endswith("$"):
            patterns.append((path, value))
    elif isinstance(value, dict) and not path.startswith("vectors"):
        for k, v in value.items():
            walk(v, f"{path}.{k}" if path else k)
    elif isinstance(value, list) and not path.startswith("vectors"):
        for i, v in enumerate(value):
            walk(v, f"{path}.{i}")


walk(spec.value(), "")
pumps = ["a", ".", "-", "/", "t", "i", "g", "1", "~", "@", ":", "%", "_", "a.", "a-", "/a", "/.", "..", "a/", ".a", "a.t", "git", "/..", "a@", "1,", "0"]
prefixes = ["", "https://", "https://a.", "https://a.com/", "https://a.com", "ref:a:", "ref:1:a:", "a@", "a", "/", "~", "c:", "swh:1:cnt:", "+1", "2020-01-01T00:00:00.", "ref:a:b;", "ref:a:b#", "a="]
suffixes = ["\n", "!", "\0", "/", "", "%", ";", "#", ".git"]


def ms(compiled: Any, text: str) -> float:
    start = time.perf_counter()
    compiled.match(text)
    return (time.perf_counter() - start) * 1000


suspects = []
for path, source in patterns:
    compiled = compile_pattern(spec, source)
    for pre in prefixes:
        for pump in pumps:
            for suf in suffixes:
                t1 = ms(compiled, pre + pump * 2000 + suf)
                if t1 < 2:
                    continue
                t2 = ms(compiled, pre + pump * 20000 + suf)
                if t2 > 30 * max(t1, 0.5) or t2 > 200:
                    suspects.append((path, repr(pre), repr(pump), repr(suf), f"{t1:.1f}ms", f"{t2:.1f}ms"))
print(f"patterns {len(patterns)}")
for s in suspects:
    print("  ".join(s))
print(f"suspects {len(suspects)}")
sys.exit(1 if suspects else 0)
