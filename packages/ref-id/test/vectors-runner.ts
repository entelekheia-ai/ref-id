// SPDX-License-Identifier: Apache-2.0
//
// Runs the three vector groups the line protocol does not carry — `build`, `digest` and `envelope` —
// through one entry point and prints the answers as canonical JSON, one object.
//
// `--browser` selects the browser entry, exactly as parse-lines.ts's flag does. It is a separate
// process per entry for a reason that is easy to miss and would quietly invalidate the comparison:
// both entry points import the SAME `spec.ts` module instance, so importing them into one process
// makes the second `installSpecSource` overwrite the first, and both entries then answer from
// whichever spec source was installed last. A comparison run that way compares a build with itself.
//
// Not a `*.test.ts`: `npm test` globs those, and this file is a subject, not a test.

const asBrowser = process.argv.includes("--browser")

const entry = asBrowser ? await import("../src/index.browser.ts") : await import("../src/index.ts")
const { build, canonicalise, digest, validateEnvelope } = entry

// Read through the Node loader regardless of which entry is under test: the point is to feed both
// entries the same vectors, not to ask each one what its own vectors are.
const { loadSpecFrom } = await import("../src/spec.node.ts")
const spec = loadSpecFrom(new URL("../spec", import.meta.url).pathname)

/** Every answer as a value, including a refusal — a throw is an answer the two builds must share. */
function attempt(run: () => unknown): unknown {
  try {
    return { ok: run() }
  } catch (error) {
    return { threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}

const vectors = spec.vectors as unknown as {
  build: { name: string; parts: unknown }[]
  digest: { name: string; members: unknown }[]
  envelope: { name: string; requestedId: string; envelope: unknown }[]
}

console.log(
  canonicalise({
    build: vectors.build.map((vector) => ({ name: vector.name, result: attempt(() => build(vector.parts as never)) })),
    digest: vectors.digest.map((vector) => ({ name: vector.name, result: attempt(() => digest(vector.members as never)) })),
    envelope: vectors.envelope.map((vector) => ({
      name: vector.name,
      result: attempt(() => validateEnvelope(vector.requestedId, vector.envelope)),
    })),
  }),
)
