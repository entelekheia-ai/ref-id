// SPDX-License-Identifier: Apache-2.0
//
// The two throws the public API is allowed to raise for a spec problem, plus the sanity check
// that the real embedded spec loads clean.

import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { canonicalise, loadSpec, loadSpecFrom, SpecIntegrityError, SpecVersionError } from "../src/index.ts"

const specUrl = new URL("../spec/ref-id.json", import.meta.url)
const sidecarUrl = new URL("../spec/ref-id.json.sha256", import.meta.url)
const rawSpec = readFileSync(specUrl, "utf8")
const rawSidecar = readFileSync(sidecarUrl, "utf8")

function digestOf(value: unknown): string {
  return createHash("sha256").update(canonicalise(value), "utf8").digest("hex")
}

test("spec-integrity: the real embedded spec loads", () => {
  // WHERE AN EDIT TO THE SPECIFICATION SURFACES, so the remedy belongs here rather than only in a script
  // somebody has to remember. `loadSpec` refuses a file that disagrees with its sidecar and most of this
  // suite goes through it, so a stale sidecar arrives as six failures whose shared cause is one line —
  // and between running the resealer and copying a digest out of an error by hand, the second is what
  // happens when nothing says otherwise.
  //
  // It may name a path in this repository because this file is not shipped (`files` is `dist` and
  // `spec`). `spec.ts` is shipped and may not: a consumer hitting `SpecIntegrityError` has no
  // `scripts/` of ours to run.
  try {
    loadSpec()
  } catch (error) {
    assert.fail(
      `${(error as Error).message}\n\n` +
        "  If you edited spec/ref-id.json, its sidecar is stale. Re-seal it:\n" +
        "    node scripts/seal-spec.mjs\n\n" +
        "  Then copy the pair into the ports, which embed their own:\n" +
        "    Sources/RefId/Resources/   crates/ref-id/spec/\n" +
        "  The `spec` gate refuses a commit where those have parted company.",
    )
  }
})

test("spec-integrity: one altered byte inside a string, sidecar unchanged, throws SpecIntegrityError", () => {
  const dir = mkdtempSync(join(tmpdir(), "ref-id-spec-integrity-"))
  const parsed = JSON.parse(rawSpec) as { scheme: string }
  parsed.scheme = `${parsed.scheme}x`
  writeFileSync(join(dir, "ref-id.json"), JSON.stringify(parsed))
  writeFileSync(join(dir, "ref-id.json.sha256"), rawSidecar)
  assert.throws(() => loadSpecFrom(dir), SpecIntegrityError)
})

test("spec-integrity: specVersion 2.0.0 with a matching sidecar throws SpecVersionError", () => {
  const dir = mkdtempSync(join(tmpdir(), "ref-id-spec-version-"))
  const parsed = JSON.parse(rawSpec) as { specVersion: string }
  parsed.specVersion = "2.0.0"
  writeFileSync(join(dir, "ref-id.json"), JSON.stringify(parsed))
  writeFileSync(join(dir, "ref-id.json.sha256"), digestOf(parsed))
  assert.throws(() => loadSpecFrom(dir), SpecVersionError)
})

test("spec-integrity: ref-id.json that is not valid JSON throws SpecIntegrityError, not SyntaxError", () => {
  const dir = mkdtempSync(join(tmpdir(), "ref-id-spec-syntax-"))
  writeFileSync(join(dir, "ref-id.json"), "{ this is not json")
  writeFileSync(join(dir, "ref-id.json.sha256"), rawSidecar)
  assert.throws(() => loadSpecFrom(dir), SpecIntegrityError)
})

test("spec-integrity: a missing spec directory throws SpecIntegrityError, not a raw file-system error", () => {
  const dir = join(tmpdir(), "ref-id-spec-missing-does-not-exist")
  assert.throws(() => loadSpecFrom(dir), SpecIntegrityError)
})

test("spec-integrity: JSON nested past the parser's own recursion limit throws SpecIntegrityError, not RangeError", () => {
  const dir = mkdtempSync(join(tmpdir(), "ref-id-spec-deep-"))
  const depth = 200_000
  const deep = "[".repeat(depth) + "]".repeat(depth)
  writeFileSync(join(dir, "ref-id.json"), deep)
  writeFileSync(join(dir, "ref-id.json.sha256"), rawSidecar)
  assert.throws(() => loadSpecFrom(dir), SpecIntegrityError)
})

test("canonicalise: a cyclic object throws SpecIntegrityError, not RangeError", () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.throws(() => canonicalise(cyclic), SpecIntegrityError)
})
