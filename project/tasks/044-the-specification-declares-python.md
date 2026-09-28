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

# Task: The specification declares Python

| Field | Value |
|---|---|
| Status | Planned |
| Created | 2026-09-27 |
| Author | Danilo Borges |
| Issue | https://github.com/entelekheia-ai/ref-id/issues/44 |
| Plan | plans/008-the-python-port.md — Track 1 |

---

## Context

Plan-008 adds a Python implementation. Its public surface is a spec edit before it is code, so this track
declares how Python spells the fourteen `openRPC` methods and what it exposes beyond them, then writes the
generator that turns that declaration into a file `mypy --strict` checks against the package. The package
itself arrives in Track 2; until then the generated file exists and imports a module that does not.

**Global constraints** (from Plan-008, apply to every item): Python `>=3.11`; the package imports as
`ref_id`; the error type is `RefIdError` and each `components.errors` kind `<Kind>` is a class
`<Kind>Error`; no table, pattern or method list is written in code — the generator reads `openRPC` only;
every new source file carries `SPDX-License-Identifier: Apache-2.0`.

Measured before writing, not assumed:

- `openRPC.x-casing` is `{typescript: camelCase, rust: snake_case, swift: camelCase}` and
  `x-extensions` has no `python` key (`spec/ref-id.json:476-490`).
- Adding to `openRPC` does not move `specVersion`: the commit that introduced the whole document,
  `001c51c`, left it at its value. So this track reseals and does not bump.
- Readers of `x-casing`/`x-extensions` today: `scripts/gen-surface-rust.mjs`, `scripts/gen-surface-swift.mjs`,
  `scripts/check-surface.mjs`, `packages/ref-id/test/runtime-surface.test.ts`. Each reads its own key, so a
  `python` key changes none of their outputs — proven by their `--check` modes in step 5.
- `docs/reference/the-ref-scheme.md:729` explains `x-casing` with Rust as its example; it names no
  language list, so it needs no edit.
- Error kinds are `Build`, `Digest`, `Serialise`, `SpecIntegrity`, `SpecVersion`. Deprecated aliases exist
  for `typescript` and `swift` only; `loadSpecFrom` is absent from `typescript-browser` only.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Declare `python` in `x-casing` and `x-extensions`, reseal, copy to ports | S |
| 2 | P0 | `scripts/gen-surface-python.mjs` with `--check`, and its test | M |
| 3 | P0 | Commit the generated `python/tests/test_surface.py` | S |

### 1. Declare Python in the specification — P0

**What:** `"python": "snake_case"` in `openRPC.x-casing`; `"python": ["embedded_spec_text"]` in
`openRPC.x-extensions`.
**Why:** without the key, the generator has no casing to apply and `check-surface.mjs` has no declared
names to hold the package to.
**Change:** edit `spec/ref-id.json`, run `node scripts/seal-spec.mjs`, copy `spec/ref-id.json` and
`spec/ref-id.json.sha256` over `Sources/RefId/Resources/` and `crates/ref-id/spec/`.

### 2. The Python surface generator — P0

**What:** `scripts/gen-surface-python.mjs`, modelled on `scripts/gen-surface-rust.mjs`, writing
`python/tests/test_surface.py`; `--check` diffs in memory and exits 1 when stale.
**Why:** it is how `mypy --strict` fails when a declared method is missing or its signature moved.
**Change:** the type table below, one annotated binding per method, a runtime test that the declared
names equal the specification's. Unlike Rust, one binding per method suffices: Python spells
`IdentifierOrParsed` as the union `str | ref_id.ParseResult`, and a function raising `RefIdError` has no
`Result` in its signature.

| Schema | Parameter | Result |
|---|---|---|
| `$ref Identifier`, `type: string` | `str` | `str` |
| `$ref IdentifierOrParsed` | `str \| ref_id.ParseResult` | — |
| `$ref <Name>` | `ref_id.<Name>` | `ref_id.<Name>` |
| `type: string, x-kind: directory` | `str \| os.PathLike[str]` | — |
| `type: boolean` | `bool` | `bool` |
| `array` of `Identifier` | `Sequence[str]` | `list[str]` |
| `{}` | `object` | `object` |
| `oneOf [X, null]` | `X \| None` | `X \| None` |
| anything else | generator exits 1 naming method and parameter | same |

`x-result-cached` changes nothing in Python. Names are `snake_case(method.name)`.

**Interfaces produced** (Track 2 onward implements against these exact names): `ref_id.parse`,
`serialise`, `build`, `canonical_identifier`, `same_identifier`, `same_package`, `covers`, `relate`,
`verdict`, `digest`, `validate_envelope`, `canonicalise`, `load_spec`, `load_spec_from`, the extension
`embedded_spec_text`, and the types `ParseResult`, `BuildParts`, `EnvelopeResult`, `RelateResult`,
`VerdictResult`, `Spec`, plus `RefIdError` and `BuildError`, `DigestError`, `SerialiseError`,
`SpecIntegrityError`, `SpecVersionError`.

### 3. The generated file — P0

**What:** `python/tests/test_surface.py`, committed.
**Why:** the file is the contract Tracks 2–4 are held to, and the staleness gate of Track 5 diffs it.
**Change:** run the generator; commit its output untouched.

## Review focus

The inputs no test below exercises and a reader would expect handled:

1. A method added to `openRPC` with a schema outside the table — the generator must exit 1 naming it,
   never emit `Any`. Pinned by the test in step 2.
2. A method gaining `x-absent-from: ["python"]` — it must drop from the bindings and from `DECLARED`.
   Pinned by the test in step 2.
3. A `python` entry in `x-deprecated-aliases` — its base name joins `DECLARED`. Pinned in step 2.
4. The generated file importing `ref_id` before Track 2 exists — `pytest` collection fails until then;
   that is expected, and nothing runs it before Track 5 wires the gate.
5. Line endings and trailing newline — `--check` compares bytes, so the generator ends the file with one
   `\n` and never emits `\r`.

## Implementation order

All steps run in the main loop (Plan-008 Decision Log: the shared harness is not delegated).

- [ ] P0 — **Step 1: declare.** Edit `spec/ref-id.json`:

  ```json
  "x-casing": { "typescript": "camelCase", "rust": "snake_case", "swift": "camelCase", "python": "snake_case" },
  ```

  and add `"python": ["embedded_spec_text"]` as the last member of `x-extensions`. Then
  `node scripts/seal-spec.mjs` — expected: `spec/ref-id.json.sha256: …` (the fix line). Then
  `cp spec/ref-id.json spec/ref-id.json.sha256 Sources/RefId/Resources/ && cp spec/ref-id.json spec/ref-id.json.sha256 crates/ref-id/spec/`.
- [ ] P0 — **Step 2: failing generator test.** Create `scripts/gen-surface-python.test.mjs`:

  ```js
  // SPDX-License-Identifier: Apache-2.0
  import { test } from "node:test"
  import assert from "node:assert/strict"
  import { render } from "./gen-surface-python.mjs"

  const base = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../spec/ref-id.json", import.meta.url), "utf8")).openRPC

  test("every declared method gets one annotated binding", () => {
    const out = render(base)
    for (const m of base.methods) {
      const name = m.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      assert.match(out, new RegExp(`^_${name}: Callable\\[`, "m"), m.name)
    }
    assert.match(out, /^_same_package: Callable\[\[str \| ref_id\.ParseResult, str \| ref_id\.ParseResult\], bool\] = ref_id\.same_package$/m)
    assert.match(out, /^_load_spec_from: Callable\[\[str \| os\.PathLike\[str\]\], ref_id\.Spec\]/m)
    assert.match(out, /^_relate: Callable\[.*\], ref_id\.RelateResult \| None\]/m)
    assert.ok(out.endsWith("\n") && !out.endsWith("\n\n") && !out.includes("\r"))
  })

  test("a method absent from python is neither bound nor declared", () => {
    const doc = structuredClone(base)
    doc.methods.find((m) => m.name === "covers")["x-absent-from"] = ["python"]
    const out = render(doc)
    assert.doesNotMatch(out, /_covers:/)
    assert.doesNotMatch(out, /"covers"/)
  })

  test("a python deprecated alias joins DECLARED", () => {
    const doc = structuredClone(base)
    doc.methods.find((m) => m.name === "covers")["x-deprecated-aliases"] = { python: ["covers_old"] }
    assert.match(render(doc), /"covers_old"/)
  })

  test("an unmappable schema is refused, never widened", () => {
    const doc = structuredClone(base)
    doc.methods[0].params[0].schema = { type: "integer" }
    assert.throws(() => render(doc), /parse.*input/)
  })
  ```

  Run `node --test scripts/gen-surface-python.test.mjs` — expected: fails, module not found.
- [ ] P0 — **Step 3: the generator.** Create `scripts/gen-surface-python.mjs` exporting `render(doc)` (pure;
  throws `Error` naming method and parameter on an unmappable schema) and, when run as a script, writing
  `python/tests/test_surface.py` or, under `--check`, diffing and exiting 1 with
  `gen-surface-python: python/tests/test_surface.py is stale — run node scripts/gen-surface-python.mjs`.
  The rendered file is:

  ```python
  # SPDX-License-Identifier: Apache-2.0
  """GENERATED by scripts/gen-surface-python.mjs from spec/ref-id.json's openRPC key. Do not hand-edit.

  One annotated binding per declared method: mypy --strict fails when the function is missing or its
  signature moved. The runtime test holds the declared names to the specification.
  """
  from __future__ import annotations

  import json
  import os
  from collections.abc import Callable, Sequence
  from pathlib import Path

  import ref_id

  _parse: Callable[[str], ref_id.ParseResult] = ref_id.parse
  # … one line per method, in openRPC order …

  DECLARED: list[str] = [
      "parse",
      # … methods not absent from python, then python deprecated aliases, then x-extensions.python,
      # then x-error-type and each components.errors kind + "Error", sorted …
  ]


  def test_declared_matches_spec() -> None:
      root = Path(__file__).resolve().parents[2] / "spec" / "ref-id.json"
      doc = json.loads(root.read_text(encoding="utf-8"))["openRPC"]
      assert doc["x-casing"]["python"] == "snake_case"
      assert sorted(DECLARED) == DECLARED
      assert set(DECLARED) <= set(ref_id.__all__)
  ```

  `Sequence` and `os` are imported only when a binding uses them, so `ruff` finds no unused import. Run the
  test — expected: 4 pass.
- [ ] P0 — **Step 4: generate.** `node scripts/gen-surface-python.mjs`, then
  `node scripts/gen-surface-python.mjs --check` — expected: exit 0.
- [ ] P0 — **Step 5: nothing else moved.** `node scripts/gen-surface-rust.mjs --check && node scripts/gen-surface-swift.mjs --check && npm run build && npm test && npm run test:gates && vibe-ops check`
  — expected: all exit 0; `openrpc-valid`, `spec-sealed`, `spec-bytes`, `spec-seal` report run, not skipped.
- [ ] P0 — **Step 6: commit.** `git add spec/ref-id.json spec/ref-id.json.sha256 Sources/RefId/Resources/ crates/ref-id/spec/ scripts/gen-surface-python.mjs scripts/gen-surface-python.test.mjs python/tests/test_surface.py project/tasks/044-the-specification-declares-python.md`
  then `git commit -m "plan(008) track 1: the specification declares Python (#44)"`.

## Surprises & Discoveries

- Observation: Plan-008 said the `openRPC` additions mint a `specVersion` minor; they do not.
  Evidence: `git show 001c51c -- spec/ref-id.json` changes no `specVersion` line while adding the whole
  `openRPC` document. Plan-008's Design and Track 1 were corrected before this dossier was written.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
