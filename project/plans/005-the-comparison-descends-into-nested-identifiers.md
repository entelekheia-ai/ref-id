---
vibe-ops-template: plan@3
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# Plan-005: The comparison descends into nested identifiers

| Field | Value |
|---|---|
| Status | Backlog |
| Created | 2026-09-23 |
| Author | Danilo Borges |
| Related | ADR-0005 (the `ai-model` locator opens on the provider) |

---

## Summary

`covers` and `samePackage` compare a qualifier by byte equality, even when its value is a nested `ref:`
identifier that the same operation could compare. So `…;by=ref:pkg:github/ggml-org/llama.cpp` does not
cover `…;by=ref:pkg:github/ggml-org/llama.cpp@b10931`, although the two nested identifiers stand in exactly
that relation when compared directly. **This is a bonus, not a gap in the pointer.** An identifier is the
locator and the declared name; `by=` is enrichment on top of it, and a nested identifier is a bare pointer
(`docs/reference/the-ref-scheme.md`, "What an identifier carries"). A query that has to reach an
attribute — which engine build, whether it was recorded — runs on the consumer's columns. What this plan
buys is that the comparison stops being stricter than the scheme it compares, for consumers that do key a
mixed-kind store by identifier. This plan makes both operations descend into a nested identifier,
and adds `relate`, an operation that reports the relation in every dimension instead of reducing it to one
boolean. The specification and its vectors change first. The three implementations follow in one
realignment pass, because their code has already drifted apart on other points and is being brought back
in line at once.

## Goals

- `covers(a, b)` is `true` when every qualifier `a` declares is declared by `b` with a value that `a`'s
  value covers. A nested identifier is compared with `covers`, and any other value by equality.
- `samePackage` descends the same way, with `samePackage` on the nested pair.
- A new `relate(a, b)` reports, for each dimension the specification lists in `comparison.dimensions`,
  whether `a` and `b` are `equal`, whether one covers the other, or whether they `differ`. `covers`,
  `coveredBy` and `samePackage` are stated as reductions of that result.
- A vector group binds every rule above, so an implementation that disagrees fails its own suite and the
  differential.
- `main` never holds a specification that one of its implementations cannot run.
- The specification declares the public surface — each operation's name, parameters, result and the
  vector group that binds it — and each implementation's suite fails when its surface departs from that
  declaration, in either direction. The three implementations expose the same operations under the same
  names, spelled by each language's convention.

## Scope

### In scope

- The `comparison` block of `spec/ref-id.json`: the `covers` and `samePackage` rules, and a new `relate`
  entry.
- Vectors: the existing `comparison` group, and a new `relate` group.
- The TypeScript reference, the Rust crate and the Swift port, including their runners' lists of executed
  groups and the differential in `scripts/differential.mjs`.
- `docs/reference/the-ref-scheme.md` and a changeset.
- A new `openRPC` key in `spec/ref-id.json` holding one OpenRPC document, and one surface check per
  implementation that reads it.

### Out of scope

- "The same weights through any provider" (`omlx/<repo>` against `mlx/<repo>`). Different first locator
  segments make those two different models by ADR-0005's own rule. A consumer that needs the weights
  compares their `pkg:huggingface` identity instead.
- Nesting deeper than one level. The specification already refuses it at parse time (the vector *"nesting
  deeper than one level is malformed"*), so the recursion is bounded at one step.
- "Version unknown" as part of an identifier. A nested identifier is a bare pointer, so an engine build
  nobody recorded is a column of the consumer's record, never `%3Bstate=none` inside `by=`. The grammar
  still parses that form, and the descent compares whatever a nested identifier carries, but no vector
  and no example here writes one.

## Design

A comparison already splits into the dimensions `comparison.dimensions` names: type, version, locator
stem, locator version, fragment path, fragment refinements, and qualifiers. `relate` computes one relation
per dimension, and for each qualifier key, in a closed set of four values:

| Relation | Meaning for a dimension |
|---|---|
| `equal` | both sides declare it identically, or neither declares it |
| `covers` | `a` is the general side: it leaves the dimension undeclared where `b` declares it, or its stem is a whole-segment prefix of `b`'s, or its nested identifier covers `b`'s |
| `coveredBy` | the mirror of `covers` |
| `differ` | both declare it, and neither side reaches the other |

A qualifier whose value on both sides is a nested `ref:` carries the nested pair's own `relate` result
under `nested`. Its relation is that result reduced by the same rule as the top level. A `sha256:` value,
a timestamp or plain text is `equal` or `differ`.

```mermaid
flowchart TD
  A["relate(a, b)"] --> D{"for each dimension"}
  D --> Q{"qualifier value is a<br/>nested ref: on both sides?"}
  Q -- yes --> N["relate(nested a, nested b)<br/>one level only"] --> R["reduce to one relation"]
  Q -- no --> E["equal / covers / coveredBy / differ<br/>by declaration and equality"]
  R --> S["per-dimension result"]
  E --> S
  S --> C["covers = no dimension is coveredBy or differ"]
  S --> B["coveredBy = no dimension is covers or differ"]
  S --> P["samePackage = every dimension equal,<br/>locator version ignored"]
```

Three consequences are part of the design, not side effects:

- Results change. A pair `covers` reports `false` for today, like the `by=` vector ADR-0005 added, becomes
  `true`. The change touches no normalisation and no separator, so by this repository's own rule it is an
  addition and ships as `minor`. The changeset still states that a stored comparison result may flip.
- `samePackage` on `by=…@1` and `by=…@2` becomes `true`: the same engine at two releases. That matches
  what `samePackage` already does to a locator version.
- `relate` is the first operation whose output shape the specification declares. The vector group is the
  declaration, and every implementation's runner must list it, or refuse to start.

**Ordering constraint.** The Rust and Swift runners declare the groups they execute
(`crates/ref-id/tests/conformance.rs`, `Sources/RefIdConformance/main.swift`) and refuse any group the
specification declares beyond them. A changed `comparison` vector also fails every implementation until
that implementation changes. So Tracks 1, 3 and 4 land on this plan's branch and **merge together with
Track 2**, never before it.

**One branch, one pull request.** Every track commits onto the branch `plan-comparison-descends-into-nested`,
which already carries this plan, and pull request #21 is the single vehicle for all of it. Do not open a
second branch or pull request for a track: #21 merges once, after Track 2, when every command in Success
criteria exits `0`.

## Tracks

- [x] **Track 1 — The rule descends.** Rewrite `comparison.covers.rule` and `comparison.samePackage.rule`
  in `spec/ref-id.json` so that a qualifier whose value is a nested identifier on both sides is compared
  with the same operation. Flip the vector *"a declared by= must match exactly — an unversioned engine does
  not cover a versioned one yet"* to `covers: true`, and add vectors for a versioned `by=` not covering
  an unversioned one, for two different engines staying `false`, for `samePackage` across two engine
  releases, and for `sha256:` values staying strict. Every nested identifier in the new vectors is a bare
  pointer. Reseal, sync the two embedded copies, regenerate the browser
  constant. Acceptance: the grammar runners pass, and each implementation fails on exactly the flipped and
  new vectors.
- [ ] **Track 3 — `relate` is declared.** Add a `comparison.relate` entry with the four relations and the
  reduction rules, and a `relate` vector group of pairs with their full expected result. The pairs cover
  one pair per dimension, a nested `by=` in each of the four relations, and the three reductions checked
  against the `comparison` group on the same pairs. Document it in `docs/reference/the-ref-scheme.md`.
  Acceptance: every `relate` vector's reductions agree with the `comparison` group's expectations for the
  same pair, checked by a script, not by eye.
- [ ] **Track 4 — The surface is declared.** Add an `openRPC` key to `spec/ref-id.json` whose value is one
  whole OpenRPC document: a method per public operation with its camelCase name, parameters in order,
  result and errors; the value types (`ParseResult`, `BuildParts`, `EnvelopeResult`, …) under
  `components.schemas`; `x-casing` per language. Each method carries `x-vectors`, the group that binds
  it (or `null` with the reason), and `x-rule`, a JSON Pointer into `ref-id.json` naming the key that
  states its rule (`/comparison/covers`). A `$ref` resolves against the OpenRPC document, an `x-rule`
  against the whole specification, and a check resolves both and validates the extracted value against
  the OpenRPC meta-schema. `relate` from Track 3 and
  `sameIdentifier` are declared; `canonical` is declared as `canonicalIdentifier`, and the JSON
  canonicalisation as `canonicalise`. An identifier parameter accepts a string or a `ParseResult`, mixed
  freely, in all three. Each implementation gains a surface check that fails on a missing or extra
  operation and on a changed name, arity or type: in TypeScript a test importing each entry point in a
  child process plus a type file checked by `tsc`, in Rust a test that fails to compile when a signature
  moves, in Swift the conformance runner referencing each declared function by its full name. The two
  TypeScript tests that import `covers`, `samePackage`, `canonical` and `sameIdentifier` from internal
  modules import them from the entry point instead. Acceptance: the block validates against the vectors'
  group list, and each surface check fails today on exactly the divergences the survey found.
- [ ] **Track 2 — The three implementations follow.** In one realignment pass over TypeScript, Rust and
  Swift, bring the drifted code back into agreement, implement the descent and `relate`, add `relate` to
  each runner's executed groups and to `scripts/differential.mjs`, and write the changeset. Acceptance:
  every suite passes and the differential reports zero disagreements. Then the branch merges.
- [ ] Run `/vibe-ops:close-plan` — retrospective against the goals, the demotion check, the tracking
  issue closed. The plan file itself is kept. Stays unchecked until the plan is actually closed; a
  track list that is otherwise complete but has this box open is not finished.

## Success criteria

```sh
npm test                       # TypeScript reference, every vector group including relate
npm run test:grammar           # Python and Perl grammar runners
cargo test --workspace         # Rust crate
swift run ref-id-conformance   # Swift port
npm run test:differential      # four implementations, zero disagreements
./scripts/check.sh             # governance gate
```

All six exit `0` on the branch before it merges. Then this pair:

```text
a = ref:ai-model:example-app;by=ref:pkg:github/ggml-org/llama.cpp
b = ref:ai-model:example-app/bartowski/SmolLM2-1.7B-Instruct-GGUF/SmolLM2-1.7B-Instruct-Q4_K_M.gguf;by=ref:pkg:github/ggml-org/llama.cpp@b10931
```

gives `covers(a, b) = true` in all four implementations — it is a `comparison` vector, so the differential
proves it. The same `b` against `…;by=ref:pkg:swift/github.com/ml-explore/mlx-swift-lm@3.31.4` gives
`false`: a different engine.

---

## Decision Log

- Decision: Tracks run in the order 1, 3, 2. The specification and vectors for both the descent and
  `relate` are written first, and the implementations follow in a single pass.
  Rationale: the three implementations have already drifted from one another and need a realignment pass
  regardless. Implementing the descent before that pass would mean writing it three times against code
  that is about to move.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: Tracks 1 and 3 are not handed to a subagent: whoever writes them holds this plan. Track 2 is
  carried out by the session doing the realignment pass, behind the six commands in Success criteria, and
  may delegate each implementation.
  Rationale: the rule text and the vectors are judgements that have to agree with this plan's intent. The
  implementation is mechanical against a closed contract — the vectors — and a gate that fails on the
  first disagreement.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: All three tracks commit onto `plan-comparison-descends-into-nested` and ship through pull
  request #21, which is opened with the plan and stays open until Track 2 is green.
  Rationale: the specification tracks cannot merge alone, since the runners would refuse them, so a
  pull request per track would have to wait for the last one anyway. Reusing #21 keeps the plan, its vectors and
  their implementation reviewable as the one change they are.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: `covers` with descent is the requirement, and `relate` follows it. If only one can ship, it is
  the descent.
  Rationale: the consumer that searches stored replies needs a boolean on its hot path. The consumer that
  types graph edges by relation needs `relate`, and it is not built yet.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: The descent and `relate` are a bonus on the comparison, not a requirement of any consumer.
  `by=` is enrichment on a pointer that already works without it, a nested identifier is a bare pointer,
  and "version unknown" is a column; the `state=none` vectors and the success-criteria pair that used one
  are dropped. The ordering between the descent and `relate` in the entry above still holds.
  Rationale: the scheme now says an identifier is a reference, not a copy of the record (reference, "What
  an identifier carries"). The consumer this plan named searches stored replies by engine and build on its
  own columns, so its hot path never reaches a nested comparison. Whether a nested qualifier becomes
  `malformed` is left to how that guidance holds up in use.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: The descent applies to any qualifier whose value is a nested `ref:` on both sides, not to `by=`
  alone; a vector on `over=` binds it. A nested pair the relation refuses — a scheme version the
  implementation does not support — falls back to byte equality, and so does a nested identifier facing a
  digest.
  Rationale: the grammar gives `by=` and `over=` the same nested form, and a rule naming one key would be
  a second table of keys in prose. A refused pair has no parts to compare, and equality is what the rule
  said before, so it is the only answer that cannot be wrong for it.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: The success-criteria pair and its vector use `pkg:github/ggml-org/llama.cpp`, not
  `pkg:swift/…/mlx-swift-lm`. The vector "a versioned `by=` not covering an unversioned one" was not
  added: it is the `coversReversed` of the flipped vector.
  Rationale: the Package URL specification requires a version on the `swift` type, and `packageurl-js`
  refuses `pkg:swift/github.com/ml-explore/mlx-swift-lm` ("swift requires a "version" component"), so the
  pair this plan first wrote parsed `malformed` at `by`. A Swift engine is therefore never an unversioned
  query; "every release of it" is `samePackage` on it, which ignores the version.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: Track 1 is accepted on this evidence: the grammar runners pass (128/128 each); TypeScript and
  Swift fail on exactly the five vectors whose answer depends on the descent, and pass the four that stay
  strict; Rust fails at the first of those five, because its comparison test stops at its first assertion.
  Rationale: the Rust harness cannot list the rest until the first passes, so its full list is Track 2's
  first reading rather than this track's.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: Track 4 declares the public surface in the specification, and the tracks now run 1, 3, 4, 2.
  The declaration completes Rust and Swift up to TypeScript rather than trimming TypeScript down:
  `sameIdentifier` is added to both, and both accept a `ParseResult` wherever an identifier is taken — a
  trait in Rust, a protocol or overloads in Swift, so every call written with a string still compiles.
  Renames that change a published name (`canonical` → `canonicalIdentifier` in TypeScript,
  `canonicalJSON` → `canonicalise` in Swift) keep the old name as a deprecated alias for one minor.
  Rationale: a survey of the three surfaces found `covers` already agrees everywhere, and seven real
  divergences elsewhere — two names, one operation present only in TypeScript, identifier parameters that
  accept a parse result only in TypeScript, an error class outside the package's own hierarchy, a type
  name, and three spellings of loading a specification. Nothing detects any of them: the specification
  declares no surface, and the TypeScript tests for `canonical` and `comparison` import from internal
  modules, so an operation dropped from the entry point leaves its vectors green. Declaring before Track 2
  lets the realignment pass implement against the declaration once instead of twice.
  Date / Author: 2026-09-23 / Danilo Borges
- Decision: The surface is declared as one OpenRPC document under the key `openRPC` of `ref-id.json`, with
  each method pointing at the key that states its rule through `x-rule`. A separate `api` block, an
  `operation` field inside each rule key, and OpenRPC as a second file in `spec/` were each considered.
  Rationale: ADR-0001 ships the specification as one file, which rules out a second file. Fields spread
  across rule keys would not form a document, so no OpenRPC tool could read them and every `$ref` would
  need to know which key it landed in. One embedded document is still a valid OpenRPC document once
  extracted, keeps the surface in one list, and `x-rule` keeps the rule where it already lives. A
  research worktree reached the same five name divergences independently with an OpenRPC file and a
  name check; its ABNF grammar and grammar derivation are a separate question and stay out of this plan.
  Date / Author: 2026-09-24 / Danilo Borges

## Outcomes & Retrospective

*Not yet — nothing has shipped.*

---

## Open questions

- Should `relate` report a dimension neither side declares, or leave it out? Reporting it as `equal` keeps
  the output shape fixed. Leaving it out keeps the output small. Track 3 decides, and records the choice
  above.

## Related

- ADR-0005 — the `ai-model` locator opens on the provider; records the `by=` behaviour this plan changes.
- `comparison` block of `spec/ref-id.json` — the rules and `dimensions` this plan extends.
