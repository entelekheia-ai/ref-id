// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.parse entry — the spec is the oracle, nothing here is hardcoded.

import assert from "node:assert/strict"
import { test } from "node:test"
import { loadSpec, parse } from "../src/index.ts"

interface ParseVector {
  name: string
  input: string
  expect: Record<string, unknown>
}

const spec = loadSpec()
const vectors = spec.vectors.parse as unknown as ParseVector[]

for (const vector of vectors) {
  test(`parse: ${vector.name}`, () => {
    const result = parse(vector.input) as unknown as Record<string, unknown>
    for (const key of Object.keys(vector.expect)) {
      assert.deepEqual(result[key], vector.expect[key], `field "${key}"`)
    }
  })
}
