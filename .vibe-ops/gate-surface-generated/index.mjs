// SPDX-License-Identifier: Apache-2.0
/**
 * Hold every generated surface file to the specification it is generated from.
 *
 * Each implementation's surface — the TypeScript `surface.generated.ts`, the Rust `surface.rs`, the Swift
 * `Surface.generated.swift`, the Python `test_surface.py` — is written by a `scripts/gen-surface-*.mjs`
 * that reads `openRPC` alone. Each has a `--check` mode that regenerates in memory and exits non-zero when
 * the committed file differs. This gate runs them all at commit time: they need Node only, so a spec edit
 * that forgot to regenerate one surface is refused here rather than on the pull request, whatever
 * toolchains the committer has.
 *
 * A generator named in `generators` that is absent from the tree is a finding — a generator removed while
 * the gate still names it — never a skip.
 *
 * Options: `generators` (paths relative to the repository; default the four `scripts/gen-surface-*.mjs`).
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const RULE = "surface-stale"
const DEFAULT_GENERATORS = ["scripts/gen-surface-ts.mjs", "scripts/gen-surface-rust.mjs", "scripts/gen-surface-swift.mjs", "scripts/gen-surface-python.mjs"]

export default {
  definition: {
    id: RULE,
    version: 1,
    summary: "every generated surface file matches what its generator writes from the specification",
    defaultPaths: ["spec/ref-id.json"],
    fixable: false,
  },
  async run(ctx) {
    const generators = Array.isArray(ctx.options?.generators) ? ctx.options.generators : DEFAULT_GENERATORS
    const findings = []
    for (const generator of generators) {
      if (!existsSync(path.join(ctx.repoRoot, generator))) {
        findings.push({ rule: RULE, file: generator, evidence: `${generator} is named by this gate and absent from the tree` })
        continue
      }
      const run = spawnSync(process.execPath, [generator, "--check"], { cwd: ctx.repoRoot, encoding: "utf8", timeout: 60_000 })
      if (run.status !== 0) {
        const said = `${run.stderr ?? ""}${run.stdout ?? ""}`.trim().split("\n")[0]?.slice(0, 300) || `exit ${run.status}`
        findings.push({ rule: RULE, file: generator, evidence: `${said} — regenerate with node ${generator}` })
      }
    }
    return { findings, examined: generators.length }
  },
}
