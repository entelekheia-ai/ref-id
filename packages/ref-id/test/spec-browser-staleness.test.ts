// SPDX-License-Identifier: Apache-2.0
//
// The staleness guard for the generated browser spec (Plan-004, Track 1).
//
// `src/spec.browser.ts` is committed, generated code: scripts/gen-spec.mjs compiles
// spec/ref-id.json into it as a typed constant, for the environment that has no filesystem to read
// the JSON from. A generated file that is valid TypeScript and one edit behind is the failure with
// no symptom — the build stays green and the browser build quietly serves a spec that is not the one
// on disk. So this test does not check that the file exists, and it does not check a timestamp; both
// pass for a file edited by hand, which is exactly the failure this guard exists to catch. It
// regenerates the module in memory and diffs it byte for byte against what is committed.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"
// scripts/gen-spec.mjs, not a second reading of spec/ref-id.json here: the generator already knows how
// to verify the spec against its sidecar and render the module, and a guard with its own idea of how to
// do that is the same drift Plan-004 calls out between this script and scripts/seal-spec.mjs.
import { generate } from "../../../scripts/gen-spec.mjs"

const COMMITTED_FILE = fileURLToPath(new URL("../src/spec.browser.ts", import.meta.url))

test("spec-browser-staleness: src/spec.browser.ts matches what spec/ref-id.json generates today", () => {
  // generate() verifies spec/ref-id.json against its sidecar before it renders anything — the same
  // check src/spec.ts's own loader runs. A spec that fails that check throws here rather than being
  // compared, so this test also fails loudly (not silently green) when the sidecar itself is stale.
  const regenerated = generate()
  let committed: string
  try {
    committed = readFileSync(COMMITTED_FILE, "utf8")
  } catch {
    assert.fail(
      "packages/ref-id/src/spec.browser.ts does not exist.\n" +
        "  Generate it with: node scripts/gen-spec.mjs",
    )
    return
  }
  assert.equal(
    committed,
    regenerated,
    "packages/ref-id/src/spec.browser.ts no longer matches spec/ref-id.json.\n" +
      "  Regenerate it with: node scripts/gen-spec.mjs\n" +
      "  and commit the result alongside the spec change.",
  )
})
