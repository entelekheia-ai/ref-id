# SPDX-License-Identifier: Apache-2.0
"""The envelope invariant from `spec.envelope`: an identifier carrying a digest is admissible only with
an object whose sets entry for that qualifier recomputes to it, served under its own id.

Ported from `crates/ref-id/src/envelope.rs`.
"""
from __future__ import annotations

from .digest import digest
from .errors import DigestError, SpecVersionError
from .parse import parse
from .spec import load_spec
from .types import EnvelopeResult

__all__ = ["validate_envelope"]


def _refused(reason: str) -> EnvelopeResult:
    return EnvelopeResult(admissible=False, reason=reason)


def validate_envelope(requested_id: str, envelope: object) -> EnvelopeResult:
    """Refuses an envelope whose self-reference or recomputed digests do not hold."""
    spec = load_spec()
    self_reference = spec.get_str("envelope", "selfReference")
    sets_field = spec.get_str("envelope", "setsField")

    if not isinstance(envelope, dict):
        return _refused("envelope is not an object")
    if envelope.get(self_reference) != requested_id:
        return _refused(f"envelope.{self_reference} does not match the requested identifier")

    parsed = parse(requested_id)
    if parsed.status in (spec.status("malformed"), spec.status("unsupported")):
        return _refused(f"the requested identifier is {parsed.status}")

    grammar = spec.grammar()
    digest_patterns: list[str] = []
    for name, form in (spec.get_object("forms") or {}).items():
        if not isinstance(form, dict) or form.get("digest") is not True:
            continue
        pattern = form.get("pattern")
        if not isinstance(pattern, str):
            raise SpecVersionError(f"spec.forms.{name} declares digest: true without a pattern; this package cannot recognise it")
        digest_patterns.append(pattern)

    sets = envelope.get(sets_field)
    sets = sets if isinstance(sets, dict) else None

    for key, value in parsed.qualifiers:
        is_digest = any(grammar.matches(spec, pattern, value) for pattern in digest_patterns)
        if not is_digest:
            continue
        members = sets.get(key) if sets is not None else None
        if not isinstance(members, list) or not all(isinstance(item, str) for item in members):
            return _refused(f"{sets_field}.{key} is missing or is not an array of strings")
        try:
            recomputed = digest(members)
        except DigestError as error:
            return _refused(f"{sets_field}.{key} {error.message}")
        if recomputed != value:
            return _refused(f"{sets_field}.{key} does not recompute to the declared digest")

    return EnvelopeResult(admissible=True)
