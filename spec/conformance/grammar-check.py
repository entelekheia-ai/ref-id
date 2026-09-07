#!/usr/bin/env python3
"""Prove ref-id.json's grammar is engine-neutral: replay vectors.parse against
the Python `re` engine using the python-re adaptation, and report agreement."""
import json
import os
import re
import sys

SPEC_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ref-id.json")


def load_spec():
    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_pattern(spec, engine):
    expr = spec["grammar"]["expression"]
    for old, new in spec["grammar"]["adaptations"][engine]["replace"]:
        expr = expr.replace(old, new)
    return expr


def split_pairs(text, separator):
    """Split `text` on `separator`, then split each piece on the first '='."""
    pairs = []
    for piece in text.split(separator):
        if "=" in piece:
            key, value = piece.split("=", 1)
        else:
            key, value = piece, None
        pairs.append([key, value])
    return pairs


def check_vector(spec, m, vec):
    """Return (agree: bool, reason: str) for one vector against a regex match."""
    expect = vec["expect"]
    status = expect.get("status")
    part = expect.get("part")

    if status == "malformed" and part == "grammar":
        if m is None:
            return True, ""
        return False, "expected no match (malformed/grammar) but it matched"

    if m is None:
        return False, "expected a match but got none"

    gd = m.groupdict()

    # version / type / locator, when present in expect
    if "version" in expect:
        raw = gd.get("version")
        version = spec["version"]["default"] if not raw else int(raw)
        if version != expect["version"]:
            return False, f"version {version!r} != expect {expect['version']!r}"

    if "type" in expect:
        if gd.get("type") != expect["type"]:
            return False, f"type {gd.get('type')!r} != expect {expect['type']!r}"

    if "locator" in expect:
        if gd.get("locator") != expect["locator"]:
            return False, f"locator {gd.get('locator')!r} != expect {expect['locator']!r}"

    # qualifiers, when present in expect: split state group on state.separator,
    # each piece on the first '='
    if "qualifiers" in expect:
        state_sep = spec["grammar"]["state"]["separator"]
        state_group = gd.get("state")
        if state_group:
            actual_pairs = split_pairs(state_group, state_sep)
        else:
            actual_pairs = []
        if actual_pairs != expect["qualifiers"]:
            return False, f"qualifiers {actual_pairs!r} != expect {expect['qualifiers']!r}"

    # fragment, when present and not null in expect
    if expect.get("fragment") is not None:
        frag_sep = spec["grammar"]["fragment"]["separator"]
        frag_group = gd.get("fragment")
        if frag_group is None:
            return False, "expected a fragment group but none captured"
        pieces = frag_group.split(frag_sep)
        path = pieces[0]
        refinements = split_pairs(frag_sep.join(pieces[1:]), frag_sep) if len(pieces) > 1 else []
        exp_frag = expect["fragment"]
        if path != exp_frag.get("path"):
            return False, f"fragment.path {path!r} != expect {exp_frag.get('path')!r}"
        if refinements != exp_frag.get("refinements", []):
            return False, f"fragment.refinements {refinements!r} != expect {exp_frag.get('refinements')!r}"

    return True, ""


def main():
    spec = load_spec()
    pattern = build_pattern(spec, "python-re")
    rx = re.compile(pattern)

    vectors = spec["vectors"]["parse"]
    total = len(vectors)
    agreed = 0
    disagreements = []

    for vec in vectors:
        m = rx.match(vec["input"])
        ok, reason = check_vector(spec, m, vec)
        if ok:
            agreed += 1
        else:
            disagreements.append((vec["name"], reason))

    print(f"python-re: {agreed}/{total} agreed")
    for name, reason in disagreements:
        print(f"  DISAGREE: {name} -- {reason}")

    return 0 if not disagreements else 1


if __name__ == "__main__":
    sys.exit(main())
