# SPDX-License-Identifier: Apache-2.0
"""Assembles a `ref:` identifier string from its parts. A part the grammar cannot carry is refused with
`BuildError` naming it — the builder never emits a string that means something else, which is proven at
the end by parsing what was built and comparing it with what was asked.

Ported from `crates/ref-id/src/build.rs`.
"""
from __future__ import annotations

from typing import Any

from .encoding import contains_any, encode, table_for
from .errors import BuildError
from .grammar import (
    FIELD,
    FRAGMENT_INTRODUCER,
    LINE_BREAKS,
    PAIR,
    scheme_prefix,
)
from .parse import parse
from .spec import Spec, load_spec
from .types import BuildParts, NestedValue
from .validators import folds_type

__all__ = ["build"]


def _nesting_form(spec: Spec, key: str) -> dict[str, Any] | None:
    declared = spec.get_object("qualifiers")
    entry = declared.get(key) if declared is not None else None
    if not isinstance(entry, dict):
        return None
    forms = spec.get_object("forms") or {}
    for name in entry.get("forms", []):
        if not isinstance(name, str):
            continue
        form = forms.get(name)
        if isinstance(form, dict) and form.get("nested") is True:
            return form
    return None


def _refuse(spec: Spec, part: str, why: str) -> BuildError:
    return _refuse_at(spec.part(part), why)


def _refuse_at(part: str, why: str) -> BuildError:
    """The message names the refused part, so a caller reads what to change instead of guessing and
    retrying. A part `parse` already reported is used verbatim: it may be a key the identifier carries
    and the spec never declared."""
    return BuildError(part, f"cannot build: {why} — refused at the {part}")


def build(parts: BuildParts, /) -> str:
    """Builds a `ref:` identifier string."""
    spec = load_spec()
    grammar = spec.grammar()
    state_separator = spec.get_str("grammar", "state", "separator")
    fragment_separator = spec.get_str("grammar", "fragment", "separator")
    separators = state_separator + FRAGMENT_INTRODUCER + "".join(LINE_BREAKS)
    fragment_reserved = fragment_separator + "".join(LINE_BREAKS)

    locator = parts.locator
    fold = f"{parts.type}{FIELD}"
    if folds_type(spec, parts.type) and locator.startswith(fold):
        locator = locator[len(fold) :]

    if not locator or contains_any(locator, separators):
        raise _refuse(spec, "locator", "a locator is handed to its validator verbatim and cannot carry a reserved character")

    out = [f"{scheme_prefix(spec)}{parts.type}{FIELD}{locator}"]

    if parts.qualifiers:
        rendered = []
        for key, value in parts.qualifiers:
            if isinstance(value, NestedValue):
                form = _nesting_form(spec, key)
                if form is None:
                    raise _refuse(spec, key, "this qualifier declares no nesting form")
                encoded = encode(value.nested, table_for(spec, form))
            else:
                if value.startswith(scheme_prefix(spec)) or contains_any(value, separators):
                    raise _refuse(spec, key, "a nested identifier is passed as Nested, never as a plain string")
                encoded = value
            rendering = f"{key}{PAIR}{encoded}"
            if grammar.state_pair.fullmatch(rendering) is None:
                raise _refuse(spec, key, "the key does not fit the pair grammar")
            rendered.append(rendering)
        out.append(state_separator)
        out.append(state_separator.join(rendered))

    wanted_path: str | None = None
    wanted_refinements: tuple[tuple[str, str], ...] = ()
    if parts.fragment is not None:
        if isinstance(parts.fragment, str):
            path = parts.fragment
        else:
            path = parts.fragment.path
            wanted_refinements = parts.fragment.refinements
        if not path or contains_any(path, fragment_reserved):
            raise _refuse(spec, "fragment", "a declared-name path cannot be empty or carry the refinement separator")
        for key, value in wanted_refinements:
            if contains_any(value, fragment_reserved):
                raise _refuse(spec, key, "a refinement value cannot carry the separator")
        out.append(FRAGMENT_INTRODUCER)
        out.append(path)
        if wanted_refinements:
            out.append(fragment_separator)
            out.append(fragment_separator.join(f"{key}{PAIR}{value}" for key, value in wanted_refinements))
        wanted_path = path

    assembled = "".join(out)

    # The last word is the grammar's: what was built must decompose to exactly what was asked.
    if grammar.top.fullmatch(assembled) is None:
        raise _refuse(spec, "grammar", "the assembled string does not match the grammar")
    check = parse(assembled)
    if check.status == spec.status("malformed"):
        refused = check.part if check.part is not None else spec.part("grammar")
        raise _refuse_at(refused, "the assembled string is malformed")
    if check.explicit_version or check.type != parts.type:
        raise _refuse(spec, "type", "the type re-split into other parts")
    if check.locator != locator:
        raise _refuse(spec, "locator", "the locator re-split into other parts")
    if len(check.qualifiers) != len(parts.qualifiers):
        raise _refuse(spec, "state", "a qualifier re-split into other parts")
    check_path = check.fragment.path if check.fragment is not None else None
    check_refinements = len(check.fragment.refinements) if check.fragment is not None else 0
    if check_path != wanted_path or check_refinements != len(wanted_refinements):
        raise _refuse(spec, "fragment", "the fragment re-split into other parts")
    return assembled
