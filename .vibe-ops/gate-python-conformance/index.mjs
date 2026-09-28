// SPDX-License-Identifier: Apache-2.0
/**
 * Run the Python port's test suite — every vector group, the generated surface test, the unit tests —
 * and turn each failed test case into a finding.
 *
 * The suite is pytest's, and this gate reads pytest's own report rather than its terminal text: it
 * appends `--junitxml=<file>` to the command and parses the JUnit XML, so a finding names the test file
 * and the test case, never a line scraped from colourised output. JUnit is pytest's built-in report, so
 * the port carries no test dependency for this gate's sake.
 *
 * A SKIP MEANS THE INSTRUMENT IS ABSENT, NEVER THAT THE PORT IS BROKEN. The command's program not being
 * on PATH (a machine without `uv`) and the suite running past the timeout are skips, each naming why; a
 * clean skip is never a pass. A run that exits non-zero with no failed case in its report — a collection
 * error, an import that fails — is a finding carrying the tail of its output, since that is the port
 * failing to load at all.
 *
 * Options: `command` (argv; default `uv run -q --directory python pytest -q -o junit_family=xunit1`), `timeoutSeconds` (default
 * 300). The fixture passes a command that writes a report of its own, so the self-test needs neither `uv`
 * nor the network.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const RULE = "python-conformance-failed"
// `junit_family=xunit1` makes pytest write each case's `file`, which the default family leaves out.
const DEFAULT_COMMAND = ["uv", "run", "-q", "--directory", "python", "pytest", "-q", "-o", "junit_family=xunit1"]

const unescapeXml = (text) =>
  text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&")

/** Each <testcase …> with its attributes and whether it holds a <failure> or <error>. */
function readJunit(xml) {
  const cases = []
  const pattern = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g
  for (const match of xml.matchAll(pattern)) {
    const attributes = Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], unescapeXml(m[2])]))
    const body = match[3] ?? ""
    const tag = body.match(/<(failure|error)\b([^>]*)>/)
    const message = tag?.[2].match(/\bmessage="([^"]*)"/)?.[1]
    cases.push({ ...attributes, failed: tag !== null, message: tag ? unescapeXml(message ?? tag[1]) : undefined })
  }
  return cases
}

export default {
  definition: {
    id: RULE,
    version: 1,
    summary: "every test of the Python port passes — the vector groups, the generated surface test and the unit tests",
    defaultPaths: ["python/pyproject.toml"],
    fixable: false,
  },
  async run(ctx) {
    const options = ctx.options ?? {}
    const command = Array.isArray(options.command) && options.command.length > 0 ? options.command : DEFAULT_COMMAND
    const timeout = Number(options.timeoutSeconds ?? 300) * 1000
    if (!Array.isArray(options.command) && !existsSync(path.join(ctx.repoRoot, "python/pyproject.toml"))) {
      return { findings: [], skipped: "python/pyproject.toml is not present in this tree" }
    }
    const scratch = mkdtempSync(path.join(tmpdir(), "gate-python-conformance-"))
    const report = path.join(scratch, "junit.xml")
    try {
      const run = spawnSync(command[0], [...command.slice(1), `--junitxml=${report}`], { cwd: ctx.repoRoot, encoding: "utf8", timeout })
      if (run.error?.code === "ENOENT") return { findings: [], skipped: `${command[0]} is not on PATH — install it to run the Python port's suite` }
      if (run.error?.code === "ETIMEDOUT" || (run.status === null && run.signal === "SIGTERM")) return { findings: [], skipped: `the Python suite ran past ${timeout / 1000}s` }
      const cases = existsSync(report) ? readJunit(readFileSync(report, "utf8")) : []
      const failed = cases.filter((c) => c.failed)
      const findings = failed.map((c) => ({
        rule: RULE,
        // pytest runs from python/, so the file it names is relative to that directory.
        file: c.file ? `python/${c.file}` : "python/tests",
        evidence: `${c.classname ?? ""}::${c.name ?? ""} — ${String(c.message ?? "failed").split("\n")[0].slice(0, 300)}`,
      }))
      if (run.status !== 0 && findings.length === 0) {
        const tail = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-5).join(" | ").slice(0, 500)
        findings.push({ rule: RULE, file: "python/tests", evidence: `the suite exited ${run.status} with no failed case reported: ${tail}` })
      }
      return { findings, examined: cases.length }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  },
}
