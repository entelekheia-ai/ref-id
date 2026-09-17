// SPDX-License-Identifier: Apache-2.0
//
// The two builds answer identically on the vector groups the differential harness cannot carry
// (Plan-004, Goal 2).
//
// `npm run test:differential` runs the browser build as a fourth implementation, which is where the
// two builds are held against each other — but its line protocol is shared with the Rust and Swift
// ports and carries `parse` and `serialise` only. That leaves `spec.vectors.build`,
// `spec.vectors.digest` and `spec.vectors.envelope` exercised against the Node build alone, and the
// browser build's sha256 — a different implementation, not a different call to the same one —
// exercised by nothing at all. This closes that, and it closes it by comparing the two builds rather
// than by giving the browser build expectations of its own, which is the check that stays green while
// two implementations disagree.
//
// It spawns a child process per entry point. Importing both into this process would not work: they
// share one `spec.ts` module instance, so the second installation wins and both entries answer from
// the same source — a comparison of a build with itself, reported as agreement.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNNER = `${HERE}/vectors-runner.ts`

function answers(args: string[]): Record<string, { name: string; result: unknown }[]> {
  const out = execFileSync(process.execPath, ["--experimental-strip-types", RUNNER, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
  return JSON.parse(out)
}

test("browser parity: build, digest and envelope vectors answer identically in both builds", () => {
  const node = answers([])
  const browser = answers(["--browser"])

  for (const group of ["build", "digest", "envelope"]) {
    assert.ok(node[group].length > 0, `the ${group} vector group is empty — nothing was compared`)
    for (const [index, expected] of node[group].entries()) {
      const actual = browser[group][index]
      assert.deepEqual(
        actual,
        expected,
        `the browser build disagrees with the Node build on ${group} vector "${expected.name}"`,
      )
    }
  }
})
