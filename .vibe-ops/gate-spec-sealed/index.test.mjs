// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"

import gate, { typeStrippingAvailable } from "./index.mjs"

const REPO_ROOT = new URL("../..", import.meta.url).pathname
const GATE_FILE = new URL("./index.mjs", import.meta.url).pathname

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

// --- F2: typeStrippingAvailable is the ONLY legitimate skip; everything else is a finding ---

test("typeStrippingAvailable: a string feature flag (\"strip\"/\"transform\") means available", () => {
  assert.equal(typeStrippingAvailable({ typescript: "strip" }, "20.0.0"), true)
  assert.equal(typeStrippingAvailable({ typescript: "transform" }, "20.0.0"), true)
})

test("typeStrippingAvailable: an explicit boolean feature flag wins over the version fallback", () => {
  assert.equal(typeStrippingAvailable({ typescript: true }, "18.0.0"), true)
  assert.equal(typeStrippingAvailable({ typescript: false }, "99.0.0"), false)
})

test("typeStrippingAvailable: falls back to the version floor (22.18) when no feature flag is present", () => {
  assert.equal(typeStrippingAvailable({}, "22.17.0"), false)
  assert.equal(typeStrippingAvailable({}, "22.18.0"), true)
  assert.equal(typeStrippingAvailable({}, "23.0.0"), true)
  // {} (not `undefined`) for "no feature flag": `undefined` is a default-parameter miss, which falls
  // back to the REAL process.features — deliberately, so a plain `typeStrippingAvailable()` call always
  // reads this session's real environment rather than a frozen guess.
  assert.equal(typeStrippingAvailable({}, "21.9.9"), false)
})

test("typeStrippingAvailable: this session's real Node is available (measured process.features.typescript)", () => {
  assert.equal(typeStrippingAvailable(), true)
})

/**
 * Places a COPY of the gate two directories under a scratch root — mirroring `.vibe-ops/gate-spec-sealed/`
 * under the real repo — alongside a FAKE `packages/ref-id/src/spec.ts`, so the gate's own
 * `new URL("../../packages/ref-id/src/spec.ts", import.meta.url)` resolves to the fake file instead of
 * the real one. The same scratch root doubles as `ctx.repoRoot`, holding `spec/ref-id.json`.
 */
async function tempRepoWithFakeSpecModule(specTsSource) {
  const root = await mkdtemp(path.join(tmpdir(), "gate-spec-sealed-fakemod-"))
  await mkdir(path.join(root, ".vibe-ops/gate-spec-sealed"), { recursive: true })
  await mkdir(path.join(root, "packages/ref-id/src"), { recursive: true })
  await mkdir(path.join(root, "spec"), { recursive: true })
  const gateSrc = await readFile(GATE_FILE, "utf8")
  await writeFile(path.join(root, ".vibe-ops/gate-spec-sealed/index.mjs"), gateSrc)
  await writeFile(path.join(root, "packages/ref-id/src/spec.ts"), specTsSource)
  await writeFile(path.join(root, "spec/ref-id.json"), JSON.stringify({ anything: "goes — never reached on this path" }))
  const copiedGate = (await import(`${path.join(root, ".vibe-ops/gate-spec-sealed/index.mjs")}?bust=${Date.now()}-${Math.random()}`)).default
  return { root, copiedGate }
}

test("fires spec-unsealed when packages/ref-id/src/spec.ts throws on import (not a stripping problem)", async () => {
  const { root, copiedGate } = await tempRepoWithFakeSpecModule("throw new Error('spec.ts broken on purpose')\n")
  try {
    const outcome = await copiedGate.run(ctxFor(root))
    assert.equal(outcome.skipped, undefined)
    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].rule, "spec-unsealed")
    assert.match(outcome.findings[0].evidence, /could not be imported/)
    assert.match(outcome.findings[0].evidence, /spec\.ts broken on purpose/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("fires spec-unsealed when packages/ref-id/src/spec.ts loads but exports no canonicalise function", async () => {
  const { root, copiedGate } = await tempRepoWithFakeSpecModule("export function notCanonicalise() { return 'nope' }\n")
  try {
    const outcome = await copiedGate.run(ctxFor(root))
    assert.equal(outcome.skipped, undefined)
    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].rule, "spec-unsealed")
    assert.match(outcome.findings[0].evidence, /does not export a function named "canonicalise"/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
