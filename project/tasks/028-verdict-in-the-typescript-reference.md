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

# Task: verdict in the TypeScript reference

| Field | Value |
|---|---|
| Status | Planned |
| Created | 2026-09-26 |
| Author | Danilo Borges |
| Issue | https://github.com/entelekheia-ai/ref-id/issues/28 |
| Plan | plans/006-location-hints-and-the-verdict.md — Track 2 |

---

## Context

Spec 1.5.0 declares a new operation, `verdict(a, b)`, in `spec/ref-id.json` at `comparison.verdict`
(the rule, `result`, `decidedBy`, `symmetry`, `reads`), declares it in `openRPC` with the value type
`VerdictResult`, and binds it with the `verdict` vector group (21 vectors). No implementation exists.

The track's other half — the `folder` pattern refusing `.` and `..` segments — needs no code: parsing
validates a locator against `dispatch.folder.pattern` read from the spec, and the new parse vectors
already pass. Measured 2026-09-26 with `npm test` in `packages/ref-id`: 308 tests, 4 failing, and all
four are the guards that refuse a declared operation or vector group nothing implements:

- `runtime surface: index.ts (node) exports exactly openRPC's declared methods…` — `verdict` missing;
- the same for `index.browser.ts`;
- `surface.generated.ts is not stale against spec.openRPC` — `node scripts/gen-surface-ts.mjs` not re-run;
- `surface: every vector group the specification declares is executed by a test file` — no test reads
  `vectors.verdict`.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | `verdict` in `src/relations.ts`, exported from both entry points | M |
| 2 | P0 | `VerdictResult` and its parts in `src/types.ts` | S |
| 3 | P0 | `test/verdict.test.ts` running the `verdict` group, and its mirror | S |
| 4 | P0 | Regenerate `test/surface.generated.ts` | S |

### 1. `verdict` in `src/relations.ts` — P0

**What:** `export function verdict(a: string | ParseResult, b: string | ParseResult): VerdictResult | null`.
**Why:** the spec declares the operation, and the two runtime-surface tests fail until both entry points
export it.
**Change:** compute `relate(a, b)`; return `null` when it does. Then apply `comparison.verdict.rule` step
by step. Every qualifier fact — which keys are content-axis, which are identity-axis, each key's
`conflict`, and `conflictWhenNeitherSideDeclares` with its `keys` and `then` — is read from
`spec.qualifiers[key].verdict`, never written into the code (`.agents/rules/repo-guardrails.md`: never
restate the spec in code). A qualifier key with no `verdict` member follows step three. "Declared on
either side" in `conflictWhenNeitherSideDeclares` means present among that side's parsed qualifiers.
`decidedBy` member names and order are exactly as `comparison.verdict.result.decidedBy` states: the five
dimensions in order, then `fragmentRefinements.<key>`, then `qualifiers.<key>`, each group sorted by UTF-16
code unit order. Export from `src/index.ts:20` and `src/index.browser.ts:37` beside `relate`.

### 2. `VerdictResult` in `src/types.ts` — P0

**What:** the result type matching `openRPC.components.schemas.VerdictResult`.
**Why:** `test/surface.generated.ts` is compiled by `tsc` against the package's exported types.
**Change:** add it beside `RelateResult` (`src/types.ts:56`) and export it as a type from both entries.

### 3. `test/verdict.test.ts` — P0

**What:** one subtest per `vectors.verdict` entry, asserting `verdict(a, b)` deep-equals `expect.verdict`,
and asserting `verdict(b, a)` is the mirror stated by `comparison.verdict.symmetry` (covers and coveredBy
exchanged on identity; content and decidedBy unchanged).
**Why:** the surface guard fails until a test file executes the group; the mirror is a law the vectors do
not state pair by pair.
**Change:** model it on `test/relate.test.ts`.

### 4. Regenerate the surface file — P0

**What:** `node scripts/gen-surface-ts.mjs`.
**Why:** the staleness guard compares the committed file to one generated from `openRPC`.
**Change:** run it; commit the output unedited.

## Implementation order

Delegated whole to one subagent under the contract below (Plan-006 Decision Log: Track 2 goes to `sonnet`
behind `npm test`).

**Contract.** May edit: `packages/ref-id/src/relations.ts`, `src/types.ts`, `src/index.ts`,
`src/index.browser.ts`, new `test/verdict.test.ts`, regenerated `test/surface.generated.ts`, and this
dossier's Implementation order and Surprises sections. Must not edit: `spec/` and its two mirrors, any
other test, any script, any doc, the plan, the ADR. Must not run `git stash`, `git checkout` or
`git restore`. Done means `npm run build && npm test` in `packages/ref-id` exits 0 **and** `npm run
test:surface` at the root reports no divergence for TypeScript. A vector that looks wrong is reported with
the rule text that contradicts it — changing a vector to make a test pass is not an acceptable outcome, and
stopping red with the reason is.

- [x] P0 — item 2: `VerdictResult` type
- [x] P0 — item 1: `verdict` and its exports
- [x] P0 — item 4: regenerate the surface file
- [x] P0 — item 3: `test/verdict.test.ts`, then `npm run build && npm test`

## Surprises & Discoveries

- Observation: the `folder` half of the track needs no code — the parser reads the locator pattern from
  the spec.
  Evidence: all 21 new parse vectors pass in `packages/ref-id` before any source change (2026-09-26).
- Observation: step two's "distinct" and step three's "distinct" both feed the same `decidedBy.identity`
  list, and only step two/three members that individually resolved to "distinct" are listed — a step-two
  qualifier that resolved to "undetermined" (e.g. `path` beside a deciding `origin` conflict) is dropped
  from `decidedBy` once the overall verdict is `distinct`, never merged in as a second, softer signal.
  Evidence: vector "an origin conflict decides distinct even beside a path conflict" expects
  `decidedBy.identity: ["qualifiers.origin"]` alone, though `path` also relates as `differ` (spec
  `comparison.verdict.rule`, step two).
- Observation: content-axis qualifiers (only `state` today) are fully excluded from every identity step —
  a `state=` differing between two otherwise-identical names never makes identity `distinct`; it only
  ever appears in `decidedBy.content`. Confirmed by reading `spec.qualifiers.state.verdict` (`{"axis":
  "content"}`, no `conflict`) and by vectors 14–16, where identical names with differing `state=` values
  report `identity: "same"`.
- Observation: `conflictWhenNeitherSideDeclares.keys` ("declared on either side") is read against each
  side's own parsed qualifiers, not against `relate()`'s reduced per-key relation — a key present on one
  side only (e.g. `state=` on `a` alone) still counts as "declared", which keeps the `path` conflict at
  its default `undetermined` instead of falling to the `then: "distinct"` fallback.
  Evidence: vector "a state= on one side keeps two local paths undetermined" (spec
  `qualifiers.path.verdict.conflictWhenNeitherSideDeclares`).

## Closure

- [x] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
