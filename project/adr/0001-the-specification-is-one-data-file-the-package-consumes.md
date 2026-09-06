---
vibe-ops-template: adr@2
---

# ADR-0001: The specification is one data file the package consumes

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-06 |
| Deciders | Danilo Borges |

---

## Context

The `ref:` scheme has more than one implementation in its future: the first in TypeScript, a second in
Python for an extraction pipeline that does not run Node. A scheme held to prose diverges exactly where
prose is weakest — the degradation paths: an unknown type matches the grammar perfectly, and nothing in
the expression says whether that yields a state or an exception.

The scheme has three layers. The tables (dispatch, qualifier keys, refinement keys, resolution states,
normalisation form) are data. The grammar is a regular expression with a declared dialect and the
adaptations each engine family applies; measured before this decision, it ran unchanged in three engine
families and in a fourth after one declared substitution, and all four agreed on every vector. Behaviour
— order of validation, delegation to the validator that owns each format, normalisation, degrading rather
than throwing — is an algorithm.

The package must also be able to prove which specification it was built against, and refuse one that was
altered.

## Decision

We will ship the specification as **one JSON file**, `spec/ref-id.json`, carrying the grammar with its
dialect and adaptations, every table, the digest canonicalisation, a `specVersion`, and the conformance
vectors in five classes: `parse`, `roundtrip`, `build`, `digest`, `envelope`. Behaviour stays code and is
bound by the vectors.

The file never contains its own digest. Its digest is the SHA-256 of a canonical serialisation — object
keys sorted by UTF-16 code unit, no whitespace outside strings, strings escaped as `JSON.stringify` does,
integers only — and lives in a sidecar, `spec/ref-id.json.sha256`. The package embeds both and refuses at
load a file whose digest does not match or whose `specVersion` falls outside the range it declares.

## Options considered

- **Option A — prose specification with one reference implementation** — cheapest to write; a port is a
  re-derivation from a reading of the source, and the two diverge on every path the prose left implicit.
  Rejected.
- **Option B — behaviour as data too, with a rule language** — one artefact holds everything; it requires
  inventing a rule language and maintaining an interpreter for it once per implementation, which
  multiplies the divergence the data was meant to remove. Rejected.
- **Option C — a shared compiled core (WebAssembly or FFI)** — one parser everywhere; it places a runtime
  dependency, an initialisation step and a string boundary inside every consumer, for a parser that is one
  expression and a dispatch. Rejected; reopens if computing a SWHID or interning identifiers moves into the
  shared surface.
- **Option D — several data files (grammar, tables, vectors apart)** — easier to read; the digest of "the
  specification" becomes a digest of a set, and a port can be checked against a subset without noticing.
  Rejected.
- **Option E (chosen) — one data file, digest in a sidecar, canonicalisation declared in the file** — a
  port is checked against one artefact with one digest; the canonicalisation is a five-rule subset of
  RFC 8785 that needs no dependency because the file holds only strings, integers, booleans, arrays and
  objects.

## Consequences

Easier: a second implementation is a port checked against vectors; a spec edit is visible as a digest
change; the package can state which specification it embeds. Harder: every edit to the file needs the
sidecar regenerated, and the build fails when it is not — by design; the JSON carries no comments, so
the reasoning lives in `docs/explanation/` and has to be kept beside it; a vector class added later is an
addition to the file and to every implementation's test runner at once.

## Related

- The repository guardrail that forbids restating the file in code: `.agents/rules/repo-guardrails.md`.
