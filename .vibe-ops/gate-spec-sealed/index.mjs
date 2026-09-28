// SPDX-License-Identifier: Apache-2.0
/**
 * Hold `spec/ref-id.json` to its sidecar digest. `fix()` writes the sidecar — `${digest}\n`, the
 * form every implementation reads — and `scripts/seal-spec.mjs` is only the door a person types to call it.
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

/**
 * The digest `spec/ref-id.json` should be sealed with, or why it could not be computed.
 *
 * TWO FAILURES, TWO VERDICTS. `canonicalise` failing to import is the instrument missing — a Node older
 * than 22.18 cannot strip the `.ts` source — and says nothing about the specification, so the gate skips.
 * The file failing to parse is the specification's own defect, and is a finding.
 */
async function sealFor(repoRoot) {
  let raw
  try {
    raw = readFileSync(path.join(repoRoot, SPEC_PATH), "utf8")
  } catch {
    return { skipped: `${SPEC_PATH} is not present in this tree` }
  }
  let canonicalise
  try {
    canonicalise = await loadCanonicalise()
  } catch (error) {
    return { skipped: `canonicalise could not be imported from packages/ref-id/src/spec.ts (Node 22.18+ strips types): ${error.message}` }
  }
  try {
    return { computed: createHash("sha256").update(canonicalise(JSON.parse(raw)), "utf8").digest("hex") }
  } catch (error) {
    return { defect: `spec/ref-id.json could not be parsed or canonicalised: ${error.message}` }
  }
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
    const seal = await sealFor(ctx.repoRoot)
    if (seal.skipped !== undefined) return { findings: [], skipped: seal.skipped }
    if (seal.defect !== undefined) {
      return { findings: [{ rule: RULE, file: SPEC_PATH, evidence: seal.defect }], examined: 1 }
    }
    const { computed } = seal

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
    const { computed } = await sealFor(ctx.repoRoot)
    // A skip or a defect leaves nothing mechanical to write: a spec that does not parse needs an author.
    if (computed === undefined) return []
    writeFileSync(path.join(ctx.repoRoot, SIDECAR_PATH), `${computed}\n`)
    return [{ file: SIDECAR_PATH, action: `wrote the sidecar digest ${computed}` }]
  },
}
