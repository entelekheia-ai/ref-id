# SPDX-License-Identifier: Apache-2.0
"""The canonical serialisation `/canonicalisation` fixes: object keys sorted by UTF-16 code unit, no
whitespace outside strings, strings escaped exactly as ECMAScript `JSON.stringify` does, integers only.

Ported from `crates/ref-id/src/canonical.rs`. `json.dumps` is not used for string escaping: measured
(2026-09-27), Python's own encoder writes a lone surrogate through unescaped, where `JSON.stringify`
escapes it as `\\uXXXX` — the two implementations would then digest different bytes for the same
member.
"""
from __future__ import annotations

from .errors import SpecIntegrityError

__all__ = ["canonicalise"]

_ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


def _escape(string: str) -> str:
    out: list[str] = ['"']
    for char in string:
        code = ord(char)
        if char in _ESCAPES:
            out.append(_ESCAPES[char])
        elif code < 0x20 or 0xD800 <= code <= 0xDFFF:
            # A lone surrogate cannot be re-encoded as UTF-8 unescaped; `JSON.stringify` escapes it
            # exactly like a control character, and this port must match that byte for byte.
            out.append(f"\\u{code:04x}")
        else:
            out.append(char)
    out.append('"')
    return "".join(out)


def _sort_key(key: str) -> bytes:
    # UTF-16 code unit order, per `/canonicalisation`. `surrogatepass` lets a key that is itself a lone
    # surrogate (or carries one) still sort, rather than raising where the specification does not.
    return key.encode("utf-16-be", "surrogatepass")


def _write(value: object, out: list[str]) -> None:
    if value is None:
        out.append("null")
    elif isinstance(value, bool):
        out.append("true" if value else "false")
    elif isinstance(value, int):
        out.append(str(value))
    elif isinstance(value, float):
        raise SpecIntegrityError(f"canonicalisation covers integers only, got {value!r}")
    elif isinstance(value, str):
        out.append(_escape(value))
    elif isinstance(value, (list, tuple)):
        out.append("[")
        for i, item in enumerate(value):
            if i > 0:
                out.append(",")
            _write(item, out)
        out.append("]")
    elif isinstance(value, dict):
        keys = sorted(value.keys(), key=_sort_key)
        out.append("{")
        for i, key in enumerate(keys):
            if i > 0:
                out.append(",")
            out.append(_escape(key))
            out.append(":")
            _write(value[key], out)
        out.append("}")
    else:
        raise SpecIntegrityError(f"canonicalisation cannot serialise a value of type {type(value).__name__}")


def canonicalise(value: object, /) -> str:
    """The canonical serialisation the specification digest is computed over."""
    out: list[str] = []
    _write(value, out)
    return "".join(out)
