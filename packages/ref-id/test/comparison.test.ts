// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.comparison entry. Each vector carries three expectations, because the
// two relations disagree on direction and that disagreement is the thing worth binding: `samePackage`
// is symmetric, `covers` is not, and a vector that asserted only the forward direction would pass while
// the relation was inverted.

import assert from "node:assert/strict"
import { test } from "node:test"
import { loadSpec } from "../src/index.ts"
import { covers, samePackage } from "../src/relations.ts"

interface ComparisonVector {
  name: string
  a: string
  b: string
  expect: { samePackage: boolean; covers: boolean; coversReversed: boolean }
}

const spec = loadSpec()
const vectors = (spec as unknown as { vectors: { comparison: ComparisonVector[] } }).vectors.comparison

test("comparison: every vector holds in both directions", async (t) => {
  for (const vector of vectors) {
    await t.test(vector.name, () => {
      assert.equal(samePackage(vector.a, vector.b), vector.expect.samePackage, "samePackage(a, b)")
      assert.equal(covers(vector.a, vector.b), vector.expect.covers, "covers(a, b)")
      assert.equal(covers(vector.b, vector.a), vector.expect.coversReversed, "covers(b, a)")
    })
  }
})

test("comparison: samePackage is symmetric on every vector", () => {
  for (const vector of vectors) {
    assert.equal(
      samePackage(vector.b, vector.a),
      samePackage(vector.a, vector.b),
      `${vector.name}: samePackage disagreed with itself when the arguments were swapped`,
    )
  }
})

// The relation is sold as a query primitive, so the property matters more than any one vector: an
// identifier the relation accepts stands for itself. A vector could assert this for the cases it lists;
// only a sweep asserts it for every case the file contains.
test("comparison: covers is reflexive wherever it accepts an identifier at all", () => {
  for (const vector of vectors) {
    for (const identifier of [vector.a, vector.b]) {
      if (covers(identifier, identifier)) continue
      assert.equal(
        samePackage(identifier, identifier),
        false,
        `${identifier} did not cover itself, so it must be one the relations refuse outright`,
      )
    }
  }
})

test("comparison: an asymmetric pair is asymmetric — the vectors are not all symmetric by accident", () => {
  const asymmetric = vectors.filter((vector) => vector.expect.covers !== vector.expect.coversReversed)
  assert.ok(
    asymmetric.length >= 4,
    `only ${asymmetric.length} vector(s) exercise the asymmetry; the direction is the whole point of covers`,
  )
})
