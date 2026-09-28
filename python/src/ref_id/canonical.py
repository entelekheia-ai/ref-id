# SPDX-License-Identifier: Apache-2.0
"""The canonical serialisation `/canonicalisation` fixes: object keys sorted by UTF-16 code unit, no
whitespace outside strings, strings escaped exactly as ECMAScript `JSON.stringify` does, integers only.

Ported from `crates/ref-id/src/canonical.rs`. `json.dumps` is not used for string escaping: measured
(2026-09-27), Python's own encoder writes a lone surrogate through unescaped, where `JSON.stringify`
escapes it as `\\uXXXX` — the two implementations would then digest different bytes for the same
member.
"""
from __future__ import annotations

import json

from .errors import SpecIntegrityError

__all__ = ["canonicalise"]

_maximum_cache: int | None = None


def _maximum() -> int:
    """`version.maximum`, read from the embedded specification rather than written as a literal here.
    Deferred import: `spec.py` imports this module at its own top level to build `canonicalise`, so the
    reverse read happens only inside this function body, by which time both modules are fully loaded —
    and it reads the raw bytes rather than the validated `Spec`, because this is itself the function that
    computes the digest `Spec` is validated against."""
    global _maximum_cache
    if _maximum_cache is None:
        from .spec import embedded_spec_text

        json_text, _sidecar_text = embedded_spec_text()
        document = json.loads(json_text)
        value = document.get("version", {}).get("maximum") if isinstance(document, dict) else None
        if not isinstance(value, int) or isinstance(value, bool):
            raise SpecIntegrityError("spec/ref-id.json does not declare version.maximum as an integer")
        _maximum_cache = value
    return _maximum_cache

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
    index = 0
    length = len(string)
    while index < length:
        char = string[index]
        code = ord(char)
        # A Python `str` may hold an unpaired surrogate half where JavaScript would already have joined
        # it into one UTF-16 code unit pair naming a single character. Joining a high/low pair back into
        # its codepoint before deciding how to write it keeps this port's output identical to
        # `JSON.stringify`'s for a string built the way JavaScript itself would see it — two `str` halves
        # from splitting an astral character must canonicalise the same as that one character.
        if 0xD800 <= code <= 0xDBFF and index + 1 < length:
            next_code = ord(string[index + 1])
            if 0xDC00 <= next_code <= 0xDFFF:
                combined = 0x10000 + (code - 0xD800) * 0x400 + (next_code - 0xDC00)
                out.append(chr(combined))
                index += 2
                continue
        if char in _ESCAPES:
            out.append(_ESCAPES[char])
        elif code < 0x20 or 0xD800 <= code <= 0xDFFF:
            # A lone surrogate cannot be re-encoded as UTF-8 unescaped; `JSON.stringify` escapes it
            # exactly like a control character, and this port must match that byte for byte.
            out.append(f"\\u{code:04x}")
        else:
            out.append(char)
        index += 1
    out.append('"')
    return "".join(out)


def _sort_key(key: str) -> bytes:
    # UTF-16 code unit order, per `/canonicalisation`. `surrogatepass` lets a key that is itself a lone
    # surrogate (or carries one) still sort, rather than raising where the specification does not.
    return key.encode("utf-16-be", "surrogatepass")


# A depth this deep has no legitimate use in a specification document (the real one nests a handful of
# levels); it exists so a pathologically deep or cyclic input is refused with `SpecIntegrityError` well
# before it could exhaust CPython's own call stack (`RecursionError`) — Security review finding 5.
_MAX_DEPTH = 500


def _describe_int(value: int) -> str:
    """A safe textual magnitude for an error message — `str()`/`repr()` on an integer long enough hits
    CPython's own int-conversion digit-count guard, which would turn *reporting* the refusal into the
    same crash this function exists to avoid."""
    try:
        return repr(value)
    except ValueError:
        sign = "-" if value < 0 else ""
        return f"{sign}<integer of magnitude 2**{value.bit_length()}>"


def _write(value: object, out: list[str], maximum: int, depth: int, seen: set[int]) -> None:
    if depth > _MAX_DEPTH:
        raise SpecIntegrityError(f"canonicalisation nests more than {_MAX_DEPTH} levels deep")
    if value is None:
        out.append("null")
    elif isinstance(value, bool):
        out.append("true" if value else "false")
    elif isinstance(value, int):
        if abs(value) > maximum:
            raise SpecIntegrityError(f"canonicalisation covers magnitudes up to {maximum}, got {_describe_int(value)}")
        out.append(str(value))
    elif isinstance(value, float):
        # A number is an integer whose magnitude is at most `version.maximum`, written as that integer;
        # an integral value written with a fraction or an exponent (`json.loads` turns both into a
        # `float`, e.g. `1.0` or `1e2`) is that integer; any other number is refused (`/canonicalisation`).
        if not value.is_integer() or abs(value) > maximum:
            raise SpecIntegrityError(f"canonicalisation covers integers only, got {value!r}")
        out.append(str(int(value)))
    elif isinstance(value, str):
        out.append(_escape(value))
    elif isinstance(value, (list, tuple)):
        # `id(value)` marks a container as "on the path from the root to here" for the length of its own
        # recursion (added on entry, discarded on exit) — a reference cycle (a container that reaches
        # itself through its own descendants) is refused instead of recursing forever, while the same
        # object appearing twice in separate, non-nested branches (aliasing, not a cycle) still
        # canonicalises normally.
        marker = id(value)
        if marker in seen:
            raise SpecIntegrityError("canonicalisation cannot serialise a cyclic structure")
        seen.add(marker)
        try:
            out.append("[")
            for i, item in enumerate(value):
                if i > 0:
                    out.append(",")
                _write(item, out, maximum, depth + 1, seen)
            out.append("]")
        finally:
            seen.discard(marker)
    elif isinstance(value, dict):
        marker = id(value)
        if marker in seen:
            raise SpecIntegrityError("canonicalisation cannot serialise a cyclic structure")
        seen.add(marker)
        try:
            if any(not isinstance(key, str) for key in value):
                raise SpecIntegrityError("canonicalisation covers string-keyed objects only")
            keys = sorted(value.keys(), key=_sort_key)
            out.append("{")
            for i, key in enumerate(keys):
                if i > 0:
                    out.append(",")
                out.append(_escape(key))
                out.append(":")
                _write(value[key], out, maximum, depth + 1, seen)
            out.append("}")
        finally:
            seen.discard(marker)
    else:
        raise SpecIntegrityError(f"canonicalisation cannot serialise a value of type {type(value).__name__}")


def canonicalise(value: object, /) -> str:
    """The canonical serialisation the specification digest is computed over."""
    out: list[str] = []
    _write(value, out, _maximum(), 0, set())
    return "".join(out)
