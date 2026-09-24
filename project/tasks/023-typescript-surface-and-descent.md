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
| Status | In Progress |
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

### After the adversarial review — P0

An adversarial review ran 3025 constructed pairs through the three implementations. The specification
changed in response (commits `a4fe3c0`, `757e720`), and the TypeScript reference fails the new vectors until:

7. **The canonical form** (`identifierEquivalence.canonicalForm`) sorts refinements by key as it sorts
   qualifiers, writes a nested identifier in a qualifier value in its own canonical form (decode, canonicalise,
   re-encode), and omits the version slot when it holds the default version. `src/canonical.ts`'s comment
   saying refinements are positional is now false: order *inside* one value is content, order between keys
   is not.
8. **A `--pairs` mode** in `parse-lines.ts`, exactly as Plan-005 Track 5 specifies (two input lines per
   pair, one canonical JSON line out with `covers`, `coversReversed`, `samePackage`, `sameIdentifier`,
   `relate`), for both entry points (`--browser` too).
9. **README** (`packages/ref-id/README.md`): the "entry points" sentence lists every exported operation
   (`sameIdentifier`, `canonicalIdentifier`, `relate`, `build`, `canonicalise`, `loadSpec` are missing
   today), and the `sameIdentifier("pkg:npm/x@1.0.0", …)` example has no `ref:` prefix, so both sides are
   malformed — give it real identifiers and state the rule it shows.

## Implementation order

- [x] P0 — items 1–3 — delegable: one agent (`sonnet`), writes only under `packages/ref-id/`; never the
      specification, `scripts/`, `crates/`, `Sources/`, or any generated surface file; gate `npm test`
      and `npm run typecheck` in `packages/ref-id` and `node scripts/gen-surface-ts.mjs --check` at the
      root; returns files changed, the gate output, and anything in this dossier found wrong with
      `file:line`
- [x] P1 — items 4–6 — same agent, same contract
- [ ] P0 — items 7–9 — same contract as above (plus `packages/ref-id/parse-lines.ts`); the gate adds
      `npm run test:differential` once all three ports speak `--pairs`
- [ ] Orchestrator — changeset for the package contract (new `relate`, renamed `canonicalIdentifier`,
      descent), written once for the three implementations

## Surprises & Discoveries

- Observation: The `runtime-surface.test.ts` check does not read `x-deprecated-aliases` at all — it only
  accepts a runtime export that is a declared method name or listed under `x-extensions`. Renaming
  `canonical` to `canonicalIdentifier` while keeping `canonical` exported (item 3) therefore made the test
  fail on `canonical` as an "undeclared" export until the test itself was taught to read
  `method["x-deprecated-aliases"].typescript`, exactly as item 3's own "Change" text anticipated
  ("teach test/runtime-surface.test.ts to accept the names…").
  Evidence: `packages/ref-id/test/runtime-surface.test.ts`'s `declaredFor()` previously built its list from
  `doc.methods` names, `x-extensions`, `x-error-type` and error classes only — no read of
  `x-deprecated-aliases` anywhere in the file before this change.
- Observation: `canonicalise`'s two existing throw sites (non-integer number, unmappable JS type) already
  had a ready-made class to raise — `SpecIntegrityError` was already defined in `spec.ts` above
  `canonicalise` (for the sidecar-digest mismatch case) and is declared in `openRPC` as `canonicalise`'s
  one error (`components/errors/SpecIntegrity`). No new error class was needed for item 5, just swapping
  `throw new Error(...)` for `throw new SpecIntegrityError(...)` at both sites in `src/spec.ts`.
  Evidence: `spec/ref-id.json`'s `openRPC.methods` entry for `canonicalise` carries
  `"errors": [{"$ref": "#/components/errors/SpecIntegrity"}]`.
- Observation: `ParseResult.nested[key]` already holds the *decoded* nested identifier string one level
  down (populated by `parse.ts`'s `tryNested`), so the descent in `covers`/`samePackage`/`relate` needed no
  new decoding step — it just calls the public `covers`/`samePackage`/`relate` again on that string. A
  second level of nesting can never reach this code: the parser already refuses it (a qualifier value that
  itself tries to nest past `form.depth` fails `matchForms` and the *outer* identifier comes back
  `malformed`, so `read()` at the top of `covers`/`samePackage`/`relate` already rejects it before any
  qualifier is compared).
  Evidence: `src/parse.ts`'s `tryNested()` (`depth >= maxDepth` check) and the "nesting deeper than one
  level is malformed" vector referenced in Plan-005's Scope section.
- Observation: the dossier's own gate commands were already exactly reproducible: before this work,
  `npm test` in `packages/ref-id` failed on 6 named test cases (5 `comparison` subtests + the vector-group
  coverage test) plus the 2 `runtime-surface` tests, all listed under `# fail`. After the change, all 268
  tests pass, `npm run typecheck` is clean, and `node scripts/gen-surface-ts.mjs --check` at the root
  reports the committed `test/surface.generated.ts` current — this file needed no edit, since Track 4 had
  already generated it against the target (post-Track-2) surface.
  Evidence: `npm test` output before/after this session; `node scripts/gen-surface-ts.mjs --check` exits 0
  with "is current".

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
