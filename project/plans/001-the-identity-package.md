---
vibe-ops-template: plan@3
---

# Plan-001: The identity package

| Field | Value |
|---|---|
| Status | In Progress |
| Created | 2026-09-06 |
| Author | Danilo Borges |
| Related | ADR-0001, ADR-0002, ADR-0003 |

---

## Summary

Several tools keep stores that need to point at each other and cannot: a node in a merged knowledge graph,
a reading stored by an observation framework, a detector composed by a governance tool, an agent package,
and whatever a citation checker emits. Each names things in its own way, and the graph names them worst of
all — measured before this plan, 94% of its identifiers came from a label a model inferred rather than
from anything a format declared. This plan builds the shared scheme: a specification published as data with
conformance vectors, and a first implementation that consumes it. The scheme itself is written — the
normative text is `docs/reference/the-ref-scheme.md`, the reasoning and the rejected alternatives are
`docs/explanation/why-a-declared-name.md`, and the machine-readable form is `spec/ref-id.json`. This plan
is how it gets built, proved against data already on disk, and published.

## Goals

1. A specification file — grammar with its declared dialect, dispatch and qualifier tables, digest
   canonicalisation, conformance vectors — carrying its own version, with the digest of its canonical
   serialisation beside it, so a second implementation is a port checked against vectors rather than a
   re-derivation.
2. A published package that consumes that file rather than restating any part of it, decomposing an
   identifier with one regular expression and delegating each captured part to the validator that already
   owns it.
3. The envelope and its one invariant enforced: an identifier carrying a digest is admissible only
   alongside an object whose members recompute to it.
4. Every identity already declared in code across the consuming tools expressible in the scheme without
   inventing a name that does not already exist.
5. The scheme proved against stored data: a report that reconstructs units from identifiers built out of
   the fields existing readings already carry.

## Scope

### In scope

The specification file and the package that consumes it. The envelope type and its invariant. A mapping of
the names the consuming tools already declare (a trait, an observation specification, a profile; a gate, a
composed entry, a governed record) onto the scheme. A reconstruction report run over a stored registry of
readings and over stored gate artefacts. Publication on an independent version line.

### Out of scope

**Adopting the scheme in any consumer.** Changing what a consumer stores or emits is that consumer's own
work, and each has a different cost. This plan owes them a package and a specification; it does not owe
them an integration.

**A Python port.** Anticipated for an extraction pipeline; the ports in scope are Swift and Rust (Decision
Log, 2026-09-07), and the grammar-level runners in `spec/conformance/` are what a Python port would start from.

**Computing a frozen-state qualifier.** The scheme accepts a SWHID and the parser validates its shape, but
producing one belongs to whatever writes the reading.

**Resolving the open corpus question.** Who declares the corpus for files with no provable name is
unresolved and is the one thing that blocks an exporter. The package works without an answer; an exporter
does not.

## Design

The scheme is specified in `spec/ref-id.json` and explained in `docs/reference/the-ref-scheme.md`; neither
is restated here. Three properties of it shape the tracks below.

It **wraps existing standards as intact faces** — a Package URL for a locator that a manifest proves, a
SWHID for a captured state, RFC 5147's placement for a positional refinement — so the package delegates to
validators it does not own and stays small enough to port.

It rests on one rule: **only what somebody declared receives an identifier.** A composition is a node in
its own package rather than a member's name with something appended, which is what bounds the identifier
space and is why a list never appears inside a name.

And it **degrades rather than refuses**: an unknown type yields `uncovered`, so extending the scheme later
is not a data-loss event for whoever already stored identifiers.

    flowchart TD
        S["identifier string"] --> R{"one regular expression"}
        R -->|"no match"| E["malformed"]
        R -->|"match"| V{"version in the<br/>supported range?"}
        V -->|"no"| U0["unsupported —<br/>decomposed, not validated"]
        V -->|"yes"| Q["validate qualifiers and refinements<br/>with the form that owns each"]
        Q -->|"a validator fails"| E
        Q --> T{"type in the<br/>dispatch table?"}
        T -->|"no"| U["uncovered —<br/>identifier stays readable"]
        T -->|"yes"| L["delegate the locator to<br/>the validator that owns it"]
        L -->|"fails"| E
        L --> P["parsed identifier"]
        P --> D{"carries a digest?"}
        D -->|"no"| OK["admissible"]
        D -->|"yes"| M["require the envelope;<br/>recompute the digest<br/>from its members"]
        M -->|"agrees"| OK
        M -->|"disagrees"| X["refuse at ingestion"]

The branch at the bottom is the one a reader most often misses. An identifier carrying a digest is a
promise that an object listing the members exists, and a promise nobody checks is a dangling pointer.
Recomputing at ingestion is what turns it into a verifiable claim.

**Three layers, and only two can be data.** The tables (dispatch, qualifier keys, fragment grammars,
resolution states, normalisation form) are data. The grammar is data, with a declared dialect and the
adaptations each regular-expression engine family may apply. Behaviour — order of validation, delegation,
normalisation, degrading rather than throwing — stays code, because encoding it as data means inventing a
rule language and maintaining an interpreter for it once per implementation, which multiplies the
divergence the data exists to prevent. The vectors bind behaviour instead, and they bind it where
implementations actually differ: an unknown type matches the expression perfectly, and nothing in the
expression says whether that yields a state or an exception.

**Where the code lives.** `packages/ref-id/src/` reads `spec/ref-id.json` (copied into the package at
build, digest-checked at load) and exposes `parse`, `serialise`, `build`, `digest` and
`validateEnvelope`; `packages/ref-id/test/` is generated from the vectors and holds no expected value of its
own.

## Tracks

- [x] **Track 1 — The specification file and the package that consumes it.** Two artefacts, not one. The
      file carries the grammar with its dialect, the tables, the digest canonicalisation, a `specVersion`,
      and vectors in five classes: `parse`, fixing what each input decomposes to; `roundtrip`, fixing that
      re-serialising returns the original bytes; `build`, fixing that a producer never lets a location into
      an identifier; `digest` and `envelope`, fixing Track 2. The package reads the file rather than
      restating it, and returns an uncovered result for an unknown type rather than throwing. Acceptance:
      every vector class passes; the grammar and the parse vectors agree in at least one other
      regular-expression engine through the declared adaptation.
- [x] **Track 2 — The envelope and its invariant.** The type an identifier resolves to, and the check that
      makes a digest a claim rather than a promise. Acceptance: a vector where a member's content changed
      and the set digest did not is refused; reordered members produce a different digest; a repeated
      member is not deduplicated.
- [x] **Track 3 — Mapping the names already declared.** Every identity the consuming tools declare in code
      is written in the scheme, in a table generated from the declarations rather than hand-maintained. At
      the end there is proof that no name had to be invented — and if one has to be, that is the finding,
      recorded rather than quietly fixed.
- [x] **Track 4 — Reconstruction against stored data.** A report builds an identifier for each stored
      reading from the fields it already carries and prints the distinct units it finds, plus the readings
      whose identifier could not be built and why. This is the track that can falsify the design, and it
      runs against real data rather than fixtures. It also answers the one question left open in the
      scheme: whether a reading taken under conditions nobody declared should be admitted, refused, or
      admitted and marked unattributable.
- [ ] **Track 5 — Publication.** The package publishes on its own version line with the specification
      embedded rather than fetched, carrying the digest of its canonical serialisation and refusing a file
      whose `specVersion` falls outside the range it declares. The registry is the one ADR-0003 names until
      the public release.
- [x] **Track 6 — Ports in Swift and Rust.** A Swift package at the repository root and a Rust crate under
      `crates/ref-id`, each embedding the specification, held to every vector class, and checked
      differentially against the TypeScript reference on the vectors and on generated hostile inputs.
      Acceptance: both gates green (`swift test`, `cargo test`), zero disagreements with the reference on
      the vectors, and the dialect each engine needed recorded in the specification's adaptations table.
- [ ] Run `/vibe-ops:close-plan` — retrospective against the goals, the demotion check, the tracking
      issue closed. The plan file itself is kept.

## Success criteria

- Every conformance vector class passes (`npm test` in `packages/ref-id` reports zero failures). Three fail
  loudly if a shortcut was taken: two sequences with the same members in different order produce
  **different** digests; a sequence containing one identifier twice does not deduplicate; the same declared
  name reached through two different file paths produces **identical** identifiers.
- An envelope whose members no longer recompute to its digest is refused. A run that accepts it is a
  failing run.
- The reconstruction report prints a unit count greater than zero **with an explicitly stated number of
  readings it could not identify**. A run that silently identifies everything is a failing run: it means
  the report is not checking.
- A deliberately altered copy of the specification file fails the digest test.
- The published package's dependency list requires no native runtime.

---

## Decision Log

- Decision: the scheme ships as versioned data with conformance vectors, and the code consumes it; only
  the tables and the grammar are data, behaviour stays code.
  Rationale: ADR-0001. Measured before the decision: the grammar ran in four regular-expression engines from
  one shared file — three accepted the canonical expression unchanged, the fourth after one declared
  adaptation, and all four agreed on every vector.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: the SWHID core form is validated by one pattern declared in the specification — the single
  exception to delegation.
  Rationale: ADR-0002. No maintained dependency-free validator exists on the registry.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: the grammar captures an optional version slot; a version outside the supported range parses
  to `unsupported`, never to malformed.
  Rationale: the prose declared a slot the expression could not match. Capturing it keeps the published
  expression the whole grammar and keeps behaviour out of a pre-parse step.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: the `#` of an identifier has URI-fragment semantics; a Package URL subpath's `#` is
  percent-encoded as `%23` inside the locator; a nested identifier used as a qualifier value is
  percent-encoded for `;`, `#` and `%`.
  Rationale: two different nested identifiers must yield two different outer identifiers, and the whole
  string must stay one shareable token. Encoding only `#` left a nested `;at=` breaking the split.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: adopting the scheme in any consumer is out of scope; each consumer decides its own timing.
  Rationale: the cost differs per consumer. Bundling them would make the cheapest adoption wait on the most
  expensive and give this plan a success criterion it cannot observe from here.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: discovery and mechanical edits are delegated; the boundary and the scheme are not.
  Rationale: sweeping stored readings, inventorying declarations and applying an edit under a contract that
  fits in a paragraph are cheap to hand off and easy to check. Deciding what the scheme admits has to agree
  with this plan's intent, and a subagent does not hold the plan. Vectors are the maintainer's; an
  implementer that disagrees with one reports it and implements what the vector says.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: the locator is the captured group verbatim, and the dispatch table declares how the string
  handed to a validator is formed — `type-prefixed` for `pkg` (the ref type token is also the Package
  URL's own scheme), `verbatim` for `folder`.
  Rationale: the prose said "an intact Package URL" while the expression, with `type = pkg`, captured the
  purl without its scheme; six vectors expected it restored and nothing said how. Found by the drift check
  on the public twin and by the port check in two engines, which disagreed with the vectors identically.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: there is no percent-encoding layer on a locator. A purl keeps its own encoding intact, and a
  value that needs `;` or `#` cannot be a locator — a Package URL subpath is not representable and the
  builder refuses it. This reverts the `%23`-in-locator choice taken earlier the same day.
  Rationale: with the `%23` layer, `build` was not injective — a locator carrying a literal `%23` and one
  carrying `#` produced one string — because purl already percent-encodes. Injectivity with a subpath
  would cost `%`→`%25` on every locator, doubling the encoding of canonical purls (`%2540scope`).
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: an identifier is one line (the expression excludes CR and LF); `digest` refuses a member that
  carries the join character; `validateEnvelope` refuses a requested identifier that parses `malformed`
  or `unsupported`.
  Rationale: three review blockers. Without the first two, `digest` was not injective over sequences;
  without the third, an envelope served under an unparseable identifier was admissible.
  Date / Author: 2026-09-06 / Danilo Borges

- Decision: two ports are in scope — Swift first, Rust second — and the Python port is dropped. The
  Swift package sits at the repository root (`Package.swift`, `Sources/RefId`, `Tests/RefIdTests`) because
  Swift Package Manager resolves a git dependency's manifest only at the repository root; the Rust crate
  sits in `crates/ref-id` under a root Cargo workspace. Each port embeds the specification and is held to
  the same vectors, plus a differential test against the TypeScript reference. The Python and Perl
  grammar checks stay in `spec/conformance/` as the proof of the declared dialects.
  Rationale: the maintainer's direction on 2026-09-07. The specification-as-data decision exists for
  exactly this; the grammar runners already written are the decomposition half of any port's test runner
  and are kept rather than rewritten.
  Date / Author: 2026-09-07 / Danilo Borges

- Decision: the freeze qualifier is `state` (was `at`) and a moment is its own qualifier, `when`, in
  RFC 3339 UTC; a reading without `state`, `by` or `over` is admitted and identified by its moment.
  Rationale: `at` reads temporal, and the identifier specifications that carry both axes keep them apart
  (DID Core `versionId`/`versionTime`, git `@{sha}`/`@{time}`). Measured: without a moment 800 of 801
  reconstructed readings collapse onto 43 observation specs, and a producer had already invented a
  reference format carrying a timestamp and a budget (481 readings). Renamed before any consumer
  exists, so the scheme stays at version 1.
  Date / Author: 2026-09-07 / Danilo Borges

- Decision: the corpus of a file is the nearest manifest that declares a name, written as an unversioned
  Package URL (`ref:pkg:npm/<name>#…`); `folder` is only for subtrees no manifest reaches. A governed
  record's fragment is typed, `<provider>/<type>@<template version>/<name>`, every part from the record's
  own front-matter stamp, and the provider of the type declares the form of `<name>` (a number for
  adr/rfc/plan/task, the front-matter `name` for log).
  Rationale: a manifest is a declaration, so finding it is not deriving from a path; unversioned, the
  Package URL names the living package and `state=` the frozen one, so a record's identifier survives
  releases. `adr@2` alone does not say whose ADR rule applies; the provider does. Measured: 90 of 226
  declarations lacked a corpus under the folder-only rule; under this rule only the workspace root's own
  `project/` still needs a declared `folder`.
  Date / Author: 2026-09-07 / Danilo Borges

- Decision: a gate reading is the composed entry plus its moment — `ref:pkg:npm/<ops package>;when=…#<ops>@<v>/<entry>` — never with the gate repeated in `by=`; a `finding` row is an attribute in the reading's `data`, never a node.
  Rationale: the composed entry already declares which gate it composes, so a `by=` naming the gate is the
  member repeated in the composition's name, which the scheme forbids and which made the identifier 150
  characters long. A finding is a count per rule for one run; it hangs off the run.
  Date / Author: 2026-09-07 / Danilo Borges

## Outcomes & Retrospective

**2026-09-07 — Tracks 1 and 2 landed.** `spec/ref-id.json` 1.0.0 carries 83 vectors (parse 41, roundtrip
15, build 9, digest 7, envelope 11) and a digest sidecar; `packages/ref-id` passes all of them plus the
three integrity tests (86 green), typechecks clean, and restates none of the tables. The grammar decomposes
every parse vector identically in three engines (ECMAScript, python-re with the one declared adaptation,
pcre2 via perl), which is the port-neutrality claim measured rather than asserted. Three things changed
against the original design while landing: the locator is the captured group with the delegated string
formed per type; there is no locator encoding layer; identifiers are one line and the producer-side API
refuses what the grammar cannot carry. Open at this point: a second adversarial review of the committed
package is in flight, and the ports (Track 6) have started.

**2026-09-07 — Tracks 3 and 4 landed; the design held.** The mapping generator writes 205 of 226 declared identities with no invented part; the 21 left are a name nobody declared (records without a template stamp, a profiles folder no manifest covers, sub-packages without a name, two per-run computed entries) plus one gap in the delegate rather than the scheme — Package URL has no type for a marketplace extension. The reconstruction over 6,254 stored records identifies 5,196 of them: with `when` admitted, 749 units in 801 instrument readings and 4,394 in 4,395 gate records, where the same data gave 43 and 15 units before a moment could enter the identifier. Every unidentifiable record is a name absent from every manifest; none is a defect of the scheme. The open question on undeclared conditions dissolved: conditions were never identifier material, and the consequence — readings that differ only in conditions collide — is what `when` resolves, with same-instant batches left as one unit by definition. Three rules landed from the measurement: `at` became `state` (a freeze) beside a new `when` (RFC 3339 UTC); the corpus is the nearest manifest declaring a name, unversioned, `folder` only where no manifest exists; the governed-record fragment is typed, `<provider>/<type>@<templateVersion>/<name>`, because heading text collides in over a third of governance nodes.

**2026-09-07 — Track 6 landed: Swift and Rust ports.** Both embed the specification byte-identically and pass every vector class (Swift 260/260 through a conformance executable, because the command-line toolchain ships no XCTest; Rust 9 tests over the vector file). Differential runs against the TypeScript reference agree on 292 of 294 hostile inputs; the two disagreements are the Swift purl validator's core grammar — written in-house because no maintained Swift purl library exists — on an `@` inside a namespace, recorded rather than patched over. The dialect table gained two measured rows: `rust-regex` and `swift-regex` need no adaptation, against `python-re` and `pcre2`, which need their end anchor replaced. Process: the two implementer delegations stalled or were killed twice; both ports were finished in the main loop from the vectors and the TypeScript source, which is the register entry, not a retrospective on the models.

---

## Open questions

*Both answered on 2026-09-07 — see Outcomes & Retrospective. Kept as written.*

**Who declares the corpus for the files with no provable name.** Measured over 722 markdown files across
ten repositories: 12.6% sit under a publishable package, 64.4% under a private one, and 23.0% have no name
at all — and a governance corpus is typically in the last group. The package works without an answer; an
exporter does not.

**Whether a reading taken under undeclared conditions is admissible.** A scan with parameters chosen for
one run has no node to be attributed to. Track 4 makes the case visible: a stored reading whose identifier
cannot be built is either this or a defect, and the report must say which.

## Related

- `docs/reference/the-ref-scheme.md` — the scheme this plan builds.
- `docs/explanation/why-a-declared-name.md` — why each rule is shaped that way, and the alternatives
  rejected with what would reopen each.
- ADR-0001, ADR-0002, ADR-0003.
