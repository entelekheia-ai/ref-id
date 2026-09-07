# Why identity is a declared name, and what was rejected

The scheme itself is [`the-ref-scheme.md`](../reference/the-ref-scheme.md), and the authority for it is
`spec/ref-id.json` at the root of this repository. This page is the reasoning: why each rule is shaped the
way it is, and — the half that is usually lost — what was considered and ruled out, with what would reopen
each one.

## The question the scheme answers

A path answers *where is it*; an identifier answers *what is it*. While nothing is renamed the two have the
same answer, which is why the distinction stays invisible until it costs something.

Live identity is **a declared name inside a declared scope** — not a file path, and not a hash of content.
Three sources reach that independently. Kythe keeps a symbol's `signature` separate from its `path`. SCIP's
global symbol identity contains no file path at all. And a knowledge-graph pipeline built before this
scheme reached the same rule by measurement: per-file namespacing left **766 transitions dangling**,
because one agent's behaviour files share their states between them and the scope was the agent, never the
file.

A content hash is the opposite answer to a different question. It identifies the frozen past perfectly and
cannot identify a living thing, because every edit produces a new one. The scheme uses both: a declared
name for the living present, a SWHID in `;state=` for a captured state. Two separate investigations settled
the two halves three days apart — an archival-format comparison (2026-08-07) chose SWHID for the frozen
side, and a node-identity study (2026-08-10) chose the declared name for the living side.

## Why identity and content resolve together

An identifier carrying a digest is a promise that an object with those members exists. Without the
envelope, the promise is unverifiable and the digest is a dangling pointer.

The pattern is borrowed from DID: an identifier resolves to a document, and that document carries its own
identifier as a self-reference, so it cannot be served under a name that is not its own. What is *not*
borrowed is what that document is for — see [the rejection below](#did-as-the-resource-id-format).

## Why nesting is admitted and listing is not

Depth is bounded by the shape; width is bounded by nothing. And the storage cost of nesting is already
paid: identifiers are interned, measured at a **65–71% reduction** against storing the strings literally,
so a nested identifier costs one reference.

A list in a name has a second problem beyond length. Three detectors over one corpus produce **three
readings**, and an identifier naming all three is a batch header — under it, none of the three can be
compared with anything. If the combination was declared by somebody, it is a node with its own name; if it
was not, it is a digest. Either way the list does not belong in the name.

## Why a nested value stays inside the identifier

The alternative to encoding a nested `ref:` is putting it somewhere else — a side table, a second field, a
second string to carry alongside the first. Each of those makes the identifier stop being shareable: paste
it into an issue, a commit message or a log line and the part that says *which instrument* is missing.

So the nested value is encoded in place, and the encoding is injective. `%` is encoded first, then `;` and
`#`, which means two different nested identifiers can never produce the same outer identifier — and a
nested value that already contained `%23` comes back as `%2523` rather than colliding with one that
contained a literal `#`. The cost is one unreadable-looking span inside an otherwise readable string. That
is the trade: legibility of the outer name, at the price of a percent-encoded inner one.

## Why the `#` belongs to this scheme and not to purl

A Package URL has its own `#subpath`, and it means a file path relative to the package root. This scheme's
`#` means a declared name. Two meanings, one character — so one of them has to yield.

It is purl's that yields, because the declared-name path is the whole point of the scheme and the subpath is
an occasional extra. The `#` therefore has URI-fragment semantics throughout: a purl subpath has no
representation inside a `pkg` locator at all, since the locator excludes `#` and carries no encoding layer
that could smuggle it through — a builder given one refuses rather than guessing what was meant. The
alternative — letting the first `#` belong to purl and inventing a second separator for the declared
name — spends a new separator, and a new separator is one of the exactly two changes that mint a new
version of the scheme.

## Why a reading needs `by=`

A reading has three participants: the instrument, the corpus that was read, and the moment. A locator names
one thing, so an identifier without `by=` can express the instrument frozen at a moment, or the corpus
frozen at a moment, but not one reading the other.

The moment is its own qualifier, `when=`, in RFC 3339 UTC: a state says *which bytes*, a moment says
*when*, and the two never share a key — DID Core keeps them apart as `versionId` and `versionTime`, git as
`@{<sha>}` and `@{<time>}`. Two attempts fail without `by=`. Naming the instrument loses the corpus. Inventing a fragment such as
`#reading/<something>` invents a name nobody declared, which the scheme's central rule forbids.

## Why `by` and `over` are separate axes

Collapsing them makes two readings collide: same corpus, same population, different instruments, identical
identifier. Two axes, each independently a declared name or a digest, keep them distinct and keep the
difference legible.

The asymmetry between the two forms is a useful signal rather than a defect: a `by=` that is a digest and
recurs every week is evidence the combination deserved a declared name.

## Why order is significant

A sequence can be read as an unordered set by sorting; an unordered set cannot recover an order it never
kept. The asymmetry runs one way, so the ordered reading is the default and the cost — a producer that must
not reorder — falls on the side that can bear it.

## Why the digest never reads content

The alternative does not scale and does not need to. Content state belongs to each member, and for
version-controlled content it is already computed: SWHID hashes are git-compatible, so the blob sha the
index holds *is* the member's captured state. A set of terabyte files costs the same as a set of small
ones, because the digest never leaves the identifier strings.

Related tools agree by example: git LFS stores a pointer with an oid and a size rather than the content;
Nix and Bazel hash declared inputs rather than large outputs.

## Why the specification file's digest lives in a sidecar

A file that carries its own digest cannot be verified without first deciding which bytes to exclude, and
that decision is a second canonicalisation — one that would be exercised by nothing except the verification
step itself. A sidecar keeps the canonicalisation single: the digest covers every byte of the file, and the
file is unaware of it.

## Why an unknown type parses

An implementation that raises on a type it does not know makes every later extension a data loss for
whoever already stored identifiers. So the failure modes are ranked instead: `malformed` for something that
broke its own grammar, `unsupported` for a version this implementation cannot judge, `uncovered` for a type
it has never heard of, and `ok` for the rest — with the strictest reading winning when more than one
applies. An `uncovered` identifier is still decomposed, still comparable and still round-trips.

The same reasoning makes an unsupported version stop validation rather than fail it. A later version may
define parts today's implementation cannot judge, and judging them anyway reports a failure that is not
there. That is also why the ranking has one qualification: an unsupported version outranks the validator
failures below it, because on that path no validator ever runs.

## Why unresolved is a value

Two repair mechanisms existed in a graph pipeline built before this scheme, and both existed only because
its model could not express "not resolved": one contract rule pruned a node whose origin had left the disk,
and one repair script guessed which existing file a mistyped path had meant. The first resolves dishonestly
by deletion, the second by invention.

With state as a value on the edge, an orphan is labelled instead of being silently carried or silently
deleted. A view with no broken links remains available as a **filter** (`status == resolved`), rather than
as an invariant somebody must maintain in real time — which is the trade this makes against a neighbouring
design whose strict referential-integrity rule requires exactly that real-time synchronisation, and which
declares that synchronisation out of scope in the same document.

---

## Rejected, and what would reopen each

This section exists because each alternative below was considered seriously, ruled out, and then proposed
again later by somebody who had no record of the first rejection. They were recovered from the 2026-08-07
working transcript, where a write-once discipline had stripped them out of the design document.

### A Package URL as the whole scheme, not one locator face

Its `#subpath` is specified as a file path relative to the package root. So `#RelayClient/send` parses
without error and means the wrong thing — an SBOM scanner reads it as the file `RelayClient/send`. A silent
semantic collision is worse than a syntactic one. It also has no temporal axis for an unpublished commit,
and canonical purl percent-encodes a scoped npm name's `@` to `%40`, pushing encoding into the readable
part.

**Reopens if** purl gains a symbol-anchor qualifier distinct from a subpath.

### A `tag:` locator carrying the year of authority

Proposed as `tag:example.org,2026:governance` (RFC 4151) to fix the fact that a `folder` corpus is a claim
with no provable owner: whoever controlled the domain in that year is a permanent, attributable coiner.

Rejected two turns later for inconsistent rigour. The most verifiable face of the scheme — purl — does not
date authority either: registry names change hands, and the resolution is a lockfile and an integrity hash,
which is the captured-state mechanism this scheme already has. One temporal mechanism, not two.

**Reopens if** corpus authorship needs to be provable rather than merely declared.

### DID as the resource-id format

Investigated deliberately as a control check, and rejected on three counts. A DID resolves to a DID
Document of cryptographic keys and service endpoints, which is the wrong target for a markdown heading. DID
identifies **controllers** — people, organisations, agents — rather than content fragments. And its entire
value is cryptographic proof of control, a question this substrate does not have: the verifiability
question here is whether a registry answers for a name, which purl answers by construction.

What was kept: the resolution pattern (identifier → document carrying its own identifier) and the
self-reference field. What was kept for a *different* question: `did:web:<the corpus owner's domain>`,
resolved through `/.well-known/did.json`, as a way to prove *corpus authorship* — the same mechanism an
adjacent agent-identity specification proposes for its first tier.

**Reopens if** proving control over a corpus becomes a requirement.

### A corpus derived from the filesystem, the repository, or the remote

Each fails on a measured case. A corpus derived from the enclosing directory tree makes every identifier
depend on one machine's layout, breaking the rule that a repository must stand alone when cloned. A
remote-derived corpus fails for a repository that has no remote — a measured case, not a hypothetical. A
path-derived corpus fails because a `file:` link between two repositories puts the same content live under
two corpora at once.

One corpus per repository also failed: measured over one repository, 49 files sit under a public package
and 154 above any package. Corpus is per subtree, by nearest ancestor.

**Does not reopen.** The corpus is declared, and declaration is what all three failures point at. A manifest
is a declaration: the nearest package manifest that declares a name is the corpus, as an unversioned
Package URL, so "discovering" the corpus means finding that manifest, never deriving it from the path.
`folder` remains for the subtrees no manifest reaches.

### An integrity qualifier on the reference

RFC 5147 offers `length=` and `md5=` so a reader can detect that the target moved since the reference was
written.

Redundant here: when a member carries `;state=`, verification is comparing the current captured state against
the recorded one — the same function without a new field. And when a member carries no `;state=`, the problem
is not integrity but the absence of state, which a checksum would appear to cover without covering.

**Reopens if** a member type exists that cannot carry a captured state but must still be verifiable. If it
does, BLAKE3 rather than md5 — faster, and with partial verification through its internal tree.

### A cardinality qualifier

Proposed as a cheap readability aid — how many members, without recomputing the digest. It became ambiguous
the moment a second digest-carrying qualifier existed: cardinality of which set? Disambiguating would mean
new syntax for a convenience.

Cardinality lives in the object the digest names, beside the members.

**Reopens if** a reader needs the count without fetching the object, and a non-ambiguous spelling is worth
the syntax.

### A shared compiled core

Compiling the parser once and consuming it elsewhere through WebAssembly or an FFI. The parser is one
regular expression and a dispatch — a few hundred lines in any language — while sharing it as a binary
places a runtime dependency, an initialisation step and a string boundary inside every consumer.

What is shared instead is the data: the grammar with its declared dialect, the tables, and the conformance
vectors. Behaviour stays code, held to the specification by the vectors rather than by prose. Measured
before the decision: the grammar ran in four regular-expression engines from one shared file — three
accepted the canonical expression unchanged, the fourth after one declared adaptation, and all four agreed
on every vector. Since then the ports measured the anchor semantics as well: `$` matches before a final
line break in Perl and Python but not in ECMAScript, Rust or Swift, so the specification declares five
dialects — three that take every pattern unchanged and two that replace the terminal anchor (Python also
renames its named groups). Every one of the five decomposes every parse vector identically.

**Reopens if** either genuinely engine-shaped part — computing a SWHID, or interning the identifier tree —
moves into the shared surface.

### stack-graphs as a dependency for resolving code edges

Read and rejected: the upstream repository is archived.

**Reopens if** it returns to maintenance, or an equivalent with the same scope-resolution model appears.

## Where the scheme breaks

**Renaming a declared name changes the identifier.** That is semantically correct — the link's target
stopped existing under that name — and the operational consequence is that "rename everywhere" is a write
to the graph, not a move that preserves an identifier. Whoever performs it rewrites the incoming edges in
the same transaction. A declared `alsoKnownAs` makes the reconciliation explicit; reconciliation by
similarity remains rejected.

**A declared name collides inside one document, rarely.** Measured over one repository's governance corpus:
162 markdown files, 1,175 headings, **2 collisions within the same document — 0.17%**, both in one file. An
ordinal tie-break resolves it without touching the common case.

**Most of the corpus has no provable name.** Measured over 722 markdown files across ten repositories:
12.6% under a publishable package, 64.4% under a private one, 23.0% with no name at all. So this is not
global verification — it is **local disambiguation with a declared promotion path**, and verification is a
bonus that 12.6% gets. The governance corpus that motivates the whole substrate is the one with the least
guarantee.

## Open

**Who declares the corpus for the 23% of files that sit under no package at all.** It was named as the one
question that blocks an exporter, and it is still open.

**Who governs the type registry.** The dispatch table is extensible by construction, and nothing says who
may add to it. Perpetual work, with a single maintainer today.
