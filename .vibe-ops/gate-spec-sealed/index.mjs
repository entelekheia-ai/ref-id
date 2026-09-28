// SPDX-License-Identifier: Apache-2.0
/**
 * Hold `spec/ref-id.json` to its sidecar digest — the `--check` half of `scripts/seal-spec.mjs`,
 * moved. `fix()` writes the sidecar with the exact bytes the script's write mode writes.
 *
 * The digest is computed through the package's own `canonicalise`, imported from its SOURCE — resolved
 * relative to THIS FILE, never through `ctx.repoRoot` — and never through `loadSpec`/`parse`/any
 * builder, all of which refuse a spec whose seal does not match: exactly the state this gate exists to
 * report. Node's default type stripping (22.18+) is what makes importing the `.ts` source work.
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const RULE = "spec-unsealed"
const SPEC_PATH = "spec/ref-id.json"
const SIDECAR_PATH = "spec/ref-id.json.sha256"

async function loadCanonicalise() {
  const url = new URL("../../packages/ref-id/src/spec.ts", import.meta.url)
  const mod = await import(url.href)
  return mod.canonicalise
}

export default {
  definition: {
    id: "spec-sealed",
    version: 1,
    summary: "The specification's bytes match the sidecar digest every implementation verifies at load",
    defaultPaths: [SPEC_PATH, SIDECAR_PATH],
    fixable: true,
  },

  async run(ctx) {
    let raw
    try {
      raw = readFileSync(path.join(ctx.repoRoot, SPEC_PATH), "utf8")
    } catch {
      return { findings: [], skipped: `${SPEC_PATH} is not present in this tree` }
    }

    let computed
    try {
      const canonicalise = await loadCanonicalise()
      computed = createHash("sha256").update(canonicalise(JSON.parse(raw)), "utf8").digest("hex")
    } catch (error) {
      return {
        findings: [
          {
            rule: RULE,
            file: SPEC_PATH,
            evidence: `spec/ref-id.json could not be parsed or canonicalised: ${error.message}`,
          },
        ],
        examined: 1,
      }
    }

    let recorded
    try {
      recorded = readFileSync(path.join(ctx.repoRoot, SIDECAR_PATH), "utf8").trim()
    } catch {
      return {
        findings: [
          {
            rule: RULE,
            file: SIDECAR_PATH,
            evidence: `spec/ref-id.json has no sidecar — run node scripts/seal-spec.mjs to write it (expected ${computed})`,
          },
        ],
        examined: 1,
      }
    }

    if (computed === recorded) return { findings: [], examined: 1 }

    return {
      findings: [
        {
          rule: RULE,
          file: SIDECAR_PATH,
          evidence: `spec/ref-id.json does not match its sidecar — recorded ${recorded}, computed ${computed}; run node scripts/seal-spec.mjs to re-seal it`,
        },
      ],
      examined: 1,
    }
  },

  async fix(ctx, findings) {
    if (findings.length === 0) return []
    let computed
    try {
      const raw = readFileSync(path.join(ctx.repoRoot, SPEC_PATH), "utf8")
      const canonicalise = await loadCanonicalise()
      computed = createHash("sha256").update(canonicalise(JSON.parse(raw)), "utf8").digest("hex")
    } catch {
      return []
    }
    writeFileSync(path.join(ctx.repoRoot, SIDECAR_PATH), `${computed}\n`)
    return [{ file: SIDECAR_PATH, action: `wrote the sidecar digest ${computed}` }]
  },
}
