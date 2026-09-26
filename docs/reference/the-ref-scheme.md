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
ref:folder:acme-governance/learnings#a-chunk-carrying-no-answer-means-death-or-health
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
(`explicitVersion`), because the identifier round-trips as written; the canonical form omits the default
version, so `ref:1:pkg:npm/x` and `ref:pkg:npm/x` are one identifier to `sameIdentifier`.

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

**1.4.0 is the version the registry should have moved at, and did not.** Everything from `url`, `unknown`,
`tel`, `isbn` and `gtin` joining the dispatch — with `domain` and `dot-agent` retired — through the path
moving into the `folder` and `pkg` locators, `relate`, and the `ai-model` locator opening on its provider,
shipped in `@entelekheia/ref-id` 0.4.0 and 0.5.0 under a document that still called itself 1.3.0. Two
releases therefore embedded two different registries with one `specVersion`, and a consumer pinning it
could not tell them apart. 1.4.0 names that state, and adds that a repeated key the spec does not declare
is `malformed` at the key rather than an error. A reader that pins `specVersion` and compares identifiers
of those types must treat 1.3.0 as ambiguous and read the package version beside it.

**1.5.0 narrows two things a 1.4.0 reader admitted, and adds one relation.** `path=`, `origin=` and
`corpus=` were unknown keys under 1.4.0 and carried through whatever their value; they are now declared
location qualifiers, so a value outside their forms — a relative `path=`, an `origin=` carrying
credentials or `.git` — is `malformed` at the key. Written after `#`, the same three keys were unknown
refinements and carried through; a declared qualifier key on the fragment side is `malformed` at that key,
whatever its value. A `folder` locator segment that is exactly `.` or `..` was `ok` and is now `malformed`
at the locator. Everything else valid under 1.4.0 keeps its parse. The
addition is `verdict`, which reads `relate` and says what a difference means once some qualifiers are
hints rather than identity (see [ADR-0006](../../project/adr/0006-location-enters-the-identifier-as-a-hint-never-as-identity.md)).

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
| `folder` | a claimed corpus name, then one segment per directory down to the file | a first segment `[A-Za-z0-9][A-Za-z0-9._-]*`, then segments of `[A-Za-z0-9._-]` that are never exactly `.` or `..` — a segment opening on `.` (`.github`) is an ordinary directory | the file is not one a package manager ships, so no release contains it: `ref:folder:acme-tools/docs/guide.md#Setup`. A clean install of the package would not hold this file, and a `pkg` identifier for it would resolve to nothing. The name is claimed by whoever writes the identifier; where it was found goes in the [location qualifiers](#location-qualifiers) |
| `url` | `host(/segment)*(@version)?` — a host under the owner's control, then each path segment a name the owner declares beneath it | host labels per RFC 1123, lowercase, internationalised labels in punycode; a segment admits every character except `/`, `@`, `;`, `#` and `:` — the colon is excluded so an identifier spelled in another format's own convention (a version after a colon, a digest after a tilde) is refused rather than absorbed silently, with the version and digest inert inside a name; `~` is admitted alone, because a digest never appears without the colon that precedes it; an optional `@version` on the last segment | the thing exists *as* a host — a site, a portfolio, a case published under it: `ref:url:portfolio.example/case-xpto@2#results`. The package that builds the site keeps its own `pkg` identity |
| `email` | an addr-spec as the first segment, then one segment per item served under it | RFC 5322 dot-atom local part on the first segment only, host as above | a mailbox identifies a person or a role, and the items served under it are declared by whoever serves them — a message by its RFC 5322 Message-ID, a thread by the id its provider minted: `ref:email:someone@mail.example/CADx9v7abc123@mail.gmail.com#Assunto`. The addr-spec is the first segment and nothing else, so an item id carrying an `@` is never mistaken for the mailbox. A Message-ID is written without the angle brackets the RFC surrounds it with, which is the form a mail API hands over |
| `unknown` | a deferred species, `species:name(@version)?` | a declared-name pattern, permissive in its characters and strict in its shape: exactly one `:`, the one closing the species, and one `@`, trailing the last segment — so `acme:delivery/pro:be` and `acme:delivery/pro@be/x` are refused, and a composed label carrying either fits only in the fragment, where `covers` compares by equality | an authority this registry does not cover, named precisely instead of opaquely: `ref:unknown:doi:10.1000/182`, `ref:unknown:orcid:0000-0002-1825-0097`. Promoting the species to a type of its own later leaves the written identifier unchanged and moves only its status, from `uncovered` to `ok` |
| `tel` | a global number, `+` and up to 15 digits | ITU-T E.164, written as RFC 3966's `global-number-digits` — the leading `+` is required, so one number has one spelling | a telephone number: `ref:tel:+15551234567`. A visually separated spelling is refused, not repaired |
| `isbn` | 10 or 13 digits, no hyphens | ISO 2108, pattern and check digit | a book number: `ref:isbn:9780306406157`. A 13-digit ISBN is also a GTIN-13 under the 978/979 prefixes; the two types overlap there deliberately and diverge at the 10-digit form |
| `gtin` | 8, 12, 13 or 14 digits | GS1, pattern and the GS1 weighted-sum check digit | a trade item number, the number a retail barcode carries: `ref:gtin:00012345678905` (GTIN-8, GTIN-12/UPC-A, GTIN-13/EAN-13 and GTIN-14/ITF-14 are all admitted) |
| `ai-model` | `provider/served-id` — the provider that executes the model as the first segment, then the id the caller hands it to select the model, verbatim | provider `[a-z0-9][a-z0-9._-]*`, then each served-id segment `[A-Za-z0-9][A-Za-z0-9._:@-]*` — declared-name. The provider is an [OpenTelemetry `gen_ai.provider.name`](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) well-known value where one applies (`anthropic`, `aws.bedrock`, `azure.ai.inference`, `gcp.vertex_ai`, `openai`, …) and the name of the runtime that executes the model otherwise — a server (`omlx`, `ollama`, `lm-studio`) or a library linked in-process (`mlx`, `llama.cpp`), since a process boundary is not part of what executed the model; an application that embeds and configures a runtime is itself the provider, with the engine as its instrument in `by=` as a bare pointer (`;by=ref:pkg:…@version`, or the living package with no version when the linked one is unknown — the unknown is a column of the consumer's record); lowercase and without `:` or `@`, so no served id's tag or key can open the locator. The served id is deliberately permissive: no published grammar names a hosted API model (Package URL registers only artifact-registry namespaces such as `huggingface` and `mlflow`; CycloneDX and SPDX 3.0's `AIPackage` both delegate identity to an ordinary purl or free text; OpenTelemetry's `gen_ai.request.model` is explicitly free text), and coercing a served name breaks the round-trip that makes it an identifier at all. `:` (an Ollama tag), `/` (a hub-style namespace) and `@` (a quantisation key or revision pin) are all admitted, because a real serving process accepts each of them today; every segment opens on an alphanumeric, which refuses `..` and `//` | a model, named by who serves it and exactly as they serve it: `ref:ai-model:anthropic/claude-opus-5-5`, `ref:ai-model:azure.ai.inference/claude-opus-5-5` (the same served id through another provider — a different model), `ref:ai-model:ollama/llama3:8b`, `ref:ai-model:omlx/mlx-community/Qwen3-1.7B-4bit`, `ref:ai-model:llama.cpp/bartowski/SmolLM2-1.7B-Instruct-GGUF/SmolLM2-1.7B-Instruct-Q4_K_M.gguf` (in-process, no server: the served id is the name the weights' source declares, never a filesystem path). One segment names the provider alone and covers every model it serves; the machine a local runtime runs on travels as a qualifier, never in the locator |

**The type names the naming system that owns the locator's grammar, and this table is the registry of
types.** A type absent from it — `ref:spotify:track/4uLU6hMCjMI75M1A2tKUQC` — parses to `uncovered`,
never to `malformed`: the identifier is carried whole and validated by nobody. Registering its validator
here is what promotes it to `ok`. A type name is admissible only when an unrelated party solving the same
problem would have chosen it identically — see
[`what-earns-a-type.md`](../explanation/what-earns-a-type.md) for the test and for what was rejected.

A Package URL's own `#subpath` reaches a `pkg` locator as a path after the version, never as a `#`. The
locator excludes both `;` and `#` and carries no encoding that would let one through, so a builder handed
a literal `#` **MUST** refuse, naming the locator as the failing part — but `npm/x@1.0.0/docs/guide.md` is
admissible and canonicalises as `pkg:npm/x@1.0.0#docs/guide.md`, the subpath leaving for the component
that means exactly this. The scheme's own `#` has no Package URL equivalent and is a declared loss in that
direction.

**Where the version ends and the path begins is decided by one rule.** An `@` preceded by `/`, or first in
the locator, opens a segment and belongs to the name — `npm/@acme/x` carries no version. An `@` inside a
segment closes the name: the version runs from it to the next `/`, and everything after that `/` is the
path. **With no version declared there is no marker at all**, so `npm/a/b/c` stays a namespaced package
and carries no path — a file in a corpus nobody versioned is named through `folder`.

A corpus name carries the path to a file inside it: `ref:folder:acme-governance/docs/AGENTS.md#Licence`
names a declared name inside that file, and `ref:folder:acme-governance/docs/` is malformed at the
locator, because a trailing separator names no item. An invalid Package URL is likewise malformed at the
locator.

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

A `pkg` corpus is declared by its manifest. A `folder` corpus name is **claimed** by whoever writes the
identifier: nothing proves it, and it is never the whole of what locates the file. Where the name was
found — a repository's `origin`, a directory on one machine, a manifest — goes beside it in the
[location qualifiers](#location-qualifiers), which narrow where to search without deciding what is named.
That is what keeps one content live under two roots at once, which a `file:` dependency between two
repositories makes routine, from becoming two corpora: the two identifiers differ only in a hint, and
[`verdict`](#comparison) reads the hint for what it is.

The corpus of a file is the **nearest manifest that declares a name**, resolved by nearest ancestor — skipping any ancestor manifest whose own workspace or package configuration excludes the file, so a workspace root whose `workspaces` globs leave a subtree out is not that subtree's corpus — and written as an unversioned Package URL: `ref:pkg:npm/acme-tools#acme/adr@2/0019` names a record of the living package, and `state=` carries the frozen one. A `folder` corpus is for the files no release contains, named by a claim, with `corpus=` pointing at a declaration where one exists. Measured over one
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

The second line shows what the encoding admits. A producer writes the first shape, because a nested
identifier **SHOULD** stay a bare pointer (see [What an identifier carries](#what-an-identifier-carries)).

**Nesting is exactly one level deep.** Depth is fixed by the specification; width is not (see
[Qualifiers](#qualifiers)). A nested value that itself nests another level is `malformed`, reported at the
qualifier key that carries it.

## Three roles, never mixed

| Role | Carried by | Changes when |
|---|---|---|
| **Identity** | `type`, `locator`, declared-name path | the format renames the thing |
| **Location** | `path=`, `origin=`, `corpus=` as hints; a byte range never | a clone, a move, a mirror — a hint, never identity |
| **Freeze** | a SWHID in `;state=` | never |
| **Moment** | an RFC 3339 timestamp in `;when=` | never — a second reading is a second moment |

A file path **MUST NOT** appear in the identity of anything whose format declares a name. Location enters
an identifier only as a qualifier whose role is `location`, which narrows where to search and never decides
by itself what is named ([ADR-0006](../../project/adr/0006-location-enters-the-identifier-as-a-hint-never-as-identity.md)). A builder given the same declared name reached through two
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

## What an identifier carries

**An identifier is a reference, not a copy of the record.** It is the shortest string that points at one
record, the way a URL does; the record's attributes stay in its columns. Read it as a search:

```text
search(in: <type>:<locator>, for: #<declared name>, with: ;<qualifiers>)
```

`in` says where to look and `for` says which declared name — those two are the identifier. `with` is
enrichment, added only when two records would otherwise share one identifier. A `by=` naming the
instrument is enrichment too: it sits on top of a pointer that already works without it, and what
`covers` does with it is a bonus.

Three rules keep every identifier that short and every one shaped the same way:

- A qualifier **SHOULD** be added only where it tells two records apart or earns its place in a debug
  view, and it is flat: `;thinking=no`, `;endpoint=mac-studio`.
- A nested identifier **SHOULD** be a bare pointer — a type, a locator and at most a fragment, with no
  qualifiers of its own. The grammar already refuses a second level of nesting and a repeated key, so an
  identifier never carries two `by=`.
- What does not fit those rules is a column beside the identifier, and a query on it runs on the columns.

```text
ref:ai-model:example-app/org/repo;thinking=no                                          ← the pointer
ref:ai-model:example-app/org/repo;thinking=no;by=ref:pkg:github/ggml-org/llama.cpp     ← enriched, still a pointer
ref:ai-model:example-app/org/repo;thinking=no;by=ref:pkg:github/ggml-org/llama.cpp%3Bstate=none;latency-ms=812
                                                                                       ← a copy of the record
```

In the third line the engine build nobody recorded and the latency of one reply are attributes: they go in
columns (`engine_build = null`, `latency_ms = 812`), and "everything an unrecorded build answered" is a
query on those columns. Every qualifier a producer adds by habit is one more place where two producers
naming the same record write two different identifiers.

**These rules are guidance; the grammar is unchanged.** The third line parses `ok` under this `specVersion`, and a
consumer that already stored one keeps it. Whether the nested rule becomes a grammar rule — which would
make such an identifier `malformed`, a new major — is decided on how the guidance holds up in use.

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

### Location qualifiers

Three qualifiers carry where the thing was found. Each appears at most once, a reader tries them in the
order below, and none of them is identity: [`verdict`](#comparison) states how far each may separate two
identifiers.

| Qualifier | Value | A different value on each side |
|---|---|---|
| `path` | a directory on one machine, opening on a token — `~` (home), `{tmp}`, `{config}`, `{data}`, `{cache}`, mapped per OS in `forms.local-path.tokens` — or an absolute path outside every token, `c:/windows` | `undetermined`: one corpus lives in many clones. `distinct` only when neither side carries `origin=` or `state=` — a file whose identity is its place |
| `origin` | the `https` address of the repository, in one spelling: lowercase ASCII path, no port, userinfo, dot segment or `.git` | `distinct`: two authorities |
| `corpus` | where the name's declaration lives — a manifest relative to the root the other hints reach (`package.json`), or a nested `ref:` | `undetermined`: two declarations may point at one file |

A `path=` segment that is exactly `.` or `..` is refused rather than resolved, and so is a relative path, a
trailing separator and a backslash separator. **A builder MUST write a path under the user's home or
temporary directory through its token**: the pattern cannot tell a user name from a directory name, so the
obligation is the builder's. A second spelling of one repository in `origin=` would make it `distinct`
from itself, which is why that form admits exactly one.

```text
ref:folder:acme-tools/docs/guide.md;origin=https://github.com/acme/acme-tools#Setup
ref:folder:acme-tools/docs/guide.md;path=~/Development/acme-tools#Setup
ref:folder:acme-tools/src/x.ts;corpus=package.json
ref:folder:system32/windows.dll;path=c:/windows
```

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

**Refinement order does not distinguish either.** A qualifier is a filter on what the locator names and a
refinement a filter on what the declared name selects, and filters combine with AND, so
`#Setup;lines=10,20;item=2` and `#Setup;item=2;lines=10,20` are one identifier and the canonical form
sorts refinements by key as it sorts qualifiers. The order *inside* one value is content: `lines=1,20` is a
range. A nested identifier in a qualifier value is written in its own canonical form, so the order of its
qualifiers does not distinguish the outer identifier.

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

## Comparison

`comparison` in the specification defines four relations equality cannot express, all computed on the
parsed parts and never on the bytes. An identifier with no decomposition — `malformed`, or at a scheme
version the implementation does not support — relates to nothing, itself included.

| Relation | Answers | Direction |
|---|---|---|
| `covers(a, b)` | whether `a` is `b` with less declared — a partial identifier used as a query | asymmetric |
| `samePackage(a, b)` | whether both name one released thing, at whatever version each declares | symmetric |
| `relate(a, b)` | how the two relate in each dimension | mirrored |
| `verdict(a, b)` | what the two mean together once location qualifiers are hints — an identity axis and a content axis | mirrored |

**`covers`** requires the type and scheme version to be equal and the first locator stem to reach the
second — equal, or a whole-segment prefix, so `acme-tools` reaches `acme-tools/docs` and never
`acme-tools-extra`. For the locator version, the declared-name path, each refinement and each qualifier,
what the first leaves undeclared the second may declare, and what the first declares the second must
declare identically. **`samePackage`** compares every part identically except the locator version, which
it ignores — and only a type whose `dispatch` entry sets `versionTail` has one.

**Both descend one level into a nested identifier.** Where a qualifier's value is a nested `ref:` on both
sides, the pair is compared with the same relation on the decoded identifiers, so
`…;by=ref:pkg:github/ggml-org/llama.cpp` covers `…;by=ref:pkg:github/ggml-org/llama.cpp@b10931`, and two
releases of one engine are the same package. A digest, a timestamp, plain text, a nested identifier facing
a digest, and a nested pair at a scheme version the relation refuses are compared byte for byte.

**`relate` reports where, and the other two are its reductions.** Its result has five fixed dimensions —
`type`, `version`, `locatorStem`, `locatorVersion`, `fragmentPath` — and two keyed ones,
`fragmentRefinements` and `qualifiers`, carrying only the keys at least one side declares. Each holds one of
`equal`, `covers`, `coveredBy`, `differ`; a qualifier whose value is a nested identifier on both sides also
carries `nested`, the `relate` result of the decoded pair. Every dimension is computed on its own, so two
different types still report their locators.

```text
relate(ref:folder:acme-tools;when=2026-01-01T00:00:00Z, ref:folder:acme-tools/docs/guide.md)
  locatorStem: covers   qualifiers.when: coveredBy   everything else: equal
  → reduces to differ: neither covers the other
```

A result reduces to `equal` when every relation in it is `equal`, to `covers` when each is `equal` or
`covers`, to `coveredBy` for the mirror, and to `differ` otherwise. `covers(a, b)` is a reduction to
`equal` or `covers` with the type and version equal; `samePackage(a, b)` is every dimension `equal` apart
from the locator version, applying `samePackage` to each `nested` result. The `relate` vector group states
full results and the three booleans for each pair; `npm run test:relate` checks, from the specification
alone, that those booleans follow from the results and agree with the `comparison` group wherever the
two groups hold the same pair.

**`verdict` reads `relate` and says what a difference means.** It returns an identity axis — `same`,
`covers`, `coveredBy`, `distinct` or `undetermined` — a content axis — `same`, `different` or
`unknown`, read from `state=` — and `decidedBy`, the members of the `relate` result that fixed each
one. The rule is `comparison.verdict.rule` in five steps:

1. A differing type, version, locator stem, locator version or fragment path makes identity `distinct`.
2. A location qualifier present on both sides with different values decides by its declared conflict:
   `origin=` is `distinct`, `path=` and `corpus=` are `undetermined` — and `path=` becomes
   `distinct` when neither side declares `origin=` or `state=`.
3. Any other qualifier or refinement that differs makes identity `distinct`, as it does for `covers`.
4. Failing a `distinct`, an `undetermined` from step two stands.
5. Otherwise the `relate` result reduces as above with `state=` set aside: a hint on one side only reads
   as `covers` or `coveredBy`, and one side declaring what the other leaves open in one place and the
   reverse in another is `undetermined`.

```text
verdict(…/guide.md;origin=https://github.com/acme/tools, …/guide.md;origin=https://github.com/acme/fork)
  → identity: distinct   decidedBy.identity: [qualifiers.origin]
verdict(…/guide.md;path=~/a, …/guide.md;path=~/b;origin=https://github.com/acme/tools)
  → identity: undetermined   (a path conflict beside an origin= is two clones, not two things)
verdict(…/guide.md;state=sha256:aa…, …/manual.md;state=sha256:aa…)
  → identity: distinct   content: same   — one content under two names
```

`covers(a, b)` holds exactly when `verdict(a, b)` is `same` or `covers` and every `state=` the first
declares is declared identically by the second, so the two never disagree on a pair.

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

**This table is guidance for whoever mints, not a rule any parser applies.** The scheme does not
interpret the kind of item being cut: it hands over what it can, and the implementer finds the rest.
That is why this table lives here and not in `spec/ref-id.json` — a table in the specification reads as
a contract, and no implementation has ever consulted this one.

What stays normative is only the shape: the locator names the item, the fragment names one level inside
it, and a refinement narrows within that level.

| Document model | Declared name | Tie-break |
|---|---|---|
| A governed record | `<provider>/<type>@<template version>/<name>` — every part from the record's own front-matter stamp; the provider of the type declares the form of `<name>` (a record number, or a front-matter `name` field) | none needed |
| Markdown prose | the heading text | **the file is in the locator**, so two documents never share a name; ordinal on collision within one document |
| A code symbol | the fully-qualified name, no path | per the language's own rules |
| A `.behavior` state | the state name within its agent, never within its file | none needed |
| A record's own data | an `id` field the record declares in its data — a case slug, a capability name — not its front matter | none needed |

Two rows are measured rather than reasoned. The `.behavior` one: per-file namespacing left 766
transitions dangling, because one agent's behaviour files share their states between them — there the
file is the wrong scope. Markdown is the opposite case and the one that motivated this table's
correction: the scope of a heading **is** its document, so with the corpus alone in the locator every
`## Overview` in a tree minted one identifier. A code symbol needs no path for the same reason the
`.behavior` state needs none — the language, or the agent, already supplies the scope.

## The specification file itself

The file declares two identities and one digest, and they do different jobs.

| Field | Today | Versions |
|---|---|---|
| `scheme` | `ref` | the URI scheme every identifier starts with |
| `specVersion` | `1.5.0` | **the document** — its tables, its vectors, its canonicalisation |
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

**The public surface is declared inside the file, as one OpenRPC document under `openRPC`.** Each method
is one operation every implementation exposes — its canonical name, parameters, result and errors — and
`components.schemas` holds the value types (`ParseResult`, `BuildParts`, `RelateResult`, …) in JSON Schema
draft-07. No JSON-RPC transport is implied; the format is used because an extracted `openRPC` value is a
document any OpenRPC tool reads. Four extensions tie it to the rest of the file:

| Extension | Holds |
|---|---|
| `x-rule` | a JSON Pointer into the whole specification naming the key that states the method's rule, `/comparison/covers` |
| `x-vectors` | the vector group that binds the method, or `null` beside an `x-vectors-reason` |
| `x-casing` | how each language spells a canonical name — `covers` stays `covers`, `samePackage` becomes `same_package` in Rust |
| `x-extensions` | what a language exposes beyond the shared surface, such as the browser build's `SPEC_DIGEST` |

A `$ref` resolves against the OpenRPC document; an `x-rule` against the whole specification.
`npm run test:openrpc` validates the value against the OpenRPC meta-schema, resolves both kinds of pointer,
and requires every vector group to be claimed by a method. Each implementation's own suite compares its
public surface, read from its compiler, with the methods.

## Conformance vectors

Eight classes. Each fixes a different property, and a port is checked against all eight rather than
against any implementation's source.

| Class | Vectors | Fixes |
|---|---|---|
| `parse` | 129 | what each input decomposes to — status, version and whether it was written explicitly, type, the reported locator, the string delegated to its validator for a dispatched type, the decoded nested identifier of any qualifier carrying one, qualifiers in order, fragment path and refinements, and, on failure, the failing part |
| `canonical` | 13 | that the canonical form of an identifier sorts its qualifiers and its refinements by key, writes a nested qualifier value in its own canonical form, and omits the version slot when it holds the default |
| `roundtrip` | 23 | that re-serialising a parsed identifier returns the original bytes, encoding intact — for an `uncovered` and an `unsupported` identifier as much as for an `ok` one |
| `build` | 15 | that assembling parts yields the canonical string, including that location never enters identity and that the builder applies the nested-value encoding — and that a locator carrying a reserved character, a fragment carrying the separator, or a nested identifier passed as a plain string is refused, naming the failing part |
| `digest` | 7 | the sequence digest: order significant, no deduplication, the empty sequence, a member carrying the join character refused |
| `envelope` | 12 | the admissibility invariant — recompute, self-reference, a `malformed` or `unsupported` requested identifier refused while an `uncovered` one is admissible |
| `comparison` | 44 | `covers`, `samePackage` and `sameIdentifier` on parsed pairs, including the descent into a nested qualifier value and the vectors ADR-0005's `by=` behaviour binds |
| `relate` | 19 | the full per-dimension `relate` result for a pair, including a nested qualifier's own `relate` result, checked to reduce to the same `covers`/`coveredBy`/`samePackage` the `comparison` group expects for the same pair |

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
