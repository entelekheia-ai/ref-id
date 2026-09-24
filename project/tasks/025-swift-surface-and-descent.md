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

# Task: Swift — the declared surface, relate, and the descent

| Field | Value |
|---|---|
| Status | Planned |
| Created | 2026-09-24 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/25> |
| Plan | `project/plans/005-the-comparison-descends-into-nested-identifiers.md`, Track 2 (Swift) |

---

## Context

Plan-005 Tracks 1, 3 and 4 changed the specification first: `covers` and `samePackage` descend into a
nested identifier, `relate` is declared with its own vector group, and `openRPC` declares the public
surface. Measured on the branch at `f7e5b1c`:

- `swift run ref-id-conformance` stops at compilation: `Sources/RefIdConformance/Surface.generated.swift`
  has 9 failing references — `sameIdentifier` (both), `relate` (both, and no `RelateResult` type),
  `canonicalise`, `loadSpecFrom`, and the `ParseResult` references of `canonicalIdentifier`,
  `samePackage` and `covers`;
- before the surface check existed, the runner reported 7 failures: the `relate` group it does not execute
  and six comparison vectors that depend on the descent;
- `node scripts/check-surface.mjs --only swift` reports `canonicalise`, `loadSpecFrom`, `relate` and
  `sameIdentifier` missing.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Comparison descends into a nested identifier | S |
| 2 | P0 | `sameIdentifier` | S |
| 3 | P0 | `relate` and `RelateResult`, and the runner executing the `relate` group | M |
| 4 | P0 | `canonicalise(_:)` and `loadSpecFrom(_:)`, the old names kept as deprecated aliases | S |
| 5 | P0 | Identifiers taken as `String` or `ParseResult` | M |

### 1. Comparison descends into a nested identifier — P0

**What:** `covers` and `samePackage` compare a qualifier whose value is a nested `ref:` on both sides with
the same relation on the decoded pair, one level deep; everything else stays byte for byte.
**Why:** six comparison vectors fail without it.

### 2. `sameIdentifier` — P0

**What:** `sameIdentifier(_:_:) -> Bool`: the canonical forms are equal byte for byte. It exists in
TypeScript only today.

### 3. `relate` — P0

**What:** `relate(_:_:) -> RelateResult?`, with `RelateResult`, `Relation` and a qualifier relation type
matching `openRPC.components.schemas`; add `relate` to the executed groups in `main.swift` and check every
`relate` vector's result and three booleans.

### 4. `canonicalise` and `loadSpecFrom` — P0

**What:** `canonicalise(_ value: Any?) throws -> String` and `loadSpecFrom(_ directory: URL) throws -> Spec`.
`canonicalJSON(_:)` (which takes `Any`) and `loadSpec(from:)` stay, marked
`@available(*, deprecated, renamed: …)`; `openRPC` already declares them as aliases.

### 5. `String` or `ParseResult` — P0

**What:** `canonicalIdentifier`, `sameIdentifier`, `samePackage`, `covers` and `relate` accept either form
for each identifier, mixed freely — a protocol both conform to, or overloads — so every call written with
`String` still compiles.
**Why:** the generated references bind each function to both a `String` and a `ParseResult` signature.

## Implementation order

- [ ] P0 — items 1–5 — delegable: one agent (`sonnet`), writes only under `Sources/RefId/` and
      `Sources/RefIdConformance/main.swift`; never the specification, `Surface.generated.swift`
      (generated), `Package.swift`, `scripts/`, `packages/`, `crates/`; gate
      `swift run ref-id-conformance`, `node scripts/gen-surface-swift.mjs --check` and
      `node scripts/check-surface.mjs --only swift`; returns files changed, the gate output, and anything
      in this dossier found wrong with `file:line`
- [ ] Orchestrator — `swift run ref-id-conformance --parse` and the differential, if `relate` joins the
      line protocol

## Surprises & Discoveries

- Observation: …
  Evidence: …

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
