// SPDX-License-Identifier: Apache-2.0
//
// One subtest per spec.vectors.digest entry. An `expect` of shape `{ error: <part> }` means the
// digest must be refused with a DigestError naming that part.

import assert from "node:assert/strict"
import { test } from "node:test"
import { digest, DigestError, loadSpec } from "../src/index.ts"

interface DigestVector {
  name: string
  members: string[]
  expect: string | { error: string }
}

const spec = loadSpec()
const vectors = spec.vectors.digest as unknown as DigestVector[]

for (const vector of vectors) {
  test(`digest: ${vector.name}`, () => {
    if (typeof vector.expect === "string") {
      assert.equal(digest(vector.members), vector.expect)
      return
    }
    const wanted = vector.expect.error
    assert.throws(
      () => digest(vector.members),
      (error: unknown) => error instanceof DigestError && error.part === wanted,
      `expected DigestError at part "${wanted}"`,
    )
  })
}
