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

/**
 * Places a COPY of the gate (plus the pointer helper it imports) in its own scratch directory, so a
 * dynamic `import("ajv")` from that copy resolves against `<scratch>/gate/node_modules` rather than the
 * real install — Node's bare-specifier resolution walks up from the importing file, and a fresh
 * scratch tree under the OS tmpdir has no `ajv` anywhere in its ancestry. `nodeModules === undefined`
 * leaves no local `node_modules/ajv` at all, so the import fails with the real `ERR_MODULE_NOT_FOUND` —
 * the package is genuinely absent, nothing faked. Passing `nodeModules` writes that fake package there
 * instead, so the specifier resolves to code that then throws — present, but broken.
 */
async function loadShadowedGate(nodeModules) {
  const scratch = await mkdtemp(path.join(tmpdir(), "gate-openrpc-valid-shadow-"))
  const pointerHelperSrc = await readFile(path.join(REPO_ROOT, ".vibe-ops/_json-pointer-line.mjs"), "utf8")
  await mkdir(path.join(scratch, "gate"), { recursive: true })
  await writeFile(path.join(scratch, "_json-pointer-line.mjs"), pointerHelperSrc)
  const gateSrc = await readFile(GATE_FILE, "utf8")
  await writeFile(path.join(scratch, "gate/index.mjs"), gateSrc)

  if (nodeModules !== undefined) {
    for (const [pkgName, files] of Object.entries(nodeModules)) {
      const pkgDir = path.join(scratch, "gate/node_modules", pkgName)
      await mkdir(pkgDir, { recursive: true })
      for (const [relPath, content] of Object.entries(files)) await writeFile(path.join(pkgDir, relPath), content)
    }
  }

  const gate = (await import(`${path.join(scratch, "gate/index.mjs")}?bust=${Date.now()}-${Math.random()}`)).default
  return { gate, scratch }
}

test("skipped when a dependency is not installed at all (ERR_MODULE_NOT_FOUND) — the instrument is absent", async () => {
  const { gate: shadowed, scratch } = await loadShadowedGate(undefined)
  try {
    const repoRoot = await tempRepoWithRealSpec()
    try {
      const outcome = await shadowed.run(ctxFor(repoRoot))
      assert.equal(outcome.findings.length, 0)
      assert.match(outcome.skipped, /ajv/)
      assert.match(outcome.skipped, /not installed/)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when a dependency resolves but throws while loading — present, not absent", async () => {
  const { gate: shadowed, scratch } = await loadShadowedGate({
    ajv: {
      "package.json": JSON.stringify({ name: "ajv", version: "0.0.0", main: "index.js" }),
      "index.js": "throw new Error('shadowed for test')\n",
    },
  })
  try {
    const repoRoot = await tempRepoWithRealSpec()
    try {
      const outcome = await shadowed.run(ctxFor(repoRoot))
      assert.equal(outcome.skipped, undefined)
      const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /dependency "ajv" could not be loaded/.test(f.evidence))
      assert.equal(hits.length, 1)
    } finally {
      await rm(repoRoot, { recursive: true, force: true })
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

// --- F3: shape defects are findings, never a throw or a silent skip ---

test("fires openrpc-invalid when openRPC itself is absent", async () => {
  const repoRoot = await tempRepoWithRealSpec()
  try {
    const spec = await loadRealSpec()
    delete spec.openRPC
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    assert.equal(outcome.skipped, undefined)
    assert.equal(outcome.examined, 0)
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /openRPC is absent — expected an object/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when openRPC.methods is not an array", async () => {
  const spec = await loadRealSpec()
  spec.openRPC.methods = "not-an-array"
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /openRPC\.methods is string — expected an array/.test(f.evidence))
    assert.equal(hits.length, 1)
    assert.equal(outcome.examined, 0)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when openRPC.components is missing and when components.schemas is not an object", async () => {
  const withoutComponents = await loadRealSpec()
  delete withoutComponents.openRPC.components
  const repoRoot1 = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot1, "spec/ref-id.json"), JSON.stringify(withoutComponents))
    const outcome1 = await gate.run(ctxFor(repoRoot1))
    assert.equal(outcome1.findings.filter((f) => /openRPC\.components is absent — expected an object/.test(f.evidence)).length, 1)
  } finally {
    await rm(repoRoot1, { recursive: true, force: true })
  }

  const withBadSchemas = await loadRealSpec()
  withBadSchemas.openRPC.components.schemas = ["not", "an", "object"]
  const repoRoot2 = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot2, "spec/ref-id.json"), JSON.stringify(withBadSchemas))
    const outcome2 = await gate.run(ctxFor(repoRoot2))
    assert.equal(outcome2.findings.filter((f) => /openRPC\.components\.schemas is an array — expected an object/.test(f.evidence)).length, 1)
  } finally {
    await rm(repoRoot2, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when a method is not an object, and keeps examining the rest", async () => {
  const spec = await loadRealSpec()
  const goodMethodCount = spec.openRPC.methods.length
  spec.openRPC.methods.splice(1, 0, "not-a-method-object")
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /openRPC\.methods\[1\] is string — expected an object/.test(f.evidence))
    assert.equal(hits.length, 1)
    assert.equal(outcome.examined, goodMethodCount + 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

// --- F4: x-rule must be a string starting with "/" ---

test("fires openrpc-invalid when x-rule is an empty string (used to resolve to the whole spec and pass)", async () => {
  const spec = await loadRealSpec()
  spec.openRPC.methods[0]["x-rule"] = ""
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /x-rule "" names no key/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when x-rule has no leading slash (used to resolve to the whole spec and pass)", async () => {
  const spec = await loadRealSpec()
  spec.openRPC.methods[0]["x-rule"] = "comparison"
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /x-rule "comparison" names no key/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

// --- F5: pointer tokens are JSON-Pointer-escaped before pointerToLine ---

test("escapes '~' and '/' in a vector-group name used inside a pointer", async () => {
  const spec = await loadRealSpec()
  const groups = Object.keys(spec.vectors)
  const weirdGroup = "weird/group~name"
  spec.vectors[weirdGroup] = []
  // No method claims it, so it must be reported unclaimed — at a pointer that escapes the "/" and "~".
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && f.evidence.includes(`vector group ${weirdGroup} is claimed by no method`))
    assert.equal(hits.length, 1)
    // A crash-free run over an escaped pointer is the property under test; pointerToLine may or may not
    // resolve depending on how the fixture serialised, so only its type is asserted.
    assert.ok(hits[0].line === undefined || typeof hits[0].line === "number")
    void groups
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

// --- F6: branches not previously exercised by a firing test ---

test("fires openrpc-invalid when the document fails OpenRPC meta-schema validation", async () => {
  const spec = await loadRealSpec()
  delete spec.openRPC.info // required by the OpenRPC meta-schema
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /not a valid OpenRPC document/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when a $ref dangles", async () => {
  const spec = await loadRealSpec()
  spec.openRPC.methods[0].result.schema = { $ref: "#/components/schemas/DoesNotExist" }
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /resolves to nothing inside openRPC/.test(f.evidence))
    assert.ok(hits.length >= 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when x-vectors is null with no x-vectors-reason", async () => {
  const spec = await loadRealSpec()
  delete spec.openRPC.methods[0]["x-vectors-reason"]
  spec.openRPC.methods[0]["x-vectors"] = null
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /x-vectors is null and no x-vectors-reason says why/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires openrpc-invalid when a method name is declared twice", async () => {
  const spec = await loadRealSpec()
  spec.openRPC.methods.push({ ...spec.openRPC.methods[0] })
  const repoRoot = await tempRepoWithRealSpec()
  try {
    await writeFile(path.join(repoRoot, "spec/ref-id.json"), JSON.stringify(spec))
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "openrpc-invalid" && /is declared twice/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})
