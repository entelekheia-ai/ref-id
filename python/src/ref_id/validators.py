# SPDX-License-Identifier: Apache-2.0
"""The one registry that maps a NAME the specification uses to behaviour: the owning validators (by
`dispatch.<type>.validator`), the ways a delegated string is formed (by `dispatch.<type>.delegate`), the
refinement range constraints (by `refinements.<key>.range`) and the policies this package implements. A
validator or delegate name the specification uses and this file does not know degrades to `uncovered`; a
range or policy name it does not know is a version mismatch, refused loudly.

Ported from `crates/ref-id/src/validators.rs`.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from weakref import WeakSet

from packageurl import PackageURL

from .errors import SpecVersionError
from .grammar import FIELD
from .spec import Spec

__all__: list[str] = []


@dataclass(frozen=True, slots=True)
class Validation:
    ok: bool
    canonical: str | None = None


def _split_subpath(delegated: str) -> tuple[str, str | None]:
    """Where a Package URL locator stops being the package and starts being a path inside it.

    An `@` that opens a segment — preceded by `/`, or first in the string — belongs to a namespace and
    is part of the name. An `@` inside a segment closes the name: the version runs from it to the next
    `/`, and whatever follows that `/` is the subpath. Without a version there is no marker at all, so
    `npm/a/b/c` stays a namespaced package and carries no subpath.

    Ported from `crates/ref-id/src/validators.rs:31` (`split_subpath`).
    """
    for index in range(1, len(delegated)):
        if delegated[index] != "@" or delegated[index - 1] == "/":
            continue
        slash = delegated.find("/", index)
        if slash < 0:
            return delegated, None
        return delegated[:slash], delegated[slash + 1 :]
    return delegated, None


def _uppercase_percent_escapes(text: str) -> str:
    """`packageurl-python`'s `to_string()` lowercases its percent-escapes (`%2b`); the other three
    implementations agree on uppercase (`%2B`, per RFC 3986 §2.1 and what `packageurl-js` and the `purl`
    crate both emit), so this port's canonical form is uppercased to match rather than left to the one
    validator that happens to disagree. A left-to-right index scan, mirroring `decode`/`strictly_encoded`
    above, so it stays linear rather than copying the tail at each `%`."""
    out: list[str] = []
    length = len(text)
    index = 0
    while index < length:
        if text[index] == "%" and index + 2 < length:
            out.append("%")
            out.append(text[index + 1 : index + 3].upper())
            index += 3
        else:
            out.append(text[index])
            index += 1
    return "".join(out)


def _package_url(_spec: Spec, _entry: dict[str, Any], delegated: str) -> Validation:
    base, subpath = _split_subpath(delegated)
    try:
        purl = PackageURL.from_string(base)
        if subpath is not None:
            purl = PackageURL(purl.type, purl.namespace, purl.name, purl.version, purl.qualifiers, subpath)
        return Validation(ok=True, canonical=_uppercase_percent_escapes(purl.to_string()))
    except ValueError:
        return Validation(ok=False)


def _declared_name(spec: Spec, entry: dict[str, Any], delegated: str) -> Validation:
    pattern = entry.get("pattern", "")
    grammar = spec.grammar()
    return Validation(ok=grammar.matches(spec, pattern, delegated))


def _check_digit_holds(value: str) -> bool:
    """The check digit of a registered article number.

    A ten-character book number weights its digits 10..1 and is correct when the sum is divisible by
    eleven, which is why its last character may be `X` for the value ten. Every other length is a GS1
    trade item number: the digits before the last are weighted 3 and 1 alternately from the right, and
    the last is whatever brings the total up to a multiple of ten.

    Ported from `crates/ref-id/src/validators.rs:76` (`check_digit_holds`).
    """
    if len(value) == 10:
        weighted = sum((10 if char == "X" else int(char)) * (10 - index) for index, char in enumerate(value))
        return weighted % 11 == 0
    digits = [int(char) for char in value]
    if not digits:
        return False
    declared = digits[-1]
    weighted = sum(digit * (3 if index % 2 == 0 else 1) for index, digit in enumerate(reversed(digits[:-1])))
    return (10 - (weighted % 10)) % 10 == declared


def _check_digit(spec: Spec, entry: dict[str, Any], delegated: str) -> Validation:
    pattern = entry.get("pattern", "")
    grammar = spec.grammar()
    matches = grammar.matches(spec, pattern, delegated)
    return Validation(ok=matches and _check_digit_holds(delegated))


Validator = Callable[[Spec, dict[str, Any], str], Validation]

_VALIDATORS: dict[str, Validator] = {
    "package-url": _package_url,
    "declared-name": _declared_name,
    "check-digit": _check_digit,
}


@dataclass(frozen=True, slots=True)
class _Delegator:
    form: Callable[[str, str], str]
    folds_type: bool


_DELEGATORS: dict[str, _Delegator] = {
    "type-prefixed": _Delegator(form=lambda t, l: f"{t}{FIELD}{l}", folds_type=True),
    "verbatim": _Delegator(form=lambda _t, l: l, folds_type=False),
}


def _as_digits(text: str) -> str | None:
    """As Rust's `str::parse::<u64>()` reads a bound: digits only, no sign, no separators — but returned
    as a leading-zero-stripped digit string rather than converted to an `int`, so a value with thousands
    of digits (this package does not bound refinement values to `u64`, unlike Rust — the open spec
    question `_ascending`'s docstring names) never hits CPython's int-conversion digit-count guard."""
    return text.lstrip("0") or "0" if text.isascii() and text.isdigit() else None


def _magnitude_at_most(a: str, b: str) -> bool:
    """Whether digit string `a` is numerically `<=` digit string `b`, both already leading-zero-stripped:
    magnitude order is decided by length first, then lexicographically — equivalent to comparing the two
    as integers without ever converting either to one."""
    if len(a) != len(b):
        return len(a) < len(b)
    return a <= b


def _ascending(value: str, separator: str) -> bool:
    bounds = value.split(separator) if separator else [value]
    if len(bounds) < 2:
        return True
    first, second = _as_digits(bounds[0]), _as_digits(bounds[1])
    if first is None or second is None:
        return True
    return _magnitude_at_most(first, second)


_RANGES: dict[str, Callable[[str, str], bool]] = {"ascending": _ascending}

_UNKNOWN_KEY_POLICY = "carry-through"
_REPEATED_KEY_POLICY = "malformed"

# Keyed by the `Spec` instance itself, not `id(spec)`: an id is only unique while the object is alive,
# and a short-lived `Spec` (a test's `load_spec_from` over a temporary copy) can be garbage-collected and
# have its id reused by an unrelated later `Spec`, which would then skip this check by accident.
_IMPLEMENTED: WeakSet[Spec] = WeakSet()


def assert_implemented(spec: Spec, /) -> None:
    """Refuses a spec whose declared policies or range names are ones this package does not implement."""
    if spec in _IMPLEMENTED:
        return
    declared = [
        ("grammar.state.unknownKey", spec.get_str("grammar", "state", "unknownKey"), _UNKNOWN_KEY_POLICY),
        ("unknownRefinement", spec.get_str("unknownRefinement"), _UNKNOWN_KEY_POLICY),
        ("grammar.state.repeatedKey", spec.get_str("grammar", "state", "repeatedKey"), _REPEATED_KEY_POLICY),
        ("grammar.fragment.repeatedKey", spec.get_str("grammar", "fragment", "repeatedKey"), _REPEATED_KEY_POLICY),
    ]
    for field_name, value, implemented in declared:
        if value != implemented:
            raise SpecVersionError(f"spec.{field_name} declares {value!r}; this package implements only {implemented!r}")
    refinements = spec.get_object("refinements") or {}
    for key_name, refinement in refinements.items():
        name = refinement.get("range") if isinstance(refinement, dict) else None
        if name is not None and name not in _RANGES:
            raise SpecVersionError(f"spec.refinements.{key_name}.range declares {name!r}, which this package does not implement")
    _IMPLEMENTED.add(spec)


def _dispatch_entry(spec: Spec, type_: str) -> dict[str, Any] | None:
    dispatch = spec.get_object("dispatch") or {}
    entry = dispatch.get(type_)
    return entry if isinstance(entry, dict) else None


def delegated_string(spec: Spec, type_: str, locator: str) -> str | None:
    entry = _dispatch_entry(spec, type_)
    if entry is None:
        return None
    mode = entry.get("delegate")
    delegator = _DELEGATORS.get(mode) if isinstance(mode, str) else None
    if delegator is None:
        return None
    return delegator.form(type_, locator)


def folds_type(spec: Spec, type_: str) -> bool:
    entry = _dispatch_entry(spec, type_)
    if entry is None:
        return False
    mode = entry.get("delegate")
    delegator = _DELEGATORS.get(mode) if isinstance(mode, str) else None
    return delegator.folds_type if delegator is not None else False


def validate_locator(spec: Spec, entry: dict[str, Any], delegated: str) -> Validation | None:
    """Runs the owning validator, or None when the spec names one this package does not implement."""
    name = entry.get("validator")
    validator = _VALIDATORS.get(name) if isinstance(name, str) else None
    if validator is None:
        return None
    return validator(spec, entry, delegated)


def range_holds(refinement: dict[str, Any], value: str) -> bool:
    name = refinement.get("range")
    check = _RANGES.get(name) if isinstance(name, str) else None
    if check is None:
        return True
    return check(value, refinement.get("boundSeparator", ""))
