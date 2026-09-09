# @entelekheia/ref-id

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
