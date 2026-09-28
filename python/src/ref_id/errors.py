# SPDX-License-Identifier: Apache-2.0
"""The error hierarchy every other module raises through.

`RefIdError` is the base every kind subclasses; `BuildError`, `DigestError` and `SerialiseError` carry
the refused `part`, `SpecIntegrityError` and `SpecVersionError` do not. `str(error)` follows the crate's
`Display` (`crates/ref-id/src/types.rs:142`): ``"<Kind>Error at <part>: <message>"`` for the three with a
part, ``"<Kind>Error: <message>"`` for the other two.
"""
from __future__ import annotations

__all__ = [
    "BuildError",
    "DigestError",
    "RefIdError",
    "SerialiseError",
    "SpecIntegrityError",
    "SpecVersionError",
]


class RefIdError(ValueError):
    """The base of every error this package raises. `parse` raises none for an identifier problem."""


class BuildError(RefIdError):
    """`build` was given a part the grammar cannot carry."""

    def __init__(self, part: str, message: str) -> None:
        super().__init__(f"BuildError at {part}: {message}")
        self.part = part
        self.message = message


class DigestError(RefIdError):
    """`digest` was given a member that is not one identifier string."""

    def __init__(self, part: str, message: str) -> None:
        super().__init__(f"DigestError at {part}: {message}")
        self.part = part
        self.message = message


class SerialiseError(RefIdError):
    """`serialise` was given a result that has no faithful string form."""

    def __init__(self, part: str, message: str) -> None:
        super().__init__(f"SerialiseError at {part}: {message}")
        self.part = part
        self.message = message


class SpecIntegrityError(RefIdError):
    """The embedded specification does not match its sidecar digest."""

    def __init__(self, message: str) -> None:
        super().__init__(f"SpecIntegrityError: {message}")
        self.message = message


class SpecVersionError(RefIdError):
    """The embedded specification declares a version or vocabulary this package does not support."""

    def __init__(self, message: str) -> None:
        super().__init__(f"SpecVersionError: {message}")
        self.message = message
