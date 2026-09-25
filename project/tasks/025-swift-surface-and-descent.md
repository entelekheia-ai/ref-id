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

### After the adversarial review — P0

An adversarial review ran 3025 constructed pairs through the three implementations. The specification
changed in response (commits `a4fe3c0`, `757e720`), and the Swift port fails the new vectors until:

6. **`sameIdentifier` refuses what has no parts.** `sameIdentifierCore` checks only that
   `canonicalIdentifier` succeeds, and serialising an identifier at an unsupported scheme version succeeds,
   so `sameIdentifier("ref:2:pkg:npm/x", "ref:2:pkg:npm/x")` is `true` here and `false` in TypeScript. Gate
   on the status check the relations use (`ok` or `uncovered` only).
7. **Comparison is byte for byte.** Swift's `String ==` is Unicode canonical equivalence and `hasPrefix`
   works on grapheme clusters, so `ref:zzz:café` in NFC and NFD compare equal here and different in
   TypeScript and Rust, and a `/` followed by a combining mark is not a segment boundary here. Compare
   stems, paths and values on `utf8` (`a.utf8.elementsEqual(b.utf8)`), test prefixes on `utf8`, and walk
   `unicodeScalars` or `utf8` rather than `Character` in `split`.
8. **The canonical form** (`identifierEquivalence.canonicalForm`) sorts refinements by key as it sorts
   qualifiers, writes a nested identifier in a qualifier value in its own canonical form (decode,
   canonicalise, re-encode), and omits the version slot when it holds the default version.
9. **`canonicalJSON(_:)` takes `Any?`,** as `canonicalise(_:)` does, so the deprecated alias has the
   declared signature and the generated surface can bind it; a caller passing `Any` still compiles.
10. **A `--pairs` mode** in the conformance runner, exactly as Plan-005 Track 5 specifies.

## Implementation order

- [x] P0 — items 1–5 — delegable: one agent (`sonnet`), writes only under `Sources/RefId/` and
      `Sources/RefIdConformance/main.swift`; never the specification, `Surface.generated.swift`
      (generated), `Package.swift`, `scripts/`, `packages/`, `crates/`; gate
      `swift run ref-id-conformance`, `node scripts/gen-surface-swift.mjs --check` and
      `node scripts/check-surface.mjs --only swift`; returns files changed, the gate output, and anything
      in this dossier found wrong with `file:line`
- [x] P0 — items 6–10 — same contract as above
- [ ] Orchestrator — the pair pass of `scripts/differential.mjs`

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

- Observation: item 7's own byte-for-byte requirement reaches further than `Relations.swift`. Two more
  Character-based `@`-then-`/` segment walks exist in this package with the identical bug shape
  (a combining mark right after `/` merges into one grapheme, hiding the boundary from a `Character`
  scan): `PackageURL.splitSubpath` (`Sources/RefId/Validators.swift`) splits a delegated `pkg:` string's
  subpath the same way `Relations.split` splits a locator's version, and its own doc comment already says
  so ("The same `@`-opens-a-segment rule as `Relations.split`"). No vector exercises it with a combining
  mark today, but it feeds `ParseResult.canonical`, which the differential's `--canonical` mode compares
  against implementations that delegate to a real purl library — so a latent divergence there is exactly
  the shape the adversarial review already found once. Fixed alongside the vectored sites rather than left
  for a future review to rediscover.
  Evidence: `Sources/RefId/Validators.swift`'s `splitSubpath` now walks `utf8` bytes; `swift run
  ref-id-conformance` stays at 929 passed after the change (no vector regressed, none newly covers it).
- Observation: `Envelope.swift`'s `id == requestedId` (envelope self-reference match) is a genuine
  identifier-equality decision the dossier's item 7 wording covers ("any `==` ... over a stem, path, key
  or value decides equivalence") even though no `envelope` vector exercises a Unicode-equivalent pair.
  Fixed to `id.utf8.elementsEqual(requestedId.utf8)` for the same reason as the rest: two Unicode
  spellings of one requested id should not admit an envelope written for the other spelling.
  Evidence: `Sources/RefId/Envelope.swift:16` (was `id == requestedId`, an ordinary Swift `String`
  comparison, i.e. Unicode canonical equivalence).
- Observation: dictionary keys built from a qualifier or refinement key (`Relations.swift`'s
  `subsumes`/`qualifiersCover`/`qualifiersSamePackage`/`relateKeyedPairs`/`relateQualifiers`, and
  `Parse.swift`'s duplicate-key `Set<String>`) were deliberately left on ordinary `String` keys rather than
  converted to byte-keyed maps. `grammar.state.pair` and `grammar.fragment.pair` both anchor the key group
  to `[a-z][a-z0-9-]*` (spec/ref-id.json's `grammar.state`/`grammar.fragment`) — plain ASCII has no second
  Unicode spelling, so `String`'s canonical-equivalence `==`/`Hashable` and byte equality agree exactly for
  every key this grammar can produce. Only qualifier/refinement **values** (`[^\r\n]*`, unrestricted) and
  locators/paths needed the `bytesEqual` fix. Confirmed by reading the grammar rather than assuming.
  Evidence: `spec/ref-id.json`'s `grammar.state.pair` / `grammar.fragment.pair` regexes; `swift run
  ref-id-conformance` green with keys left as `String`.
- Observation: `PackageURL.parse`'s own internal delimiter searches (`firstIndex(of: "?")`, `"/"`, `"="`,
  and `hasPrefix("pkg:")`) were audited and left unchanged, unlike `splitSubpath` above. They are grammar
  *decomposition* (finding where the purl's own punctuation falls), the same category as `Grammar.swift`'s
  regex-based parsing, not an *equivalence decision* between two identifiers — item 7's examples are all
  about deciding whether two things are the same, which decomposition does not do. No vector or plan text
  asks for this, and Package URL is this repo's own declared exception (no maintained Swift library) rather
  than spec-declared grammar, so widening it further risked scope creep against a part the repo already
  treats as special-cased. Left as a documented gap rather than silently expanded.
  Evidence: `Sources/RefId/Validators.swift`'s `PackageURL.parse` (unchanged); `AGENTS.md`'s "Package URL
  core grammar (no maintained Swift library)" exception.
- Observation: `sameIdentifier`'s status gate could not be built on top of the existing public
  `canonicalIdentifier(_:)` entry points, because those take a `String`/`ParseResult` and re-parse
  internally with no way to inject the "refuse unless `ok` or `uncovered`" check — the same shape problem
  item 6 describes for `covers`/`samePackage` reusing their own public entry points. `sameIdentifierCore`
  therefore takes the already-`read`-gated `ParseResult?` pair and calls the private `canonicalIdentifierCore(spec:_:)`
  directly, mirroring `coversCore`/`samePackageCore`'s shape exactly.
  Evidence: `Sources/RefId/Relations.swift`'s `sameIdentifierCore(_:_:_:)` and the four public
  `sameIdentifier` overloads.

## Closure

- [x] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
