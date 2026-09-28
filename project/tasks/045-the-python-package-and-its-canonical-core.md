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

# Task: The Python package, its specification and the canonical core

| Field | Value |
|---|---|
| Status | Done |
| Created | 2026-09-27 |
| Author | Danilo Borges |
| Issue | <https://github.com/entelekheia-ai/ref-id/issues/45> |
| Plan | plans/008-the-python-port.md — Track 2 |

---

## Context

Track 1 declared Python in `openRPC` and committed `python/tests/test_surface.py`, the contract the package
is held to. This track creates the package and the part of it every later track stands on: the embedded
specification, loading and verifying it, the canonical JSON serialisation, the set digest, and the grammar
compiled in the `python-re` dialect. Parse, serialise, build and the envelope are Track 3; relations are
Track 4.

**Global constraints** (from Plan-008, apply to every item): Python `>=3.11`, tested on 3.11 and on the
newest local interpreter; distribution `ref-id`, import `ref_id`, `src` layout under `python/`; build
backend `hatchling`; runtime dependency `packageurl-python` only (not used until Track 3, declared now);
everything else from the standard library; `py.typed`; `mypy --strict` and `ruff` clean; every source file
starts with `# SPDX-License-Identifier: Apache-2.0`; nothing from `spec/ref-id.json` — a table, a pattern,
a key list, a part or status name — is written in code (`.agents/rules/repo-guardrails.md`).

**The reference behaviour** is the Rust crate, which is the closest shape to Python: `crates/ref-id/src/`
`spec.rs`, `canonical.rs`, `digest.rs`, `grammar.rs`, `types.rs` (`RefIdError`). Port behaviour, not
shape; where the crate and the specification disagree, the specification wins and the disagreement is a
finding with both `file:line`.

Measured before writing:

- `openRPC` rules: `canonicalise` → `/canonicalisation`, no vector group; `digest` → `/digest`, group
  `digest` (7 vectors); `loadSpec`/`loadSpecFrom` → `/specVersion`, errors `SpecIntegrity`, `SpecVersion`.
- `/canonicalisation` is `json-sorted-keys-compact`: keys sorted by **UTF-16 code unit** order, no
  whitespace outside strings, strings escaped as `JSON.stringify` does, integers only, the UTF-8 bytes are
  what the digest covers; the sidecar `ref-id.json.sha256` holds the digest of the file.
- The crate supports `specVersion` major `1` (`crates/ref-id/src/spec.rs:21`).
- Vector groups today: `parse canonical roundtrip build digest envelope comparison relate verdict`.
- No Python 3.11 is installed locally; `uv run --python 3.11` fetches one.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Package skeleton: `pyproject.toml`, `py.typed`, `__init__.py`, the embedded specification | S |
| 2 | P0 | `RefIdError` and its five kinds | S |
| 3 | P0 | `canonicalise` | M |
| 4 | P0 | `Spec`, `load_spec`, `load_spec_from`, `embedded_spec_text` | M |
| 5 | P0 | The grammar in the `python-re` dialect | S |
| 6 | P0 | `digest` | S |
| 7 | P0 | The conformance runner and its group-refusal test | M |

### 1. Package skeleton — P0

**What:** `python/pyproject.toml`, `python/src/ref_id/__init__.py`, `python/src/ref_id/py.typed`,
`python/src/ref_id/spec/ref-id.json` and `ref-id.json.sha256`.
**Why:** everything else lives in it; the spec copy must ship inside the wheel.
**Change:** `[project] name = "ref-id"`, `version = "0.6.0"` (the npm package's current version — Track 6
wires the sync), `requires-python = ">=3.11"`, `license = "Apache-2.0"`, `dependencies =
["packageurl-python>=0.17.6,<0.18"]`; `[build-system] requires = ["hatchling"]`; `[dependency-groups] dev =
["pytest", "mypy", "ruff"]`; `[tool.mypy] strict = true`; `[tool.ruff] target-version = "py311"`. The
spec files are **copied by the caller** before dispatch — they are generated, and the implementer's hook
refuses edits there. `__init__.py` re-exports what exists and declares `__all__` for exactly that.

### 2. The error hierarchy — P0

**What:** `RefIdError(ValueError)` and `BuildError`, `DigestError`, `SerialiseError` (each with a `part:
str` attribute), `SpecIntegrityError`, `SpecVersionError`, in `python/src/ref_id/errors.py`.
**Why:** `test_surface.py` names all six; every method's declared errors raise one of them.
**Change:** `str(error)` reads `"<Kind>Error at <part>: <message>"` for the three with a part and
`"<Kind>Error: <message>"` for the other two — the crate's `Display` (`crates/ref-id/src/types.rs:142`).

### 3. `canonicalise` — P0

**What:** `canonicalise(value: object) -> str` in `python/src/ref_id/canonical.py`.
**Why:** the digest covers its bytes, so one byte of difference from the other implementations is a
different digest for the same data.
**Change:** implement `/canonicalisation` from the specification. Sort keys by UTF-16 code unit
(`key.encode("utf-16-be")` is the sort key), escape strings exactly as `JSON.stringify` (Python's
`json.dumps(..., ensure_ascii=False)` differs on lone surrogates and must not be trusted blindly — test
it), refuse a non-integer number (`float`, and `bool` is not a number here) with the error the crate
raises.

### 4. The specification — P0

**What:** `python/src/ref_id/spec.py`: `class Spec` (opaque to callers; accessors the other modules need,
modelled on `crates/ref-id/src/spec.rs` — `spec_version`, `vectors(group)`, `vector_classes()`, the grammar
expression, a generic getter), `load_spec() -> Spec` (cached, reads the embedded file through
`importlib.resources`), `load_spec_from(directory: str | os.PathLike[str]) -> Spec`,
`embedded_spec_text() -> tuple[str, str]` (the JSON text and the sidecar text, as the crate returns).
**Why:** every other module reads the specification through it.
**Change:** verify the sidecar against the digest of the canonicalised file and raise
`SpecIntegrityError` on a mismatch; raise `SpecVersionError` for a major other than the supported one.

### 5. The grammar — P0

**What:** `python/src/ref_id/grammar.py`: compile every pattern the specification declares after applying
`grammar.adaptations["python-re"].replace` in order.
**Why:** the grammar is data; the adaptation is the one place the dialect differs.
**Change:** follow `grammar.adaptationsApplyTo` for which patterns take the adaptation. Read the retired
runner `spec/conformance/grammar-check.py` for how the adaptation is applied — it is the prior art, and
it is deleted in Track 5.

### 6. `digest` — P0

**What:** `digest(members: Sequence[str]) -> str` in `python/src/ref_id/digest.py`.
**Change:** `crates/ref-id/src/digest.rs` line for line: refuse a member carrying the join character with
`DigestError` at the part the specification names; refuse an algorithm other than `sha256` with
`SpecVersionError`; declared order, no deduplication.

### 7. The conformance runner — P0

**What:** `python/tests/test_conformance.py`: one parametrised test per group this track can run
(`digest`), and `test_every_vector_group_runs`, which holds a literal `EXECUTED` list and asserts
`set(spec.vector_classes()) - set(EXECUTED)` is empty — **and is marked `xfail(strict=True)` with the
reason "Tracks 3–4 add the remaining groups"**, so it fails the day it unexpectedly passes. Plus
`test_embedded_spec_matches_root`, byte-comparing the embedded copy with `../../spec/ref-id.json` when that
file exists.
**Why:** a group nothing runs hides every other defect (`AGENTS.md`).

## Review focus

1. **A key outside the BMP.** Two keys whose UTF-16 and code-point orders differ — `"｡"` and
   `"\U0001f600"` — must sort as UTF-16 does (`😀` first). Pinned by a test in item 3.
2. **A lone surrogate or a control character in a string.** `canonicalise({"a": "\ud800 \x1f"})`
   must equal the TypeScript reference's output byte for byte; take the expected string from
   `node -e 'console.log(JSON.stringify(...))'` and hard-code it in the test. Pinned in item 3.
3. **A float, a `bool`, a `NaN`.** Each refused, never serialised. Pinned in item 3.
4. **A tampered embedded file.** `load_spec_from` on a copy with one byte changed raises
   `SpecIntegrityError`; a copy declaring `specVersion` `2.0.0` (resealed) raises `SpecVersionError`.
   Pinned in item 4.
5. **A digest member containing the join character**, and the empty sequence — the first raises
   `DigestError`, the second returns the digest of the empty string as the crate does. Pinned in item 6.

## Implementation order

Items 1–7 are dispatched to `ref-id-port-implementer` as one brief (Plan-008 Decision Log), language
`python`, write set `python/` except `python/src/ref_id/spec/` and `python/tests/test_surface.py`. The
caller copies the specification into `python/src/ref_id/spec/` before the dispatch.

The gate for this track, from inside `python/`: `uv run pytest --ignore tests/test_surface.py`,
`uv run --python 3.11 pytest --ignore tests/test_surface.py`,
`uv run mypy --strict src tests/test_conformance.py`, `uv run ruff check`; at the root,
`node scripts/gen-surface-python.mjs --check`. `test_surface.py` runs from Track 4, when every declared
name exists.

- [x] P0 — caller: copy `spec/ref-id.json` and `.sha256` into `python/src/ref_id/spec/`; add the Python
      pair to `spec-bytes` and `spec-seal` in `.vibe-ops/ops.json`
- [x] P0 — implementer: items 1–7, TDD, each test watched failing first
- [x] P0 — caller: read the diff, rerun the gate, break one detection on purpose, commit

## Surprises & Discoveries

- Ruling (received from the caller, Track 1 review): every public function is positional-only; `digest`
  refuses a bare `str` with `DigestError`; ruff's line-length rule stays off — cost if wrong: see the
  Track 1 dossier's rulings, which carry the reasons.

- Ruling: `digest.py` keeps its own `_FIELD = ":"` rather than importing a shared grammar constant — the
  grammar's constants are not public yet — cost if wrong: two identical literals to fold into one later.

- Ruling: `Spec` reads through `value(*path)` and typed `get_str`/`get_int`/`get_strings`/`get_object`,
  prefixed so as not to shadow the builtins `int` and `object` — cost if wrong: internal names only.

- Ruling: `Spec` caches its `Grammar` lazily in a private method, as the crate's `OnceLock` does — cost
  if wrong: a one-line change if Track 3 wants the cache elsewhere.

- Ruling: `load_spec_from` on a missing directory raises `SpecIntegrityError`, wrapping the `OSError`, as
  the crate maps its read error — cost if wrong: a caller catching `OSError` would miss it.

- Observation: the crate's `escape()` has no lone-surrogate branch to port, because a Rust `String` cannot
  hold one; the Python escaper's expected bytes for that case come from `JSON.stringify` directly.
  Evidence: `crates/ref-id/src/canonical.rs:11-27` iterates `char`s; Python's `json.dumps(...,
  ensure_ascii=False)` passes `\ud800` through unescaped, so the port writes its own escaper.

- Observation: the package holds a module `ref_id/spec.py` and a data folder `ref_id/spec/` with no
  `__init__.py`; the module wins the import, and `importlib.resources` reaches the data through
  `files("ref_id") / "spec" / "ref-id.json"`.
  Evidence: a wheel built with `uv build` lists `ref_id/spec.py` beside `ref_id/spec/ref-id.json`, and a
  clean venv importing it ran `ref_id.load_spec()` and `ref_id.digest([])` — verified by the caller.

- Observation: a `# type: ignore[arg-type]` on the bare-`str` digest test was unused — `str` satisfies
  `Sequence[str]`, the reason the runtime refusal exists — and `mypy --strict src tests` reported it.
  Evidence: `tests/test_digest.py:32`; removed by the caller before commit.

- Ruling (review follow-up): `digest` refuses anything that is not a `list` or `tuple`, then works on a
  snapshot, and refuses a non-`str` member ("a member must be a string") and one that does not encode as
  UTF-8 ("a member must encode as UTF-8"), both at part `member` — the TypeScript reference refuses the
  same inputs; a generator had silently digested as the empty list — cost if wrong: a caller passing
  another sequence type converts it first.

- Ruling (review follow-up): `digest` imports the grammar's `FIELD`, superseding the earlier ruling that
  kept a local literal; `canonicalise` joins a split surrogate pair before escaping it, as JavaScript sees
  one character; `embedded_spec_text` decodes bytes rather than reading text, so no newline translation
  applies — cost if wrong: none.

- Observation: `forms.origin-url.pattern` did not compile under the `python-re` adaptation, because a
  plain replace of `$` reached the `$` inside its character classes.
  Evidence: `re.compile` raised `bad escape \Z at position 84`; `pcre2`'s `$` → `\z` has the same flaw;
  the retired grammar runners adapted only the top expression. Parked, answered by the maintainer
  (Plan-008 Decision Log, the `anchor` field), carried out in Track 3.

- Deferred minor: `load_spec_from` still reads through text mode; the integrity check digests the
  canonicalised parse, so a CRLF copy verifies the same — declined as a defect, noted for a reader who
  expects byte reads there too.

- Deferred minor: the wheel ships no LICENSE file, because `python/` has none — Track 6.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
