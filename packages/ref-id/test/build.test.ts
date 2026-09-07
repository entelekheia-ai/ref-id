// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.build entry. An `expect` of shape `{ error: <part> }` means the
// builder must refuse with a BuildError naming that part.

import assert from "node:assert/strict"
import { test } from "node:test"
import { build, BuildError, loadSpec } from "../src/index.ts"
import type { BuildParts } from "../src/index.ts"

interface BuildVector {
  name: string
  parts: BuildParts
  expect: string | { error: string }
}

const spec = loadSpec()
const vectors = spec.vectors.build as unknown as BuildVector[]

for (const vector of vectors) {
  test(`build: ${vector.name}`, () => {
    if (typeof vector.expect === "string") {
      assert.equal(build(vector.parts), vector.expect)
      return
    }
    const wanted = vector.expect.error
    assert.throws(
      () => build(vector.parts),
      (error: unknown) => error instanceof BuildError && error.part === wanted,
      `expected BuildError at part "${wanted}"`,
    )
  })
}
