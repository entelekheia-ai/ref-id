# SPDX-License-Identifier: Apache-2.0
"""Reassembles a `ParseResult` into the exact bytes it was parsed from. Every part is emitted verbatim.

Ported from `crates/ref-id/src/serialise.rs`; `canonical_identifier` from `crates/ref-id/src/relations.rs`'s
`canonical_form`.
"""
from __future__ import annotations

from dataclasses import replace

from .encoding import encode, table_for
from .errors import SerialiseError
from .grammar import FIELD, FRAGMENT_INTRODUCER, PAIR, scheme_prefix
from .parse import parse
from .spec import Spec, load_spec
from .types import Fragment, ParseResult

__all__ = ["canonical_identifier", "serialise"]


def _pairs(entries: tuple[tuple[str, str], ...], separator: str) -> str:
    return separator.join(f"{key}{PAIR}{value}" for key, value in entries)


def serialise(parsed: ParseResult, /) -> str:
    """`serialise(parse(s)) == s` for every parseable input, including uncovered and unsupported ones. A
    malformed result has no faithful form and is refused."""
    spec = load_spec()
    if parsed.status == spec.status("malformed"):
        raise SerialiseError(
            spec.part(parsed.part) if parsed.part is not None else spec.part("grammar"),
            "a malformed identifier cannot be serialised without losing the part that failed",
        )
    out = [scheme_prefix(spec)]
    if parsed.explicit_version:
        out.append(parsed.version_text if parsed.version_text is not None else str(parsed.version))
        out.append(FIELD)
    out.append(parsed.type)
    out.append(FIELD)
    out.append(parsed.locator)
    if parsed.qualifiers:
        separator = spec.get_str("grammar", "state", "separator")
        out.append(separator)
        out.append(_pairs(parsed.qualifiers, separator))
    if parsed.fragment is not None:
        out.append(FRAGMENT_INTRODUCER)
        out.append(parsed.fragment.path)
        if parsed.fragment.refinements:
            separator = spec.get_str("grammar", "fragment", "separator")
            out.append(separator)
            out.append(_pairs(parsed.fragment.refinements, separator))
    return "".join(out)


def _by_key(pair: tuple[str, str]) -> bytes:
    return pair[0].encode("utf-16-be", "surrogatepass")


def _nesting_form(spec: Spec, key: str) -> dict[str, object] | None:
    """The qualifier's declared form that nests an identifier, if it declares one — ported from
    `crates/ref-id/src/relations.rs`'s `nesting_form`."""
    declared = spec.get_object("qualifiers")
    if declared is None:
        return None
    entry = declared.get(key)
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


def _canonical_form(spec: Spec, parsed: ParseResult) -> str:
    """`identifierEquivalence.canonicalForm`: qualifiers and the fragment's refinements sorted by key
    (UTF-16 code unit order); a nested `ref:` identifier inside a qualifier value re-written in its own
    canonical form (decode, canonicalise, re-encode); the version slot omitted when it holds
    `version.default`. Every other part is left exactly as parsed.

    A malformed identifier has no canonical form: `serialise` refuses it, naming the part that failed.
    """
    out = replace(parsed, qualifiers=tuple(sorted(parsed.qualifiers, key=_by_key)))
    if out.fragment is not None:
        out = replace(out, fragment=Fragment(path=out.fragment.path, refinements=tuple(sorted(out.fragment.refinements, key=_by_key))))
    if parsed.nested is not None:
        qualifiers = list(out.qualifiers)
        for key, raw in parsed.nested:
            form = _nesting_form(spec, key)
            if form is None:
                continue
            inner = parse(raw)
            canonical_inner = _canonical_form(spec, inner)
            encoded = encode(canonical_inner, table_for(spec, form))
            qualifiers = [(k, encoded) if k == key else (k, v) for k, v in qualifiers]
        out = replace(out, qualifiers=tuple(qualifiers))
    if out.version == spec.get_int("version", "default"):
        out = replace(out, explicit_version=False)
    return serialise(out)


def canonical_identifier(identifier: str | ParseResult, /) -> str:
    """The canonical spelling of an identifier — `identifierEquivalence.canonicalForm`."""
    parsed = identifier if isinstance(identifier, ParseResult) else parse(identifier)
    spec = load_spec()
    return _canonical_form(spec, parsed)
