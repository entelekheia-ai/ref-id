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

async function loadSpecModule() {
  const url = new URL("../../packages/ref-id/src/spec.ts", import.meta.url)
  return import(url.href)
}

/**
 * Whether THIS Node can strip the `.ts` source at all — the one condition that makes importing
 * `packages/ref-id/src/spec.ts` a question about the instrument rather than about the specification.
 * `process.features.typescript` is `"strip"`/`"transform"` (truthy) once type stripping is available
 * (measured here on Node 26.9.0: `"strip"`) and `false` on an older Node that lacks it; `versionString`
 * is the fallback for a Node old enough not to carry the feature flag at all. Parameterised so a test
 * can drive the decision with a fake environment without touching the real one.
 */
export function typeStrippingAvailable(features = process.features, versionString = process.versions.node) {
  if (typeof features?.typescript === "string") return true
  if (features?.typescript === true) return true
  if (features?.typescript === false) return false
  const [major, minor] = String(versionString)
    .split(".")
    .map((n) => Number(n))
  if (!Number.isFinite(major)) return false
  return major > 22 || (major === 22 && minor >= 18)
}

/**
 * The digest `spec/ref-id.json` should be sealed with, or why it could not be computed.
 *
 * ONE LEGITIMATE SKIP: a Node too old to strip types cannot import `packages/ref-id/src/spec.ts` at
 * all, and that says nothing about the specification. Every other way this can fail — the import
 * throwing for an unrelated reason, the module loading but not exporting a `canonicalise` function, the
 * spec failing to parse or canonicalise — is the specification's or the package's own defect, and is a
 * finding, never a silent skip and never an uncaught throw.
 */
async function sealFor(repoRoot) {
  let raw
  try {
    raw = readFileSync(path.join(repoRoot, SPEC_PATH), "utf8")
  } catch {
    return { skipped: `${SPEC_PATH} is not present in this tree` }
  }

  if (!typeStrippingAvailable()) {
    return {
      skipped: `Node ${process.versions.node} has no type stripping (need 22.18+) — cannot import packages/ref-id/src/spec.ts to compute the digest`,
    }
  }

  let mod
  try {
    mod = await loadSpecModule()
  } catch (error) {
    return { defect: `packages/ref-id/src/spec.ts could not be imported: ${error.message}` }
  }
  const canonicalise = mod.canonicalise
  if (typeof canonicalise !== "function") {
    return { defect: `packages/ref-id/src/spec.ts does not export a function named "canonicalise"` }
  }

  try {
    // The document being sealed names its own number bound (`version.maximum`); passed explicitly, since the
    // default would load an installed specification — the very one this gate has not yet verified. A document
    // that declares no bound (a fixture) gets the one `spec.node.ts` falls back to.
    const parsed = JSON.parse(raw)
    return { computed: createHash("sha256").update(canonicalise(parsed, parsed?.version?.maximum ?? Number.MAX_SAFE_INTEGER), "utf8").digest("hex") }
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
