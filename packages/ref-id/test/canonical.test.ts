// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.canonical entry. An `expect` of shape `{ error: <part> }` means the
// identifier is malformed and has no canonical form, so canonicalising it must refuse naming that part.

import assert from "node:assert/strict"
import { test } from "node:test"
import { canonical, sameIdentifier } from "../src/canonical.ts"
import { loadSpec, SerialiseError } from "../src/index.ts"

interface CanonicalVector {
  name: string
  input: string
  expect: string | { error: string }
}

const spec = loadSpec()
const vectors = spec.vectors.canonical as unknown as CanonicalVector[]

for (const vector of vectors) {
  test(`canonical: ${vector.name}`, () => {
    if (typeof vector.expect === "string") {
      assert.equal(canonical(vector.input), vector.expect)
      return
    }
    const wanted = vector.expect.error
    assert.throws(
      () => canonical(vector.input),
      (error: unknown) => error instanceof SerialiseError && error.part === wanted,
      `expected SerialiseError at part "${wanted}"`,
    )
  })
}

test("canonical: the form is idempotent", () => {
  for (const vector of vectors) {
    if (typeof vector.expect !== "string") continue
    assert.equal(canonical(vector.expect), vector.expect, `${vector.name} moved on a second pass`)
  }
})

test("canonical: every vector whose expected form matches another's names the same identifier", () => {
  // The rule stated as the property it exists for, over the spec's own data rather than over a literal
  // spelled out here: two inputs reaching one canonical form are one identifier, and two reaching
  // different forms are not.
  const named = vectors.filter((v): v is CanonicalVector & { expect: string } => typeof v.expect === "string")

  for (const a of named) {
    for (const b of named) {
      assert.equal(
        sameIdentifier(a.input, b.input),
        a.expect === b.expect,
        `"${a.name}" vs "${b.name}"`,
      )
    }
  }
})
