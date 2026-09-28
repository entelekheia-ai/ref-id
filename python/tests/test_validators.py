# SPDX-License-Identifier: Apache-2.0
"""Review focus item 3 of project/tasks/046-python-parse-serialise-build-and-the-envelope.md: a
validator name the specification adds later degrades that type to `uncovered`; a range name it adds
raises `SpecVersionError`. Pinned with `load_spec_from` over a temporary resealed copy, since the
embedded spec never names either.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

import ref_id
from ref_id.canonical import canonicalise
from ref_id.errors import SpecVersionError
from ref_id.parse import _Parser
from ref_id.validators import assert_implemented, validate_locator


def _load_document() -> dict[str, Any]:
    json_text, _sidecar = ref_id.embedded_spec_text()
    document: dict[str, Any] = json.loads(json_text)
    return document


def _reseal_and_load(tmp_path: Path, document: dict[str, Any]) -> ref_id.Spec:
    digest = hashlib.sha256(canonicalise(document).encode("utf-8")).hexdigest()
    (tmp_path / "ref-id.json").write_text(json.dumps(document), encoding="utf-8")
    (tmp_path / "ref-id.json.sha256").write_text(digest + "\n", encoding="utf-8")
    return ref_id.load_spec_from(tmp_path)


def test_unknown_validator_name_degrades_the_dispatch_entry(tmp_path: Path) -> None:
    document = _load_document()
    document["dispatch"]["pkg"]["validator"] = "a-validator-this-package-does-not-know"
    spec = _reseal_and_load(tmp_path, document)
    entry = spec.get_object("dispatch")["pkg"]  # type: ignore[index]
    assert validate_locator(spec, entry, "pkg:npm/x@1.0.0") is None


def test_unknown_validator_name_makes_the_type_parse_as_uncovered(tmp_path: Path) -> None:
    document = _load_document()
    document["dispatch"]["pkg"]["validator"] = "a-validator-this-package-does-not-know"
    spec = _reseal_and_load(tmp_path, document)
    assert_implemented(spec)
    result = _Parser(spec, spec.grammar()).parse("ref:pkg:npm/x@1.0.0", 0)
    assert result.status == "uncovered"


def test_unknown_range_name_raises_spec_version_error(tmp_path: Path) -> None:
    document = _load_document()
    document["refinements"]["lines"]["range"] = "a-range-this-package-does-not-know"
    spec = _reseal_and_load(tmp_path, document)
    with pytest.raises(SpecVersionError):
        assert_implemented(spec)


class TestPackageUrlCanonicalUsesUppercasePercentEscapes:
    """Security review finding 4: `packageurl-python`'s `to_string()` lowercases its percent-escapes
    (`%2b`); the other three implementations agree on uppercase (`%2B`), so a canonical form this port
    produces must be uppercased to match. Expected values taken from
    `node --experimental-strip-types` against `packages/ref-id/src/index.ts` (2026-09-28)."""

    def test_a_plus_in_a_package_name(self) -> None:
        result = ref_id.parse("ref:pkg:npm/a+b@1")
        assert result.canonical == "pkg:npm/a%2Bb@1"

    def test_a_semicolon_and_equals_in_a_github_repository_path(self) -> None:
        result = ref_id.parse("ref:pkg:github/ggml-org/llama.cpp%3Bstate=none")
        assert result.canonical == "pkg:github/ggml-org/llama.cpp%3Bstate%3Dnone"
