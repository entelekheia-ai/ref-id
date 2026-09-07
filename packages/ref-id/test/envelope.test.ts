// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.envelope entry.

import assert from "node:assert/strict"
import { test } from "node:test"
import { loadSpec, validateEnvelope } from "../src/index.ts"

interface EnvelopeVector {
  name: string
  requestedId: string
  envelope: unknown
  expect: "admissible" | "refused"
}

const spec = loadSpec()
const vectors = spec.vectors.envelope as unknown as EnvelopeVector[]

for (const vector of vectors) {
  test(`envelope: ${vector.name}`, () => {
    const result = validateEnvelope(vector.requestedId, vector.envelope)
    assert.equal(result.admissible, vector.expect === "admissible")
  })
}
