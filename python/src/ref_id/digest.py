# SPDX-License-Identifier: Apache-2.0
"""sha256 over the UTF-8 bytes of the joined identifier strings, per `spec.digest`: declared order, no
deduplication, and a refusal for a member that carries the join character.

Ported line for line from `crates/ref-id/src/digest.rs`.
"""
from __future__ import annotations

import hashlib
from collections.abc import Sequence

from .errors import DigestError, SpecVersionError
from .spec import load_spec

__all__ = ["digest"]

# The structural separator between an algorithm name and its hex digest in `spec.digest.output`
# ("sha256:<64 lowercase hex>") — a literal of the scheme's own syntax, not spec data, exactly as
# `crates/ref-id/src/grammar.rs`'s `FIELD` constant is.
_FIELD = ":"


def digest(members: Sequence[str], /) -> str:
    """Digests an ordered, non-deduplicated sequence of identifier strings."""
    spec = load_spec()
    if isinstance(members, str):
        # A `str` satisfies `Sequence[str]` at the type level but is not a sequence of members — the
        # TypeScript reference refuses it the same way (`packages/ref-id/src/digest.ts:15`).
        raise DigestError(spec.part("member"), "members must be a sequence of strings")
    join = spec.get_str("digest", "join")
    for member in members:
        if join in member:
            raise DigestError(spec.part("member"), "a member must be a string that does not carry the join character")
    algorithm = spec.get_str("digest", "algorithm")
    if algorithm != "sha256":
        raise SpecVersionError(f"spec.digest.algorithm declares {algorithm}; this package implements sha256 only")
    joined = join.join(members)
    hashed = hashlib.sha256(joined.encode("utf-8")).hexdigest()
    return f"{algorithm}{_FIELD}{hashed}"
