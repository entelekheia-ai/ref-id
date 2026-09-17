#!/usr/bin/env node
/**
 * Generate `packages/ref-id/src/spec.browser.ts` — the specification compiled in as a typed
 * constant, for the environment that has no filesystem to read `spec/ref-id.json` from.
 *
 * Plan-004, Track 1: the browser cannot run `loadSpec()`'s `node:fs` + `node:crypto` path, so the
 * integrity guarantee moves earlier. This generator verifies `spec/ref-id.json` against its sidecar
 * FIRST, through `loadSpecFrom` — the same function the Node build's tests exercise, not a second
 * reading of the file — and only then emits a module. A spec that fails its sidecar throws here and
 * no module is written; a stale or hand-edited spec can never become the constant the browser trusts.
 *
 * The generated module declares the digest it was built from as a field. That is a STATEMENT about
 * provenance, not a verification — there is nothing in the browser to recompute it against. The field
 * is labelled as a statement in the module itself, so a reader cannot mistake it for a check.
 *
 *   node scripts/gen-spec.mjs [--check]
 *
 * `--check` regenerates into memory and diffs against the committed file, without writing — this is
 * the staleness guard's mechanism, reused rather than duplicated (see
 * packages/ref-id/test/spec-browser-staleness.test.ts). It reports a byte diff position rather than
 * only "stale", and exits non-zero on any mismatch, including a missing file.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// The SOURCE, not the build — same reasoning as scripts/seal-spec.mjs: `dist/` is gitignored and a
// fresh clone has none, so reaching for it fails exactly when a stale spec.browser.ts told someone to
// regenerate. Importing loadSpecFrom (rather than re-reading + re-hashing here) means the generator
// verifies the spec exactly the way the package itself does — never a second idea of what "verified"
// means. It lives in spec.node.ts, which is the half of the old spec.ts that keeps the filesystem —
// the half the browser build does not import (Plan-004, Track 2).
import { loadSpecFrom } from '../packages/ref-id/src/spec.node.ts'

const SPEC_DIR = fileURLToPath(new URL('../spec', import.meta.url))
const OUT_FILE = fileURLToPath(new URL('../packages/ref-id/src/spec.browser.ts', import.meta.url))

const HEADER = `// SPDX-License-Identifier: Apache-2.0
//
// GENERATED FILE — do not edit by hand. Regenerate with:
//   node scripts/gen-spec.mjs
//
// The specification, compiled in as a constant, for an environment with no filesystem to read
// spec/ref-id.json from. Produced by scripts/gen-spec.mjs, which verifies spec/ref-id.json against
// its sidecar digest BEFORE emitting this file — a spec that fails that check never reaches here.
// scripts/checks composes the staleness guard that fails when this file no longer matches the spec
// it was generated from (packages/ref-id/test/spec-browser-staleness.test.ts).

import type { RefIdSpec } from "./spec.ts"

/**
 * The sidecar digest \`spec/ref-id.json.sha256\` carried at the moment this file was generated.
 *
 * This is a STATEMENT about provenance, not a verification: nothing in this module recomputes it,
 * and there is no live spec/ref-id.json here to recompute it against. The guarantee that this digest
 * is the one that was actually verified belongs to the generator (scripts/gen-spec.mjs, which refuses
 * to emit from a spec that fails its sidecar) and to the staleness guard that regenerates and diffs
 * this file in CI. Reading this field as a check performed at import time would be a mistake.
 */
export const SPEC_DIGEST: string = `

/**
 * Renders the generated module's source text for a given verified spec + digest. Exported so the
 * staleness guard can produce the same bytes in-process, without shelling out to this script or
 * writing to disk.
 */
export function render(spec, digest) {
  // `as unknown as RefIdSpec`, not a `: RefIdSpec` annotation on the literal: spec.ts's own loader
  // takes exactly this two-step shortcut (`JSON.parse(rawJson) as unknown`, then later `parsed as
  // RefIdSpec`), because RefIdSpec is "typed only as far as the code reads it" (spec.ts's own doc
  // comment) — it does not declare every key the published JSON carries (e.g. `dispatch[*].corpus`,
  // `vectors.canonical`), and one field (`roles`) mixes `string` and `string[]` values in a way the
  // declared `Record<string, string[]>` cannot express. A direct `as RefIdSpec` on the literal fails
  // TypeScript's "insufficient overlap" check for the same reason a direct annotation fails its
  // excess-property check; going through `unknown` first is the loader's own idiom for this exact
  // gap, not a new one invented here to silence the compiler.
  return `${HEADER}${JSON.stringify(digest)}

export const SPEC = ${JSON.stringify(spec)} as unknown as RefIdSpec
`
}

/** Verifies spec/ref-id.json against its sidecar and renders the module text. Throws first. */
export function generate() {
  // loadSpecFrom reads spec/ref-id.json + spec/ref-id.json.sha256, canonicalises, hashes, and throws
  // SpecIntegrityError/SpecVersionError before returning anything — so a failing spec never reaches
  // JSON.stringify below.
  const spec = loadSpecFrom(SPEC_DIR)
  const digest = readFileSync(`${SPEC_DIR}/ref-id.json.sha256`, 'utf8').trim()
  return render(spec, digest)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const checkOnly = process.argv.includes('--check')
  const rendered = generate()

  if (checkOnly) {
    let existing
    try {
      existing = readFileSync(OUT_FILE, 'utf8')
    } catch {
      console.error(`${OUT_FILE} does not exist — run \`node scripts/gen-spec.mjs\` to generate it`)
      process.exit(1)
    }
    if (existing !== rendered) {
      console.error('packages/ref-id/src/spec.browser.ts does not match spec/ref-id.json')
      console.error('run `node scripts/gen-spec.mjs` to regenerate it')
      process.exit(1)
    }
    console.log('spec.browser.ts matches spec/ref-id.json')
    process.exit(0)
  }

  writeFileSync(OUT_FILE, rendered)
  console.log(`generated: ${OUT_FILE}`)
}
