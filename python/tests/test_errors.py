# SPDX-License-Identifier: Apache-2.0
"""`str(error)` follows the crate's `Display` (`crates/ref-id/src/types.rs:142`)."""
from __future__ import annotations

import ref_id


def test_build_error_carries_part() -> None:
    error = ref_id.BuildError("locator", "went wrong")
    assert str(error) == "BuildError at locator: went wrong"
    assert isinstance(error, ref_id.RefIdError)
    assert isinstance(error, ValueError)


def test_digest_error_carries_part() -> None:
    error = ref_id.DigestError("member", "went wrong")
    assert str(error) == "DigestError at member: went wrong"


def test_serialise_error_carries_part() -> None:
    error = ref_id.SerialiseError("qualifiers", "went wrong")
    assert str(error) == "SerialiseError at qualifiers: went wrong"


def test_spec_integrity_error_has_no_part() -> None:
    error = ref_id.SpecIntegrityError("went wrong")
    assert str(error) == "SpecIntegrityError: went wrong"


def test_spec_version_error_has_no_part() -> None:
    error = ref_id.SpecVersionError("went wrong")
    assert str(error) == "SpecVersionError: went wrong"
