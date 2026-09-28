# SPDX-License-Identifier: Apache-2.0
"""Review findings on `build()` and `BuildParts.from_json()` from
`project/tasks/046-python-parse-serialise-build-and-the-envelope.md`: a badly typed part is refused with
`BuildError` naming the part it names in the TypeScript reference — never `AttributeError`, `TypeError`,
`IndexError` or `KeyError`.
"""
from __future__ import annotations

import pytest

import ref_id
from ref_id.digest import digest
from ref_id.types import BuildParts, Fragment, NestedValue


def test_a_qualifier_value_that_must_be_nested_is_refused_as_a_plain_string() -> None:
    """`packages/ref-id/src/build.ts:79` refuses the same input at the `by` part."""
    with pytest.raises(ref_id.BuildError) as excinfo:
        ref_id.build(BuildParts("folder", "x", qualifiers=(("by", "ref:pkg:npm/x@1.0.0"),)))
    assert excinfo.value.part == "by"


def test_a_locator_packageurl_python_refuses_is_refused_at_locator() -> None:
    """`packageurl-python` refuses `npm/@@x@1` (an empty name after the namespace); `parse()` reports it
    malformed at `locator`, and `build()`'s round-trip check names the same part."""
    with pytest.raises(ref_id.BuildError) as excinfo:
        ref_id.build(BuildParts("pkg", "npm/@@x@1"))
    assert excinfo.value.part == "locator"


def test_a_refinement_value_its_pattern_refuses_is_refused_at_the_refinement_key() -> None:
    """A `lines` refinement value that does not fit `spec.refinements.lines.pattern` is refused at
    `lines`, not at `fragment` — `packages/ref-id/src/build.ts` reaches the same part through the same
    round-trip: what was built must reparse to exactly what was asked."""
    with pytest.raises(ref_id.BuildError) as excinfo:
        ref_id.build(BuildParts("folder", "x", fragment=Fragment("a", (("lines", "not-a-line-range"),))))
    assert excinfo.value.part == "lines"


def test_an_unsupported_requested_identifier_is_not_admissible_even_with_correct_sets() -> None:
    """`ref:2:folder:x` is `unsupported` (version 2 is not in `spec.version.supported`); `validate_envelope`
    refuses it before it ever looks at `sets`, so a correctly recomputed digest does not make it
    admissible."""
    members = ["ref:folder:x#a", "ref:folder:x#b"]
    recomputed = digest(members)
    requested_id = f"ref:2:folder:x;over={recomputed}"
    envelope = {"id": requested_id, "sets": {"over": members}}
    result = ref_id.validate_envelope(requested_id, envelope)
    assert result.admissible is False


class TestBuildRefusesBadlyTypedParts:
    """A part the type checker would refuse statically is refused at run time with `BuildError`, the way
    `packages/ref-id/src/build.ts` refuses it with its own runtime guards — never with the exception a
    missing attribute, a bad subscript or an unhashable key would otherwise raise."""

    def test_a_qualifier_value_that_is_neither_str_nor_nested_value(self) -> None:
        with pytest.raises(ref_id.BuildError) as excinfo:
            ref_id.build(BuildParts("folder", "x", qualifiers=(("by", 42),)))  # type: ignore[arg-type]
        assert excinfo.value.part == "by"

    def test_a_fragment_that_is_neither_str_nor_fragment(self) -> None:
        with pytest.raises(ref_id.BuildError) as excinfo:
            ref_id.build(BuildParts("folder", "x", fragment=42))  # type: ignore[arg-type]
        assert excinfo.value.part == "fragment"

    def test_a_nested_value_holding_a_non_str(self) -> None:
        with pytest.raises(ref_id.BuildError) as excinfo:
            ref_id.build(BuildParts("folder", "x", qualifiers=(("by", NestedValue(42)),)))  # type: ignore[arg-type]
        assert excinfo.value.part == "by"

    def test_from_json_a_malformed_qualifier_pair_not_a_two_element_list(self) -> None:
        with pytest.raises(ref_id.BuildError) as excinfo:
            BuildParts.from_json({"type": "folder", "locator": "x", "qualifiers": [{"key": "by", "value": "x"}]})
        assert excinfo.value.part == "state"

    def test_from_json_a_malformed_qualifier_pair_missing_a_value(self) -> None:
        with pytest.raises(ref_id.BuildError) as excinfo:
            BuildParts.from_json({"type": "folder", "locator": "x", "qualifiers": [["by"]]})
        assert excinfo.value.part == "state"

    def test_from_json_a_missing_type(self) -> None:
        with pytest.raises(ref_id.BuildError) as excinfo:
            BuildParts.from_json({"locator": "x"})
        assert excinfo.value.part == "type"

    def test_from_json_a_missing_locator(self) -> None:
        with pytest.raises(ref_id.BuildError) as excinfo:
            BuildParts.from_json({"type": "folder"})
        assert excinfo.value.part == "locator"
