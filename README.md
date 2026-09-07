<div align="center">

# ref-id

**One identifier for anything somebody declared, so that different tools' stores can point at each other.**
A specification published as data with conformance vectors, and the package that consumes it.

[Why](#why) · [Install](#install) · [Usage](#usage) · [Spec](spec/) · [Docs](docs/)

</div>

<!-- PROOF PLACEHOLDER: a copied, runnable parse → digest → envelope example lands here once
     packages/ref-id ships its first vectors. Do not compose one by hand. -->

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
| `RefId` (Swift) | The same API as a Swift package at the repository root, held to the same vectors; `swift run ref-id-conformance` is its gate. | [`Sources/RefId/`](Sources/RefId/) |

## Install

Not yet published — the first release is tracked in [`project/plans/`](project/plans/).

## Usage

See the package README: [`packages/ref-id/`](packages/ref-id/README.md). The specification itself is
[`spec/ref-id.json`](spec/); the reasoning behind each rule is in [`docs/explanation/`](docs/explanation/).

## Requirements

Node.js 22 or later. No native dependencies.

## License

Apache-2.0 — see [LICENSE](LICENSE). Governance & decisions: [`project/`](project/) (see
[`GOVERNANCE.md`](GOVERNANCE.md)). Docs: [`docs/`](docs/).
