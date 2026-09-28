# SPDX-License-Identifier: Apache-2.0
"""Review focus item 4 of project/tasks/046-python-parse-serialise-build-and-the-envelope.md:
`validate_envelope` called positionally and by keyword, with the names `requested_id` and `envelope`.
"""
from __future__ import annotations

import ref_id
from ref_id.digest import digest

_REQUESTED_ID = "ref:folder:acme-tools;over=sha256:75433bb5329808aa4064084a54173f0328926eb38ddce742f61cbd4f0ebba71e"
_ENVELOPE = {
    "id": _REQUESTED_ID,
    "sets": {
        "over": [
            "ref:folder:acme-tools#AGENTS.md;state=swh:1:cnt:3404a00f00000000000000000000000000000000",
            "ref:folder:acme-tools#GOVERNANCE.md;state=swh:1:cnt:48db124700000000000000000000000000000000",
        ],
    },
}


def test_validate_envelope_accepts_positional_arguments() -> None:
    result = ref_id.validate_envelope(_REQUESTED_ID, _ENVELOPE)
    assert result.admissible


def test_validate_envelope_accepts_keyword_arguments() -> None:
    result = ref_id.validate_envelope(requested_id=_REQUESTED_ID, envelope=_ENVELOPE)
    assert result.admissible


def test_a_member_failing_utf8_is_refused_under_its_real_reason() -> None:
    """A `DigestError` the member's own problem raised — here a lone surrogate that cannot encode as
    UTF-8 — is reported through `DigestError.message`, not a fixed "join character" text that does not
    describe this member's actual defect."""
    members = ["ref:folder:x#a", "ref:folder:x#b"]
    requested_id = f"ref:folder:x;over={digest(members)}"
    envelope = {"id": requested_id, "sets": {"over": ["\ud800", members[1]]}}
    result = ref_id.validate_envelope(requested_id, envelope)
    assert result.admissible is False
    assert result.reason is not None
    assert "UTF-8" in result.reason
    assert "join character" not in result.reason
