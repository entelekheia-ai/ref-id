# AGENTS.md — ref-id

The `ref:` identifier scheme: one way to name anything somebody declared — a package, a symbol, a record,
a detector, a reading — so that stores kept by different tools can point at each other. The scheme is
**published as data** (`spec/ref-id.json`: grammar, tables, digest rules, conformance vectors) and this
repository holds the first implementation that consumes it. A second implementation in another language
is expected and is checked against the same vectors, never against this code.

## Layout

| Folder | Role |
|---|---|
| `spec/` | **The specification, as data.** `ref-id.json` is the only place the grammar, the dispatch and qualifier tables, the digest canonicalisation and the conformance vectors live. Prose in `docs/` explains it; nothing in `packages/` restates it. |
| `packages/ref-id/` | `@entelekheia/ref-id` — the TypeScript reference: parse, serialise, build, digest, envelope validation. Reads `spec/ref-id.json`; its tests are the vectors. |
| `Package.swift`, `Sources/RefId/` | The Swift port (`RefId`), at the root because SwiftPM resolves a git dependency's manifest only there. `Sources/RefId/Resources/` holds a byte-identical copy of `spec/` (the runner proves it). Gate: `swift run ref-id-conformance` — an executable, because Command Line Tools ship neither XCTest nor the Swift Testing macros. |
| `spec/conformance/` | Grammar-level runners in Python and Perl: the declared dialects, proven on every parse vector (`npm run test:grammar`). |
| `docs/` | Diátaxis: `explanation/` carries the scheme's rationale and the rejected alternatives; `reference/` the API. |
| `project/` | Governance records (ADR / RFC / plan / task / log / research) — lifecycles in `.agents/rules/governance.md`. |

## How this repo works

- **Data first, then code.** A change to the scheme is an edit to `spec/ref-id.json` plus the vectors
  that bind it; the code follows. Code that hardcodes a table, a qualifier key or the expression is a
  defect even when every test passes.
- **Behaviour stays code.** Order of validation, delegation to owning validators (Package URL, SWHID),
  normalisation and degrading to `uncovered` rather than throwing are algorithms. They are bound by
  vectors, not by prose or by a rule language.
- **Two changes mint a new `specVersion` major:** normalisation or percent-encoding, and separators or
  shape. A new locator type, qualifier key, refinement key or fragment grammar is an addition.
- **A digest is a claim, never a promise.** An identifier carrying a digest is admissible only with an
  envelope whose members recompute to it; the validator refuses the rest at ingestion.
- **The package embeds the spec** and carries the digest of its canonical serialisation. A spec edit
  without the regenerated digest fails the build on purpose.
- **Every change to a published package's contract carries a `.changeset/*.md`** (changesets, stable
  channel only until a beta branch exists). `changeset version` has never run: no `CHANGELOG.md` yet is
  expected, not broken. The package publishes to GitHub Packages until its npm release — `project/adr/0003`.
- Every delegated validation goes to the library that owns the format. Two exceptions are declared: the
  SWHID core form (ADR-0002, no maintained validator on npm) and, in the Swift port only, the Package URL
  core grammar (no maintained Swift library). The two purl validators differ at the edge — `packageurl-js`
  accepts an empty name after a namespace, the Swift validator refuses it — and a locator's validity is the
  format's, so a differential test compares every field except that verdict.

## Source of truth

| What | Where |
|---|---|
| The scheme (grammar, tables, vectors) | `spec/ref-id.json` |
| Why each rule is shaped that way | `docs/explanation/` |
| Decisions with consequences for consumers | `project/adr/` |
| Work in flight | `project/plans/` |

## Agent config layout

`.agents/` is the canonical home; `.claude/` holds relative symlinks back into it.

| Kind | Canonical | Claude sees it via |
|---|---|---|
| Rules (always-on or path-scoped) | `.agents/rules/<name>.md` | `.claude/rules/<name>.md` → `../../.agents/rules/<name>.md` |
| Skills | `.agents/skills/<name>/SKILL.md` | `.claude/skills/<name>` → `../../.agents/skills/<name>` |

Agent tooling is the `vibe-ops` plugin — no per-repo skill copies. Closing a task goes through
`/vibe-ops:close-task`, never a plain delete.

## Keeping this file current

1. **Notice drift.** Whenever you `ls` the root, compare disk against the tables above.
2. **Triggers:** a package appears under `packages/` (a port, a CLI); `spec/` gains a second file; a
   locator type or qualifier key is added; a rule or skill lands under `.agents/`; the SWHID exception
   gains a library and stops being an exception.
3. **Update in place** — one line per entry, pointing at the source of truth.
4. **Fold it into the current task** and mention the edit.

## License rules

- New `.md` documents need **no license header** — the root [`LICENSE`](LICENSE) covers the repository.
- Non-code example/fixture files need no header either.
- Source files (`*.ts *.tsx *.js *.jsx`) carry a one-line SPDX header at the top:

  ```
  // SPDX-License-Identifier: Apache-2.0
  ```

  Follow the existing pattern in the file's neighbors; don't invent a different header style.
