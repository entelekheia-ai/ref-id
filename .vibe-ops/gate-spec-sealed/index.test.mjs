// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"

import gate from "./index.mjs"

const REPO_ROOT = new URL("../..", import.meta.url).pathname

async function tempRepo() {
  const root = await mkdtemp(path.join(tmpdir(), "gate-spec-sealed-"))
  await mkdir(path.join(root, "spec"), { recursive: true })
  return root
}

/** Mirrors packages/ref-id/src/spec.ts canonicalise() for a plain-JSON fixture. */
function canonicalDigestOf(value) {
  const canon = (v) => {
    if (v === null) return "null"
    if (typeof v === "boolean") return v ? "true" : "false"
    if (typeof v === "number") return String(v)
    if (typeof v === "string") return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`
    const keys = Object.keys(v).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`
  }
  return createHash("sha256").update(canon(value), "utf8").digest("hex")
}

const ctxFor = (repoRoot) => ({
  repoRoot,
  pluginDir: repoRoot,
  files: ["spec/ref-id.json", "spec/ref-id.json.sha256"],
  options: {},
  documents: undefined,
})

test("fires spec-unsealed when the sidecar does not match the spec", async () => {
  const repoRoot = await tempRepo()
  try {
    const spec = { specVersion: "9.9.9", note: "broken" }
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    await writeFile(path.join(repoRoot, "spec/ref-id.json.sha256"), "0".repeat(64) + "\n")

    const outcome = await gate.run(ctxFor(repoRoot))

    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].rule, "spec-unsealed")
    assert.equal(outcome.findings[0].file, "spec/ref-id.json.sha256")
    assert.match(outcome.findings[0].evidence, /does not match its sidecar/)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires spec-unsealed when the sidecar is entirely absent", async () => {
  const repoRoot = await tempRepo()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify({ a: 1 }))

    const outcome = await gate.run(ctxFor(repoRoot))

    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].rule, "spec-unsealed")
    assert.match(outcome.findings[0].evidence, /no sidecar/)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("near-miss: a sidecar with no trailing newline still matches — the reader trims", async () => {
  const repoRoot = await tempRepo()
  try {
    const spec = { a: 1, b: [1, 2, 3] }
    const digest = canonicalDigestOf(spec)
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    // Deliberately no trailing newline, unlike the real writer.
    await writeFile(path.join(repoRoot, "spec/ref-id.json.sha256"), digest)

    const outcome = await gate.run(ctxFor(repoRoot))

    assert.equal(outcome.findings.length, 0)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("the real spec/ref-id.json of this worktree produces zero findings", async () => {
  const outcome = await gate.run(ctxFor(REPO_ROOT))
  assert.equal(outcome.findings.length, 0)
  assert.equal(outcome.examined, 1)
})

test("fix() on a broken tree writes a sidecar run() then accepts", async () => {
  const repoRoot = await tempRepo()
  try {
    const spec = { specVersion: "3.3.3", list: [3, 2, 1], nested: { z: 1, a: 2 } }
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    await writeFile(path.join(repoRoot, "spec/ref-id.json.sha256"), "0".repeat(64) + "\n")

    const before = await gate.run(ctxFor(repoRoot))
    assert.equal(before.findings.length, 1)

    const fixes = await gate.fix(ctxFor(repoRoot), before.findings)
    assert.equal(fixes.length, 1)
    assert.equal(fixes[0].file, "spec/ref-id.json.sha256")

    const after = await gate.run(ctxFor(repoRoot))
    assert.equal(after.findings.length, 0)

    // Byte-identical to what scripts/seal-spec.mjs's write mode produces for the same canonical
    // digest: `${computed}\n`, nothing else.
    const written = await readFile(path.join(repoRoot, "spec/ref-id.json.sha256"), "utf8")
    const expectedDigest = canonicalDigestOf(spec)
    assert.equal(written, `${expectedDigest}\n`)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})
