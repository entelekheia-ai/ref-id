#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Re-seal `spec/ref-id.json` against its sidecar digest.
 *
 * The rule and the writer both live in the `spec-sealed` gate (`.vibe-ops/gate-spec-sealed/`), which the
 * commit gate runs: its `run()` compares the digest, its `fix()` writes it. This file is only the door a
 * person can type. It exists because `vibe-ops check` does not forward `--fix`, and the one surface that
 * does (`vibe-ops hook ops`) reads a hook payload from stdin. When the CLI can repair from a terminal,
 * this file goes.
 *
 *   node scripts/seal-spec.mjs
 */
import { fileURLToPath } from 'node:url'
import gate from '../.vibe-ops/gate-spec-sealed/index.mjs'

const ctx = { repoRoot: fileURLToPath(new URL('..', import.meta.url)), files: [], options: {} }
const outcome = await gate.run(ctx)

if (outcome.skipped !== undefined) {
  console.error(`cannot seal: ${outcome.skipped}`)
  process.exit(1)
}
if (outcome.findings.length === 0) {
  console.log('sealed: spec/ref-id.json already matches its sidecar')
  process.exit(0)
}

const fixes = await gate.fix(ctx, outcome.findings)
if (fixes.length === 0) {
  // Not mechanical: the specification itself does not parse, and the finding says why.
  for (const finding of outcome.findings) console.error(finding.evidence)
  process.exit(1)
}
for (const fix of fixes) console.log(`${fix.file}: ${fix.action}`)
