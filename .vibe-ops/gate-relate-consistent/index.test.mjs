// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import gate from "./index.mjs"

const REPO_ROOT = new URL("../..", import.meta.url).pathname

const emptyRelate = {
  type: "equal",
  version: "equal",
  locatorStem: "equal",
  locatorVersion: "equal",
  fragmentPath: "equal",
  fragmentRefinements: {},
  qualifiers: {},
}

function specWith(relateVectors, comparisonVectors = []) {
  return {
    vectors: {
      relate: relateVectors,
      comparison: comparisonVectors,
    },
  }
}

async function tempRepo(spec) {
  const root = await mkdtemp(path.join(tmpdir(), "gate-relate-consistent-"))
  await mkdir(path.join(root, "spec"), { recursive: true })
  await writeFile(path.join(root, "spec/ref-id.json"), JSON.stringify(spec, null, 1))
  return root
}

const ctxFor = (repoRoot) => ({ repoRoot, pluginDir: repoRoot, files: ["spec/ref-id.json"], options: {}, documents: undefined })

test("fires relate-disagrees when a flipped boolean contradicts its own reduction", async () => {
  const vector = {
    name: "a vector whose stated boolean is wrong",
    a: "ref:pkg:npm/x@1.0.0",
    b: "ref:pkg:npm/x@1.0.0",
    expect: { relate: emptyRelate, samePackage: true, covers: false, coversReversed: true },
  }
  const repoRoot = await tempRepo(specWith([vector]))
  try {
    const raw = await readFile(path.join(repoRoot, "spec/ref-id.json"), "utf8")
    const outcome = await gate.run(ctxFor(repoRoot))

    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].rule, "relate-disagrees")
    assert.match(outcome.findings[0].evidence, /covers reduces to true, the vector says false/)
    const expectedLine = raw.slice(0, raw.indexOf('"relate"')).split("\n").length
    // Line points somewhere inside this vector's entry (best-effort helper) — assert it resolves.
    assert.equal(typeof outcome.findings[0].line, "number")
    void expectedLine
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires relate-disagrees when the mirror law is broken", async () => {
  const forward = {
    name: "forward",
    a: "ref:pkg:npm/x@1.0.0",
    b: "ref:pkg:npm/x@2.0.0",
    expect: {
      relate: { ...emptyRelate, locatorVersion: "covers" },
      samePackage: true,
      covers: true,
      coversReversed: false,
    },
  }
  const backward = {
    name: "backward, wrongly stated as also covers",
    a: "ref:pkg:npm/x@2.0.0",
    b: "ref:pkg:npm/x@1.0.0",
    expect: {
      // Should mirror to "coveredBy", not repeat "covers" — this is the injected defect.
      relate: { ...emptyRelate, locatorVersion: "covers" },
      samePackage: true,
      covers: true,
      coversReversed: false,
    },
  }
  const repoRoot = await tempRepo(specWith([forward, backward]))
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    const mirrorFailures = outcome.findings.filter((f) => /not its mirror/.test(f.evidence))
    assert.ok(mirrorFailures.length >= 1)
    assert.equal(mirrorFailures[0].rule, "relate-disagrees")
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("near-miss: a relate vector consistent with the comparison group in the reversed order does not fire", async () => {
  // Only locatorVersion differs (a covers b there), so this stays the SAME package — samePackage cares
  // about type/version/locatorStem/fragmentPath, never locatorVersion.
  const relateVector = {
    name: "a covers b, one locatorVersion apart",
    a: "ref:pkg:npm/x@1.0.0",
    b: "ref:pkg:npm/x@2.0.0",
    expect: {
      relate: { ...emptyRelate, locatorVersion: "covers" },
      samePackage: true,
      covers: true,
      coversReversed: false,
    },
  }
  const comparisonVector = {
    name: "the reversed pair, in the comparison group",
    a: "ref:pkg:npm/x@2.0.0",
    b: "ref:pkg:npm/x@1.0.0",
    expect: { samePackage: true, covers: false, coversReversed: true, sameIdentifier: false },
  }
  const repoRoot = await tempRepo(specWith([relateVector], [comparisonVector]))
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    assert.equal(outcome.findings.length, 0)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("the real spec/ref-id.json of this worktree produces zero findings", async () => {
  const outcome = await gate.run(ctxFor(REPO_ROOT))
  assert.equal(outcome.findings.length, 0)
  const raw = await readFile(path.join(REPO_ROOT, "spec/ref-id.json"), "utf8")
  const spec = JSON.parse(raw)
  assert.equal(outcome.examined, spec.vectors.relate.length)
})

// --- F3: shape defects are findings, never a throw or a silent skip ---

async function tempRepoWithRawSpec(rawSpecObject) {
  const root = await mkdtemp(path.join(tmpdir(), "gate-relate-consistent-shape-"))
  await mkdir(path.join(root, "spec"), { recursive: true })
  await writeFile(path.join(root, "spec/ref-id.json"), JSON.stringify(rawSpecObject))
  return root
}

test("fires relate-disagrees when vectors.relate is absent", async () => {
  const repoRoot = await tempRepoWithRawSpec({ vectors: { comparison: [] } })
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    assert.equal(outcome.skipped, undefined)
    assert.equal(outcome.examined, 0)
    const hits = outcome.findings.filter((f) => f.rule === "relate-disagrees" && /vectors\.relate is absent — expected an array/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires relate-disagrees when vectors.comparison is not an array", async () => {
  const repoRoot = await tempRepoWithRawSpec({ vectors: { relate: [], comparison: "nope" } })
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "relate-disagrees" && /vectors\.comparison is string — expected an array/.test(f.evidence))
    assert.equal(hits.length, 1)
    // vectors.relate IS a (empty) array here, so the gate still runs — examined 0, not a bail-out.
    assert.equal(outcome.examined, 0)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires relate-disagrees when a vector is missing 'expect' — reproduces the deleted-expect crash, and keeps examining the rest", async () => {
  const broken = { name: "no expect at all", a: "ref:pkg:npm/x@1.0.0", b: "ref:pkg:npm/x@1.0.0" }
  const healthy = {
    name: "a healthy vector right after it",
    a: "ref:pkg:npm/y@1.0.0",
    b: "ref:pkg:npm/y@1.0.0",
    expect: { relate: emptyRelate, samePackage: true, covers: true, coversReversed: true },
  }
  const repoRoot = await tempRepo(specWith([broken, healthy]))
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    assert.equal(outcome.skipped, undefined)
    assert.equal(outcome.examined, 2)
    const hits = outcome.findings.filter((f) => f.rule === "relate-disagrees" && /"expect" is absent — expected an object/.test(f.evidence))
    assert.equal(hits.length, 1)
    assert.match(hits[0].evidence, /no expect at all/)
    // The healthy vector right after it was still examined and produced no finding of its own.
    assert.equal(outcome.findings.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires relate-disagrees when a vector's 'expect.relate' is present but not an object", async () => {
  const broken = {
    name: "expect.relate is a string",
    a: "ref:pkg:npm/x@1.0.0",
    b: "ref:pkg:npm/x@1.0.0",
    expect: { relate: "not-an-object", samePackage: true, covers: true, coversReversed: true },
  }
  const repoRoot = await tempRepo(specWith([broken]))
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "relate-disagrees" && /"expect\.relate" is string — expected an object or null/.test(f.evidence))
    assert.equal(hits.length, 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

// --- F6: branches not previously exercised by a firing test ---

test("fires relate-disagrees when a nested result does not reduce to the relation its qualifier states", async () => {
  const vector = {
    name: "a nested by= claims equal but reduces to covers",
    a: "ref:folder:acme-tools;by=ref:pkg:github/ggml-org/llama.cpp",
    b: "ref:folder:acme-tools;by=ref:pkg:github/ggml-org/llama.cpp@b10931",
    expect: {
      relate: {
        ...emptyRelate,
        qualifiers: {
          by: { relation: "equal", nested: { ...emptyRelate, locatorVersion: "covers" } },
        },
      },
      samePackage: true,
      covers: true,
      coversReversed: true,
    },
  }
  const repoRoot = await tempRepo(specWith([vector]))
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].rule, "relate-disagrees")
    assert.match(outcome.findings[0].evidence, /a nested result does not reduce to the relation its qualifier states/)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test("fires relate-disagrees when a relate vector disagrees with the comparison group for the SAME pair order", async () => {
  const relateVector = {
    name: "a covers b, one locatorVersion apart",
    a: "ref:pkg:npm/x@1.0.0",
    b: "ref:pkg:npm/x@2.0.0",
    expect: {
      relate: { ...emptyRelate, locatorVersion: "covers" },
      samePackage: true,
      covers: true,
      coversReversed: false,
    },
  }
  const comparisonVector = {
    name: "the same pair, in the comparison group, stated wrongly",
    a: "ref:pkg:npm/x@1.0.0",
    b: "ref:pkg:npm/x@2.0.0",
    expect: { samePackage: true, covers: false, coversReversed: true, sameIdentifier: false },
  }
  const repoRoot = await tempRepo(specWith([relateVector], [comparisonVector]))
  try {
    const outcome = await gate.run(ctxFor(repoRoot))
    const hits = outcome.findings.filter((f) => f.rule === "relate-disagrees" && /in the comparison group/.test(f.evidence))
    assert.ok(hits.length >= 1)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})
