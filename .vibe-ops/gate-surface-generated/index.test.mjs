// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import gate from "./index.mjs"

const REPO_ROOT = new URL("../..", import.meta.url).pathname

async function withGenerators(files, body) {
  const root = await mkdtemp(path.join(tmpdir(), "gate-surface-generated-"))
  try {
    await mkdir(path.join(root, "scripts"), { recursive: true })
    for (const [name, source] of Object.entries(files)) await writeFile(path.join(root, name), source)
    return await body(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test("the real generators of this worktree produce zero findings", async () => {
  const outcome = await gate.run({ repoRoot: REPO_ROOT, files: [], options: {} })
  assert.deepEqual(outcome, { findings: [], examined: 4 })
})

test("fires surface-stale when a generator's --check exits non-zero", () =>
  withGenerators({ "scripts/stale.mjs": 'console.error("stale — regenerate"); process.exit(1)\n', "scripts/fresh.mjs": "process.exit(0)\n" }, async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { generators: ["scripts/stale.mjs", "scripts/fresh.mjs"] } })
    assert.equal(outcome.examined, 2)
    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].file, "scripts/stale.mjs")
    assert.match(outcome.findings[0].evidence, /stale — regenerate/)
  }))

test("near-miss: a generator the gate names and the tree lacks is a finding, never a skip", () =>
  withGenerators({}, async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { generators: ["scripts/gone.mjs"] } })
    assert.equal(outcome.findings.length, 1)
    assert.match(outcome.findings[0].evidence, /absent from the tree/)
    assert.equal(outcome.skipped, undefined)
  }))

test("near-miss: the gate calls each generator in --check mode, never in the mode that writes", () =>
  withGenerators({ "scripts/writer.mjs": 'if (!process.argv.includes("--check")) { console.error("wrote the surface"); process.exit(1) }\n' }, async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { generators: ["scripts/writer.mjs"] } })
    assert.deepEqual(outcome, { findings: [], examined: 1 })
  }))
