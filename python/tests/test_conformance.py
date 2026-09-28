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
EXECUTED = ["digest", "parse", "canonical", "roundtrip", "build", "envelope"]


@pytest.mark.xfail(strict=True, raises=AssertionError, reason="Tracks 3-4 add the remaining groups")
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


def _parse_vectors() -> list[dict[str, Any]]:
    return load_spec().vectors("parse")


@pytest.mark.parametrize("vector", _parse_vectors(), ids=lambda v: v["name"])
def test_parse_vectors(vector: dict[str, Any]) -> None:
    result = ref_id.parse(vector["input"]).to_json()
    for key, wanted in vector["expect"].items():
        got = result.get(key)
        assert ref_id.canonicalise(got) == ref_id.canonicalise(wanted), f"{vector['name']} — field {key}"


def _canonical_vectors() -> list[dict[str, Any]]:
    return load_spec().vectors("canonical")


@pytest.mark.parametrize("vector", _canonical_vectors(), ids=lambda v: v["name"])
def test_canonical_vectors(vector: dict[str, Any]) -> None:
    expect = vector["expect"]
    if isinstance(expect, str):
        assert ref_id.canonical_identifier(vector["input"]) == expect, vector["name"]
    else:
        part = expect["error"]
        with pytest.raises(ref_id.RefIdError) as excinfo:
            ref_id.canonical_identifier(vector["input"])
        assert part in str(excinfo.value), f"{vector['name']} — refusal did not name {part}"


def _roundtrip_vectors() -> list[str]:
    return load_spec().vectors("roundtrip")


@pytest.mark.parametrize("input_", _roundtrip_vectors())
def test_roundtrip_vectors(input_: str) -> None:
    assert ref_id.serialise(ref_id.parse(input_)) == input_, f"roundtrip: {input_}"


def _build_parts(json: dict[str, Any]) -> ref_id.BuildParts:
    return ref_id.BuildParts.from_json(json)


def _build_vectors() -> list[dict[str, Any]]:
    return load_spec().vectors("build")


@pytest.mark.parametrize("vector", _build_vectors(), ids=lambda v: v["name"])
def test_build_vectors(vector: dict[str, Any]) -> None:
    name = vector["name"]
    parts = _build_parts(vector["parts"])
    expect = vector["expect"]
    if isinstance(expect, str):
        assert ref_id.build(parts) == expect, name
    else:
        wanted = expect["error"]
        with pytest.raises(ref_id.BuildError) as excinfo:
            ref_id.build(parts)
        assert excinfo.value.part == wanted, f"{name} — part"
        assert wanted in excinfo.value.message, f"{name} — the message names the part: {excinfo.value.message}"


def _envelope_vectors() -> list[dict[str, Any]]:
    return load_spec().vectors("envelope")


@pytest.mark.parametrize("vector", _envelope_vectors(), ids=lambda v: v["name"])
def test_envelope_vectors(vector: dict[str, Any]) -> None:
    result = ref_id.validate_envelope(vector["requestedId"], vector["envelope"])
    assert result.admissible == (vector["expect"] == "admissible"), f"{vector['name']} — {result.reason}"


def test_embedded_spec_matches_root() -> None:
    root = Path(__file__).resolve().parents[2] / "spec"
    if not root.exists():
        pytest.skip("root spec/ is not present in this checkout")
    json_text, sidecar_text = ref_id.embedded_spec_text()
    assert json_text == (root / "ref-id.json").read_text(encoding="utf-8")
    assert sidecar_text == (root / "ref-id.json.sha256").read_text(encoding="utf-8")
