// SPDX-License-Identifier: Apache-2.0
// Times each implementation's parse line protocol on one generated identifier per size, and flags any
// implementation whose time grows faster than its input.
//
//   node timing.mjs <generator | all> [sizes…]       default sizes: 10000 100000 1000000
//
// A row per generator and size — each cell the seconds, the status, and `out×` (the longest single field
// of the result over the input's UTF-8 byte length, the memory-amplification reading of Step 5; the line as a whole
// echoes the input in several fields, so its own length measures nothing) — then two verdict lines per generator:
//   verdict <generator>: linear | super-linear <implementation> ×<growth> for ×<size growth>
//   amplification <generator>: none | <implementation> out×<ratio>   (flagged above ×3)
// Growth is judged between the two largest sizes, on each run's time minus that implementation's start-up
// (a one-line run timed first), so a process that starts slowly cannot hide a quadratic; a timeout counts
// as super-linear. An implementation that exits non-zero or prints no row is a third verdict line:
//   crashed <generator>: none | <implementation> n=<size> <status>
// TIMEOUT (seconds, default 60) bounds each run.

import { spawnSync } from "node:child_process"
import { ROOT, escape, ports } from "./ports.mjs"

const generators = {
  nestedA: (n) => "ref:folder:a;by=ref:folder:" + "a".repeat(n),
  nestedPct: (n) => "ref:folder:a;by=ref:folder:a" + "%3B".repeat(Math.floor(n / 3)),
  manyQualifiers: (n) => "ref:folder:a;" + Array.from({ length: Math.floor(n / 8) }, (_, i) => "x" + i.toString(36) + "=1").join(";"),
  repeatedQualifier: (n) => "ref:folder:a;" + Array.from({ length: Math.floor(n / 4) }, () => "x=1").join(";"),
  originDots: (n) => "ref:folder:a;origin=https://" + "a.".repeat(Math.floor(n / 2)) + "!",
  originSegments: (n) => "ref:folder:a;origin=https://example.com/" + "a/".repeat(Math.floor(n / 2)) + "b.git",
  localPath: (n) => "ref:folder:a;path=/" + "a/".repeat(Math.floor(n / 2)) + "..",
  relativePath: (n) => "ref:folder:a;corpus=" + "..a/".repeat(Math.floor(n / 4)) + "..",
  urlHost: (n) => "ref:url:" + "a.".repeat(Math.floor(n / 2)) + "a",
  email: (n) => "ref:email:" + "a@".repeat(Math.floor(n / 2)),
  unknownType: (n) => "ref:zz:" + "a:".repeat(Math.floor(n / 2)),
  versionDigits: (n) => "ref:" + "1".repeat(n) + ":folder:a",
  typeLetters: (n) => "ref:" + "a".repeat(n),
  pkgName: (n) => "ref:pkg:npm/" + "a".repeat(n) + "@1",
  pkgPercent: (n) => "ref:pkg:npm/" + "%61".repeat(Math.floor(n / 3)) + "@1",
  pkgUnicode: (n) => "ref:pkg:npm/" + "é".repeat(n) + "@1",
  pkgSubpath: (n) => "ref:pkg:npm/a@1#" + "a/".repeat(Math.floor(n / 2)),
  manyRefinements: (n) => "ref:folder:a#p;" + Array.from({ length: Math.floor(n / 8) }, (_, i) => "y" + i.toString(36) + "=1").join(";"),
  linesDigits: (n) => "ref:folder:a#x;lines=" + "1".repeat(n) + ",",
}

const [which, ...sizeArgs] = process.argv.slice(2)
const sizes = (sizeArgs.length ? sizeArgs : ["10000", "100000", "1000000"]).map(Number)
const names = which === "all" ? Object.keys(generators) : [which]
if (!names.every((n) => generators[n])) {
  console.error(`usage: timing.mjs <${Object.keys(generators).join(" | ")} | all> [sizes…]`)
  process.exit(2)
}
const timeout = Number(process.env.TIMEOUT ?? 60) * 1000
const startup = {}
for (const [impl, command, args] of ports("parse")) {
  const start = process.hrtime.bigint()
  spawnSync(command, args, { cwd: ROOT, input: "ref:folder:a\n", encoding: "utf8", timeout })
  startup[impl] = Number(process.hrtime.bigint() - start) / 1e9
}
// The longest string anywhere in a row: `relate` and `nested` carry strings below the top level.
const longestString = (value) =>
  typeof value === "string" ? value.length : value && typeof value === "object" ? Math.max(0, ...Object.values(value).map(longestString)) : 0
let slow = 0
let crashed = 0
let amplified = 0
for (const name of names) {
  const seconds = {}
  const ratios = {}
  const crashes = []
  for (const n of sizes) {
    const input = escape(generators[name](n)) + "\n"
    const cells = []
    for (const [impl, command, args] of ports("parse")) {
      const start = process.hrtime.bigint()
      const run = spawnSync(command, args, { cwd: ROOT, input, encoding: "utf8", timeout, maxBuffer: 1 << 30 })
      const s = Number(process.hrtime.bigint() - start) / 1e9
      const status = run.error?.code === "ETIMEDOUT" ? "TIMEOUT" : (run.stdout.match(/"status":"([a-z]+)"|"threw":"([^"]{0,40})/) ?? [])[1] ?? `exit ${run.status}`
      ;(seconds[impl] ??= []).push(status === "TIMEOUT" ? Infinity : Math.max(s - startup[impl], 0))
      if (status !== "TIMEOUT" && (run.status !== 0 || !run.stdout.trim())) crashes.push(`${impl} n=${n} ${status}`)
      let longest = 0
      try {
        longest = longestString(JSON.parse(run.stdout.split("\n")[0] || "{}"))
      } catch {
        longest = 0 // an unparsable row is reported by its status, not measured
      }
      // Over the input's UTF-8 bytes: percent-encoding triples a byte, so a two-byte character legitimately
      // becomes six characters, and a denominator in characters would flag that as amplification.
      const ratio = longest / Buffer.byteLength(input, "utf8")
      ratios[impl] = Math.max(ratios[impl] ?? 0, ratio)
      cells.push(`${impl}=${s.toFixed(2)}s[${status}] out×${ratio.toFixed(1)}`)
    }
    console.log(`${name.padEnd(18)} n=${String(n).padEnd(8)} ${cells.join(" ")}`)
  }
  const [a, b] = [sizes.length - 2, sizes.length - 1]
  const verdicts = Object.entries(seconds)
    .map(([impl, t]) => [impl, t[b] / Math.max(t[a], 0.05)])
    .filter(([, growth]) => growth > 3 * (sizes[b] / sizes[a]))
  if (verdicts.length) slow++
  const big = Object.entries(ratios).filter(([, r]) => r > 3)
  if (big.length) amplified++
  if (crashes.length) crashed++
  console.log(`crashed ${name}: ${crashes.length ? crashes.join(", ") : "none"}`)
  console.log(`amplification ${name}: ${big.length ? big.map(([i, r]) => `${i} out×${r.toFixed(1)}`).join(", ") : "none"}`)
  console.log(`verdict ${name}: ${verdicts.length ? "super-linear " + verdicts.map(([i, g]) => `${i} ×${g === Infinity ? "timeout" : g.toFixed(0)}`).join(", ") + ` for ×${sizes[b] / sizes[a]}` : "linear"}`)
}
process.exitCode = slow || amplified || crashed ? 1 : 0
