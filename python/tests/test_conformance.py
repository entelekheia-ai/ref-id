# SPDX-License-Identifier: Apache-2.0
"""One parametrised test per vector group this track can run, and the group-refusal test that keeps a
new group from running silently nowhere (`AGENTS.md`: "a vector group nothing runs is the defect that
hides every other one").

Modelled on `crates/ref-id/tests/conformance.rs`.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

import ref_id
from ref_id.spec import load_spec

# Every group this track's runner executes, by name — Track 3 adds parse/canonical/roundtrip/build/
# envelope, Track 4 adds comparison/relate/verdict.
EXECUTED = ["digest"]


@pytest.mark.xfail(strict=True, reason="Tracks 3-4 add the remaining groups")
def test_every_vector_group_runs() -> None:
    spec = load_spec()
    missing = sorted(set(spec.vector_classes()) - set(EXECUTED))
    assert not missing, f"spec/ref-id.json declares vector groups this runner does not execute: {missing}"


def _digest_vectors() -> list[dict[str, Any]]:
    return load_spec().vectors("digest")


@pytest.mark.parametrize("vector", _digest_vectors(), ids=lambda v: v["name"])
def test_digest_vectors(vector: dict[str, Any]) -> None:
    members = vector["members"]
    expect = vector["expect"]
    if isinstance(expect, str):
        assert ref_id.digest(members) == expect, vector["name"]
    else:
        part = expect["error"]
        with pytest.raises(ref_id.RefIdError) as excinfo:
            ref_id.digest(members)
        assert part in str(excinfo.value), f"{vector['name']} — refusal did not name {part}"


def test_embedded_spec_matches_root() -> None:
    root = Path(__file__).resolve().parents[2] / "spec"
    if not root.exists():
        pytest.skip("root spec/ is not present in this checkout")
    json_text, sidecar_text = ref_id.embedded_spec_text()
    assert json_text == (root / "ref-id.json").read_text(encoding="utf-8")
    assert sidecar_text == (root / "ref-id.json.sha256").read_text(encoding="utf-8")
