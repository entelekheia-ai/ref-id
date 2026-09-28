---
name: attack
description: 'Attack every ref: implementation with hostile input and report what an attacker can make each one do — crash, hang, cost super-linear time, confuse two identities, trip on corrupted bytes, admit a forged envelope, trust a hostile specification file. Use before merging or releasing a change to how any implementation reads bytes, numbers, Unicode, Package URLs or the specification file; when asked for a security review of ref-id; or after an implementation is added.'
---

# Attack the implementations with hostile input

Fires before a change that touches how the TypeScript, Rust, Swift or Python implementation reads its
input merges or ships, and whenever someone asks what hostile input can do to them. At the end there is a
report: every finding with a one-line reproduction, a severity and a proposed fix, and a table of seven
threat classes against every implementation, each cell found, checked clean with what ran, or not checked.

This skill fits neither kind. A second run takes a fresh reading of the implementations as they then
stand; it repairs nothing and records nothing beyond the report it produces.

The differential (`npm run test:differential`) already proves the implementations agree on every input
the vectors name. This skill asks a different question: what an attacker who controls the input can make
each implementation do. The attacker controls identifier strings given to `parse`, `serialise`,
`canonical_identifier` and the relations; the parts given to `build`; the envelope given to
`validate_envelope`; the values given to `canonicalise` and `digest`; and a specification file given to
`load_spec_from`. The attacker does not control the embedded specification.

All scripts live in `scripts/` beside this file and resolve the repository from their own location, so
they run the same in the main checkout and in a worktree. Run them from the repository root. Write every
scratch file under a temporary directory, never into the repository, and never use `git stash`: the stash
stack is shared with every worktree and every agent working beside you.

## Step 1 — Every implementation is built once

```sh
sh .agents/skills/attack/scripts/build.sh
```

It prints one line per implementation — `typescript: built`, `rust: …`, `swift: …`, `python: …`. A
failed build stops the review: a probe against a stale binary judges code that is no longer there.

## Step 2 — The implementations agree on hostile corpora, or each disagreement is a candidate

Build four corpora and run each through every implementation's line protocol:

```sh
S=$(mktemp -d)
A=.agents/skills/attack/scripts
node $A/corpus.mjs vectors            > $S/vectors.txt
node $A/corpus.mjs marks              > $S/marks.txt
node $A/corpus.mjs fuzz 20000 7       > $S/fuzz.txt
node $A/corpus.mjs fuzz 6000 11 --pairs > $S/pairs.txt
node $A/compare.mjs $S/vectors.txt
node $A/compare.mjs $S/marks.txt --browser
node $A/compare.mjs $S/fuzz.txt
node $A/compare.mjs $S/pairs.txt --pairs
```

`marks` glues a combining mark, a zero-width joiner and a keycap to every separator — the corpus that
catches an engine matching by grapheme cluster instead of by Unicode scalar. `fuzz` mutates every `ref:`
string the vectors carry; quote the seed beside any finding it produced, so it can be regenerated. Change
the seeds on a later run: the same seed reads the same corpus.

Each run ends with a verdict line, and the verdict decides what happens next:

| Verdict | Do |
|---|---|
| `agree` | nothing — record the corpus as checked clean |
| `package-url-edge-only <n>` | read the listed groups against the known edges below; a group outside them is a candidate |
| `disagree <n>` | every group is a candidate: reproduce it (Step 6) |

The four Package URL validators are different software and part at the edge — `packageurl-js`,
`packageurl-python`, the `packageurl` crate and the Swift port's in-house grammar. `compare.mjs` lists a
difference as an edge when it sits on a `pkg` locator and only in `status`, `part`, `serialised` or
`canonical`, and, in `--pairs`, when either member already parts that way on its own. **An edge is still
read, not skipped.** A validity difference is exempt; two different identifiers reaching one
`canonical` in the same implementation is identity confusion (class 5) even when it sits on the edge.

## Step 3 — No hostile value crashes a process or escapes as an undeclared error

```sh
node --experimental-strip-types $A/crash/ts.ts
node --experimental-strip-types $A/crash/ts.ts --browser
(cd python && uv run python ../$A/crash/py.py)
sh $A/crash/rust.sh
sh $A/crash/swift.sh
```

Each battery prints one line per case. What each line means:

| Line | Meaning |
|---|---|
| `OK`, `decl` | the call returned, or refused with a declared `RefIdError` |
| `typed` | a call the type checker refuses (labelled `ill-typed …`) failed some other way — reported, not a finding |
| `ESCAPE` (TypeScript, Python) | an undeclared exception type left the public API — a finding |
| `exit=None` or non-zero (Rust), `SIGNAL` (Swift) | the process aborted — a finding, unless the case is named `in-memory-…` |

A case named `in-memory-…` builds a value no JSON parser produces — `serde_json` stops at depth 128,
`JSONSerialization` at 512 — so an abort there is recorded in the table as reachable only from code that
builds the value itself. The Rust and Swift batteries write their manifest into a scratch directory at run
time, pointing at this checkout, so nothing committed names a machine path; `REFID_SCRATCH` chooses that
directory.

The batteries also cover class 4 (corrupted bytes in the specification file: a byte-order mark, invalid
UTF-8, truncation, deep nesting, a 5000-digit number, an uppercase or padded sidecar, a duplicate key),
class 6 (envelopes with inherited keys, arrays, non-string members, a digest inside a nested qualifier) and
class 7 (a hostile file through `load_spec_from`). **Add a case to the battery of each language** when a
change introduces an input shape none of them builds — the batteries grow with the attack surface.

## Step 4 — No input costs super-linear time

```sh
node $A/timing.mjs all
node $A/backtrack.mjs
(cd python && uv run python ../$A/backtrack.py)
```

`timing.mjs` feeds one generated identifier per size (10k, 100k, 1M characters by default) to every
implementation and ends each generator with `verdict <generator>: linear` or `super-linear <implementation>
×<growth>`. Growth is judged between the two largest sizes; more than three times the size growth, or a
timeout, is super-linear. `TIMEOUT` (seconds) bounds each run. Add a generator when a change introduces a
repeatable shape — a new qualifier, refinement or form.

`backtrack.mjs` pumps every pattern the specification declares through V8's engine, and `backtrack.py`
through the Python port's own compile path, with the `python-re` adaptation applied. Each ends with
`suspects <n>`; each suspect names the pattern, prefix, pump and suffix. Rust's `regex` is linear by
construction; Swift's `Regex` backtracks, and its patterns compile inside the runner, so `timing.mjs` is
what reaches it.

## Step 5 — No input amplifies memory

For each generator in `timing.mjs` and each implementation, compare the length of an output line with the
length of its input: percent-encoding may triple a character and nothing else in the scheme should grow an
identifier. An output more than three times its input, or a process whose memory grows faster than its
input across the timing sizes, is a finding. Where no generator exercises a new shape, say so in the table
rather than marking the class clean.

## Step 6 — Every candidate is reproduced and graded

A candidate becomes a finding only with a reproduction a reader can paste: one command and its output,
for the implementation that fails and, beside it, for the TypeScript reference. Grade by what a caller
meets:

| Severity | When |
|---|---|
| BLOCKER | a crash, a hang, an undeclared error or an identity confusion reachable from an identifier string |
| SHOULD | the same reachable only through `build`, an envelope, `canonicalise` or a specification file; a cost cliff; an implementation disagreeing with the reference outside the known edges |
| NOTE | reachable only from code that builds the value itself, or a difference with no consequence for a caller |

For each finding, say whether the change under review introduced it or it predates it (`git log -S` on the
line, or the same probe on the base commit), and propose the fix. A fix that changes what an identifier
means is a specification change first — a rule and a vector in `spec/ref-id.json` — and every
implementation follows it; a fix inside one implementation's code is that implementation's.

**Known edges — read, never re-reported as new:**

- The Package URL validity verdict differs per implementation: `packageurl-js` accepts an empty name after
  a namespace and a version ending in `/`, which the Rust crate and the Swift grammar refuse;
  `packageurl-python` refuses the empty name and accepts the trailing `/`; the libraries also differ on
  scoped names (`npm/@x@1.0.0`), stray `%` sequences and whitespace in the type.
- `serialise` and `canonical_identifier` of a result malformed at an undeclared qualifier key raise
  `SpecVersionError` rather than `SerialiseError`, in every implementation alike.
- A lone surrogate has no vector: a JSON string holding one stops the Rust crate from loading the
  specification, and neither a Rust nor a Swift string can hold one. TypeScript and Python pin it with
  unit tests.

## Step 7 — The report is written, and every finding has a destination

Write the report in this order: findings, most severe first, each with implementation, `file:line`,
severity, reproduction, introduced-or-predates, and proposed fix; then the table below; then what was run,
with the seeds and sizes, so the next run can widen it.

| Class | TypeScript (Node, browser) | Rust | Swift | Python |
|---|---|---|---|---|
| 1 Crash or abort | | | | |
| 2 Super-linear cost | | | | |
| 3 Memory amplification | | | | |
| 4 Corrupted bytes, lone surrogates | | | | |
| 5 Identity confusion | | | | |
| 6 Envelope bypass | | | | |
| 7 Specification-loader trust | | | | |

Each cell reads `found (<finding>)`, `clean — <what ran>` or `not checked — <why>`. A cell left empty reads
as clean to the next reader, which is the one result this table must never produce by omission.

A finding that fits the change under review goes back to it as a follow-up. A finding that widens the
change, or changes what an identifier means, goes to the maintainer as a question with options, before
anyone implements it.

## Harness traps

- **In `zsh`, a command held in a variable is one word.** `$cmd < input` runs nothing useful; call the
  scripts here, which pass arguments as arrays, or wrap a loop in `bash -c`.
- **Never print a lone surrogate from a harness.** Python's `print` raises `UnicodeEncodeError` on one,
  and the battery then reports its own printing as the implementation escaping. `crash/py.py` reconfigures
  `stdout` with `backslashreplace`; a probe written by hand needs the same.
- **Build a surrogate in Python with `chr(0xD800)`,** never by writing the escape in a string the shell or
  an editor may already have joined into one character.
- **Python's integer conversion refuses more than 4300 digits by default, and a host may lower it** with
  `PYTHONINTMAXSTRDIGITS` (minimum 640). Probe long digit runs with that variable set to 640.

## Checklist

- [ ] `build.sh` printed a line for each of the four implementations
- [ ] The four corpora ran through `compare.mjs`, the seeds are in the report, and every group outside the
      known edges was reproduced or dismissed with its reason
- [ ] All five crash batteries ran; every `ESCAPE`, abort or `SIGNAL` outside an `in-memory-…` case is a finding
- [ ] `timing.mjs all` and both backtracking searches ran, and their verdict lines are in the report
- [ ] Every finding carries a pasteable reproduction, a severity, introduced-or-predates and a fix
- [ ] Every cell of the class table is filled — found, clean with what ran, or not checked with why
- [ ] No scratch file was written into the repository and `git stash` was never used

## ⟳ After every use: review this skill

**The step most likely to fail silently is Step 2's edge rule.** `compare.mjs` files a Package URL
difference under the edge section, and a real identity confusion on a `pkg` locator lands there too;
read the edge groups for two inputs reaching one `canonical`, and tighten the rule in `compare.mjs` if a
run shows it hiding one.

**Step 5 has no script.** Memory amplification is judged by reading lengths, and no run has yet produced a
finding in that class to test the reading against. The first run that does should turn the reading into a
check in `timing.mjs`.

**A generator, a corpus or a battery case that stops finding anything is still worth keeping** — it is the
regression test for the last thing it found. Remove one only when the input shape it builds leaves the
scheme.

Verified against: Node 26, Rust stable, Swift 6 (Command Line Tools), CPython 3.14 and 3.11 through `uv`,
spec 1.6.0, 2026-09-28.
