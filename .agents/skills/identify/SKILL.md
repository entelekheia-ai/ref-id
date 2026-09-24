---
name: identify
description: 'Decide whether something can be identified under the `ref:` scheme and produce its identifier. Use when a file, package, person, model or reading needs a name under this scheme; when a thought needs testing for whether it is identifiable at all; when identifiers already written down may have gone stale; when a type parses as uncovered and should gain a validator; or "/identify".'
---

# Identify a thing under the `ref:` scheme

Fires when something needs a name under this scheme, or when a name already written down needs checking.
At the end there is one canonical identifier, a refusal that says which judgement is missing, a report on
the identifiers a corpus already holds, or a registered type where an uncovered one was.

**This is a target-state skill** in each of its three modes. Minting the same target twice produces the
same identifier, a second sweep replaces the previous report, and covering a type already registered
changes nothing.

Four terms are used throughout. The **locator** is the segment after the type, handed verbatim to that
type's validator. The **fragment** is what follows `#`: the declared name inside the corpus. A
**qualifier** is a `key=value` pair after `;`. The **corpus** is whatever declares the name — a manifest,
or a subtree declared in the repository configuration.

## Step 1 — The target is established as a node, or the work stops here

This step is judgement and runs before the script. Five rules decide it, and each one refuses work that
the grammar would otherwise accept.

**Only what somebody declared receives an identifier.** A name declared inside a package, or a
composition a package declares by name, is a node. A relation between two nodes is an edge. What a
reading *found* — a verdict, a score, a count — is an attribute. Neither an edge nor an attribute gets an
identifier, and stopping here is a correct outcome of this skill — say so and stop. The conditions a
reading was taken under are a different thing and they belong in the name: `by=`, `over=` and `when=`
are what tell two readings apart, so a store keyed by identifier would collapse them into one without.

**The `#` cuts exactly one level below what the locator names.** What that level is depends on the type
of the item being cut — a folder's cut is a file, a file's cut is a declared name inside it, a sentence's
cut is a word. Descending a level pushes the previous one into the locator, so an identifier carries
exactly one cut, and **choosing where to cut is choosing what is being named**:

```text
ref:folder:acme-tools#docs/guide.md                 ← the item is the corpus, the cut is a file
ref:folder:acme-tools/docs/guide.md#Setup           ← the item is the file, the cut is a heading
ref:folder:acme-tools/docs/guide.md#Setup;lines=10,20   ← a refinement narrows within the cut
```

All three are correct; they name three different things. What is *not* correct is skipping a level —
cutting at the corpus and hanging a heading on it, which is what produces one identifier for every
`## Overview` in the tree, and leaves `state=` with nowhere to go but the corpus it is not about.

**A path in the locator is scope, not location.** The scope of a heading in a Markdown file *is* that
file — unlike a code symbol, whose language gives it a qualified name and whose fragment grammar
therefore says *"no path"*. Identity is where the cut was made; location is how a reader reached it from
outside the identifier, and a byte offset stays outside. In `pkg`, the path follows the version and has
no marker without one, so a file in a corpus nobody versioned is named through `folder`.

**A released version belongs in the locator.** The ecosystem declared `x@1.0.0`, so the version is part
of the name, and it goes wherever that type's grammar declares one — `pkg`, `url` and `unknown` carry it
after `@`, the three types whose `versionTail` the specification sets to `true`. `ai-model`'s `@` is not
one of them: `versionTail` is `false` there, because that character is a quantisation key on a served
model id, never a version. `state=` freezes content that was released
under no version — a commit, a SWHID, a content hash — so the two compose:
`ref:pkg:npm/x@1.0.0;state=swh:1:rev:…` is a conformance vector, and 25 of the 27 `pkg` vectors in the
specification carry a version. A version placed in `state=` is refused on arrival, because every `state=`
form takes a digest or a commit object name.

**A composition is a name in the package that declares it**, never a member's identifier with the
composition appended. Appending is what makes an identifier space grow without bound as nesting deepens.

**An identifier is a reference, not a copy of the record — so the default is no qualifier at all.** Read
it as `search(in: <type>:<locator>, for: #<declared name>, with: ;<qualifiers>)`. The locator and the
fragment are the pointer. Each qualifier is enrichment, and it earns its place by telling two records
apart or by showing up in a debug view. `by=` is enrichment too, added on top of a pointer that already
works. A nested identifier is a bare pointer: a type, a locator and at most a fragment. So an engine build
nobody recorded is a column (`engine_build = null`), and latencies, token counts and parameters are
columns beside the identifier as well:

```text
ref:ai-model:example-app/org/repo;thinking=no;by=ref:pkg:github/ggml-org/llama.cpp   ← write this
ref:ai-model:example-app/org/repo;by=ref:pkg:github/ggml-org/llama.cpp%3Bstate=none;latency-ms=812
                                                                                     ← a copy of the record
```

The grammar parses both lines `ok`. This skill writes the first shape only.

**The qualifiers are chosen here, before the script runs.** `state=` freezes the content the identifier
was read against and takes the forms `swhid`, `git`, `content-hash` or `none` — never a released version,
which the rule above keeps in the locator. `by=` names the instrument that produced a reading, as a
nested identifier or a `sha256` digest. `over=` names what the observation ranged over, and takes a
nested identifier, a `sha256` digest, or `unknown`. `when=` is RFC 3339 in UTC, and an offset is refused.
Declared absence and real absence differ: `state=none` is a declared level and so is `over=unknown`,
while `over=none` is refused, because a population over zero members and a population nobody recorded are
different facts.

The reasoning behind each of these, with the alternatives that were rejected, is in
[`docs/explanation/why-a-declared-name.md`](../../../docs/explanation/why-a-declared-name.md). Read it
when a rule above is disputed rather than applied.

## Step 2 — The deterministic half is answered by the script

```sh
node .agents/skills/identify/scripts/identify.ts mint --path <path> --fragment '<declared name>'
node .agents/skills/identify/scripts/identify.ts mint --path <path> --fragment '<name>' --root <dir>
node .agents/skills/identify/scripts/identify.ts mint --path <path> --corpus
node .agents/skills/identify/scripts/identify.ts mint --type <type> --locator <locator> \
  --fragment '<name>' --qualifier 'when=2026-01-01T00:00:00Z'
```

### Which type a file gets, and why the answer is not a preference

The locator reaches the file, so something has to say where it starts counting from. **One question
decides it: does a clean install of the package contain this file?**

| The package manager ships it | It does not |
|---|---|
| `ref:pkg:npm/x@1.0.0/README.md#Install` | `ref:folder:x/test/parse.test.ts#vectors` |
| The version is part of the name, because that release is where the file is | The package directory is the root, and its **base name** is the corpus name |

The question is answered by `npm pack --dry-run --json` — the list a publish would actually upload, so
the `files` field, the ignore files and every npm default are npm's answer and not a re-implementation
here. Getting that wrong fails in the direction that matters: a `pkg` identifier for a file the install
does not contain resolves to nothing.

Two consequences, both deliberate:

- **The corpus name is the directory's base name, never the manifest's `name`.** A scoped package name
  (`@acme/tools`) cannot be a declared corpus name, and cutting it to its last segment would put two
  scopes under one corpus. `--root` overrides the root for a subtree no manifest describes.
- **Nothing is written to disk to record the name, and nothing needs to be.** `ref:folder:xpto/etc`
  matches inside `xpto` and nowhere else; a reader that wants the bytes has to locate `xpto` itself,
  exactly as a reader of `ref:pkg:npm/x@1.0.0` has to reach a registry. The identifier names; resolving
  is the reader's half, and the scheme promises nothing about it.

It resolves the nearest manifest that declares a name, builds the Package URL from it, calls the
package's own `build()` and prints one JSON object. An identifier exits `0`; a refusal exits `2`.

Four facts about how it runs, none of them visible from the command:

- **A corpus it resolves is unversioned, and that rule is scoped to corpus resolution.** `mint --path`
  builds the Package URL from the manifest's `name` and leaves its `version` behind, so a record's
  identifier survives the releases of the package it sits in. Passing `--type pkg --locator npm/x@1.0.0`
  is the other act — naming a released artifact — and it is accepted and exits `0`.
- **It mirrors `spec/ref-id.json` into `packages/ref-id/spec/` before importing the package.**
  `loadSpec()` reads the copy beside the package, git ignores that copy, and a fresh checkout has none —
  so without the mirror every call fails on a clone.
- **It restates no table.** The dispatch entries, the patterns and the statuses are read from the
  specification through the package, which is the same rule that governs the source.
- **It guesses nothing.** Every question it cannot settle comes back as a named refusal carrying the
  evidence that produced it, so the next step answers one question instead of the whole problem.

## Step 3 — Each refusal is answered by name

| Refusal | What it means | What answers it |
|---|---|---|
| `no-such-path` | nothing is at that path | correct the path |
| `no-corpus` | no manifest reaching the target declares a name; `skipped` lists each one and why | pass `--type folder --locator <name>`, with a name matching `^[A-Za-z0-9][A-Za-z0-9._-]*$` — and read the paragraph below before choosing it |
| `manifest-not-purl-mappable` | a Swift package is named by its source host and organisation, which the manifest never carries | pass `--type pkg --locator swift/<host>/<org>/<name>` |
| `target-undeclared` | the corpus resolved; which declared name inside it is the target is still open | choose from `declaredNames`, or pass `--corpus` when the package itself is the target |
| `uncovered-type` | the type parses and no validator owns its locator | go to Step 5, or choose a registered type |
| `build-refused` | the grammar rejected a part; `part` names which | correct that segment |

**A `folder` locator is a bare declared name, and its pattern admits no `@`.** `folder` reaches Step 1's
version rule with nothing to place: it exists only where no manifest declares a name, so its subtree was
published under no version.

**A `folder` corpus has no declaration mechanism yet.** The specification says the name is declared by
"one line in the repository configuration, per subtree, nearest ancestor wins", and names no file, no
format and no key — checked across `spec/ref-id.json` and `docs/` on 2026-09-15, which found the sentence
and nothing that implements it. So a `folder` locator is supplied on the command line today, and where the
name came from belongs beside the identifier wherever it is stored. A subtree that needs one repeatedly is
the case that should produce the mechanism rather than another hand-passed name.

**`target-undeclared` on a governed record returns an empty candidate list, and that is correct rather
than a failure.** A governed record's declared name has the form
`<provider>/<type>@<template version>/<name>`, and the provider of the type declares the form of the last
part — which the record itself never carries. Supply the name; the file cannot.

## Step 4 — A corpus's stored identifiers are brought current

```sh
node .agents/skills/identify/scripts/identify.ts sweep \
  --exclude docs/ --exclude spec/ --exclude Sources/RefId/Resources/ --exclude crates/ref-id/spec/
```

It parses every `ref:` string in the tracked files under `--path` (the whole repository by default),
counts them by status, and lists each identifier whose status is other than `ok`, with the files holding
it.

**Exclude the files that teach the scheme.** A document explaining the grammar carries malformed examples
on purpose, and the specification's conformance vectors are counter-examples by construction — including
in the two mirrored copies the ports embed. A parser cannot tell a deliberate counter-example from a
defect, so the exclusion is a judgement the caller makes. Measured 2026-09-15 on this repository:
excluding only `docs/` and `spec/` still returned 36 malformed identifiers, every one a vector living in a
mirrored copy.

**The four excludes above are a floor, and the remaining findings are opened rather than trusted.** The
same measurement, run with all four, returned three findings and all three were teaching artifacts outside
every excluded path: a string literal in a port's conformance test asserting that the grammar stops at a
newline, and two truncated illustrations in prose. **Open the file each finding names before acting on
it.** A finding is a false positive when the file's job is to teach the grammar or to test it, and that
judgement belongs to a reader — the sweep reports position and status, never purpose.

## Step 5 — A type moves from uncovered to registered

```sh
node .agents/skills/identify/scripts/identify.ts cover <type>
```

It reports whether the type has a dispatch entry, which conformance vectors already use it, and the
fields the registered entries carry.

**An uncovered type is not a defect.** It parses, it is comparable, and it degrades to `uncovered` so
that a later extension never becomes data loss for whoever already stored identifiers. Register a type
when a validator should own its locator grammar — not merely because the type is in use.

Registering one is five things, in this order:

1. **State the admissibility test against the proposal, before anything else.** A type name must be one
   an unrelated party solving the same problem would have chosen identically. Ask two questions of the
   proposed name: would a second, unrelated implementer reach for this exact word — a product name fails,
   because claiming it is the point of proposing it — and does the word already belong to several
   unrelated activities rather than to one grammar — a short desirable word naming a general activity
   fails for that opposite reason. Either failure refuses the proposal outright, before the checks below
   run. The reasoning behind both failure shapes, and the types that already passed this test, are in
   [`docs/explanation/what-earns-a-type.md`](../../../docs/explanation/what-earns-a-type.md).
2. **Check the proposal against what was already rejected.** Eight alternatives were considered and
   turned down, each recorded with the condition that would reopen it, in
   [`docs/explanation/why-a-declared-name.md`](../../../docs/explanation/why-a-declared-name.md) under
   "Rejected, and what would reopen each". A proposal matching one of them is refused unless its reopen
   condition now holds.
3. **Add the `dispatch.<type>` entry** to `spec/ref-id.json`. The registered entries draw on seven fields
   in total, and `cover` prints that list from the live specification rather than from this page. Three
   are carried by every entry: `locator`, `validator` and `delegate`. A `verbatim` delegate also carries
   `pattern`, and a delegating one carries neither `pattern` nor `declaredBy`, because the owning format
   holds both. `declaredBy` says who declares the name, `corpus` says what lives under the type, and
   `reference` points at the grammar the validator delegates to — or, where none is published, at the
   survey that established there is none. Seven of the nine registered entries carry `reference`.
4. **Add conformance vectors** that bind the new grammar, including the inputs it must refuse.
5. **Reseal the specification** with `node scripts/seal-spec.mjs`. The package embeds the digest of the
   canonical serialisation and refuses a specification whose bytes disagree, so an edit without this step
   is a build failure.

## Checklist

- [ ] The target was established as a node in Step 1, or the work stopped with that said out loud
- [ ] No file path and no byte range entered the identity, and a released version stayed in the locator
      rather than being pushed into `state=`
- [ ] The qualifiers were chosen before the script ran, and declared absence was distinguished from
      absence
- [ ] Every qualifier tells two records apart, every nested identifier is a bare pointer, and every
      other attribute went to a column
- [ ] The script ran, and any refusal was answered by its own row in Step 3 rather than worked around
- [ ] A sweep excluded the files that teach the scheme, and every remaining finding was judged by opening
      the file it names
- [ ] A newly registered type passed the admissibility test and was checked against the eight rejected
      alternatives, carries vectors that bind its grammar, and was followed by a reseal

## ⟳ After every use: review this skill

**The corpus walk's weakest rule is the workspace exclusion.** This skill skips an ancestor manifest whose
declared workspaces exclude the target, and the specification's own dispatch text says the nearest manifest
declaring a name wins. Where a corpus comes back that a reader disputes, that disagreement is the evidence
the two readings differ — record which one the reader expected.

**The manifest ordering rests on no measurement.** Which manifest is tried first at a directory level is
chosen from the target's file extension, and a Swift manifest is held to Swift sources so that it stops
answering for every file the npm workspaces exclude. A repository whose layout defeats either heuristic is
the case that would correct this step.

**`target-undeclared` on a governed record returns an empty list by construction.** If a record type ever
declares the form of its own name inside the file, that emptiness becomes a defect rather than a fact, and
Step 3 is where the correction goes.

**The `folder` paragraph in Step 3 expires the day the declaration mechanism exists.** It asserts that the
specification names a repository configuration and defines none. A file, format or key that implements it
makes that paragraph wrong rather than merely dated, and the refusal row above it changes with it.

**Step 1's rules are stated over identity and exercised by one mode.** Each one is checked against the
manual `--type`/`--locator` path as well as `mint --path`, because the two modes reach different halves of
the grammar — a rule true of every corpus can be false of every released artifact, and the corpus mode
alone reports a pass either way.

**The sweep's identifier pattern trims trailing punctuation** so that an identifier ending a sentence
parses. A locator legitimately ending in one of those characters would be cut, and the tell is a
`malformed` finding whose `part` is the locator on a string that looks correct in its source file.

Verified against: `@entelekheia/ref-id` 0.3.0 and `spec/ref-id.json` as of 2026-09-16, nine registered
types; Node 26.6.0, which strips types from the script without a flag.
