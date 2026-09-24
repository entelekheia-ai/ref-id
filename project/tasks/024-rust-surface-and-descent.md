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
| Status | In Progress |
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

- [x] P0 — items 1–4 — delegable: one agent (`sonnet`), writes only under `crates/ref-id/src/`,
      `crates/ref-id/tests/conformance.rs` and a new test file for `relate` under `crates/ref-id/tests/`;
      never the specification, `crates/ref-id/tests/surface.rs` (generated), `scripts/`, `packages/`,
      `Sources/`; gate `cargo test --workspace`, `node scripts/gen-surface-rust.mjs --check` and
      `node scripts/check-surface.mjs --only rust`; returns files changed, the gate output, and anything
      in this dossier found wrong with `file:line`. Done: gate green (`cargo test --workspace` 14/14,
      `gen-surface-rust.mjs --check` up to date, `check-surface.mjs --only rust` no divergence).
- [ ] Orchestrator — `examples/parse_lines.rs` and the differential, if `relate` joins the line protocol

## Surprises & Discoveries

- Observation: `covers` and `same_package` are now implemented as reductions of `relate`'s own result
  (`comparison.relate.reductions.covers`/`.samePackage`) rather than as separate hand-written traversals,
  even though the dossier's item 1 ("comparison descends into a nested identifier") reads as if it were
  its own change to `covers`/`samePackage` ahead of item 3 (`relate`). Building `relate_result` first and
  deriving the two booleans from it removes the risk of the two computations disagreeing on the same
  pair, which Plan-005's own design section calls out as the point of the reduction relationship.
  Evidence: `crates/ref-id/src/relations.rs` — `pub fn covers` and `pub fn same_package` both call
  `relate_result` internally; the old byte-comparison `equal`/`subsumes` helpers were removed as dead code
  once nothing called them.
- Observation: a generic function whose type parameter *is* a reference (`fn f<T: Trait>(x: T)` with
  `T = &str`) does not coerce to the higher-ranked function pointer `for<'a> fn(&'a str) -> _` that the
  generated `crates/ref-id/tests/surface.rs` binds against — `rustc` reports
  `error[E0308]: one type is more general than the other` on every such binding. The fix is to implement
  the trait on the bare type (`str`, `ParseResult`) and have every public function take `&T` for a plain
  generic `T: IdentifierArg + ?Sized`, rather than taking `T` where `T` is instantiated to a reference —
  that shape coerces to the higher-ranked pointer cleanly.
  Evidence: `crates/ref-id/src/relations.rs:20-39` (the `IdentifierArg` trait's doc comment records the
  measured error); the same fix applies to every one of `canonical_identifier`, `same_identifier`,
  `same_package`, `covers`, `relate`.
- Observation: `same_identifier`'s treatment of a malformed identifier is not fully specified.
  `identifierEquivalence.comparison` only defines equality on two canonical forms, and a malformed
  identifier has no canonical form (`canonical_identifier` refuses it, naming the failing part). Since the
  declared surface returns a bare `bool` (the `sameIdentifier` method carries no `errors`), a malformed
  operand cannot propagate a `RefIdError`; this crate treats a canonicalisation failure on either side as
  `false`, matching how `covers` and `same_package` already treat a malformed operand as "the same as
  nothing, including itself." This is a judgement call, not something read directly off a spec key — worth
  confirming across ports during Track 2's realignment pass.
  Evidence: `crates/ref-id/src/relations.rs` — `pub fn same_identifier`'s doc comment and body.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
