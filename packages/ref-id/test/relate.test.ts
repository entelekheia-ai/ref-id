// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.relate entry, asserting both the full RelateResult (or null) and the
// three booleans the same pair binds in the comparison group — relate's own vector group is the
// declaration of its output shape, so a runner that skipped it would report green for a contract it
// never checked (`test/surface.test.ts`'s "every vector group... is executed" check).

import assert from "node:assert/strict"
import { test } from "node:test"
import { covers, loadSpec, relate, samePackage } from "../src/index.ts"
import type { RelateResult } from "../src/index.ts"

interface RelateVector {
  name: string
  a: string
  b: string
  expect: { relate: RelateResult | null; samePackage: boolean; covers: boolean; coversReversed: boolean }
}

const spec = loadSpec()
const vectors = (spec as unknown as { vectors: { relate: RelateVector[] } }).vectors.relate

test("relate: every vector's result and reductions hold", async (t) => {
  for (const vector of vectors) {
    await t.test(vector.name, () => {
      assert.deepEqual(relate(vector.a, vector.b), vector.expect.relate, "relate(a, b)")
      assert.equal(samePackage(vector.a, vector.b), vector.expect.samePackage, "samePackage(a, b)")
      assert.equal(covers(vector.a, vector.b), vector.expect.covers, "covers(a, b)")
      assert.equal(covers(vector.b, vector.a), vector.expect.coversReversed, "covers(b, a)")
    })
  }
})
