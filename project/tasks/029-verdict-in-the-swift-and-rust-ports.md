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

# Task: verdict in the Swift and Rust ports

| Field | Value |
|---|---|
| Status | Planned |
| Created | 2026-09-26 |
| Author | Danilo Borges |
| Issue | https://github.com/entelekheia-ai/ref-id/issues/29 |
| Plan | plans/006-location-hints-and-the-verdict.md — Track 3 |

---

## Context

Spec 1.5.0 declares `verdict(a, b)` at `comparison.verdict` in `spec/ref-id.json`, with per-qualifier facts
at `qualifiers.<key>.verdict` and 21 vectors in `vectors.verdict`. The TypeScript reference implements it
in `packages/ref-id/src/relations.ts` (`verdict`, after `relate`); it passes every vector and agrees with
an independent reading of the rule on all 82,369 ordered pairs of the identifiers the vectors name.

Measured 2026-09-26 before this task: `cargo test --workspace` fails one test, `every_vector_group_runs`
(`crates/ref-id/tests/conformance.rs:49`); `swift run ref-id-conformance` fails two checks,
`every-vector-group-runs` and the `surface` check for method `verdict`; `npm run test:surface` reports
`declared methods missing: verdict` for both `rust` and `swift`. The differential's pair pass now expects a
`verdict` key on every pair line (`packages/ref-id/parse-lines.ts`, `scripts/differential.mjs`).

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Rust: `verdict` in `crates/ref-id/src/relations.rs`, re-exported from `src/lib.rs` | M |
| 2 | P0 | Rust: conformance runner, surface bindings, `--pairs` output | S |
| 3 | P0 | Swift: `verdict` in `Sources/RefId/Relations.swift`, types in `Types.swift` | M |
| 4 | P0 | Swift: conformance runner, surface, `--pairs` output | S |

### 1. Rust `verdict` — P0

**What:** a public `verdict` beside `relate` (`crates/ref-id/src/relations.rs:406`), taking the same
`IdentifierArg` pair, returning `Option<VerdictResult>`.
**Why:** the spec declares the operation; the surface and group guards fail without it.
**Change:** port the rule from the spec text, with the TypeScript function as the reference reading. Every
qualifier fact is read from the loaded spec's `qualifiers.<key>.verdict`, never from a literal key list.

### 2. Rust runner, surface and pairs — P0

**What:** run `vectors.verdict` (result and mirror) in `crates/ref-id/tests/` and add `verdict` to the
executed-groups list; regenerate bindings with `node scripts/gen-surface-rust.mjs`; add a `verdict` key to
the `--pairs` JSON line of `crates/ref-id/examples/parse_lines.rs`, serialised exactly as the TypeScript
side prints it.
**Why:** the group guard, the surface guard and the differential each fail until these exist.
**Change:** model the vector test on `crates/ref-id/tests/relate.rs`.

### 3. Swift `verdict` — P0

**What:** a public `verdict` beside `relate` in `Sources/RefId/Relations.swift`, a `VerdictResult` type in
`Sources/RefId/Types.swift`.
**Why and change:** as item 1.

### 4. Swift runner, surface and pairs — P0

**What:** in `Sources/RefIdConformance/main.swift`, add `"verdict"` to `executed` (line 138) and a loop over
`vectors("verdict")` modelled on the `relate` one (line 258), checking the mirror too; regenerate
`Surface.generated.swift` with `node scripts/gen-surface-swift.mjs`; add `"verdict"` to the `--pairs`
output (line 91), serialised exactly as the TypeScript side prints it.
**Why and change:** as item 2.

## Implementation order

Delegated to two subagents in parallel, one per port (Plan-006 Decision Log: one `sonnet` per port behind
its own gate). The ports share no file.

**Contract, Rust agent.** May edit `crates/ref-id/**`. Done means `cargo test --workspace` exits 0 and `npm run test:surface` prints no `rust`
divergence.

**Contract, Swift agent.** May edit `Sources/**` except `Sources/RefId/Resources/`. Done means `swift run ref-id-conformance` reports 0 failed and
`npm run test:surface` prints no `swift` divergence.

**Both.** Must not edit `spec/`, the spec mirrors, `packages/`, `scripts/`, docs, the plan or the ADR, nor
the other port's tree, nor this dossier — both report surprises in their hand-back and the orchestrator
records them here, because two agents in one stage never share a writable file. Must not run `git stash`, `git checkout` or `git restore`, and must not commit. A
vector that looks wrong is reported with the rule text that contradicts it; editing a vector to go green
is forbidden, and stopping red with the reason is acceptable.

The differential (`npm run test:differential`) needs both ports and is run by the orchestrator after both
land.

- [ ] P0 — item 1: Rust `verdict`
- [ ] P0 — item 2: Rust runner, surface, pairs
- [ ] P0 — item 3: Swift `verdict`
- [ ] P0 — item 4: Swift runner, surface, pairs
- [ ] P0 — orchestrator: `npm run test:differential` with all four implementations

## Surprises & Discoveries

*None yet.*

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
