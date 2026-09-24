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
| Status | In Progress |
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

- [x] P0 — items 1–5 — delegable: one agent (`sonnet`), writes only under `Sources/RefId/` and
      `Sources/RefIdConformance/main.swift`; never the specification, `Surface.generated.swift`
      (generated), `Package.swift`, `scripts/`, `packages/`, `crates/`; gate
      `swift run ref-id-conformance`, `node scripts/gen-surface-swift.mjs --check` and
      `node scripts/check-surface.mjs --only swift`; returns files changed, the gate output, and anything
      in this dossier found wrong with `file:line`
- [ ] Orchestrator — `swift run ref-id-conformance --parse` and the differential, if `relate` joins the
      line protocol

## Surprises & Discoveries

- Observation: Item 5's own hint — "a generic function referenced by full name may need its type
  context — confirm by building, don't assume" — is the reason the surface generator
  (`scripts/gen-surface-swift.mjs`) already avoided a protocol/generic approach and emits two concrete
  references per `IdentifierOrParsed` parameter (String and ParseResult), never a generic one. Plain
  concrete overloads over a shared `…Core(spec, ParseResult?, ParseResult?)` implementation resolve
  `let _: (String, String) -> Bool = covers(_:_:)` unambiguously; a `some RefIdentifierConvertible`
  generic parameter was tried first in reasoning and dropped without needing to build it, on the same
  evidence the generator's own comment states.
  Evidence: `Sources/RefIdConformance/Surface.generated.swift` never emits a generic reference; every
  `covers`/`samePackage`/`sameIdentifier`/`relate`/`canonicalIdentifier` in `Sources/RefId/Relations.swift`
  is four (or two, for the one-identifier `canonicalIdentifier`) concrete overloads, and
  `swift build`/`swift run ref-id-conformance` both pass with zero ambiguity errors.
- Observation: descending into a nested qualifier on both `covers` and `samePackage` cannot reuse the
  public `covers(_:_:)`/`samePackage(_:_:)` entry points for the recursive call, because those return
  `false` uniformly whenever the nested pair is refused (malformed, or an unsupported scheme version) —
  but the spec requires a *refused* nested pair to fall back to plain byte equality on the raw qualifier
  value, not to `false` outright. `qualifiersCover`/`qualifiersSamePackage` therefore call `read(spec, …)`
  on both decoded nested strings first, and only descend into `coversCore`/`samePackageCore` when both
  reads succeed; otherwise the code falls through to the ordinary byte comparison.
  Evidence: `spec/ref-id.json`'s `comparison.covers.rule` / `comparison.samePackage.rule`: "so must a
  nested pair this relation refuses" (fall back to equality) — verified against
  `Sources/RefId/Relations.swift`'s `qualifiersCover`/`qualifiersSamePackage`, and green on
  `swift run ref-id-conformance` (862 passed, 0 failed) plus `node scripts/check-relate.mjs` (19 vectors).
- Observation: `RelateResult` containing `[String: QualifierRelation]`, where `QualifierRelation` holds an
  optional `RelateResult` directly (not through a collection), compiles in Swift without `indirect` —
  `Dictionary`'s own heap-allocated buffer breaks the layout cycle, so `RelateResult`'s size does not
  depend on `QualifierRelation`'s size even though the two reference each other.
  Evidence: `Sources/RefId/Types.swift`'s `RelateResult`/`QualifierRelation` pair builds and runs with no
  `indirect` keyword anywhere.
- Observation: the dossier's item 5 description ("the generated references bind each identifier-taking
  function to both a `String` and a `ParseResult` signature") holds exactly as stated for every method —
  confirmed by reading the actual generated file rather than assuming, since `gen-surface-swift.mjs` emits
  two variants (`String`, `ParseResult`) only, never a mixed pair — so the "mixed freely" wording in
  Plan-005's Design section is satisfied by adding the two cross overloads
  (`(String, ParseResult)`/`(ParseResult, String)`) beyond what the generated surface itself exercises.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
