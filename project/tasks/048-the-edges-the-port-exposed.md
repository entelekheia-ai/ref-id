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

# Task: The edges the port exposed

| Field | Value |
|---|---|
| Status | Done |
| Created | 2026-09-28 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/48> |
| Plan | plans/008-the-python-port.md — Track 7 |

---

## Context

Writing and reviewing the Python port found five places where the four implementations disagree or where
no vector binds what they do. The maintainer decided each (Plan-008 Decision Log, 2026-09-28). The
specification edit is done by the caller and committed with this dossier; each implementation then follows
it behind its own gate, one `ref-id-port-implementer` per language, in parallel.

**The specification edit (done by the caller):**

- `/canonicalisation` rule: *a number is an integer whose magnitude is at most 9007199254740991, written as
  that integer; an integral value written with a fraction or an exponent (`1.0`, `1e2`) is that integer;
  any other number is refused.* A new vector group **`canonicalisation`** (8 vectors): `{name, json,
  expect}` — parse `json` with the language's own JSON parser, canonicalise, compare to `expect` — or
  `{name, json, refused: true}` — canonicalisation raises the `SpecIntegrity` error. `openRPC`'s
  `canonicalise` now names this group in `x-vectors`.
- `version.maximum` = 9007199254740991 and `version.maximumNote`: a version literal above the maximum is
  `unsupported`, `versionText` keeps the literal, `version` reports the maximum. Two `parse` vectors.
- `digest.unicode`: a member holding a lone surrogate is refused, never replaced. **No vector** — a JSON
  string with a lone surrogate stops the Rust crate from loading the specification, and Rust and Swift
  strings cannot hold one; TypeScript and Python pin it with a unit test.
- A `parse` vector: `ref:foo:x;constructor=1` is `uncovered` with the qualifier kept.
- Vectors for three pair shapes: one scoped package at two versions and a scoped package covering itself
  at a version (`comparison`), a nested pair refused on one side only (`relate`), a verdict decided by a
  fragment refinement (`verdict`).

**Baseline after the edit, before any code:** `npm test` 333 pass / 4 fail; `cargo test --workspace`
fails `every_vector_group_runs` and `parse_vectors`; `uv run pytest` 665 pass / 4 fail; the surface
generators all report up to date. Every failure is a new vector or the new group.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | TypeScript | M |
| 2 | P0 | Rust | M |
| 3 | P0 | Swift | M |
| 4 | P0 | Python | S |

### 1. TypeScript — P0

`packages/ref-id/src/` and `packages/ref-id/test/`. Run the `canonicalisation` group (`JSON.parse` of
`json`, then `canonicalise`); `canonicalise` refuses a non-integer and a magnitude above the maximum, read
from the specification (JavaScript's `JSON.parse` already turns `1.0` into `1`). `parse` reports a version
literal above `version.maximum` as `unsupported` with `version` = the maximum (today it reports
`Number(text)`, a rounded float). `parse` stops throwing on a qualifier key that names an
`Object.prototype` member: every lookup keyed by a qualifier or refinement key uses an own-property test
(`Object.hasOwn` or a `Map`) — find them all, not only `matchForms` at `parse.ts:122`. `digest` refuses a
member holding a lone surrogate (`DigestError` at the member part; `String.prototype.isWellFormed` exists
in Node 20+) instead of encoding it as U+FFFD — with a unit test; `validateEnvelope` inherits it. This is a
published contract change: the caller adds the changeset. Gate: in `packages/ref-id`, `npm test` and
`npm run typecheck`; at the root, `node scripts/gen-surface-ts.mjs --check`; and `npm run build` (the
browser-purity walk).

### 2. Rust — P0

`crates/ref-id/src/`, `crates/ref-id/tests/`. Run the group (`serde_json::from_str` of `json`, then
`canonicalise`); `canonicalise` accepts an `f64` with an integral value within the maximum and refuses the
rest, and refuses an `i64`/`u64` beyond the maximum. `parse` reads a version literal above the maximum —
including one that overflows `i64` — as `unsupported` with `version` = the maximum and `version_text`
kept (today `parse::<i64>()` fails and falls back to the default, version 1). Add `canonicalisation` to
`every_vector_group_runs`. No digest change: a Rust `String` cannot hold a lone surrogate. Gate:
`cargo test --workspace`, `node scripts/gen-surface-rust.mjs --check`, `node scripts/check-surface.mjs --only rust`.

### 3. Swift — P0

`Sources/RefId/`, `Sources/RefIdConformance/main.swift`. Run the group (`JSONSerialization` of `json`,
then `canonicalJSON`/`canonicalise`); the canonicaliser already refuses a non-integral `Double` and one at
or beyond 2^53 — check it against the vectors, and make its bound the specification's `version.maximum`
rather than a literal if it is one. `parse` reads a version literal above the maximum as `unsupported`
with `version` = the maximum and `versionText` kept (today `Int(text)` fails on overflow and falls back
to the default). Add the group to `checkEveryVectorGroupRuns`. No digest change. Gate:
`swift run ref-id-conformance`, `node scripts/gen-surface-swift.mjs --check`,
`node scripts/check-surface.mjs --only swift`.

### 4. Python — P0

`python/src/ref_id/`, `python/tests/` (not `test_surface.py`). Run the group (`json.loads` of `json`,
then `canonicalise`); `canonicalise` accepts a `float` with an integral value within the maximum as that
integer and refuses the rest, and refuses an `int` beyond the maximum. `parse` reads a version literal
above the maximum as `unsupported` with `version` = the maximum (today it mirrors the crate's `i64`
fallback to version 1). `EXECUTED` gains `canonicalisation`. `digest` already refuses a lone surrogate.
Gate: `uv run pytest`, `uv run --python 3.11 pytest`, `uv run mypy --strict src tests`, `uv run ruff check`.

**For every language:** the maximum is read from `version.maximum`, never written as a literal; the
bound for canonical numbers is the same value, read from the same key.

## Second round — from the security review (Plan-008 Decision Log, 2026-09-28)

**The specification edit (done by the caller, still spec 1.6.0):** `refinements.lines`, `.item` and
`.para` declare `"maximum": "/version/maximum"` — a JSON Pointer into the specification; any integer in
such a refinement's value above it makes the identifier malformed at that refinement
(`version.maximumNote` says so). Ten `parse` vectors: five on refinement bounds (2^53, 2^63+1, 2^64+1,
`item`, and the maximum itself admitted), five gluing U+0301 to each separator (fragment, qualifier,
before a qualifier separator, refinement, scheme). Baseline: `npm test` 352/4; `cargo test` `parse_vectors`
fails; `swift run ref-id-conformance` 1131/14; `uv run pytest` 703/8; grammar runners 171/171.

| # | Item |
|---|---|
| 5 | TypeScript: the refinement bound, read through the `maximum` pointer; `loadSpecFrom` and `canonicalise` wrap `SyntaxError`, `RangeError` and file-system errors as `SpecIntegrityError`, each with a test |
| 6 | Rust: the refinement bound — its ascending check treats an overflowing `u64` as holding today |
| 7 | Swift: the refinement bound; the grammar matched and every split and separator search done by Unicode scalar, not grapheme cluster — `Regex` with `.matchingSemantics(.unicodeScalar)`, `components(separatedBy:)` and `containsAny` over `unicodeScalars` — so the five combining-mark vectors pass and `build` stops emitting what the others split differently |
| 8 | Python: the refinement bound, by digit-string length as the version already is |

For every language the bound is resolved from the pointer the refinement declares, never written as a
literal, and a refinement declaring no `maximum` keeps today's behaviour.

## Implementation order

- [x] P0 — caller: the specification edit, resealed and copied to the three ports' copies and the browser
      constant; baseline recorded above
- [x] P0 — four implementers in parallel, items 1–4, write sets as named
- [x] P0 — caller: each diff read, each gate rerun, `npm run test:differential`, the changeset, commit

## Surprises & Discoveries

- Ruling: every implementation reads `version.maximum` from the raw, not-yet-verified document when it
  canonicalises the specification to check its own sidecar — the digest `canonicalise` computes is what
  authenticates that document, so it cannot wait for a verified `Spec`; a document declaring no bound gets
  2^53 − 1 (TypeScript's `spec.node.ts`, the seal gate), `i64::MAX` (Rust) or `Int64.max` (Swift) — each
  reached only by a specification that is already malformed — cost if wrong: none; the sidecar check that
  follows still refuses such a document.

- Ruling: TypeScript's `canonicalise` gains an optional second parameter, the bound, defaulting to the
  loaded specification's; the `openRPC` signature `(value) -> string` still holds, and the generated
  surface check passes — cost if wrong: a caller passing a second argument by accident.

- Ruling: TypeScript keeps `ParseResult.nested` a plain object and reads it through an own-property test,
  not `Object.create(null)`, because `node:assert/strict`'s `deepEqual` compares prototypes and six vectors
  broke — cost if wrong: a future reader bypassing `nestedAt` reopens the hole.

- Ruling: TypeScript declares `String.prototype.isWellFormed` in an ambient merge rather than raising
  `tsconfig.json`'s `lib`, which lay outside its write set; the package requires Node >= 22, which has it —
  cost if wrong: the rest of ES2024 stays untyped until `lib` is raised.

- Ruling (caller): `specVersion` moves to 1.6.0 — a field, a vector group and rules a 1.5.0 reader sees
  change are additions — while the `anchor` change, which altered how an adaptation is declared but not
  what any implementation observes, did not.

- Observation: the prototype lookups in TypeScript were eight, not one — `spec.qualifiers`,
  `spec.refinements` and `spec.dispatch` indexed by a key off the identifier in `parse.ts`, `build.ts`,
  `validators.ts` and `relations.ts` — plus four reads of `ParseResult.nested` with the same shape.
  Evidence: the TypeScript implementer's report, each `file:line`; `parse("ref:foo:x;constructor=1")`
  threw `formNames is not iterable` before and is `uncovered` after.

- Observation: Swift's bound was enforced only on the `Double` path — a JSON integer such as
  `9007199254740992` passed unchecked — and `Spec.int` read through `NSNumber.intValue`, 32 bits, which
  would have truncated `version.maximum` itself.
  Evidence: the Swift implementer's report; `swift run ref-id-conformance` 1100/4 before, 1112/0 after.

- Observation: the seal gate and both grammar runners are bootstrap callers too — the gate imports the
  TypeScript `canonicalise` and failed on its new default; the runners compared the regex's raw version
  with the saturated expectation.
  Evidence: `vibe-ops check` reported `spec-unsealed … no specification source is installed`;
  `grammar-check.py` 159/161. Both fixed by the caller; 161/161 and 0 failed after.

- Observation: with every change in, the four implementations agree everywhere.
  Evidence: `npm run test:differential` 231 inputs and 53,361 pairs × 4, 0 disagreements; `npm test`
  346/0; `cargo test --workspace` 18/0; `swift run ref-id-conformance` 1112/0; `uv run pytest` 677/0;
  `npm run test:gates` 38/0; `vibe-ops check` and `--self-test` clean.

- Observation (security review, after this track): Swift's `loadSpecFrom` trapped the process on a
  hostile file — `{"a":9223372036854775808.0}`, "Double value cannot be converted to Int64" — because its
  default bound `Int64.max` becomes 2^63 as a `Double`, and `canonicalise` wrote `UInt64.max` as `-1`.
  Evidence: the review's reproduction; `JSONSerialization` gives `18446744073709551615` an NSNumber of
  `objCType "Q"` whose `int64Value` is `-1`. Fixed with `Int64(exactly:)` and an unsigned-type refusal;
  `swift run ref-id-conformance` 1115/0 with three hostile-spec checks that crashed before.
  > Promoted to learning on 2026-09-28

- Observation (security review): Rust's `relate` was quadratic in the number of qualifiers — two sites,
  `declared_keys` and the per-key `.find()` after it. Evidence: 40,000 qualifiers per side took 16.0 s
  in debug before and 0.16 s after, pinned by `crates/ref-id/tests/relate_perf.rs`; `BTreeSet`/`BTreeMap`,
  never `HashMap`, because the crate also compiles to WASM.

- Observation (process): the Swift follow-up used `git stash` on one file while the Python follow-up was
  editing the same worktree. Nothing was lost — the dropped stash, found with `git fsck --unreachable`,
  held only `Sources/RefId/Canonical.swift` — but the stash stack is shared across worktrees and agents.
  Evidence: stash commit `36d1544`, "swift-security-fix-wip-008", one file changed.
  > Promoted to .claude/agents/ref-id-port-implementer.md on 2026-09-28

- Observation (security review): the Python port raised an undeclared `ValueError` from a single
  identifier with a digit run past CPython's 4300-digit int-conversion limit — a limit each host may lower
  with `PYTHONINTMAXSTRDIGITS`. Evidence: `ref:` + 4301 digits + `:folder:a`; fixed by comparing digit
  strings by length before converting; with the variable at its minimum, 640, a 5000-digit version is
  `unsupported` and a 5000-digit `lines=` bound `malformed`, neither raising.

- Observation (security review): Python percent-decoding and relations were quadratic, its Package URL
  canonical form wrote lowercase escapes (`%2b`) where the other three write `%2B`, and `load_spec_from`,
  `canonicalise` and `build` let undeclared exception types escape. Evidence: 1M characters decoded in
  2.6–6.1 s before and 0.1 s after; 40,000 qualifiers related in 2.9 s before and 0.002 s after; each
  refusal pinned by a test; `uv run pytest` 693/0 on 3.14 and 3.11.

- Observation: a `build` given its qualifiers as a dict with a two-letter key built a wrong identifier
  silently — Python unpacked the key string itself (`{"by": "1"}` became `;b=y`); it now raises
  `BuildError` at `state`. Evidence: the follow-up's reproduction.

- Ruling (Python follow-up): `canonicalise` refuses input nested past 500 levels and a cyclic structure
  with `SpecIntegrityError`, where the process's recursion limit would otherwise decide — cost if wrong: a
  document deeper than 500 levels is refused where another implementation's parser decides its own depth
  (`serde_json` stops at 128, `JSONSerialization` at 512).

- Observation (second round): with the refinement bound, scalar matching in Swift and the TypeScript
  refusals in, the four implementations agree everywhere.
  Evidence: the differential 241 inputs and 58,081 pairs × 4, 0 disagreements; `npm test` 360/0;
  `cargo test --workspace` 19/0; `swift run ref-id-conformance` 1145/0; `uv run pytest` 711/0; the Swift
  implementer's probe gluing U+0301, U+200D and U+20E3 to every separator of three inputs, 51 inputs, 0
  mismatches against TypeScript.
  > Promoted to learning on 2026-09-28

- Deferred minor: TypeScript and Rust check every digit run in a bounded refinement's value, Swift and
  Python split on `boundSeparator` first; the two agree for every refinement the specification declares,
  and would part only for a pattern embedding digits in a non-numeric token.

- Deferred minor: Swift's `Spec.pointer` resolves plain keys only (no `~0`/`~1`); every pointer the
  specification writes is `/version/maximum`.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
