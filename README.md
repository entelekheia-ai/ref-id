<div align="center">

# ref-id

**One identifier for anything somebody declared, so that different tools' stores can point at each other.**
A specification published as data with conformance vectors, and the package that consumes it.

[Why](#why) · [Install](#install) · [Usage](#usage) · [Spec](spec/) · [Docs](docs/)

</div>

```ts
import { parse, digest, validateEnvelope } from "@entelekheia/ref-id"

parse("ref:pkg:npm/@acme/scanner-core@0.1.0#Observation")
// => { status: "ok", type: "pkg", locator: "npm/@acme/scanner-core@0.1.0", ... }

const members = [
  "ref:folder:acme-tools#AGENTS.md;state=swh:1:cnt:3404a00f00000000000000000000000000000000",
  "ref:folder:acme-tools#GOVERNANCE.md;state=swh:1:cnt:48db124700000000000000000000000000000000",
]
const setDigest = digest(members)
// => "sha256:75433bb5329808aa4064084a54173f0328926eb38ddce742f61cbd4f0ebba71e"

const requestedId = `ref:folder:acme-tools;over=${setDigest}`
validateEnvelope(requestedId, { id: requestedId, sets: { over: members } })
// => { admissible: true }
```

## Why

A file path says *where* something is; a content hash says *what its bytes were*. Neither answers *what is
it* for a thing that keeps living after an edit or a move. A trait a scanner runs, a rule a gate checks, a
record in a governance folder, an exported symbol — each exists because a format declared it by name inside
a scope, and that declared name is the only identity that survives a refactor.

`ref:` is a small scheme built on that rule. It wraps standards that already exist — a Package URL for a
locator a manifest proves, a SWHID for a captured state, RFC 5147 for a positional range — and adds only
what they do not say together: which thing, in which state, read by which instrument, over which
population. An identifier that carries a digest resolves to an envelope whose members recompute to it, so
the digest is a checkable claim rather than a dangling pointer.

The scheme is shipped as **data** — the grammar with its declared dialect, the dispatch and qualifier
tables, the digest canonicalisation, and conformance vectors — so a second implementation is a port checked
against vectors, never a re-derivation from this one's source.

## Packages

| Package | Purpose | README |
|---|---|---|
| `@entelekheia/ref-id` | TypeScript reference: parse, serialise, build, digest and validate `ref:` identifiers and envelopes against `spec/ref-id.json`. | [`packages/ref-id/`](packages/ref-id/README.md) |
| `ref-id` (Rust) | A crate under `crates/ref-id`, held to the same vectors; `cargo test --workspace` is its gate. **Its public surface is still reaching parity with the reference** — see below. | [`crates/ref-id/`](crates/ref-id/) |
| `RefId` (Swift) | A Swift package at the repository root, held to the same vectors; `swift run ref-id-conformance` is its gate. **Its public surface is still reaching parity with the reference** — see below. | [`Sources/RefId/`](Sources/RefId/) |

**The three ports agree on every answer, and not yet on every name.** A differential test runs all three
over every input the specification names and fails on the first disagreement (`npm run
test:differential`), so a `ref:` identifier means the same thing in each. What is still under
construction is the *surface*: the Rust and Swift ports do not yet expose every operation the TypeScript
reference does — `sameIdentifier` is missing from both — and some operations are spelled differently
across them. Treat the TypeScript package as the reference for what the API *is*; the other two are
correct where they overlap it.

## Install

```sh
npm install @entelekheia/ref-id
```

## Usage

See the package README: [`packages/ref-id/`](packages/ref-id/README.md). The specification itself is
[`spec/ref-id.json`](spec/); the reasoning behind each rule is in [`docs/explanation/`](docs/explanation/).

## Requirements

Node.js 22 or later, and — for `@entelekheia/ref-id` — any browser reached through a bundler: the package
ships a second build whose specification is compiled in, served through the `browser` condition of its
`exports`, with the same public API and nothing to configure. What that build gives up is stated in
[its own README](packages/ref-id/README.md#environments). No native dependencies.

## License

Apache-2.0 — see [LICENSE](LICENSE). Governance & decisions: [`project/`](project/) (see
[`GOVERNANCE.md`](GOVERNANCE.md)). Docs: [`docs/`](docs/).
