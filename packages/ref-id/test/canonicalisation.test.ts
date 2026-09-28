// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.canonicalisation entry: parse `json` with this language's own JSON
// parser, canonicalise it, and compare — or, for `refused: true`, expect a SpecIntegrityError.

import assert from "node:assert/strict"
import { test } from "node:test"
import { canonicalise, loadSpec, SpecIntegrityError } from "../src/index.ts"

interface CanonicalisationVector {
  name: string
  json: string
  expect?: string
  refused?: true
}

const spec = loadSpec()
const vectors = spec.vectors.canonicalisation as unknown as CanonicalisationVector[]

for (const vector of vectors) {
  test(`canonicalisation: ${vector.name}`, () => {
    const parsed = JSON.parse(vector.json) as unknown
    if (vector.refused) {
      assert.throws(() => canonicalise(parsed), SpecIntegrityError)
      return
    }
    assert.equal(canonicalise(parsed), vector.expect)
  })
}
