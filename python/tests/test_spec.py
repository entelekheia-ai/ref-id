# SPDX-License-Identifier: Apache-2.0
"""`load_spec`, `load_spec_from` and their integrity checks — review focus item 4 of
project/tasks/045-the-python-package-and-its-canonical-core.md.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

import ref_id
from ref_id.canonical import canonicalise
from ref_id.errors import SpecIntegrityError, SpecVersionError


def test_load_spec_returns_the_supported_major() -> None:
    spec = ref_id.load_spec()
    assert spec.spec_version().split(".")[0] == "1"
    assert spec.scheme() == "ref"


def test_load_spec_is_cached() -> None:
    assert ref_id.load_spec() is ref_id.load_spec()


def test_embedded_spec_matches_root() -> None:
    root = Path(__file__).resolve().parents[2] / "spec"
    if not root.exists():
        pytest.skip("root spec/ is not present in this checkout")
    json_text, sidecar_text = ref_id.embedded_spec_text()
    assert json_text == (root / "ref-id.json").read_text(encoding="utf-8")
    assert sidecar_text == (root / "ref-id.json.sha256").read_text(encoding="utf-8")


def _write_pair(tmp_path: Path, document: object) -> Path:
    text = json.dumps(document)
    digest = hashlib.sha256(canonicalise(document).encode("utf-8")).hexdigest()
    (tmp_path / "ref-id.json").write_text(text, encoding="utf-8")
    (tmp_path / "ref-id.json.sha256").write_text(digest + "\n", encoding="utf-8")
    return tmp_path


def test_load_spec_from_a_tampered_byte_raises_integrity_error(tmp_path: Path) -> None:
    json_text, sidecar_text = ref_id.embedded_spec_text()
    document = json.loads(json_text)
    document["scheme"] = document["scheme"] + "x"
    (tmp_path / "ref-id.json").write_text(json.dumps(document), encoding="utf-8")
    (tmp_path / "ref-id.json.sha256").write_text(sidecar_text, encoding="utf-8")
    with pytest.raises(SpecIntegrityError):
        ref_id.load_spec_from(tmp_path)


def test_load_spec_from_an_unsupported_major_raises_version_error(tmp_path: Path) -> None:
    json_text, _ = ref_id.embedded_spec_text()
    document = json.loads(json_text)
    document["specVersion"] = "2.0.0"
    _write_pair(tmp_path, document)
    with pytest.raises(SpecVersionError):
        ref_id.load_spec_from(tmp_path)


def test_load_spec_from_a_missing_directory_raises_integrity_error(tmp_path: Path) -> None:
    with pytest.raises(SpecIntegrityError):
        ref_id.load_spec_from(tmp_path / "does-not-exist")
