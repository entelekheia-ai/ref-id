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

# Task: Release the Python port and document it

| Field | Value |
|---|---|
| Status | In Progress |
| Created | 2026-09-28 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/50> |
| Plan | plans/008-the-python-port.md — Track 6 |

---

## Context

The Python port is complete and held by the harness (Tracks 1–5, 7). This track makes the release publish
it and every document that counts or lists the implementations say so. The pending trusted publisher for
`ref-id` was declared on pypi.org on 2026-09-28 — repository `entelekheia-ai/ref-id`, workflow
`release.yml`, no environment restriction — so nothing in the release is manual. Main loop throughout
(Plan-008 Decision Log).

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | `scripts/sync-versions.sh` writes the version into `python/pyproject.toml` and relocks | S |
| 2 | P0 | `release.yml` probes PyPI and publishes through trusted publishing | S |
| 3 | P0 | The changeset names the Python package | S |
| 4 | P0 | README (packages, install, the generated ref-ids block), AGENTS.md, the config and code comments | S |
| 5 | P0 | The wheel carries a README fit for PyPI and the licence | S |

## Implementation order

- [x] P0 — items 1–5, and the whole gate: `vibe-ops check` 65 checks, 0 failed; `spec-bytes` 4 pairs
      (the licence copy included); `npm test` and `npm run test:gates` green

## Surprises & Discoveries

- Observation: `npm run version` is `changeset version` followed by the sync, not the sync alone; run
  locally to test the sync, it consumed both pending changesets, bumped every manifest to 0.7.0 and wrote
  the changelog — the step `AGENTS.md` assigns to CI's "Version Packages" pull request.
  Evidence: `git status` after the run showed both `.changeset/*.md` deleted and six manifests changed;
  every one was restored from `HEAD` before any commit, and `sh scripts/sync-versions.sh` alone was then
  run to test the sync (0.6.0 → 0.6.0, no change).

- Ruling: the publish step pins `pypa/gh-action-pypi-publish@v1.14.2`, the current release, rather than
  the plan's `v1.13.0` — cost if wrong: none; both take `packages-dir` and `skip-existing`.

- Ruling: the PyPI steps run in the existing release job with no `environment:`, where the plan said the
  job names `pypi` — an environment is set per job, so naming one would put the npm and crate publishes
  behind it too, and the declared publisher accepts any environment — cost if wrong: an approval rule
  for PyPI alone later needs a separate job with the built distribution handed over.

- Ruling: the licence ships as `python/LICENSE`, a copy the `spec-bytes` mirror gate holds against the
  root `LICENSE`, because `hatchling` refuses a licence path outside the project directory — cost if
  wrong: none; the gate refuses a copy that drifts.

- Ruling: `scripts/gen-readme-refs.mjs` gains the PyPI row but leaves the generated block as it is while
  changesets are pending; the release's `npm run version` writes it with the new version and spec
  1.6.0 — cost if wrong: none; `test:readme-refs` holds the block.

## Review of Track 6 — findings (review of e500271, 2026-09-28; triaged below)

- BLOCKER: `astral-sh/setup-uv@v10` does not exist (latest `v10.2.0`) — at `release.yml:103` and
  `gates.yml:32,79,108`; the runner resolves every action at "Set up job" regardless of `if:`, so every
  release run and every gate run would fail. Same finding as Track 5's; fix all four together.
- SHOULD: `scripts/sync-versions.sh:12` never relocks in CI — `npm run version` runs inside
  `changesets/action` before any `uv` exists, and `--offline` fails on a cold cache anyway; `|| true` hides
  it, so each Version Packages PR ships a stale `python/uv.lock`. Put a pinned setup-uv above
  `changesets/action`, drop `--offline`, fail loudly.
- NOTE: the release job publishes to PyPI without running pytest; add `uv run --directory python pytest -q`
  to its gates step once uv is on the runner.
- NOTE: `AGENTS.md:64-66` (and `scripts/differential.mjs:73-75`) misstate the Package URL edges — Node
  refuses `pkg:npm/@scope/`, Swift accepts `pkg:npm/foo@1.0.0/`; write the measured table.
- NOTE: stale counts at `.github/workflows/gates.yml:97` and `packages/ref-id/src/canonical.ts:67`.
- NOTE: the `spec-bytes` message for the `LICENSE` pair tells the fixer to copy the specification.
- NOTE (predates, identity): Python canonicalises `ref:pkg:npm/acme/@1` to `pkg:npm/acme@1`, the canonical
  of `ref:pkg:npm/acme@1` (Node `pkg:npm/acme/%401`, Rust and Swift malformed); Swift keeps
  `pkg:pypi/Ref_ID@1` where the others normalise to `ref-id`. Belongs with the plan's open question on the
  Package URL canonical spelling.

Triage, each finding reproduced first:

- Ruling: the setup-uv BLOCKER and the relock SHOULD are fixed in `b4f2217`. The release job installs uv
  before `changesets/action`, and `sync-versions.sh` relocks online and fails loudly. The release gates also
  run the Python suite, which covers the pytest NOTE — cost if wrong: a network outage during `npm run version`
  now fails the release, where it used to ship a stale lock.
- Ruling: the edge table is measured on the line protocol and written in `AGENTS.md`, `scripts/differential.mjs`
  and the `verify-hostile-input` skill. `packageurl-python` reads `pkg:npm/acme/@1` as `pkg:npm/acme@1`, and the Swift
  grammar accepts a version ending in `/`: both earlier copies said otherwise — cost if wrong: none.
- Ruling: the stale counts at `gates.yml:97` and `canonical.ts:67` now say four — cost if wrong: none.
- Deferred minor: the `spec-bytes` message for the `LICENSE` pair tells the fixer to copy the specification.
- Ruling (re-review of `b4f2217`): no BLOCKER, no SHOULD; its one NOTE — nothing refused a stale
  `python/uv.lock` — is met by `uv run --locked` in the gates workflow's Python step and in the release gates, which
  refuses a lock one version behind `pyproject.toml` — cost if wrong: none.
- Ruling (maintainer, Decision Log): the measured Package URL edges live in one place,
  `docs/reference/implementation-differences.md`, linked from the four READMEs; `AGENTS.md`,
  `scripts/differential.mjs` and the `verify-hostile-input` skill point at it. Re-measured for it: the `%23` edge exists
  only nested in `by=`, a scoped name with nothing after the scope and whitespace before the type are
  edges too, and `packageurl-python` turns a truncated escape into U+FFFD.
- Observation: identity is unaffected by any of the edges — `same_identifier` and `same_package` agree in
  all four implementations on `ref:pkg:npm/acme/@1` against `ref:pkg:npm/acme@1`, and on
  `ref:pkg:npm/foo@1.0.0/` against `ref:pkg:npm/foo@1.0.0`.
  Evidence: the pairs line protocol of each implementation over those two pairs.
- Observation: the identity NOTE on `ref:pkg:npm/acme/@1` and `pkg:pypi/Ref_ID@1` is already part of the
  plan's open question on the Package URL canonical spelling.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
