---
"@entelekheia/ref-id": minor
---

Two additions to `spec/ref-id.json`, which moves to `specVersion` 1.2.0. Neither changes an existing
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
than a destination: a producer that can enumerate its population says which one with `sha256`.

**`ai-model` is registered as a type.** Its locator is the id a model is served under — the exact string a
caller sends to select it. The pattern is permissive on purpose, admitting both an Ollama tag's `:` and a
hub-style name's `/`, because coercing a served name breaks the round-trip that makes it an identifier at
all; rejecting a shape a real serving process accepts would be a defect rather than a safeguard.

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
which is the opposite of what a seal is for. So the *guidance* is what enters the lifecycle instead, at
both places the failure appears — the integrity test's message and the copy gate's finding each name the
command to run.
