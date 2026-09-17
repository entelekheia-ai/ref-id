// SPDX-License-Identifier: Apache-2.0
//
// What the package's own surface must hold, where the conformance vectors say nothing.
//
// The vectors bind answers; these bind the shape a consumer catches and iterates. Both gaps below were
// found by comparing this package against the Rust and Swift ports, which already had them — the
// reference implementation was the one missing them, which is the direction nobody checks.

import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { RefIdError, SpecIntegrityError, SpecVersionError, loadSpec } from "../src/index.ts"

const HERE = dirname(fileURLToPath(import.meta.url))

test("surface: every error this package throws is a RefIdError", () => {
  // A consumer writes one `instanceof` and expects it to hold for anything this package throws. When a
  // spec error sits outside the hierarchy, that check silently misses the two failures a consumer is
  // least equipped to recover from — the specification not matching its own digest, and declaring a
  // major this build cannot honour.
  for (const error of [new SpecIntegrityError("x"), new SpecVersionError("x")]) {
    assert.ok(error instanceof RefIdError, `${error.name} is not a RefIdError`)
    assert.ok(error instanceof Error, `${error.name} is not an Error`)
  }
})

test("surface: every vector group the specification declares is executed by a test file", () => {
  // The specification may add a vector group at any time, and a group nothing runs is the defect that
  // hides every other one — a suite reports green for a contract it never checked. Both ports assert
  // this (`every_vector_group_runs` in Rust, `checkEveryVectorGroupRuns` in Swift); this package did
  // not, so it was the one that would have gone quietly green.
  const declared = Object.keys(loadSpec().vectors)
  const files = readdirSync(HERE).filter((name) => name.endsWith(".test.ts"))
  const executed = declared.filter((group) =>
    files.some((file) => new RegExp(`spec\\.vectors\\.${group}\\b`).test(readFileSync(join(HERE, file), "utf8"))),
  )
  assert.deepEqual(
    executed.sort(),
    declared.sort(),
    `vector groups declared but not executed: ${declared.filter((group) => !executed.includes(group)).join(", ")}`,
  )
})
