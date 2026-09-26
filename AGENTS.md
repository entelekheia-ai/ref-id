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
| `packages/ref-id/` | `@entelekheia/ref-id` — the TypeScript reference: parse, serialise, build, digest, envelope validation. Its tests are the vectors. **Two builds of one source**, picked by `exports`: the default reads `spec/ref-id.json` from disk, the `browser` condition serves a build whose specification is a constant `scripts/gen-spec.mjs` compiled in. |
| `Package.swift`, `Sources/RefId/` | The Swift port (`RefId`), at the root because SwiftPM resolves a git dependency's manifest only there. `Sources/RefId/Resources/` holds a byte-identical copy of `spec/` (the runner proves it). Gate: `swift run ref-id-conformance` — an executable, because Command Line Tools ship neither XCTest nor the Swift Testing macros. |
| `Cargo.toml`, `crates/ref-id/` | The Rust port (`ref-id` crate, `ref_id` library) under a root Cargo workspace. Embeds `crates/ref-id/spec/`, a byte-identical copy of the root spec held by a test, so the crate packages on its own. Version synced from the npm package by `scripts/sync-versions.sh`. Gate: `cargo test --workspace`. Delegates the purl to the `packageurl` crate. |
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
  **Retiring a type is an addition too**, which is counter-intuitive and load-bearing: an identifier
  written against the departed type keeps parsing, keeps its parts and stays comparable, because an
  unregistered type degrades to `uncovered`. That is what makes the registry editable rather than frozen.
- **A vector group nothing runs is the defect that hides every other one.** Each runner declares by name
  the groups it executes and refuses any group `spec.vectors` declares that it does not — because a group
  added to the specification obliges no implementation to run it, and a runner that silently skips one
  reports green for a contract it never checked.
- **A digest is a claim, never a promise.** An identifier carrying a digest is admissible only with an
  envelope whose members recompute to it; the validator refuses the rest at ingestion.
- **The package embeds the spec** and carries the digest of its canonical serialisation. A spec edit
  without the regenerated digest fails the build on purpose.
- **The package runs in Node and in a browser, and the integrity guarantee changes hands between them.**
  Node reads `spec/ref-id.json` and verifies it against the sidecar at load. A browser has no disk, so the
  guarantee moves earlier: `scripts/gen-spec.mjs` refuses to emit `src/spec.browser.ts` from a spec that
  fails its sidecar, and a staleness test regenerates and diffs the committed constant. The browser build
  **does not** re-hash its own constant — it would compare a constant against a digest compiled from it in
  the same build, a check that cannot fail and reads as one. It exports `SPEC_DIGEST` as a statement about
  provenance instead. The entry points differ in two lines (which spec source and which sha256 they
  install) and in one export (`loadSpecFrom`, which needs a directory); everything else is shared.
  `npm run build` walks the emitted browser module graph and refuses any Node builtin surviving into it —
  the whole closure, because `tsc` emits one module per file and grepping the entry point alone passes by
  construction.
- **Every change to a published package's contract carries a `.changeset/*.md`** (changesets, stable
  channel only until a beta branch exists). `changeset version` runs in CI and writes `packages/ref-id/CHANGELOG.md`. The package publishes to the public npm registry — `project/adr/0004` — from
  `.github/workflows/release.yml` through npm trusted publishing: a push to `main` opens the "Version
  Packages" pull request, and merging it publishes the npm package, the crate (crates.io trusted
  publishing) and the `v<version>` tag Swift Package Manager resolves. No publishing token exists anywhere.
- Every delegated validation goes to the library that owns the format. Two exceptions are declared: the
  SWHID core form (ADR-0002, no maintained validator on npm) and, in the Swift port only, the Package URL
  core grammar (no maintained Swift library). **The purl exemption in the differential is per
  implementation**: the browser build resolves the same `packageurl-js` the Node build does, so a purl
  disagreement between those two is a defect rather than a known edge. The three purl validators differ at the edge — `packageurl-js`
  accepts an empty name after a namespace and a version ending in `/`; the `packageurl` crate and the Swift
  validator refuse them — and a locator's validity is the format's, so the differential test compares every
  field except that verdict.
- **Each suite proves its own implementation; only the differential proves they agree with each other.**
  `npm run test:differential` runs **four implementations** — the Node build, the browser build, Rust and
  Swift — over every input the specification names, drawn from the
  vector groups themselves, so the corpus grows with the spec, and then over **every ordered pair** of
  that corpus for `covers`, `samePackage`, `sameIdentifier`, `relate` and `verdict`; it fails on the first
  disagreement. The pair pass exists because parse agreeing everywhere did not make comparison agree: two
  divergences no vector named were found only by building pairs. The
  browser build is a row there rather than a suite of its own, because the failure it can reintroduce is
  the one this harness exists for, one build apart instead of one language apart. All
  four speak one line protocol (`packages/ref-id/parse-lines.ts`, with `--browser` selecting the browser
  entry, `cargo run --example parse_lines`,
  `swift run ref-id-conformance --parse`, each with a `--pairs` mode), and all are run the same way for a reason: calling the
  reference in-process would judge it by a path the ports never take. It runs in CI on the macOS runner,
  the only job where the three can coexist. A field no vector constrains can otherwise be decided three
  ways with every suite green, which is what happened to Package URL canonicalisation.
- **The public surface is declared in the specification, and each implementation is held to it.**
  `spec/ref-id.json`'s `openRPC` key is one OpenRPC document: every operation (`x-vectors` names its
  group, `x-rule` the key stating its rule) and every value type. Each suite reads its own surface from
  its compiler — a `tsc`-checked generated file plus runtime exports, typed function-pointer bindings in
  `crates/ref-id/tests/surface.rs`, typed references in the Swift runner — and fails on a missing
  operation or a moved signature; `npm run test:surface` adds the other direction, a public function
  nobody declared. The generated files come from `scripts/gen-surface-*.mjs`, which read the
  specification alone, and each has a `--check` staleness guard. **A new public operation is a spec edit
  first**: declare it in `openRPC`, regenerate, and only then implement it in all three.

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
| Subagents (Claude-only, no `.agents/` equivalent) | `.claude/agents/<name>.md` | directly |

Two subagents carry the fixed half of the delegations this repository repeats: `ref-id-port-implementer` (one
change in one of the three implementations, behind that language's gate) and `ref-id-reviewer`
(read-only review before merge). Their frontmatter pins `model` and `effort`. A per-call `model` overrides the
definition, so a call omits it — except to escalate `ref-id-port-implementer` to `opus` after its gate failed.
Findings reach `ref-id-port-implementer` already triaged: deciding which review findings stand is the caller's.

Agent tooling is the `vibe-ops` plugin — no per-repo copy of anything it ships. The one skill this
repository owns is [`identify`](.agents/skills/identify/SKILL.md), which decides whether something can be
identified under the scheme and produces the identifier. Closing a task goes through
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

  ```text
  // SPDX-License-Identifier: Apache-2.0
  ```

  Follow the existing pattern in the file's neighbors; don't invent a different header style.
