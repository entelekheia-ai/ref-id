// SPDX-License-Identifier: Apache-2.0
// Times each implementation's parse line protocol on one generated identifier per size, and flags any
// implementation whose time grows faster than its input.
//
//   node timing.mjs <generator | all> [sizes…]       default sizes: 10000 100000 1000000
//
// A row per generator and size, then one verdict line per generator:
//   verdict <generator>: linear
//   verdict <generator>: super-linear <implementation> ×<growth> for ×<size growth>
// Growth is judged between the two largest sizes that finished; a timeout counts as super-linear.
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
let slow = 0
for (const name of names) {
  const seconds = {}
  for (const n of sizes) {
    const input = escape(generators[name](n)) + "\n"
    const cells = []
    for (const [impl, command, args] of ports("parse")) {
      const start = process.hrtime.bigint()
      const run = spawnSync(command, args, { cwd: ROOT, input, encoding: "utf8", timeout, maxBuffer: 1 << 30 })
      const s = Number(process.hrtime.bigint() - start) / 1e9
      const status = run.error?.code === "ETIMEDOUT" ? "TIMEOUT" : (run.stdout.match(/"status":"([a-z]+)"|"threw":"([^"]{0,40})/) ?? [])[1] ?? `exit ${run.status}`
      ;(seconds[impl] ??= []).push(status === "TIMEOUT" ? Infinity : s)
      cells.push(`${impl}=${s.toFixed(2)}s[${status}]`)
    }
    console.log(`${name.padEnd(18)} n=${String(n).padEnd(8)} ${cells.join(" ")}`)
  }
  const [a, b] = [sizes.length - 2, sizes.length - 1]
  const verdicts = Object.entries(seconds)
    .map(([impl, t]) => [impl, t[b] / Math.max(t[a], 0.05)])
    .filter(([, growth]) => growth > 3 * (sizes[b] / sizes[a]))
  if (verdicts.length) slow++
  console.log(`verdict ${name}: ${verdicts.length ? "super-linear " + verdicts.map(([i, g]) => `${i} ×${g === Infinity ? "timeout" : g.toFixed(0)}`).join(", ") + ` for ×${sizes[b] / sizes[a]}` : "linear"}`)
}
process.exitCode = slow ? 1 : 0
