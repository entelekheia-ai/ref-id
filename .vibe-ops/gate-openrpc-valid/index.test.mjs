// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile, readFile, cp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import gate from "./index.mjs"

const REPO_ROOT = new URL("../..", import.meta.url).pathname
const GATE_FILE = fileURLToPath(new URL("./index.mjs", import.meta.url))

const ctxFor = (repoRoot) => ({ repoRoot, pluginDir: repoRoot, files: ["spec/ref-id.json"], options: {}, documents: undefined })

async function tempRepoWithRealSpec() {
  const root = await mkdtemp(path.join(tmpdir(), "gate-openrpc-valid-"))
  await mkdir(path.join(root, "spec"), { recursive: true })
  await cp(path.join(REPO_ROOT, "spec/ref-id.json"), path.join(root, "spec/ref-id.json"))
  return root
}

async function loadRealSpec() {
  const raw = await readFile(path.join(REPO_ROOT, "spec/ref-id.json"), "utf8")
  return JSON.parse(raw)
}

test("the real spec/ref-id.json of this worktree produces zero findings", async () => {
  const repoRoot = await tempRepoWithRealSpec()
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    assert.equal(outcome.findings.length, 0)
    const spec = await loadRealSpec()
    assert.equal(outcome.examined, spec.openRPC.methods.length)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when an x-rule pointer names a key that does not exist", async () => {
  const spec = await loadRealSpec()
  spec.openRPC.methods[0]["x-rule"] = "/this/key/does/not/exist"
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /x-rule .* names no key/.test(f.evidence))
    assert.ok(hits.length >= 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when a vector group is claimed by no method", async () => {
  const spec = await loadRealSpec()
  const groups = Object.keys(spec.vectors)
  let claimingIndex = -1
  let claimedGroup
  for (const [index, method] of spec.openRPC.methods.entries()) {
    if (typeof method["x-vectors"] === "string" && groups.filter((g) => g === method["x-vectors"]).length >= 1) {
      const otherClaimers = spec.openRPC.methods.filter((m) => m["x-vectors"] === method["x-vectors"])
      if (otherClaimers.length === 1) {
        claimingIndex = index
        claimedGroup = method["x-vectors"]
        break
      }
    }
  }
  assert.notEqual(claimingIndex, -1, "fixture precondition: at least one group must have exactly one claimer")
  spec.openRPC.methods[claimingIndex]["x-vectors"] = null
  spec.openRPC.methods[claimingIndex]["x-vectors-reason"] = "test override — orphaning the group on purpose"

  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && f.evidence.includes(`vector group ${claimedGroup} is claimed by no method`))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("near-miss: a method whose x-vectors names an existing group does not fire", async () => {
  const repoRoot = await tempRepoWithRealSpec()
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    const spurious = outcome.findings.filter((f) => /is not a vector group/.test(f.evidence))
    assert.equal(spurious.length, 0)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("skipped when a dependency is not resolvable, without touching the real node_modules", async () => {
  // Shadow "ajv" for a COPY of the gate placed in its own scratch directory, whose local
  // node_modules/ajv throws at import time — Node's bare-specifier resolution prefers the nearest
  // node_modules walking up from the importing file, so this never touches the real install.
  const scratch = await mkdtemp(path.join(tmpdir(), "gate-openrpc-valid-shadow-"))
  try {
    const pointerHelperSrc = await readFile(path.join(REPO_ROOT, ".vibe-ops/_json-pointer-line.mjs"), "utf8")
    await mkdir(path.join(scratch, "gate"), { recursive: true })
    await writeFile(path.join(scratch, "_json-pointer-line.mjs"), pointerHelperSrc)
    const gateSrc = await readFile(GATE_FILE, "utf8")
    await writeFile(path.join(scratch, "gate/index.mjs"), gateSrc)

    await mkdir(path.join(scratch, "gate/node_modules/ajv"), { recursive: true })
    await writeFile(path.join(scratch, "gate/node_modules/ajv/package.json"), JSON.stringify({ name: "ajv", version: "0.0.0", main: "index.js" }))
    await writeFile(path.join(scratch, "gate/node_modules/ajv/index.js"), "throw new Error('shadowed for test')\n")

    const shadowed = (await import(`${path.join(scratch, "gate/index.mjs")}?bust=${Date.now()}`)).default
    const repoRoot = await tempRepoWithRealSpec()
    try {
      const outcome = await shadowed.run(ctxFor(repoRoot))
      assert.equal(outcome.findings.length, 0)
      assert.match(outcome.skipped, /ajv/)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})
