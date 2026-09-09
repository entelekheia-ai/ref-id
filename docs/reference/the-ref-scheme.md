# The `ref:` scheme

Precise description of the identifier scheme and of the envelope an identifier resolves to. The reasoning
behind each rule, and every alternative that was ruled out, is in
[`why-a-declared-name.md`](../explanation/why-a-declared-name.md).

Key words — **MUST**, **MUST NOT**, **SHOULD**, **MAY** — follow RFC 2119.

**The machine-readable specification is `spec/ref-id.json` at the root of this repository, and it is the
authority.** This page explains that file; where the two disagree, the file wins. Nothing here is a second
copy of a table an implementation reads: the tables reproduced below are quoted to be explained, and an
implementation **MUST** read them from the specification file rather than from this page.

## The shape

```text
ref:[<version>:]<type>:<locator>[;<qualifier>=<value>]*[#<declared-name-path>[;<refinement>=<value>]*]
```

```text
ref:pkg:npm/@acme/scanner-core@0.1.0#Observation
ref:pkg:npm/@acme/scanner-trait-citation-fidelity@0.0.1#citation-fidelity@1/not-invented
ref:folder:acme-governance#learnings/a-chunk-carrying-no-answer-means-death-or-health
ref:folder:acme-governance;state=swh:1:rev:7e29bb6000000000000000000000000000000000;by=sha256:41b9caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

One regular expression decomposes it. Each captured part **MUST** then be handed to the validator that
already owns that format — a Package URL parser for a `pkg` locator, a SWHID validator for a `state` value,
and so on. **No part of this scheme re-implements a grammar another specification already defines.** One
exception to *delegation* is declared, and only one: the SWHID core form, validated by a pattern the
specification file carries itself (see [Delegation](#delegation-and-its-one-exception)). Formats this
specification owns outright — the corpus name, the `sha256:` form, the refinement values — are validated by
patterns the file declares, and are not exceptions to anything.

## The expression

Quoted verbatim from `grammar.expression`:

```regex
^ref:(?:(?<version>[0-9]+):)?(?<type>[a-z][a-z0-9+.-]*):(?<locator>[^;#\r\n]+)(?:;(?<state>[^#\r\n]*))?(?:#(?<fragment>[^\r\n]*))?$
```

The `ref:` prefix is mandatory; a string without it does not match, and is `malformed`. `locator`, `state`
and `fragment` all exclude CR and LF: one identifier is one line, and a string that spans two is
`malformed` at `grammar`.

The declared dialect is `ecmascript-2018`, and the file carries the adaptation each other engine needs, as
a literal replacement rather than as prose. An implementation on a different engine **MUST** apply that
engine's declared adaptation and **MUST NOT** rewrite the expression by hand. Five dialects are declared,
each measured on every parse vector: `ecmascript-2018`, `rust-regex` and `swift-regex` take every pattern
unchanged; `pcre2` replaces the terminal `$` with `\z` and `python-re` replaces `(?<` with `(?P<` and `$`
with `\Z`, because in those two engines `$` also matches before a final line break, which would admit an
identifier the canonical dialect refuses. The adaptations apply to every pattern in the file — the
expression, the pair grammars, the forms, the dispatch and refinement patterns — not only to the
expression.

Five capture groups, in order: `version`, `type`, `locator`, `state`, `fragment`.

| Group | Contains | Absent means |
|---|---|---|
| `version` | bare digits before the type | version 1 |
| `type` | the dispatch key — lowercase letter first | — (required) |
| `locator` | the text after the type separator, up to the first `;` or `#` | — (required, non-empty) |
| `state` | the qualifier list, `;`-separated | no qualifiers |
| `fragment` | the declared-name path and its refinements | no fragment |

Both `state` and `fragment` are then split on `;`, and each pair **MUST** match
`^(?<key>[a-z][a-z0-9-]*)=(?<value>.*)$`. Inside a fragment, the text before the first `;` is the
declared-name path, taken verbatim.

An empty `state` (`ref:folder:acme-governance;`) or a qualifier with no `=` **MUST** be reported
`malformed` at part `state`, and an empty `fragment` (`ref:folder:acme-governance#`) `malformed` at part
`fragment` — never treated as absent.

### What each type's validator receives

The `locator` group is the captured text, verbatim: nothing is added to it and nothing is stripped from it
before it is reported. `encoding.locator.reserved` is empty — there is no locator encoding layer — and the
file's own note says why: a locator is handed to its validator exactly as captured, so a format's own
percent-encoding stays the format's own (`ref:pkg:npm/%40acme/x@1.0.0` keeps its `%40` untouched), and a
value that needs `;` or `#` cannot be a locator at all.

What the validator is handed instead of the bare locator is answered by `dispatch.<type>.delegate`, and
`delegation` documents both forms:

- **`type-prefixed`** (`pkg`): the validator receives `<type>:<locator>` — the ref type token doubles as
  the Package URL's own scheme, so `ref:pkg:npm/x@1.0.0` reports locator `npm/x@1.0.0` and delegates
  `pkg:npm/x@1.0.0`.
- **`verbatim`** (`folder`): the validator receives the locator alone.

A parse result that dispatches carries the delegated string as `delegated`.

## The version slot

Bare digits, omitted for version 1. `version.default` is `1` and `version.supported` is exactly `[1]`:
version 1 is the only identifier version this document defines. Every identifier written today therefore
carries no version prefix, and an explicit `ref:1:` **MUST** parse to the same version as its omission — it
is spelling, not a different identifier class. A parse **MUST** report which spelling was used
(`explicitVersion`), because the identifier round-trips as written.

Digits and not a letter-led token, because a `type` **MUST** begin with a lowercase letter, so a leading
digit can only be a version. The letter-led alternative parses without error and means something else:
`ref:v2:pkg:npm/x` is type `v2` with locator `pkg:npm/x`, and therefore `uncovered`.

A version outside `version.supported` — `ref:2:` today — **MUST** parse to status `unsupported`, never to
`malformed`, and its qualifiers and fragment **MUST** be decomposed and carried through **unvalidated**. A
future version may define parts this implementation cannot judge, and judging them anyway invents a
failure.

Exactly two changes mint a new identifier version, and with it a new `specVersion` major: a change to
**normalisation or percent-encoding**, and a change to the **separators or the shape**. Everything else is
an addition through the extension points below.

**One addition is not soft on an older reader, and it is the one with no extension point.** An
unregistered type parses `uncovered`, an unknown qualifier key and an unknown refinement are carried
through, and an identifier naming a later version parses `unsupported` — each a status that says *not mine
to judge*. There is no equivalent for a **form**: a qualifier's `forms` list is closed, so a reader on an
older `specVersion` meeting a value from a form added since gets `malformed` at that qualifier — a hard
failure on an identifier that is well formed under the version that minted it. `over=unknown`, added in
1.2.0, is `malformed@over` to a 1.1.0 reader.

That is the intended behaviour and not an oversight: a form is what a value *means*, and carrying an
unrecognised one through would be admitting a claim nobody can check. But it makes a form the addition to
weigh hardest, and it is why a consumer pins `specVersion` rather than assuming forward tolerance.

**1.3.0 differs in kind from that, and is worth naming separately.** *Qualifier order does not
distinguish* changes no identifier's parse and mints no new one — every string valid before is valid now,
with the same decomposition. What it changes is which **pairs** of identifiers were always one thing. So a
1.2.0 reader is not wrong about any single identifier and is wrong about some comparisons: handed
`;a=1;b=2` and `;b=2;a=1` it reports two, where a 1.3.0 reader reports one. A consumer that only parses
needs nothing; one that compares, dedupes or indexes identifiers is the one that upgrades.

## Parse statuses

Quoted verbatim from `statuses`:

```json
["ok", "malformed", "uncovered", "unsupported"]
```

| Status | Means |
|---|---|
| `ok` | every part parsed, dispatched and validated |
| `malformed` | a part failed its own grammar or its owning validator — the failing part is reported |
| `uncovered` | the type is not in the dispatch table |
| `unsupported` | the version is outside `version.supported` |

### The order of evaluation

The status follows from one fixed order, and the order is what makes the precedence unambiguous:

1. **The expression.** No match → `malformed`, part `grammar`. This covers a missing `ref:` prefix
   (`pkg:npm/x@1.0.0`), a type that is not lowercase-led (`ref:Pkg:npm/x@1.0.0`) and an empty locator
   (`ref:pkg:`). An uppercase-led type is `malformed`, **not** `uncovered`: `uncovered` requires a
   well-formed type that the dispatch table does not list.
2. **The version.** Outside `version.supported` → `unsupported`, and **no validator runs from here on**.
3. **Decomposition.** `state` and `fragment` are split, and a list that cannot be split is `malformed` at
   `state` or `fragment`. Decomposition happens for every status: an `unsupported` or `uncovered`
   identifier still reports its qualifiers and its fragment.
4. **Dispatch.** A type absent from the table → `uncovered`. Validation of the parts still runs.
5. **Validators.** The locator against its declared form, each qualifier value against its declared forms,
   each known refinement against its pattern. Any failure → `malformed`, with the failing part reported.

Precedence, when more than one applies: **`malformed` > `unsupported` > `uncovered` > `ok`** — with the
qualification step 2 supplies. Only a **grammar-level** `malformed` (step 1) outranks `unsupported`,
because an unsupported version stops validation before any validator can fail. So
`ref:2:pkg:npm/x@1.0.0;state=<a seven-character SWHID hash>` is `unsupported`, even though that same `state`
value on a supported version is `malformed`.

Below `unsupported`, a validator failure does outrank an unknown type: `ref:doi:10.1000/182` carrying an
`state=` whose SWHID hash is abbreviated to seven characters is `malformed` at `state`, not `uncovered`. And an
uncovered type still carries its qualifiers and its fragment through, decomposed and comparable.

**An unknown type MUST NOT raise.** The identifier stays readable, storable and comparable, and the
relation that pointed at it takes the `uncovered` resolution state. Raising turns a later extension into
data loss for whoever already stored identifiers.

### The failing part

Quoted verbatim from `parts`:

```json
["grammar", "state", "fragment", "locator", "<qualifier key>", "<refinement key>"]
```

When the status is `malformed`, the reported part is one of:

| Part | Reported when |
|---|---|
| `grammar` | the expression itself did not match |
| `state` | the qualifier list was empty, or a pair had no `=` |
| `fragment` | the fragment was empty |
| `locator` | the locator failed its declared form |
| a qualifier key — `state`, `by`, `over`, `when`, … | that qualifier's value failed every form declared for it |
| a refinement key — `lines`, `item`, `para`, … | that refinement's value failed its pattern |

## Delegation, and its one exception

| Type | Locator form | Validated by | Use when |
|---|---|---|---|
| `pkg` | a Package URL, versioned or not | a Package URL parser, per the [Package URL specification](https://github.com/package-url/purl-spec) | the nearest manifest declares a name; unversioned, the Package URL names the living package and `state=` carries the frozen one |
| `folder` | a declared corpus name | `^[A-Za-z0-9][A-Za-z0-9._-]*$` | no manifest declares a name anywhere above the file |
| `domain` | `host[/segment…][@version]` — a host under the owner's control, then names the owner declares beneath it | host labels per RFC 1123, lowercase, internationalised labels in punycode; segments `[a-z0-9][a-z0-9._~-]*`; an optional `@version` on the last segment | the thing exists *as* a domain — a site, a portfolio, a case published under it: `ref:domain:portfolio.example/case-xpto@2#results`. The package that builds the site keeps its own `pkg` identity |
| `email` | an addr-spec, `local@host` | RFC 5322 dot-atom local part, host as above | a mailbox identifies a person or a role. Nothing lives under it: `ref:email:someone@mail.example/doctor` is malformed at the locator, because what a mailbox publishes belongs to the ecosystem that publishes it |
| `dot-agent` | an agent identifier, `namespace/name[:version]` | the agent-id grammar of that ecosystem: the namespace is a domain, a `platform/user` under a domain, a mailbox, or the literal `unknown`; the `~digest` of its full form travels as `state=` instead | an agent bundle: `ref:dot-agent:unknown/MentorUniversitario:1.4.1`, `ref:dot-agent:acme.example/doctor:v1.0;state=git:a1b2c3d4` |
| `ai-model` | the id the model is served under, verbatim | `^[A-Za-z0-9][A-Za-z0-9._:/-]*$` — declared-name, deliberately permissive: no published grammar names a hosted API model (Package URL registers only artifact-registry namespaces such as `huggingface` and `mlflow`; CycloneDX and SPDX 3.0's `AIPackage` both delegate identity to an ordinary purl or free text; OpenTelemetry's `gen_ai.request.model` is explicitly free text), and coercing a served name breaks the round-trip that makes it an identifier at all. `:` and `/` are both admitted — an Ollama tag (`llama3:8b`) and a hub-style name (`mlx-community/Qwen3-1.7B-4bit`) are both ids a real serving process accepts today | a served model, named exactly as its serving process names it: `ref:ai-model:Qwen3-4B-Instruct-2507-4bit`, `ref:ai-model:llama3:8b`, `ref:ai-model:mlx-community/Qwen3-1.7B-4bit` |

**The type names the naming system that owns the locator's grammar, and this table is the registry of
types.** A type absent from it — `ref:spotify:track/4uLU6hMCjMI75M1A2tKUQC` — parses to `uncovered`,
never to `malformed`: the identifier is carried whole and validated by nobody. Registering its validator
here is what promotes it to `ok`. A dotted namespace under `dot-agent` reads as the domain tier whether or
not the domain exists; whether it exists is the ecosystem's check, never the grammar's.

A Package URL's own `#subpath` cannot be represented as a `pkg` locator: the locator excludes both `;` and
`#`, so there is no encoding that lets a subpath through. A builder asked to build one **MUST** refuse,
naming the locator as the failing part.

A corpus name **MUST NOT** contain a path separator; `ref:folder:acme-governance/docs#AGENTS.md` is
malformed at the locator. An invalid Package URL is likewise malformed at the locator.

The SWHID core form is the single declared exception to **delegation** — the one format owned by another
specification that this file validates itself, because no maintained validator for it exists on the package
registry this implementation draws from. The file names the authority (the ISO/IEC 18670 core identifier)
and carries one pattern:

```regex
^swh:1:(cnt|dir|rev|rel|snp):[0-9a-f]{40}$
```

Core form only — no SWHID qualifiers, and no abbreviation. An abbreviated hash **MUST** fail: a `state=`
value spelled `swh:1:rev:` followed by only seven hex characters is malformed at `state`. A `sha256:` value
**MUST** match `^sha256:[0-9a-f]{64}$`.

A corpus **MUST** be declared — one line in the repository's own configuration, frozen at creation — and
**MUST NOT** be derived from a filesystem path. A path-derived corpus breaks whenever the same content is
live under two roots at once, which a `file:` dependency between two repositories makes routine.

The corpus of a file is the **nearest manifest that declares a name**, resolved by nearest ancestor — skipping any ancestor manifest whose own workspace or package configuration excludes the file, so a workspace root whose `workspaces` globs leave a subtree out is not that subtree's corpus — and written as an unversioned Package URL: `ref:pkg:npm/acme-tools#acme/adr@2/0019` names a record of the living package, and `state=` carries the frozen one. A `folder` corpus is for the subtrees no manifest reaches, declared **per subtree** in one line of the repository's own configuration. Measured over one
repository: 49 files under a public package and 154 above any package.

## Percent-encoding

`encoding.locator.reserved` is empty — a locator carries no encoding layer of its own, as described above.
The one encoding this scheme defines is for a nested identifier used as a qualifier value.

**The `ref:` `#` has URI-fragment semantics** — it introduces the declared-name path, and it always wins.
That is also why a Package URL's own `#subpath` cannot appear inside a `pkg` locator at all: the expression
stops the locator at the first `#`, and with no locator encoding to fall back on, the subpath simply has no
representation (see [Delegation, and its one exception](#delegation-and-its-one-exception)).

### A nested identifier as a qualifier value

A nested `ref:` used as a qualifier value stays **inside** the outer identifier — the whole thing remains
one shareable string. Three characters are reserved and **MUST** be encoded in the nested value:

| Character | Encoded |
|---|---|
| `;` | `%3B` |
| `#` | `%23` |
| `%` | `%25` |

`%` is encoded first, so the encoding is injective: two different nested identifiers always yield two
different outer identifiers, and a nested value that itself contained `%23` survives as `%2523`. A parse
**MUST** report the decoded inner identifier alongside the raw qualifier value.

```text
ref:folder:acme-governance;by=ref:pkg:npm/@acme/profiles@0.1.0%23profile/conformance@1
ref:folder:acme-governance;by=ref:pkg:npm/x@1.0.0%3Bstate=swh:1:rev:7e29bb6000000000000000000000000000000000%23S
```

**Nesting is exactly one level deep.** Depth is fixed by the specification; width is not (see
[Qualifiers](#qualifiers)). A nested value that itself nests another level is `malformed`, reported at the
qualifier key that carries it.

## Three roles, never mixed

| Role | Carried by | Changes when |
|---|---|---|
| **Identity** | `type`, `locator`, declared-name path | the format renames the thing |
| **Location** | a path and a byte range | any edit — an attribute, never a key |
| **Freeze** | a SWHID in `;state=` | never |
| **Moment** | an RFC 3339 timestamp in `;when=` | never — a second reading is a second moment |

A file path **MUST NOT** appear in the identity of anything whose format declares a name. Location is an
attribute of the node, recorded beside it. A builder given the same declared name reached through two
different file paths **MUST** produce the identical identifier — that is the vector that separates this
scheme from a path with decoration.

## What receives an identifier

**Only what somebody declared.** Everything else is an edge or an attribute.

| Layer | Example | Identifier? |
|---|---|---|
| A name declared inside a package | a trait, an observation spec, an exported symbol | yes |
| A composition a package declares by name | a profile, a named entry in an ops collection | yes — its own, in its own package |
| A relation between two nodes | *derived from*, *composes*, *examines* | no — an edge with attributes |
| The conditions a reading was taken under | population, environment | no — attributes of the reading |

A composition's identifier is **not** a member's identifier with the composition appended. It is a name in
the package that declares it. This is what keeps the identifier space from growing with nesting depth.

## Qualifiers

Qualifiers before the `#` say **which state** of the thing. Refinements after it say **which part**. The
two sides **MUST NOT** trade contents.

| Qualifier | Points at | Declared form | Undeclared form |
|---|---|---|---|
| `state` | the captured state of the thing — which bytes, never when | — | a SWHID; `git:<commit>` (7–40 hex); a content hash, `sha256:…` or `blake3:…`; or the literal `none` |
| `by` | the instrument that produced the reading | `ref:…` | `sha256:…` |
| `over` | the population that was read | `ref:…` | `sha256:…`; or the literal `unknown` — the declared level for a population nobody established. Deliberately not `none`, which `state` uses: a state cannot be empty, so `none` is unambiguous there, while a population over zero members is a real and different thing from a population nobody recorded |
| `when` | the moment the reading was taken | — | an RFC 3339 timestamp in UTC, `2026-08-12T18:55:27.811Z`; an offset is malformed |

**A qualifier value is a declared name or a digest. It is never a list.** A literal list grows without
bound and turns the identifier into a batch header rather than a name. A `by=` value that is neither a
nested `ref:` nor a `sha256:` digest **MUST** be reported malformed at `by`.

### Qualifier order does not distinguish

`;a=1;b=2` and `;b=2;a=1` are **the same identifier**. Two producers holding the same qualifiers name one
thing, whichever order each of them happened to write.

The rule this replaces said only that written order **MUST** be preserved on re-serialisation, and left
open whether two orders were two identifiers. They are not. Order is not a property of what is being
named — the qualifiers are a set of pairs, each key at most once, and a set has no order. Leaving the
question open put a producer's incidental choice into the identity of the thing it named, so an edit that
changed nothing about the subject renamed it.

Preserving written order on re-serialisation stays, demoted from **MUST** to **SHOULD**: round-tripping
bytes unchanged is good practice, it is what `serialise(parse(s)) === s` asserts, and it is not what
identity is judged on. An implementation **MUST NOT** rely on order to tell two identifiers apart.

**Comparison is over the canonical form.** `canonical(s)` re-serialises a parsed identifier with its
qualifiers sorted by key, in UTF-16 code unit order, leaving every other part exactly as parsed. Two
identifiers are the same when their canonical forms are equal byte for byte. Sorting is the cheapest
canonicalisation and is not itself the point — what is load-bearing is that one deterministic order
exists, so that any two implementations reach the same answer.

Three things this does **not** change:

- **The bytes a producer writes.** `build()` emits what it was handed, `serialise()` emits what it parsed,
  and neither sorts. A producer wanting its identifiers comparable as plain strings sorts before it
  builds; one that does not is still correct, and is compared through `canonical`.
- **Identifier version.** Nothing about normalisation, percent-encoding, separators or shape moves, so no
  identifier already minted becomes a different one. What changes is which pairs of them were always the
  same.
- **Sequences.** A set named by a digest stays ordered — see *Sets are ordered* below. The two rules read
  as opposites and are not: a qualifier list is a keyed set with no order to lose, and a digest names a
  sequence whose order is declared content.

**Refinements are not qualifiers here.** They sit on the fragment side and are positional — `lines=1,20`
names a range — so `canonical` leaves them in the order they were written.


### Refinements

Positional refinements follow the declared-name path: `lines=` (`^[0-9]+(,[0-9]+)?$`), `item=`
(`^[0-9]+$`), `para=` (`^[0-9]+$`). They sit on the fragment side, where RFC 5147 puts a text range, rather
than on the qualifier side where the SWHID specification puts it. **Where the two disagree, this scheme
follows RFC 5147.**

```text
ref:folder:acme-governance;state=swh:1:cnt:3404a00f00000000000000000000000000000000#AGENTS.md;lines=1
```

A refinement value that fails its pattern is malformed, and the failing part is the refinement key —
`#AGENTS.md;lines=ten` reports `lines`. A `lines=` value that matches the pattern's shape but names a
reversed range — `lines=20,10` — is malformed at `lines` too; the validator checks order as well as digits.

## Sets are ordered

A set named by a digest is a **sequence**: order is significant and is the declared order. A producer
**MUST NOT** reorder members.

A sequence can be read as an unordered set later by sorting it; an unordered set cannot recover an order it
never kept. The asymmetry runs one way, so the ordered reading is the default.

## Digest canonicalisation

A digest names a sequence of identifiers. Three things are fixed, so that two implementations agree:

1. The digest is computed over the **identifier strings**, in declared order, never over the objects they
   name.
2. Members are joined with `\n` (U+000A); the digest is `sha256` over the UTF-8 bytes of the result, and
   the output is spelled `sha256:` followed by 64 lowercase hex characters.
3. A repeated identifier is a distinct member and **MUST NOT** be deduplicated. The same instrument applied
   to two populations is two members, and collapsing them would erase a legitimate reading.
4. A member carrying the join character (`\n`) itself **MUST** be refused rather than silently joined with
   its neighbour into a longer, wrong pair of members.

The empty sequence digests to `sha256:` over zero bytes —
`sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## The digest never reads content

Content state belongs to **each member**, in that member's own `;state=`:

```text
over: [
  ref:folder:acme-governance#AGENTS.md;state=swh:1:cnt:3404a00f00000000000000000000000000000000,
  ref:folder:acme-governance#GOVERNANCE.md;state=swh:1:cnt:48db124700000000000000000000000000000000
]
```

The set's digest changes when a member's content changes, because the member's identifier changed. The cost
of the set stays the cost of concatenating strings, whatever the members weigh.

For version-controlled content the member's state is already computed: SWHID hashes are git-compatible, so
`swh:1:cnt:<sha>` is the blob sha the index already holds. No content byte is read.

For content that is not version-controlled, the member's type declares which level applies:

| Level | Cost | Proves |
|---|---|---|
| `properties` — size and mtime | an inode read | probable change, never content — so it never enters an identifier |
| `content-hash` (BLAKE3 preferred) | one sequential read, parallelisable | content — written as `state=blake3:…` or `state=sha256:…` |
| `none` | zero | nothing — and the state is recorded as unknown, written as `state=none` |

A content hash in `state=` hashes the thing itself and is never a digest of members, so it declares no
set and the envelope invariant does not apply to it.

**`none` is a legitimate declared level.** An unknown state recorded honestly is worth more than a
properties hash presented as proof of content.

## The envelope

An identifier resolves to an object. The specification fixes three fields and admits one more; everything
else is opaque to it.

```text
{
  id:           <this object's own identifier>
  sets:         { <qualifier>: [<identifier>, …] }
  alsoKnownAs:  [<identifier>, …]
  data:         <opaque>
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | always | Self-reference. Prevents an object being served under an identifier that is not its own |
| `sets` | when the identifier carries a digest | One entry per qualifier that carries one, keyed by that qualifier's name |
| `alsoKnownAs` | never | Other identifiers for the same thing |
| `data` | — | The content, interpreted by whoever knows the type |

**A digest, for this invariant, is a `sha256:` value.** A SWHID in `;state=` is a captured state, not a
digest: an identifier whose only qualifiers are `state=` and `when=` requires no `sets` entry and is admissible with no
`sets` field at all.

**The invariant:** for every qualifier whose value is a `sha256:` digest, `sets[<qualifier>]` **MUST**
exist and **MUST** recompute to that digest; and `id` **MUST** equal the identifier the envelope was
requested under. An envelope failing either **MUST** be refused at ingestion — never repaired, never
accepted with a warning. Where two qualifiers carry digests, **both** **MUST** recompute; one correct and
one wrong is refused. `alsoKnownAs` is opaque to the invariant and never participates in it.

Before that invariant is even checked, the requested identifier's own parse status gates admissibility: one
that parses `malformed` or `unsupported` **MUST** be refused; one that parses `uncovered` is admissible —
an unknown type is still a name, even though nothing yet validates it.

`alsoKnownAs` is a **declaration**, never a similarity match. It covers a renamed declared name, the same
content reachable under two corpora, and the promotion of a `folder` corpus to a `pkg` one once a manifest
exists.

Three fields are deliberately absent: a kind or media type (derivable from the locator type and the
document model), a provenance marker (domain semantics, which belongs in `data`), and a resolution state.

## Resolution state belongs to the edge

| State | Meaning |
|---|---|
| `resolved` | the target was found |
| `unresolved` | the target is gone; the edge carries the SWHID of the last state in which it resolved |
| `uncovered` | the target's format has no grammar, or its type is not in the dispatch table |
| `archival` | the target is a frozen state and resolves by construction |

State is a value on the relation, never a field of the node, and never a reason to prune.

## Extension points

Four additions require no new identifier version: a **new locator type**, a **new qualifier key**, a **new
refinement key**, a **new fragment grammar** for a document model.

An implementation meeting a qualifier key or a refinement key it does not know **MUST** carry it through
unchanged, byte for byte. Dropping an unrecognised key while re-serialising deletes a later version's data
and leaves a string that still validates, so nothing reports the loss.

## Fragment grammars

The declared-name path is interpreted by the target's document model.

| Document model | Declared name | Tie-break |
|---|---|---|
| A governed record | `<provider>/<type>@<template version>/<name>` — every part from the record's own front-matter stamp; the provider of the type declares the form of `<name>` (a record number, or a front-matter `name` field) | none needed |
| Markdown prose | the heading text | ordinal, on collision within one document |
| A code symbol | the fully-qualified name, no path | per the language's own rules |
| A `.behavior` state | the state name within its agent, never within its file | none needed |
| A record's own data | an `id` field the record declares in its data — a case slug, a capability name — not its front matter | none needed |

The last row is the one measured to matter: per-file namespacing left 766 transitions dangling, because one
agent's behaviour files share their states between them.

## The specification file itself

The file declares two identities and one digest, and they do different jobs.

| Field | Today | Versions |
|---|---|---|
| `scheme` | `ref` | the URI scheme every identifier starts with |
| `specVersion` | `1.3.0` | **the document** — its tables, its vectors, its canonicalisation |
| `version.supported` | `[1]` | **the identifier** — which version slots this document defines |

A consumer pins against `specVersion`. The two numbers move independently: an addition through an extension
point mints a new `specVersion` without touching the identifier version, while either of the two changes
listed under `version.mints` moves both.

The file is canonicalised as `json-sorted-keys-compact`: object keys sorted by UTF-16 code unit order, no
whitespace outside strings, strings escaped as `JSON.stringify` escapes them, integers only, and the digest
covers the UTF-8 bytes of the result.

**The digest lives in a sidecar — `ref-id.json.sha256` — and the file never contains its own digest.** A
file carrying its own digest cannot be verified without first deciding which bytes to exclude, and that
decision is a second canonicalisation nobody would test.

## Conformance vectors

Five classes. Each fixes a different property, and a port is checked against all five rather than against
any implementation's source.

| Class | Vectors | Fixes |
|---|---|---|
| `parse` | 41 | what each input decomposes to — status, version and whether it was written explicitly, type, the reported locator, the string delegated to its validator for a dispatched type, the decoded nested identifier of any qualifier carrying one, qualifiers in order, fragment path and refinements, and, on failure, the failing part |
| `roundtrip` | 15 | that re-serialising a parsed identifier returns the original bytes, encoding intact — for an `uncovered` and an `unsupported` identifier as much as for an `ok` one |
| `build` | 9 | that assembling parts yields the canonical string, including that location never enters identity and that the builder applies the nested-value encoding — and that a locator carrying a reserved character, a fragment carrying the separator, or a nested identifier passed as a plain string is refused, naming the failing part |
| `digest` | 7 | the sequence digest: order significant, no deduplication, the empty sequence, a member carrying the join character refused |
| `envelope` | 11 | the admissibility invariant — recompute, self-reference, a `malformed` or `unsupported` requested identifier refused while an `uncovered` one is admissible |

At minimum the set covers:

- each locator type, each qualifier, each refinement;
- an explicit `ref:1:` and its omission, which must parse to the same version and re-serialise as written;
- an unsupported version, which must yield `unsupported` and not `malformed`, carrying an otherwise
  invalid qualifier value through unvalidated;
- a letter-led token after `ref:`, which must be a type and not a version;
- an uppercase-led type and a string without the `ref:` prefix, which must be `malformed` at `grammar` and
  not `uncovered`;
- an unknown type, which must yield `uncovered` and not an exception, carrying its qualifiers and fragment;
- a validator failure on an unknown type, which must yield `malformed` and not `uncovered`;
- an `uncovered` and an `unsupported` identifier, which must both re-serialise byte for byte;
- an unknown qualifier key and an unknown refinement key, which must survive re-serialisation byte for byte;
- a nested `by=` carrying a full identifier, which must round-trip with its `%3B`, `%23` and `%25` intact
  and report the decoded inner identifier;
- a pkg locator given as the bare group and as an intact Package URL whose scheme folds into the type,
  which must build to the same string;
- a locator carrying a reserved character, a fragment carrying the separator, and a nested identifier
  passed as a plain string, each of which the builder must refuse, naming the failing part;
- two sequences with the same members in different order, which must produce **different** digests;
- a sequence containing the same identifier twice, which must not deduplicate;
- a member whose content changed, which must change the set's digest;
- a member carrying the join character, which the digest function must refuse;
- an envelope whose members no longer recompute to its digest, which must be refused;
- an envelope served under an identifier that is not its own, which must be refused;
- a requested identifier that is `malformed` or `unsupported`, which the envelope must refuse, and one that
  is `uncovered`, which it must admit;
- an identifier whose only qualifier is a captured state, which must be admissible with no `sets`;
- an identifier carrying two digest-bearing qualifiers, both of which must recompute;
- the same declared name reached through two different file paths, which must produce **identical**
  identifiers.

The last one is the vector that separates this scheme from a path with decoration.
