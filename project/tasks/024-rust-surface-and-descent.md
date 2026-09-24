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

### After the adversarial review — P0

An adversarial review ran 3025 constructed pairs through the three implementations. The specification
changed in response (commits `a4fe3c0`, `757e720`), and the crate fails the new vectors until:

5. **`same_identifier` refuses what has no parts.** It checks only that `canonical_identifier` succeeds, and
   serialising an identifier at an unsupported scheme version succeeds, so
   `same_identifier("ref:2:pkg:npm/x", "ref:2:pkg:npm/x")` is `true` here and `false` in TypeScript. Gate
   on the same status check `read` uses (`ok` or `uncovered` only).
6. **The canonical form** (`identifierEquivalence.canonicalForm`) sorts refinements by key as it sorts
   qualifiers, writes a nested identifier in a qualifier value in its own canonical form (decode,
   canonicalise, re-encode), and omits the version slot when it holds the default version.
7. **`&String` compiles again.** On `main`, `covers(&a, &b)` with `a: String` deref-coerced to `&str`; with
   `IdentifierArg` implemented only for `str` and `ParseResult` it is `E0277`. Implement it for `String`
   (and `Box<str>` if it costs nothing), and re-export the trait from `lib.rs` so the error names a path a
   caller can import — or seal it deliberately and say so in its doc comment.
8. **A `--pairs` mode** in `examples/parse_lines.rs`, exactly as Plan-005 Track 5 specifies.

## Implementation order

- [x] P0 — items 1–4 — delegable: one agent (`sonnet`), writes only under `crates/ref-id/src/`,
      `crates/ref-id/tests/conformance.rs` and a new test file for `relate` under `crates/ref-id/tests/`;
      never the specification, `crates/ref-id/tests/surface.rs` (generated), `scripts/`, `packages/`,
      `Sources/`; gate `cargo test --workspace`, `node scripts/gen-surface-rust.mjs --check` and
      `node scripts/check-surface.mjs --only rust`; returns files changed, the gate output, and anything
      in this dossier found wrong with `file:line`. Done: gate green (`cargo test --workspace` 14/14,
      `gen-surface-rust.mjs --check` up to date, `check-surface.mjs --only rust` no divergence).
- [x] P0 — items 5–8 — same contract as above, plus `crates/ref-id/examples/parse_lines.rs`
- [ ] Orchestrator — the pair pass of `scripts/differential.mjs`

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

- Observation (resolved by the orchestrator during this task, spec fix applied outside this dossier's
  scope): `spec/ref-id.json`'s `vectors.canonical` group briefly held two vectors that could not both pass
  under `identifierEquivalence.canonicalForm`'s own prose ("its refinements sorted by key"), and it was
  not a Rust-only problem — the TypeScript reference (`packages/ref-id/src/canonical.ts`, which already
  implements the sort) failed the same vector, run directly: `node --experimental-strip-types --test
  test/canonical.test.ts` inside `packages/ref-id/` reported `canonical: refinements are positional and
  keep the order they were written` and `canonical: the form is idempotent` both red, on this branch,
  before this task touched anything. The vector at `spec/ref-id.json:2835-2838` (added 2026-09-17 by
  `9f9efddb`) expected `lines=1,20;item=3` to stay unsorted; the vector added 2026-09-24 by the
  adversarial-review commit `a4fe3c0` expected the structurally identical `lines=10,20;item=2` to become
  `item=2;lines=10,20`. The review commit that introduced the sorting rule had not retired the older
  vector it contradicted. This crate implemented the sort per the prose and the TypeScript reference
  throughout, so it never special-cased the contradiction; once the orchestrator resealed the specification
  (the vector at `spec/ref-id.json:2835` is now "the order inside a refinement value is content, the order
  between refinement keys is not", expecting `item=3;lines=1,20`) and synced `crates/ref-id/spec/`,
  `cargo test --workspace` went green with no code change on this crate's side.
  Evidence: `spec/ref-id.json:2835-2837`; `packages/ref-id/src/canonical.ts:35-55` (`canonicalIdentifier`,
  the ported reference); `crates/ref-id/src/relations.rs` (`canonical_form`, unchanged across the fix).
- Observation: `same_identifier`'s gate (item 5) and the canonical form's descent/sort/version-omission
  (item 6) were both already fully designed and implemented in the TypeScript reference —
  `packages/ref-id/src/canonical.ts`'s `canonicalIdentifier` and `sameIdentifier` — so this port is a
  direct translation rather than a fresh design: same status gate (`ok`/`uncovered` via `read`, ported
  from TS's own inline `usable` check), same `nestingForm`/`tableFor`/`encodeReserved` pipeline for the
  nested descent (ported to `nesting_form`/`table_for`/`encode` in `crates/ref-id/src/relations.rs`), same
  "omit the version slot at `version.default`" rule. No judgement call was needed here — item 5's
  Surprises entry above (about a malformed operand) covers the one place this crate's behaviour is not
  read directly off a spec key.
  Evidence: `crates/ref-id/src/relations.rs` (`canonical_form`, `nesting_form`, `same_identifier`) vs
  `packages/ref-id/src/canonical.ts:35-76`.
- Observation: a generic function parameter `T: IdentifierArg + ?Sized` does not pick up `String` through
  deref coercion to `str` — deref coercion applies when the target type is written literally (`&str`), not
  when it is resolved through a type parameter. `covers(&a, &b)` with `a, b: String` is `E0277` (`the trait
  bound String: IdentifierArg is not satisfied`) until `IdentifierArg` is implemented on `String` directly.
  Proven fixed with a scratch crate outside the tracked tree (`/private/tmp/…/scratchpad/string-proof`,
  `ref-id` as a `path` dependency): `ref_id::covers(&a, &b)` with `a: String, b: String` compiles and runs,
  printing `covers(&String, &String) = true`.
  Evidence: `crates/ref-id/src/relations.rs` (`impl IdentifierArg for String`, `impl IdentifierArg for
  Box<str>`); `crates/ref-id/src/lib.rs` (`IdentifierArg` added to the `pub use relations::{…}` list, so
  the trait a caller needs in scope to call a generic method on it — never required here, since every
  public function is a free function, not a method — is at least importable from a stable path).

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
