// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { render } from "./gen-surface-python.mjs"

const base = JSON.parse(readFileSync(new URL("../spec/ref-id.json", import.meta.url), "utf8")).openRPC
const snakeCase = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

test("every declared method gets one annotated binding", () => {
  const out = render(base)
  for (const m of base.methods) {
    assert.match(out, new RegExp(`^_${snakeCase(m.name)}: Callable\\[`, "m"), m.name)
  }
  assert.match(out, /^_same_package: Callable\[\[str \| ref_id\.ParseResult, str \| ref_id\.ParseResult\], bool\] = ref_id\.same_package$/m)
  assert.match(out, /^_load_spec_from: Callable\[\[str \| os\.PathLike\[str\]\], ref_id\.Spec\] = ref_id\.load_spec_from$/m)
  assert.match(out, /^_relate: Callable\[.*\], ref_id\.RelateResult \| None\] = ref_id\.relate$/m)
  assert.match(out, /^_digest: Callable\[\[Sequence\[str\]\], str\] = ref_id\.digest$/m)
  assert.ok(out.endsWith("\n") && !out.endsWith("\n\n") && !out.includes("\r"))
})

test("DECLARED carries methods, extensions and the error hierarchy, sorted", () => {
  const block = render(base).match(/^DECLARED: list\[str\] = \[\n([\s\S]*?)\n\]$/m)
  assert.ok(block, "DECLARED block present")
  const names = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(names, [...names].sort())
  for (const expected of ["canonical_identifier", "load_spec_from", "embedded_spec_text", "RefIdError", "SpecIntegrityError"]) {
    assert.ok(names.includes(expected), expected)
  }
})

test("a method absent from python is neither bound nor declared", () => {
  const doc = structuredClone(base)
  doc.methods.find((m) => m.name === "covers")["x-absent-from"] = ["python"]
  const out = render(doc)
  assert.doesNotMatch(out, /_covers:/)
  assert.doesNotMatch(out, /"covers"/)
})

test("a python deprecated alias joins DECLARED", () => {
  const doc = structuredClone(base)
  doc.methods.find((m) => m.name === "covers")["x-deprecated-aliases"] = { python: ["covers_old"] }
  assert.match(render(doc), /"covers_old"/)
})

test("an untyped schema is object, never Any", () => {
  const out = render(base)
  assert.match(out, /^_validate_envelope: Callable\[\[str, object\], ref_id\.EnvelopeResult\] = ref_id\.validate_envelope$/m)
  assert.match(out, /^_canonicalise: Callable\[\[object\], str\] = ref_id\.canonicalise$/m)
  assert.doesNotMatch(out, /\bAny\b/)
})

test("a directory is a parameter type only", () => {
  const doc = structuredClone(base)
  doc.methods.find((m) => m.name === "loadSpec").result.schema = { type: "string", "x-kind": "directory" }
  assert.throws(() => render(doc), /loadSpec.*result/)
})

test("a casing other than snake_case is refused", () => {
  const doc = structuredClone(base)
  doc["x-casing"].python = "camelCase"
  assert.throws(() => render(doc), /x-casing/)
})

test("PARAMETERS pins arity, and names only where x-argument-labels asks for them", () => {
  const out = render(base)
  assert.match(out, /^    "covers": \(2, None\),$/m)
  assert.match(out, /^    "load_spec": \(0, None\),$/m)
  assert.match(out, /^    "validate_envelope": \(2, \["requested_id", "envelope"\]\),$/m)
})

test("an unmappable schema is refused, never widened", () => {
  const doc = structuredClone(base)
  doc.methods[0].params[0].schema = { type: "integer" }
  assert.throws(() => render(doc), /parse.*input/)
})
