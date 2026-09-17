# @entelekheia/ref-id

## 0.4.0

### Minor Changes

- dd95fbe: Nine locator types, and two relations equality cannot express.

  `domain` becomes `url`, whose path segment refuses `:` so that a name carrying its own version after a
  colon is refused rather than absorbed whole. `dot-agent` is retired: an identifier written against it
  still parses, as `uncovered`, and its four namespace tiers are re-expressed under `url`, `email` and the
  new `unknown`. `unknown` carries an optional species before the first `:`, so an authority this registry
  does not cover is still named precisely. `tel`, `isbn` and `gtin` enter, and the last two are the first
  types whose validator computes a check digit rather than matching a shape.

  `samePackage` answers whether two identifiers name the same released thing at whatever version each
  declares. `covers` answers whether the first is the second with less declared — the general covers the
  specific and not the reverse — which makes a partial identifier a query over a store keyed by identifier.

  The scheme stays at identifier version 1 throughout.

- 9f9efdd: The locator carries the path to a file, and the fragment names what is declared inside that file.

  A `folder` locator continues into the subtree it names, one segment per directory, so
  `ref:folder:acme-tools/docs/guide.md#Setup` names a heading in a file rather than hanging that
  heading on the corpus. A `pkg` locator carries a path after its version, which leaves for the
  Package URL as that format's own subpath component — `ref:pkg:npm/x@1.0.0/docs/guide.md` now
  canonicalises to `pkg:npm/x@1.0.0#docs/guide.md` instead of folding the path into the version as
  `@1.0.0%2Fdocs%2Fguide.md`. With no version declared there is no marker separating the name from the
  path, so a file in an unversioned corpus is named through `folder`.

  `covers` follows: the general stem now reaches the specific one when it is equal **or a whole
  segment prefix** of it, so a corpus covers the files under it. The segment boundary is load-bearing —
  `acme-tools` does not cover `acme-tools-extra`. A path stays in the stem and only the version leaves
  it, so one file at two releases is one package and two files in one release are not.

  One conformance vector is revoked: a corpus name may now contain a path separator.

  A mailbox carries the items served under it. `email` refused a path because its locator is an RFC 5322
  addr-spec, and the dispatch entry stated the reason as a claim about the world — _"nothing lives under
  it"_. What sits under a mailbox is the person's own items, named by whoever serves them, and the scheme
  checks neither who minted an id nor that the item exists. The addr-spec is now the **first segment** of
  the locator and nothing else, so an item id carrying an `@` — which an RFC 5322 Message-ID does — sits
  after the first `/` and is never mistaken for the mailbox. A Message-ID is carried without the angle
  brackets the RFC writes it between, which is the form a mail API hands over.

  A second conformance vector is revoked: the one named _"nothing lives under a mailbox"_.

  Every error this package throws is now a `RefIdError`. `SpecIntegrityError` and `SpecVersionError` sat
  outside the hierarchy, so `catch (e) { if (e instanceof RefIdError) … }` silently missed the two
  failures a consumer is least equipped to recover from — the specification not matching its own digest,
  and declaring a major this build cannot honour. Both now extend it and carry `part: "spec"`.

- 0a0187e: The package runs in a browser.

  Importing anything from this package used to pull a filesystem in: `loadSpec()` read `spec/ref-id.json`
  through `node:fs`, hashed it through `node:crypto`, and every public function called it. A bundler has
  neither the file nor those modules, so any consumer that minted an identifier client-side failed — at
  build time if its bundler refused the specifiers, at runtime otherwise.

  `exports` now carries a `browser` condition above the default, serving a second build of the same source
  whose specification is a constant compiled in by `scripts/gen-spec.mjs`. The public API is unchanged and
  no consumer configures anything: a bundler that honours the condition takes the browser build, Node takes
  the default and keeps reading and verifying from disk exactly as before.

  The integrity guarantee moves rather than disappearing. The generator refuses to emit a module from a
  specification that fails its sidecar digest, and a staleness test regenerates and diffs the committed
  constant, so a compiled-in specification that no longer matches the file fails the gate instead of
  shipping. The browser build does not re-hash its own constant — that would compare a constant against a
  digest compiled from it in the same build, a check that cannot fail — and exports `SPEC_DIGEST` as a
  statement about provenance instead.

  What the browser build gives up is stated in the package README: no integrity check at runtime, no
  `loadSpecFrom` (it takes a directory), and a `digest()` that honours `sha256` alone. It gains a runtime
  dependency, `@noble/hashes` — pure JavaScript, no dependencies of its own — because the web platform
  publishes no synchronous hash and making `digest()` asynchronous would have changed the public API.

  `npm run test:differential` now runs the browser build as a fourth implementation beside Node, Rust and
  Swift over every input the specification names, so the two builds are held to each other rather than each
  to its own expectations.

  One note for TypeScript consumers: under `"moduleResolution": "bundler"` without `customConditions`, the
  compiler resolves types through the default condition while your bundler takes the browser build, so
  `tsc` accepts an import of `loadSpecFrom` that the bundle then refuses. Adding
  `"customConditions": ["browser"]` makes the compiler see the same surface the bundler does.

## 0.3.0

### Minor Changes

- 01dcdc2: Qualifier order does not distinguish: `;a=1;b=2` and `;b=2;a=1` are one identifier.

  `specVersion` 1.3.0. The 1.2.0 rule said only that written order must be preserved on re-serialisation and
  left open whether two orders were two identifiers. They are not — the qualifiers are a keyed set, each key
  at most once, and a set has no order. Leaving it open put a producer's incidental choice inside the
  identity of the thing it named, so an edit that changed nothing about the subject renamed it.

  New: `canonical(identifier)` re-serialises with qualifiers sorted by key in UTF-16 code unit order, every
  other part verbatim, and `sameIdentifier(a, b)` compares two through it. Eleven conformance vectors under
  `vectors.canonical`. Preserving written order is demoted from MUST to SHOULD — `serialise(parse(s)) === s`
  still holds, and identity is no longer judged on it.

  **Refinements are not affected.** They sit on the fragment side and are positional, `lines=1,20` being a
  range, so `canonical` leaves them as written. Neither is a set named by a digest: that stays an ordered
  sequence, where order is declared content.

  Nothing a producer writes changes. `build()` emits what it was handed and `serialise()` emits what it
  parsed; neither sorts. No identifier already minted becomes a different one, and the identifier version
  does not move — what moves is which pairs of them were always the same. A consumer that only parses needs
  nothing; one that compares, dedupes or indexes identifiers is the one that upgrades.

  Rust and Swift do not carry `canonical` yet.

## 0.2.0

### Minor Changes

- 29643bc: Two additions to `spec/ref-id.json`, which moves to `specVersion` 1.2.0. Neither changes an existing
  vector's expectation, and neither touches the expression, the separators or the encoding rules — the two
  conditions the specification names for a major version.

  **`over` gains an `unknown` form.** A reading whose population nobody established could not say so in any
  spelling: `build()` refused `unknown`, `none` and a bare digest alike, and refused them even under an
  unregistered type, so the type's `uncovered` status did not relax it. The gap was found the way the same
  gap in `state` was found before it was amended — by three attempts from three directions against real
  stored data, where 438 readings are about a population their producer never recorded.

  It is `unknown` and deliberately **not** `none`, which `state` already uses. A state cannot be empty, so
  `none` is unambiguous there; a population over zero members is a real and different thing from a
  population nobody recorded, and an identifier must not let the two read alike. It is also a floor rather
  than a destination: a producer that can enumerate its population says which one with `sha256`. Both halves
  of that fence are now vectors rather than prose — `over=none` and `state=unknown` are each `malformed`,
  so a port that blurred them would fail the suite instead of passing it quietly.

  **A form is the one addition an older reader cannot absorb**, and the reference doc now says so. An
  unregistered type parses `uncovered`, an unknown qualifier key is carried through, a later version parses
  `unsupported` — but a qualifier's `forms` list is closed, so a 1.1.0 reader meeting `over=unknown` gets
  `malformed`, on an identifier that is well formed under the version that minted it. That is intended: a
  form is what a value _means_, and carrying an unrecognised one through would admit a claim nobody can
  check. It is also why a consumer pins `specVersion` rather than assuming forward tolerance.

  **`ai-model` is registered as a type.** Its locator is the id a model is served under — the exact string a
  caller sends to select it. The pattern is permissive on purpose, admitting an Ollama tag's `:`, a hub-style
  name's `/` and an LM Studio quantisation key's `@`, because coercing a served name breaks the round-trip
  that makes it an identifier at all; rejecting a shape a real serving process accepts would be a defect
  rather than a safeguard. Permissive is not unbounded: every `/`-separated segment opens on an
  alphanumeric, which admits each of those and excludes `..`, `//` and a trailing `/`. The delegate is
  verbatim, so a consumer mapping a served id onto a path — a local weights cache — would otherwise inherit
  a traversal from a locator that parsed clean.

  Case is significant and nothing normalises it, which is worth stating because it is the one part with no
  way back: two callers naming one model in two casings mint two identifiers, and folding them later would
  be a change to normalisation, which mints identifier version 2.

  This type is this specification's own rather than a delegation, and that was established before it was
  written rather than assumed. Package URL registers namespaces for artifact registries only, `huggingface`
  and `mlflow`, and none for a hosted vendor. CycloneDX carries the category as a component type and
  identifies the component with an ordinary purl. SPDX 3.0's `AIPackage` identifies by a free-text `name`
  whose own definition calls it a label chosen by the creator, and delegates identity to `packageUrl`.
  OpenTelemetry's `gen_ai.request.model` is explicitly free text. **No published grammar names a hosted API
  model**, so there was nothing to point at.

  `scripts/seal-spec.mjs` is new. It is the sidecar's **writer**, which is narrower than it first looked and
  worth stating precisely: a stale sidecar was never silent — `loadSpec` refuses the file and most of the
  suite goes through it, so an unresealed edit already arrived as six failures. What was missing was the way
  back: the correct digest existed only inside the error message, and the repair was to copy it out by hand.

  It computes through the package's own `canonicalise`, which is the load-bearing half — a resealer with its
  own serialisation would produce a file that seals cleanly here and refuses to load everywhere. Resealing
  stays a deliberate command rather than a hook: one that ran on every edit would restamp whatever arrived,
  which is the opposite of what a seal is for. So the _guidance_ is what enters the lifecycle instead, at
  both places the failure appears — the integrity test's message and the copy gate's finding each name the
  command to run.

## 0.1.2

### Patch Changes

- 13544cd: Published with npm provenance now that the repository is public; the crate and the `v<version>` tag ship from the same release.

## 0.1.1

### Patch Changes

- 8dbe83d: Releases now come from the repository's own workflow through npm trusted publishing; nothing about the package's behaviour changes.

## 0.1.0

### Minor Changes

- 82f6601: First release. The `ref:` identifier scheme as data (`spec/ref-id.json` 1.1.0, 113 conformance vectors) and the TypeScript reference implementation that consumes it: parse, serialise, build, digest and the envelope invariant, with the specification embedded and verified against its digest at load.
