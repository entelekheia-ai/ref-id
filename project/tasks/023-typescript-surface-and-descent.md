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

# Task: TypeScript — the declared surface, relate, and the descent

| Field | Value |
|---|---|
| Status | Planned |
| Created | 2026-09-24 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/23> |
| Plan | `project/plans/005-the-comparison-descends-into-nested-identifiers.md`, Track 2 (TypeScript) |

---

## Context

Plan-005 Tracks 1, 3 and 4 changed the specification first: `covers` and `samePackage` descend into a
nested identifier, `relate` is declared with its own vector group, and `openRPC` declares the public
surface every implementation exposes. The TypeScript suite now fails on purpose until the reference
catches up. Measured on the branch at `f7e5b1c`, `node --test test/*.test.ts` in `packages/ref-id` fails 9
of 248, and `npm run typecheck` fails on eight names:

- six comparison vectors that depend on the descent, and the vector-group coverage test refusing
  `relate`, which no test executes yet;
- the runtime-surface test for both entry points: `canonicalIdentifier` and `relate` missing, `canonical`
  undeclared — `openRPC` now declares `canonical` as a deprecated alias, which the test does not read yet;
- `tsc` on `test/surface.generated.ts`: no export named `canonicalIdentifier`, `relate`, `Fragment`,
  `Spec`, `RelateResult`, `Relation`, `QualifierRelation`, `IdentifierOrParsed`.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Comparison descends into a nested identifier | S |
| 2 | P0 | `relate`, its result types, and a test executing the `relate` group | M |
| 3 | P0 | `canonicalIdentifier`, with `canonical` kept as a deprecated alias | S |
| 4 | P1 | Export the declared type names | S |
| 5 | P1 | `canonicalise` raises a `SpecIntegrityError` | S |
| 6 | P1 | The package README's `covers` paragraph describes the descent | S |

### 1. Comparison descends into a nested identifier — P0

**What:** `covers` and `samePackage` compare a qualifier whose value is a nested `ref:` on both sides with
the same relation on the decoded pair (`ParseResult.nested`), one level deep.
**Why:** six `comparison` vectors fail without it.
**Change:** in `src/relations.ts`, replace the byte-equality qualifier comparison with the rule in
`comparison.covers.rule` / `comparison.samePackage.rule`; a digest, a timestamp, plain text, a nested
identifier facing a digest, and a nested pair the relation refuses stay byte for byte.

### 2. `relate` — P0

**What:** `relate(a, b)` returning `RelateResult | null`, exported from both entry points, with the types
`RelateResult`, `Relation`, `QualifierRelation`; `covers`, `coveredBy` and `samePackage` stay consistent
with its reductions (`comparison.relate.reductions`).
**Why:** the `relate` vector group is declared and unexecuted, which fails the coverage test.
**Change:** implement from `comparison.relate` in the specification; add a test file executing
`spec.vectors.relate` against both the result and the three booleans.

### 3. `canonicalIdentifier` — P0

**What:** rename `canonical` to `canonicalIdentifier`; keep `canonical` exported, marked `@deprecated`.
**Why:** `openRPC` declares `canonicalIdentifier`; Rust and Swift already use that name.
**Change:** rename in `src/canonical.ts` and both entries; teach `test/runtime-surface.test.ts` to accept
the names in each method's `x-deprecated-aliases.typescript`, read from the specification.

### 4. Declared type names — P1

**What:** export `Fragment` (today `ParsedFragment`), `Spec` (today `RefIdSpec`) and `IdentifierOrParsed`;
keep the old names as deprecated type aliases.
**Why:** `tsc` fails on the generated surface file until they exist.

### 5. `canonicalise` raises a `SpecIntegrityError` — P1

**What:** `canonicalise` throws a plain `Error` today, the one throw outside the package's own hierarchy.
**Why:** the package promises every error it throws is a `RefIdError`; Rust and Swift raise their
`SpecIntegrity` kind here.

### 6. README — P1

**What:** `packages/ref-id/README.md` states that what the first declares the second must declare
identically; after item 1 that is false for a nested identifier.

## Implementation order

- [ ] P0 — items 1–3 — delegable: one agent (`sonnet`), writes only under `packages/ref-id/`; never the
      specification, `scripts/`, `crates/`, `Sources/`, or any generated surface file; gate `npm test`
      and `npm run typecheck` in `packages/ref-id` and `node scripts/gen-surface-ts.mjs --check` at the
      root; returns files changed, the gate output, and anything in this dossier found wrong with
      `file:line`
- [ ] P1 — items 4–6 — same agent, same contract
- [ ] Orchestrator — changeset for the package contract (new `relate`, renamed `canonicalIdentifier`,
      descent), written once for the three implementations

## Surprises & Discoveries

- Observation: …
  Evidence: …

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
