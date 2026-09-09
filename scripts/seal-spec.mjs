#!/usr/bin/env node
/**
 * Re-seal `spec/ref-id.json` against its sidecar digest.
 *
 * The loader refuses a specification whose bytes do not match `spec/ref-id.json.sha256`, which is what
 * stops one copy of the data drifting from the copy an implementation ships. Nothing wrote that sidecar:
 * the digest existed only inside the check that verifies it, so every edit to the specification needed
 * somebody to recompute it by hand and get it right — and getting it wrong disables every implementation
 * at once rather than failing one test.
 *
 * It computes the digest through the package's own `canonicalise`, never a second serialisation of its
 * own. A resealer that canonicalised differently from the verifier would produce a file that seals
 * cleanly here and refuses to load everywhere.
 *
 *   node scripts/seal-spec.mjs [--check]
 *
 * `--check` reports without writing and exits non-zero on a mismatch, so a gate can call it.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canonicalise } from '../packages/ref-id/dist/index.js'

const SPEC = fileURLToPath(new URL('../spec/ref-id.json', import.meta.url))
const SIDECAR = `${SPEC}.sha256`
const checkOnly = process.argv.includes('--check')

const raw = readFileSync(SPEC, 'utf8')
const computed = createHash('sha256').update(canonicalise(JSON.parse(raw)), 'utf8').digest('hex')
const recorded = readFileSync(SIDECAR, 'utf8').trim()

if (computed === recorded) {
  console.log(`sealed: ${computed}`)
  process.exit(0)
}

if (checkOnly) {
  console.error('spec/ref-id.json does not match its sidecar')
  console.error(`  recorded ${recorded}`)
  console.error(`  computed ${computed}`)
  console.error('run `node scripts/seal-spec.mjs` to re-seal it')
  process.exit(1)
}

writeFileSync(SIDECAR, `${computed}\n`)
console.log(`re-sealed: ${recorded} -> ${computed}`)
