# @entelekheia/ref-id

**Parse, serialise, digest and validate `ref:` identifiers — against a specification shipped as data.**
The package embeds `spec/ref-id.json` and is held to it by that file's conformance vectors.

```text
ref:[<version>:]<type>:<locator>[;<qualifier>=<value>]*[#<declared-name-path>[;<refinement>=<value>]*]
```

```ts
import { parse } from "@entelekheia/ref-id"

parse("ref:pkg:npm/@acme/scanner-core@0.1.0#Observation")
// => {
//   status: "ok",
//   type: "pkg",
//   locator: "npm/@acme/scanner-core@0.1.0",
//   fragment: { path: "Observation", refinements: [] },
//   delegated: "pkg:npm/@acme/scanner-core@0.1.0",
//   canonical: "pkg:npm/%40acme/scanner-core@0.1.0",
//   ...
// }
```

## Why

Naming a thing by its file path breaks on the first move; naming it by a content hash breaks on the first
edit. `ref:` names it by what its format declared — a Package URL when a manifest proves the name, a
declared corpus name when nothing does — and keeps state (`;at=`), instrument (`;by=`) and population
(`;over=`) as qualifiers rather than folding them into the name. One regular expression decomposes an
identifier; each captured part is handed to the validator that already owns that format.

## Install

```sh
npm install @entelekheia/ref-id
```

## Usage

The entry points are `parse`, `serialise`, `digest`, `validateEnvelope`, `samePackage` and `covers`; their
contracts are the vectors in `spec/ref-id.json` (`parse`, `roundtrip`, `digest`, `envelope`,
`comparison`). An unknown locator type parses and degrades to `uncovered`; it never throws.

Three questions get three answers, and they are not interchangeable:

```ts
import { covers, sameIdentifier, samePackage } from "@entelekheia/ref-id"

sameIdentifier("pkg:npm/x@1.0.0", "pkg:npm/x@2.0.0") // false — two identifiers, compared byte for byte
samePackage("ref:pkg:npm/x@1.0.0", "ref:pkg:npm/x@2.0.0") // true  — one released thing, two versions
covers("ref:pkg:npm/x", "ref:pkg:npm/x@1.0.0") // true  — the general covers the specific
covers("ref:pkg:npm/x@1.0.0", "ref:pkg:npm/x") // false — and never the reverse
```

`sameIdentifier` is what a digest and an envelope are built on, so it stays strict. `samePackage` is
symmetric and ignores the locator's version, and only where the type declares it carries one — a mailbox's
`@` and a served model's quantisation key are not versions. `covers` is **asymmetric**: what the first
identifier leaves undeclared, the second may declare freely; what the first declares, the second must
declare identically. That is what makes a partial identifier a query over a store keyed by identifier.

## Environments

**Node.js 22 or later, and any browser reached through a bundler.** The package ships two builds of one
source, and `exports` picks between them: a bundler that honours the `browser` condition takes the browser
build, everything else takes the default. Nothing to configure, and the public API is the same either way.

|  | Node | Browser |
|---|---|---|
| Where the specification comes from | `spec/ref-id.json`, read from disk on first use | a constant compiled into the build |
| When its integrity is established | at load — the bytes are hashed and compared with the sidecar, and a mismatch throws | at build — the generator refuses to emit from a specification that fails its sidecar, and a staleness check refuses a compiled constant that no longer matches the file |
| sha256 for `digest()` | Node's `crypto` | `@noble/hashes` (pure JavaScript, no dependencies) |

**What the browser build gives up**, stated rather than discovered:

- **No integrity check at runtime.** There is no file to compare the constant against, and hashing it
  against a digest compiled from the same source in the same build would be a check that cannot fail —
  which reads as a guarantee and is a tautology. The build exports `SPEC_DIGEST`, the digest
  `spec/ref-id.json` carried when the constant was generated; it is a statement about provenance, not a
  verification, and it is labelled as one.
- **No `loadSpecFrom`.** It takes a directory to read a specification and its sidecar from. A browser has
  neither, so the browser build does not export it; every other export is present and identical.
  **TypeScript will not warn you about that on the default configuration.** Under
  `"moduleResolution": "bundler"` without `customConditions`, the compiler resolves types through the
  default condition — which does declare `loadSpecFrom` — while the bundler picks the browser build at
  build time. `tsc --noEmit` then passes on an import that fails when the bundle is produced. Add
  `"customConditions": ["browser"]` to your `tsconfig.json` and the compiler sees the same surface your
  bundler does.
- **`digest()` is sha256 only.** The algorithm is specification data, and the browser implementation
  honours `sha256` alone: a specification naming another one throws a `SpecVersionError` naming it, where
  Node would honour whatever its own `crypto` honours.
- **The compiled-in specification costs bundle size.** It is the whole published file, including the parts
  a given consumer never reads.

The two builds are held to each other by `npm run test:differential`, which runs the browser build as a
fourth implementation beside Node, Rust and Swift over every input the specification names, and fails on
the first disagreement. `npm run build` additionally walks the emitted browser module graph and refuses it
if any Node builtin — or anything resolving a path against a module's own location — survives into it.

Runtime dependencies: `packageurl-js` and `@noble/hashes`, both pure JavaScript. No native modules.

## License

Apache-2.0 — see the repository's `LICENSE`.
