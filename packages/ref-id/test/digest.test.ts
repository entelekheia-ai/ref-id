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

// spec.digest.unicode: a member holding a lone surrogate is refused, never replaced with U+FFFD. No
// vector binds this — a JSON string carrying a lone surrogate stops the Rust crate from loading the
// specification at all, and Rust's and Swift's own string types cannot hold one — so this package pins
// it with a unit test instead (Task-048, item 1).
test("digest: a member holding a lone surrogate is refused, not replaced", () => {
  const loneHighSurrogate = "a\uD800b"
  assert.throws(
    () => digest([loneHighSurrogate]),
    (error: unknown) => error instanceof DigestError,
    "expected a DigestError for a lone surrogate",
  )
})
