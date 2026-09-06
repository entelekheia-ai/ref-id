# @entelekheia/ref-id

**Parse, serialise, digest and validate `ref:` identifiers — against a specification shipped as data.**
The package embeds `spec/ref-id.json` and is held to it by that file's conformance vectors.

```text
ref:[<version>:]<type>:<locator>[;<qualifier>=<value>]*[#<declared-name-path>[;<refinement>=<value>]*]
```

<!-- PROOF PLACEHOLDER: copy the smallest runnable example from test/ once the vectors pass. -->

## Why

Naming a thing by its file path breaks on the first move; naming it by a content hash breaks on the first
edit. `ref:` names it by what its format declared — a Package URL when a manifest proves the name, a
declared corpus name when nothing does — and keeps state (`;at=`), instrument (`;by=`) and population
(`;over=`) as qualifiers rather than folding them into the name. One regular expression decomposes an
identifier; each captured part is handed to the validator that already owns that format.

## Install

Not yet published — see the repository's [`project/plans/`](../../project/plans/).

## Usage

The entry points are `parse`, `serialise`, `digest` and `validateEnvelope`; their contracts are the
vectors in `spec/ref-id.json` (`parse`, `roundtrip`, `digest`, `envelope`). An unknown locator type parses
and degrades to `uncovered`; it never throws.

## Requirements

Node.js 22 or later. Runtime dependency: `packageurl-js` (pure JavaScript). No native modules.

## License

Apache-2.0 — see the repository [LICENSE](../../LICENSE).
