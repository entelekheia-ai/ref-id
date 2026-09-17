---
"@entelekheia/ref-id": minor
---

The package runs in a browser.

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
