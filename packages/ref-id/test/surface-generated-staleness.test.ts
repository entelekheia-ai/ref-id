// SPDX-License-Identifier: Apache-2.0
//
// `test/surface.generated.ts` binds openRPC's surface at the type-checker (scripts/gen-surface-ts.mjs's
// module doc explains why). A generator only guards what it is actually run against, so this proves the
// committed file is what the generator would emit today — the same shape as
// spec-browser-staleness.test.ts, which does this for the compiled-in browser spec.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

const GENERATOR = fileURLToPath(new URL("../../../scripts/gen-surface-ts.mjs", import.meta.url))

test("surface.generated.ts is not stale against spec.openRPC", () => {
  assert.doesNotThrow(
    () => execFileSync(process.execPath, [GENERATOR, "--check"], { stdio: "pipe" }),
    "run `node scripts/gen-surface-ts.mjs` to regenerate test/surface.generated.ts",
  )
})
