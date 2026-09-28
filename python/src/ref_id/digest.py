# SPDX-License-Identifier: Apache-2.0
"""sha256 over the UTF-8 bytes of the joined identifier strings, per `spec.digest`: declared order, no
deduplication, and a refusal for a member that carries the join character.

Ported line for line from `crates/ref-id/src/digest.rs`.
"""
from __future__ import annotations

import hashlib
from collections.abc import Sequence

from .errors import DigestError, SpecVersionError
from .grammar import FIELD
from .spec import load_spec

__all__ = ["digest"]


def digest(members: Sequence[str], /) -> str:
    """Digests an ordered, non-deduplicated sequence of identifier strings."""
    spec = load_spec()
    if not isinstance(members, (list, tuple)):
        # A bare `str` satisfies `Sequence[str]` at the type level (of its own characters) but is not a
        # sequence of members, and neither is a generator or a set — the TypeScript reference refuses
        # anything that is not an array the same way (`packages/ref-id/src/digest.ts:15`).
        raise DigestError(spec.part("member"), "members must be a list or tuple of strings")
    # One snapshot, taken only after the shape refusal above, so a lazily-consumed iterable (were one
    # ever accepted) cannot be re-read differently between validation and hashing.
    snapshot = list(members)
    join = spec.get_str("digest", "join")
    for member in snapshot:
        if not isinstance(member, str):
            raise DigestError(spec.part("member"), "a member must be a string")
        try:
            member.encode("utf-8")
        except UnicodeEncodeError as error:
            raise DigestError(spec.part("member"), "a member must encode as UTF-8") from error
        if join in member:
            raise DigestError(spec.part("member"), "a member must be a string that does not carry the join character")
    algorithm = spec.get_str("digest", "algorithm")
    if algorithm != "sha256":
        raise SpecVersionError(f"spec.digest.algorithm declares {algorithm}; this package implements sha256 only")
    joined = join.join(snapshot)
    hashed = hashlib.sha256(joined.encode("utf-8")).hexdigest()
    return f"{algorithm}{FIELD}{hashed}"
