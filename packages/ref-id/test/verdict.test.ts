// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.verdict entry, asserting the full VerdictResult (or null) and the
// mirror comparison.verdict.symmetry states: verdict(b, a) is verdict(a, b) with covers and coveredBy
// exchanged on the identity axis, and the content axis and decidedBy unchanged. The vectors bind the
// forward direction only, so the mirror is a law asserted here rather than stated pair by pair.

import assert from "node:assert/strict"
import { test } from "node:test"
import { loadSpec, verdict } from "../src/index.ts"
import type { VerdictResult } from "../src/index.ts"

interface VerdictVector {
  name: string
  a: string
  b: string
  expect: { verdict: VerdictResult | null }
}

const spec = loadSpec()
const vectors = (spec as unknown as { vectors: { verdict: VerdictVector[] } }).vectors.verdict

/** `comparison.verdict.symmetry`: covers and coveredBy exchange on the identity axis; everything else
 * — content, and decidedBy for both axes — stays exactly as it was. */
function mirrored(result: VerdictResult | null): VerdictResult | null {
  if (!result) return null
  const identity = result.identity === "covers" ? "coveredBy" : result.identity === "coveredBy" ? "covers" : result.identity
  return { ...result, identity }
}

test("verdict: every vector's result holds, and its mirror matches comparison.verdict.symmetry", async (t) => {
  for (const vector of vectors) {
    await t.test(vector.name, () => {
      const forward = verdict(vector.a, vector.b)
      assert.deepEqual(forward, vector.expect.verdict, "verdict(a, b)")
      assert.deepEqual(verdict(vector.b, vector.a), mirrored(forward), "verdict(b, a)")
    })
  }
})
