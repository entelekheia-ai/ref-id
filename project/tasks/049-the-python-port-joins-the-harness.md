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

# Task: The Python port joins the harness

| Field | Value |
|---|---|
| Status | Done |
| Created | 2026-09-28 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/49> |
| Plan | plans/008-the-python-port.md — Track 5 |

---

## Context

Tracks 1–4 and 7 left a complete Python port whose own suite passes. Nothing yet holds it against the
other implementations or refuses a commit that breaks it: the differential runs four implementations,
`check-surface.mjs` reads Rust and Swift, the local gates know nothing of Python, CI installs no Python,
and `spec/conformance/grammar-check.py` still proves a dialect the port now proves on every vector. This
track closes those gaps. All of it is shared harness, so it runs in the main loop (Plan-008 Decision Log);
the one implementation fix it exposed went to `ref-id-port-implementer`.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | `python/tools/parse_lines.py`, the line protocol | S |
| 2 | P0 | The Python rows in `scripts/differential.mjs`, and its corpus drawn from every vector group | S |
| 3 | P0 | The `python` language in `scripts/check-surface.mjs` | S |
| 4 | P0 | Two local gates: `python-conformance` and `surface-generated` | M |
| 5 | P0 | CI: a `python` job, `uv` in the gate and differential jobs, the generator's tests | S |
| 6 | P0 | `spec/conformance/grammar-check.py` retired; `test:grammar` runs the Perl runner | S |
| 7 | P0 | Swift's Package URL canonical form encodes the version as the other three do | S |

## Implementation order

- [x] P0 — item 1: landed early, in `7683980`, because the `attack` skill needed it; byte-identical to the
      TypeScript protocol on 241 inputs and 14,400 pairs
- [x] P0 — item 2: `python` rows in `ports` and `pairPorts`; `corpus()` walks every vector group for
      `ref:` strings instead of naming four groups
- [x] P0 — item 3: `pythonSurface()` reads `ref_id.__all__`; a module without one is reported unreadable
- [x] P0 — item 4: both gates with fixtures in `.vibe-ops/ops.json` and tests beside them
- [x] P0 — item 5: `gates.yml` and `release.yml`
- [x] P0 — item 6: runner deleted, `package.json`, `AGENTS.md` and the step names updated
- [x] P0 — item 7: dispatched to `ref-id-port-implementer` (Swift)
- [x] P0 — caller: the whole gate, the differential at 0 and 0, commit

## Surprises & Discoveries

- Observation: this dossier was written after items 1–6 had landed, against the run-plan rule that a
  track's dossier exists before its work starts; the work followed the plan's Track 5 text directly.
  Evidence: the dossier's creation after the edits it lists.

- Observation: widening the differential's corpus to every vector group found a canonical-form difference
  no narrower corpus reached — Swift writes `state=` where the other three write `state%3D` in a Package
  URL version.
  Evidence: `npm run test:differential`, 304 inputs × 5 implementations, 2 disagreements, both Swift, both
  from `relate` vectors the old corpus left out; Python agreed on every input and every pair.

- Ruling: `python-conformance` takes its command as an option and appends `--junitxml`, reading pytest's
  own report, with `junit_family=xunit1` so each case carries its file; the fixture's command copies a
  report it carries, so the self-test needs neither `uv` nor the network — cost if wrong: a pytest release
  dropping the xunit1 family, which the gate would show as findings naming `python/tests`.

- Ruling: `surface-generated` runs all four `gen-surface-*.mjs --check`, the Rust and Swift ones included,
  which nothing ran before — they need Node only — cost if wrong: none.

- Ruling: `gen-surface-python.test.mjs` runs in the CI Node job by path rather than through a new npm
  script — cost if wrong: a local run needs the path typed.

- Observation (Swift implementer): Swift wrote a Package URL version verbatim, never re-encoding it, and
  carried a qualifier value's percent-escapes in their original case; it now re-encodes the version with
  `packageurl-js`'s unreserved set and uppercases every escape's hex digits in a final pass.
  Evidence: `swift run ref-id-conformance` 1149/0 with four checks red on the old code; the differential
  304 inputs and 92,416 pairs × 5 implementations, 0 disagreements.

- Observation: the three Package URL libraries disagree among themselves on `/`, `&` and `+` inside a
  version; Swift follows TypeScript, the reference row. Added to the plan's open question on the
  Package URL canonical spelling.
  Evidence: the Swift implementer's per-character table against `packageurl-js`, the `packageurl` crate
  and `packageurl-python`.

- Deferred minor: Swift's namespace and name encoding leaves `!`, `*`, `'`, `(`, `)` out of its unreserved
  set, which `packageurl-js` keeps unencoded, and its qualifier values are reordered rather than
  re-encoded — no vector and no corpus input reaches either.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
