# SPDX-License-Identifier: Apache-2.0
"""Percent-encode/decode helpers driven by an `encoding.<name>.table` from the specification — never a
hardcoded character list. Which table applies to a form is the form's own `encoding` field.

Ported from `crates/ref-id/src/encoding.rs`.
"""
from __future__ import annotations

from typing import Any

from .spec import Spec

__all__: list[str] = []

Table = list[tuple[str, str]]


def table_for(spec: Spec, form: dict[str, Any]) -> Table:
    """The encoding table a form declares, or an empty one when the form declares no encoding."""
    name = form.get("encoding")
    if not isinstance(name, str):
        return []
    return spec.get_table("encoding", name, "table")


def contains_any(raw: str, characters: str) -> bool:
    return any(char in characters for char in raw)


def encode(raw: str, table: Table) -> str:
    """One left-to-right pass over the source characters; a produced percent-form is never re-scanned."""
    if not table:
        return raw
    out: list[str] = []
    for char in raw:
        form = next((value for key, value in table if len(key) == 1 and key == char), None)
        out.append(form if form is not None else char)
    return "".join(out)


def decode(encoded: str, table: Table) -> str:
    """One left-to-right pass over the encoded text; decoding `%2523` yields `%23`, never `#`.

    Scans by index rather than slicing a fresh `rest` string every step: `rest = rest[1:]` (and the
    matching `rest.startswith(form)`) copies the remaining text on every character, which is quadratic in
    the input length. `str.startswith(form, i)` matches at an offset without copying anything."""
    if not table:
        return encoded
    out: list[str] = []
    length = len(encoded)
    index = 0
    while index < length:
        match = next(((character, form) for character, form in table if encoded.startswith(form, index)), None)
        if match is not None:
            character, form = match
            out.append(character)
            index += len(form)
        else:
            out.append(encoded[index])
            index += 1
    return "".join(out)


def strictly_encoded(value: str, table: Table) -> bool:
    """True when every `%` in the value begins one of the table's percent-forms — the strict nested
    encoding.

    `value[at:]` builds a fresh substring at every `%` found, which is quadratic when `%` recurs densely
    (`"%25" * n`, say); `value.startswith(form, at)` checks the same forms at that offset without copying
    the tail."""
    index = 0
    while True:
        at = value.find("%", index)
        if at < 0:
            return True
        if not any(value.startswith(form, at) for _character, form in table):
            return False
        index = at + 1
