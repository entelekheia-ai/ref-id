// SPDX-License-Identifier: Apache-2.0
//
// Prints the runtime export names of one entry point as a JSON array. `--browser` selects
// `index.browser.ts`, exactly as vectors-runner.ts's flag does — and for the same reason this is a
// separate process rather than a second dynamic import in the caller: both entries share one
// `spec.ts` module instance, so a second `installSpecSource` in the same process would overwrite the
// first. Nothing here calls an exported function, so that sharing does not actually matter for this
// script, but importing the module still runs its top-level `installSpecSource`/`installHash` calls,
// and keeping one entry per process keeps this file identical in shape to its sibling.
//
// A type-only export produces no property on the namespace object a dynamic `import()` returns, so
// `Object.keys` already reports exactly the runtime surface — functions, classes and values — with no
// filtering needed.
//
// Not a `*.test.ts`: `npm test` globs those, and this file is a subject, not a test.

const asBrowser = process.argv.includes("--browser")
const entry = asBrowser ? await import("../src/index.browser.ts") : await import("../src/index.ts")

console.log(JSON.stringify(Object.keys(entry).sort()))
