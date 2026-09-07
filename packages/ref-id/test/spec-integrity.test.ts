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
  assert.doesNotThrow(() => loadSpec())
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
