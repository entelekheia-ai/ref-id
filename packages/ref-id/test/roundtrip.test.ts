// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.roundtrip entry: serialise(parse(s)) === s.

import assert from "node:assert/strict"
import { test } from "node:test"
import { loadSpec, parse, serialise } from "../src/index.ts"

const spec = loadSpec()
const vectors = spec.vectors.roundtrip as unknown as string[]

for (const input of vectors) {
  test(`roundtrip: ${input}`, () => {
    assert.equal(serialise(parse(input)), input)
  })
}
