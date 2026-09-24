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

# Task: Rust — the declared surface, relate, and the descent

| Field | Value |
|---|---|
| Status | Planned |
| Created | 2026-09-24 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/24> |
| Plan | `project/plans/005-the-comparison-descends-into-nested-identifiers.md`, Track 2 (Rust) |

---

## Context

Plan-005 Tracks 1, 3 and 4 changed the specification first: `covers` and `samePackage` descend into a
nested identifier, `relate` is declared with its own vector group, and `openRPC` declares the public
surface. Measured on the branch at `f7e5b1c`:

- `cargo test --workspace` stops at compilation: `crates/ref-id/tests/surface.rs` has 9 failing bindings
  — `same_identifier` (both), `relate` (both, and no `RelateResult` type), and the `&ParseResult`
  bindings of `canonical_identifier`, `same_package` and `covers`;
- run alone, `cargo test -p ref-id --test conformance` fails 2: `every_vector_group_runs` refusing
  `relate`, and `comparison_vectors`, which depends on the descent;
- `node scripts/check-surface.mjs --only rust` reports `relate` and `same_identifier` missing.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Comparison descends into a nested identifier | S |
| 2 | P0 | `same_identifier` | S |
| 3 | P0 | `relate` and `RelateResult`, and the runner executing the `relate` group | M |
| 4 | P0 | Identifiers taken as `&str` or `&ParseResult` | M |

### 1. Comparison descends into a nested identifier — P0

**What:** `covers` and `same_package` compare a qualifier whose value is a nested `ref:` on both sides
with the same relation on the decoded pair, one level deep; everything else stays byte for byte.
**Why:** `comparison_vectors` fails without it.
**Change:** in `src/relations.rs`, from `comparison.covers.rule` / `comparison.samePackage.rule`.

### 2. `same_identifier` — P0

**What:** `same_identifier(a, b) -> bool`: the canonical forms are equal byte for byte
(`identifierEquivalence.comparison`). It exists in TypeScript only today.

### 3. `relate` — P0

**What:** `relate(a, b) -> Option<RelateResult>`, with `RelateResult`, `Relation` and a qualifier relation
type matching `openRPC.components.schemas`; add `relate` to the executed groups in
`tests/conformance.rs` and a test checking every `relate` vector's result and three booleans.

### 4. `&str` or `&ParseResult` — P0

**What:** `canonical_identifier`, `same_identifier`, `same_package`, `covers` and `relate` accept either
form for each identifier, mixed freely — a trait implemented for `&str` and `&ParseResult`, so every call
written with `&str` still compiles.
**Why:** `openRPC` declares `IdentifierOrParsed` for these parameters; the generated bindings coerce each
function to both `fn` types, which a generic function satisfies by inference.

## Implementation order

- [ ] P0 — items 1–4 — delegable: one agent (`sonnet`), writes only under `crates/ref-id/src/`,
      `crates/ref-id/tests/conformance.rs` and a new test file for `relate` under `crates/ref-id/tests/`;
      never the specification, `crates/ref-id/tests/surface.rs` (generated), `scripts/`, `packages/`,
      `Sources/`; gate `cargo test --workspace`, `node scripts/gen-surface-rust.mjs --check` and
      `node scripts/check-surface.mjs --only rust`; returns files changed, the gate output, and anything
      in this dossier found wrong with `file:line`
- [ ] Orchestrator — `examples/parse_lines.rs` and the differential, if `relate` joins the line protocol

## Surprises & Discoveries

- Observation: …
  Evidence: …

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
