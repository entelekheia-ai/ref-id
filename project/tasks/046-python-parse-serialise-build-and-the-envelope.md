---
vibe-ops-template: task@3
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# Task: Python parse, serialise, build and the envelope

| Field | Value |
|---|---|
| Status | In Progress |
| Created | 2026-09-28 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/46> |
| Plan | plans/008-the-python-port.md — Track 3 |

---

## Context

Track 2 left the Python package with its specification, `canonicalise`, `digest` and the grammar compiled in
the `python-re` dialect (`python/src/ref_id/`). This track adds the identifier itself: `parse`,
`serialise`, `build`, `canonical_identifier` and `validate_envelope`, the value types they exchange, and the
validator registry that delegates a Package URL to `packageurl-python`. Relations are Track 4.

**Global constraints** (from Plan-008 and the rulings of Tracks 1–2, apply to every item): Python `>=3.11`;
`mypy --strict` and `ruff` clean; `# SPDX-License-Identifier: Apache-2.0` on every source file; nothing
from `spec/ref-id.json` written in code; runtime dependency `packageurl-python` and the standard library
only; **every public function takes positional-only parameters**, except a method carrying
`x-argument-labels` — here `validate_envelope(requested_id, envelope)`, named as the specification names
them in snake_case; the error kinds are the ones `errors.py` already defines.

**The reference behaviour** is the Rust crate: `crates/ref-id/src/parse.rs` (243 lines), `serialise.rs`,
`build.rs`, `envelope.rs`, `validators.rs` (209), `encoding.rs`, `types.rs` — 776 lines together. Port
behaviour, not shape. Where the crate and the specification disagree, the specification wins, and the
disagreement is a finding with both `file:line`. The TypeScript reference (`packages/ref-id/src/`) settles
a case the crate does not reach.

Measured before writing:

- `openRPC` rules and groups: `parse` → `/grammar`, group `parse` (158 vectors); `serialise` →
  `/identifierEquivalence/reserialisation`, group `roundtrip` (23); `build` → `/dispatch`, group `build`
  (15), error `Build`; `canonicalIdentifier` → `/identifierEquivalence/canonicalForm`, group `canonical`
  (13), error `Serialise`; `validateEnvelope` → `/envelope`, group `envelope` (12), `x-argument-labels`.
- `ParseResult` keys: required `input status version explicitVersion type locator qualifiers fragment`,
  optional `versionText delegated canonical nested part`. `qualifiers` is a list of `[key, value]` pairs in
  input order; `fragment` is `{path, refinements}` or `null`; a `malformed` result carries `part`, and a
  `part` of `grammar` means `type` and `locator` are both `""`.
- `BuildParts`: required `type`, `locator`; optional `qualifiers` (a value is a string or
  `{"nested": <identifier>}`), `fragment` (a string, or `{path, refinements}`), `location` (never reaches
  the identifier). `EnvelopeResult`: `admissible`, optional `reason`.
- `packageurl-python` 0.17.6 refuses an empty name after a namespace and accepts a version ending in `/` —
  the differential exempts the Package URL verdict per implementation, so the port reports what the
  library says (Plan-008, Design).

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 0 | P0 | The dialect adaptation gains `anchor` (caller, done) | M |
| 1 | P0 | The value types, with `to_json` / `from_json` | M |
| 2 | P0 | Percent-encoding (`encoding.py`) | S |
| 3 | P0 | The validator registry, Package URL delegated | M |
| 4 | P0 | `parse` | L |
| 5 | P0 | `serialise` and `canonical_identifier` | M |
| 6 | P0 | `build` | M |
| 7 | P0 | `validate_envelope` | S |
| 8 | P0 | The conformance runner runs five more groups | S |

### 0. The dialect adaptation gains `anchor` — P0 (caller, done)

**What:** `grammar.adaptations.<dialect>.anchor` replaces only the `$` that ends a pattern; `replace` keeps
the pairs that apply everywhere. `python-re` is `replace: [["(?<", "(?P<"]]`, `anchor: "\\Z"`; `pcre2` is
`replace: []`, `anchor: "\\z"`. Every reader honours it — `packages/ref-id/src/grammar.ts`,
`crates/ref-id/src/grammar.rs`, `Sources/RefId/Grammar.swift`, `python/src/ref_id/grammar.py` and both
grammar runners — and `docs/reference/the-ref-scheme.md` says so.
**Why:** the Plan-008 Decision Log entry of 2026-09-28; `forms.origin-url.pattern` did not compile in
`python-re`.
**Change:** landed before the implementer's dispatch, with `python/tests/test_grammar.py` gaining
`test_every_declared_pattern_compiles` and `test_the_anchor_leaves_a_dollar_inside_a_class_alone`.

### 1. The value types — P0

**What:** `python/src/ref_id/types.py`: `ParseResult`, `Fragment`, `BuildParts`, `NestedValue`
(`BuildParts`' `{"nested": …}` qualifier value), `EnvelopeResult`, each `@dataclass(frozen=True,
slots=True)` with snake_case attributes; `ParseResult.to_json()` and `EnvelopeResult.to_json()` return the
`openRPC` keys exactly (camelCase, optional keys omitted when unset, key order irrelevant);
`BuildParts.from_json(obj)` reads the vector shape. Pairs are `tuple[str, str]`, sequences are `tuple`s.
**Why:** the surface binds `ref_id.ParseResult`, `ref_id.BuildParts`, `ref_id.EnvelopeResult`; the line
protocol in Track 5 prints `to_json()`.
**Change:** mirror `crates/ref-id/src/types.rs`, including `ParseResult::to_json`.

### 2. Percent-encoding — P0

**What:** `python/src/ref_id/encoding.py`, porting `crates/ref-id/src/encoding.rs` — the character sets
come from the specification, never from `urllib.parse`'s defaults.

### 3. The validator registry — P0

**What:** `python/src/ref_id/validators.py`, a name-to-behaviour registry porting
`crates/ref-id/src/validators.rs`: Package URL through `packageurl.PackageURL.from_string` (with the
subpath split the crate does at `validators.rs:31`), the declared-name and check-digit validators, the
delegators and ranges, and `assert_implemented`. **A validator or delegate name the specification uses and
this file does not know degrades to `uncovered`; a range or policy name it does not know raises
`SpecVersionError`.** The SWHID core form is validated in-house (ADR-0002).

### 4. `parse` — P0

**What:** `parse(input: str, /) -> ParseResult` in `python/src/ref_id/parse.py`, porting
`crates/ref-id/src/parse.rs`. It never raises on bad input — a bad identifier is a result with a status
and a part. An unregistered type degrades to `uncovered`; an unknown qualifier key is carried through.

### 5. `serialise` and `canonical_identifier` — P0

**What:** `serialise(parsed: ParseResult, /) -> str` and `canonical_identifier(identifier: str |
ParseResult, /) -> str` in `python/src/ref_id/serialise.py`, porting `serialise.rs` and the canonical form
from the crate. An unrecognised qualifier key is re-serialised byte for byte. A result with no faithful
string form raises `SerialiseError` at the part the crate names.

### 6. `build` — P0

**What:** `build(parts: BuildParts, /) -> str` in `python/src/ref_id/build.py`, porting `build.rs`.
`location` never reaches the identifier. A part the grammar cannot carry raises `BuildError` naming it.

### 7. `validate_envelope` — P0

**What:** `validate_envelope(requested_id: str, envelope: object) -> EnvelopeResult` in
`python/src/ref_id/envelope.py`, porting `envelope.rs`. Named parameters, not positional-only
(`x-argument-labels`). An identifier carrying a digest is admissible only with an envelope whose members
recompute to it.

### 8. The conformance runner — P0

**What:** `python/tests/test_conformance.py` runs `parse`, `canonical`, `roundtrip`, `build` and
`envelope` beside `digest`, each vector compared on the fields its `expect` names (a parse vector asserts
a subset of `ParseResult`, so compare `to_json()` restricted to the expectation's keys). `EXECUTED` gains
the five groups; the refusal test stays `xfail(strict=True)` until Track 4 adds the last three.

## Review focus

1. **A Package URL the two libraries canonicalise differently.** For every `pkg` vector that asserts
   `canonical`, the Python value must equal it; when `packageurl-python`'s `to_string()` differs from the
   expectation, that is a finding with the input, both strings and the library version — never patched
   by editing the canonical string in code. Pinned by the `parse` group itself.
2. **An unknown locator type and an unknown qualifier key.** `parse("ref:zzz:a;q=1")` is `uncovered`,
   never raised, and `serialise(parse(x)) == x` keeps `q=1` byte for byte. Pin both with a test beyond
   the vectors.
3. **A validator name the specification adds later.** A spec copy whose dispatch entry names an unknown
   validator parses that type as `uncovered`; a copy naming an unknown range raises `SpecVersionError`.
   Pin both, with `load_spec_from` over a temporary resealed copy.
4. **`validate_envelope` called positionally and by keyword** — both work, and the names are
   `requested_id` and `envelope` (the generated `test_parameter_kinds` enforces it once Track 4 runs it;
   add a direct test now).
5. **Non-string input to `parse`.** `parse(None)` is a caller error `mypy` refuses statically; at run
   time it raises `TypeError` rather than returning a `ParseResult` or coercing with `str()`. Pin it with
   `pytest.raises(TypeError)` and a `# type: ignore[arg-type]` on the call.

## Implementation order

Items 1–8 are dispatched to `ref-id-port-implementer` as one brief (Plan-008 Decision Log), language
`python`, write set `python/src/ref_id/` except `spec/`, and `python/tests/` except `test_surface.py`.

The gate, from inside `python/`: `uv run pytest --ignore tests/test_surface.py`,
`uv run --python 3.11 pytest --ignore tests/test_surface.py`, `uv run mypy --strict src tests` minus
`tests/test_surface.py` (run `uv run mypy --strict src $(ls tests/*.py | grep -v test_surface)`),
`uv run ruff check`; at the root, `node scripts/gen-surface-python.mjs --check`.

- [x] P0 — caller: item 0, and every implementation's gate after it
- [ ] P0 — implementer: items 1–8, TDD, each group watched failing first
- [ ] P0 — caller: read the diff, rerun the gate, break one detection on purpose, commit

## Surprises & Discoveries

- Ruling: the value types are frozen, slotted dataclasses with snake_case attributes and a `to_json()`
  emitting the `openRPC` keys — Python's idiom for an immutable record, and the shape the line protocol
  prints; no other implementation can observe it — cost if wrong: a consumer wanting dict access calls
  `to_json()`.

- Observation: all 26 patterns in the specification end in `$`, and none carries an unescaped `$` outside a
  character class before its end — so "the `$` that ends the pattern" names exactly one character in each.
  Evidence: a walk over every string outside `vectors` and `openRPC`, stripping character classes first.

- Observation: with the anchor applied only to the final `$`, every implementation agrees as before.
  Evidence: `npm test` 330 pass; `npm run test:grammar` 158/158 in `python-re` and in `pcre2`; `cargo
  test --workspace` 17 pass; `swift run ref-id-conformance` 1074 passed; the differential 226 inputs and
  51076 pairs × 4, 0 disagreements; Python's two new grammar tests fail with the anchor disabled.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
