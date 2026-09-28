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


class TestLoadSpecFromRaisesOnlySpecIntegrityError:
    """Security review finding 5: a malformed spec document must never surface `json.loads`'/CPython's
    own exception kinds — invalid UTF-8, a huge integer literal or deep nesting each used to raise past
    `_validate`'s `json.JSONDecodeError` catch instead of the declared `SpecIntegrityError`."""

    def test_invalid_utf8_bytes(self, tmp_path: Path) -> None:
        (tmp_path / "ref-id.json").write_bytes(b"\xff\xfe{\"a\":1}")
        (tmp_path / "ref-id.json.sha256").write_text("deadbeef", encoding="utf-8")
        with pytest.raises(SpecIntegrityError):
            ref_id.load_spec_from(tmp_path)

    def test_a_five_thousand_digit_number(self, tmp_path: Path) -> None:
        (tmp_path / "ref-id.json").write_text('{"a":' + ("9" * 5000) + "}", encoding="utf-8")
        (tmp_path / "ref-id.json.sha256").write_text("deadbeef", encoding="utf-8")
        with pytest.raises(SpecIntegrityError):
            ref_id.load_spec_from(tmp_path)

    def test_deep_nesting(self, tmp_path: Path) -> None:
        depth = 100_000
        text = "[" * depth + "]" * depth
        (tmp_path / "ref-id.json").write_text(text, encoding="utf-8")
        (tmp_path / "ref-id.json.sha256").write_text("deadbeef", encoding="utf-8")
        with pytest.raises(SpecIntegrityError):
            ref_id.load_spec_from(tmp_path)


class _FakeResource:
    """A minimal `importlib.resources.abc.Traversable` stand-in whose `read_text` reproduces the
    universal-newline translation the real one performs, so a regression to it is caught the same way
    it would be missed by comparing only `read_bytes`."""

    def __init__(self, data: bytes) -> None:
        self._data = data

    def read_bytes(self) -> bytes:
        return self._data

    def read_text(self, encoding: str = "utf-8") -> str:
        return self._data.decode(encoding).replace("\r\n", "\n").replace("\r", "\n")


class _FakeDirectory:
    def __init__(self, children: dict[str, _FakeResource | _FakeDirectory]) -> None:
        self._children = children

    def joinpath(self, name: str) -> _FakeResource | _FakeDirectory:
        return self._children[name]


def test_embedded_spec_text_does_not_translate_newlines(monkeypatch: pytest.MonkeyPatch) -> None:
    # A JSON file byte for byte identical to the root copy except one field carries a literal CRLF —
    # `importlib.resources`' `read_text` would translate it away, which would compute a different digest
    # from the one the sidecar names for the real bytes on disk.
    json_bytes = b'{"a":"line1\r\nline2"}'
    sidecar_bytes = b"deadbeef\n"
    fake_root = _FakeDirectory({"spec": _FakeDirectory({"ref-id.json": _FakeResource(json_bytes), "ref-id.json.sha256": _FakeResource(sidecar_bytes)})})
    monkeypatch.setattr("ref_id.spec.resources.files", lambda _name: fake_root)
    json_text, sidecar_text = ref_id.embedded_spec_text()
    assert json_text == '{"a":"line1\r\nline2"}'
    assert "\r\n" in json_text
    assert sidecar_text == "deadbeef\n"
