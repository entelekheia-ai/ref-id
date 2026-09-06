---
vibe-ops-template: adr@2
---

# ADR-0002: The SWHID core form is validated in-house

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-06 |
| Deciders | Danilo Borges |

---

## Context

The scheme's rule is that no part of it re-implements a grammar another specification already defines:
each captured part is handed to the validator that owns that format. For a Package URL that validator
exists on npm as pure JavaScript (`packageurl-js`, the reference implementation). For a SWHID — the
Software Heritage persistent identifier, ISO/IEC 18670 — no maintained JavaScript validator exists on the
registry at the time of this decision, and the scheme accepts only the core form
(`swh:1:<cnt|dir|rev|rel|snp>:<40 hex>`), never SWHID qualifiers, because positional refinements sit on
the fragment side per RFC 5147.

## Decision

We will validate the SWHID core form with one pattern declared in `spec/ref-id.json`
(`forms.swhid.pattern`), and record it here as the **one declared exception** to the delegation rule.
The pattern is data; the package reads it and does not restate it.

## Options considered

- **Option A — a Python or Rust SWHID library through a binding** — the owner's own validator; it adds a
  native runtime to a package whose portability rests on having none. Rejected.
- **Option B — accept `at=` values unvalidated** — no exception to declare; an abbreviated hash such as
  `swh:1:rev:7e29bb6` would then pass and be stored as a frozen state that resolves nowhere. Rejected.
- **Option C (chosen) — one pattern in the specification, exception recorded** — the core form is a
  fixed-width grammar with five enumerated types; the pattern is five lines shorter than the exception
  note, and the vectors cover both the accepted and the abbreviated case.

## Consequences

Easier: the runtime surface stays `packageurl-js` plus the platform's hashing. Harder: SWHID qualifiers
are rejected rather than parsed, which is the scheme's intent but reads as a limitation to a reader who
expects the full grammar.

## Sunset & reversal

Revisit when a maintained, dependency-free JavaScript SWHID validator appears on the registry. Unwind by
adding it as the `forms.swhid.validator` in the specification and deleting the pattern; the vectors do
not change.

## Related

- ADR-0001 — where the pattern lives and why it is data.
