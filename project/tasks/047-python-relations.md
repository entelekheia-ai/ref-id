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

# Task: Python relations

| Field | Value |
|---|---|
| Status | Done |
| Created | 2026-09-28 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/47> |
| Plan | plans/008-the-python-port.md — Track 4 |

---

## Context

Tracks 2–3 left the Python package able to load its specification, parse, serialise, build, canonicalise
and validate an envelope (`python/src/ref_id/`, six vector groups green). This track adds comparison —
`covers`, `same_package`, `same_identifier`, `relate`, `verdict` — including the descent into nested
identifiers, runs the last three vector groups, and brings the generated `python/tests/test_surface.py`
fully green, which is the first time the whole declared surface is checked.

**Global constraints** (from Plan-008 and the rulings of Tracks 1–3): Python `>=3.11`; `mypy --strict` and
`ruff` clean; SPDX header on every source file; nothing from `spec/ref-id.json` written in code;
standard library and `packageurl-python` only; every public function positional-only (`validate_envelope`
is the one named exception, already landed); value types are frozen slotted dataclasses with snake_case
attributes and a `to_json()` emitting the `openRPC` keys; a function taking an identifier takes
`str | ParseResult`, and a pair may mix them (`IdentifierOrParsed`).

**The reference behaviour** is `crates/ref-id/src/relations.rs` (696 lines — `relate_result`, `reduce`,
`same_package_reduces`, the verdict axes and `order_decided`) with `crates/ref-id/tests/relate.rs` and
`verdict.rs`. Port behaviour, not shape. `canonical_identifier` already lives in
`python/src/ref_id/serialise.py`; reuse its canonical form rather than re-porting `canonical_form`.

Measured before writing:

- Rules and groups: `sameIdentifier` → `/identifierEquivalence/comparison`, `samePackage` →
  `/comparison/samePackage`, `covers` → `/comparison/covers`, all group `comparison` (44 vectors);
  `relate` → `/comparison/relate`, group `relate` (19); `verdict` → `/comparison/verdict`, group `verdict`
  (21). None declares an error.
- `RelateResult`: `type version locatorStem locatorVersion fragmentPath` each a `Relation`
  (`equal covers coveredBy differ`), `fragmentRefinements` an object of `QualifierRelation`, `qualifiers`
  an object of `QualifierRelation` (`{relation, nested?}` — `nested` is a `RelateResult`). `relate`
  returns `null` for a pair it refuses.
- `VerdictResult`: `identity` (`same covers coveredBy distinct undetermined`), `content`
  (`same different unknown`), `decidedBy {identity: [str], content: [str]}`; `verdict` returns `null` for
  a pair `relate` refuses.
- A `comparison` vector expects some of `samePackage`, `covers`, `coversReversed` (= `covers(b, a)`),
  `sameIdentifier`; a `relate` vector expects `relate` plus some of those; a `verdict` vector `verdict`.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | `RelateResult`, `QualifierRelation`, `VerdictResult` value types | S |
| 2 | P0 | `relate` and the dimension relations | L |
| 3 | P0 | `same_package`, `covers`, `same_identifier` | M |
| 4 | P0 | `verdict` | M |
| 5 | P0 | The last three vector groups; the refusal test stops being `xfail` | S |
| 6 | P0 | `test_surface.py` green: every declared name exported, every signature matching | S |

### 1. The value types — P0

**What:** in `python/src/ref_id/types.py`, `RelateResult`, `QualifierRelation`, `VerdictResult` (with a
`DecidedBy` or equivalent), frozen slotted dataclasses; `Relation` and the verdict enums as `Literal`
aliases or `str`, the values read from the specification rather than hard-coded where the crate reads them.
`to_json()` emits the `openRPC` keys. **Why:** `test_surface.py` binds `ref_id.RelateResult` and
`ref_id.VerdictResult`; the line protocol in Track 5 prints them.

### 2–4. The operations — P0

**What:** `python/src/ref_id/relations.py` with `relate(a, b, /)`, `same_package(a, b, /)`,
`covers(general, specific, /)`, `same_identifier(a, b, /)`, `verdict(a, b, /)`, each taking
`str | ParseResult`, porting the crate. A pair the crate refuses returns `None` from `relate` and
`verdict`, and `False` from the booleans, exactly where the crate does.

### 5. The conformance runner — P0

**What:** `python/tests/test_conformance.py` runs `comparison`, `relate` and `verdict`; `EXECUTED` names
all nine groups; `test_every_vector_group_runs` loses its `xfail` and passes.

### 6. The whole surface — P0

**What:** `python/src/ref_id/__init__.py` exports every name in `test_surface.py`'s `DECLARED` plus the
value types; `uv run pytest` with **no** `--ignore` passes, including `test_parameter_kinds`; `uv run mypy
--strict src tests` passes over every test file, `test_surface.py` included.

## Review focus

1. **A mixed pair.** Every operation called with `(str, ParseResult)` and `(ParseResult, str)` returns what
   `(str, str)` returns. Pin it with a test that replays each `comparison` vector in all four mixes.
2. **Asymmetry.** `covers(a, b)` and `covers(b, a)` differ where the vectors say so; a test asserts
   `coversReversed` as its own call, never as a negation.
3. **A nested identifier inside a qualifier**, several levels deep — `relate` descends and fills `nested`;
   a malformed nested value makes the pair refused, not a crash. Pin one three-level case beyond the vectors,
   with the expected output taken from the TypeScript reference
   (`node --experimental-strip-types -e "import('./packages/ref-id/src/index.ts').then(m => console.log(JSON.stringify(m.relate(A, B))))"`).
4. **Two malformed or uncovered identifiers.** `relate` and `verdict` return `None` without raising;
   booleans are `False`. Pin with inputs from the `parse` group whose status is not `ok`.
5. **Order of `decidedBy`.** The lists follow the crate's `order_decided`, not insertion order — pin a
   verdict whose two axes are decided by more than one path.

## Implementation order

Items 1–6 are dispatched to `ref-id-port-implementer` as one brief (Plan-008 Decision Log), language
`python`, write set `python/src/ref_id/` except `spec/`, and `python/tests/` except `test_surface.py`.

The gate, from inside `python/`: `uv run pytest`, `uv run --python 3.11 pytest`,
`uv run mypy --strict src tests`, `uv run ruff check`; at the root,
`node scripts/gen-surface-python.mjs --check`.

- [x] P0 — implementer: items 1–6, TDD, each group watched failing first
- [x] P0 — caller: read the diff, rerun the gate, break one detection on purpose, commit

## Surprises & Discoveries

- Observation: the brief asked for a three-level nested case, and the specification allows one level —
  the implementer contested it with evidence, and pinned the deepest case the scheme admits.
  Evidence: `forms.ref` is `{"nested": true, "depth": 1, "encoding": "nested"}`, and the `parse` vector
  "nesting deeper than one level is malformed" binds it; the crate's `qualifier_relation` recurses once.

- Ruling: `relations.py` keeps its own UTF-16 key-sort helper rather than importing `serialise.py`'s
  private one, as the crate and the TypeScript reference each duplicate it — cost if wrong: two copies of
  a two-line function, caught by any vector that sorts differently.

- Ruling: `IdentifierOrParsed` is a private alias in `relations.py`, not exported; no declared name
  requires it — cost if wrong: none.

- Ruling: `same_identifier` catches `RefIdError` around its two canonical forms, as the crate's match
  does, though the ok/uncovered gate makes the failure unreachable — cost if wrong: a dead handler.

- Observation (caller verification): the whole suite ran for the first time, `test_surface.py` included,
  and the Track 1 contract holds — removing `covers`'s `/` fails `test_parameter_kinds`.
  Evidence: `uv run pytest` 650 passed on 3.14 and on 3.11; `mypy --strict src tests` clean; the planted
  fault gave `1 failed, 2 passed` in `tests/test_surface.py`.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
