# SPDX-License-Identifier: Apache-2.0
"""The `ref:` identifier scheme — a Python port held to `spec/ref-id.json`'s conformance vectors.

Track 2 lands the embedded specification, its integrity check, the canonical serialisation and the set
digest. Parse, serialise, build and the envelope are Track 3; relations are Track 4.
"""
from __future__ import annotations

from .canonical import canonicalise
from .digest import digest
from .errors import (
    BuildError,
    DigestError,
    RefIdError,
    SerialiseError,
    SpecIntegrityError,
    SpecVersionError,
)
from .spec import Spec, embedded_spec_text, load_spec, load_spec_from

__all__ = [
    "BuildError",
    "DigestError",
    "RefIdError",
    "SerialiseError",
    "Spec",
    "SpecIntegrityError",
    "SpecVersionError",
    "canonicalise",
    "digest",
    "embedded_spec_text",
    "load_spec",
    "load_spec_from",
]
