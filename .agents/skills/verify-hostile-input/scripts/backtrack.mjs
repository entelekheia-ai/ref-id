// SPDX-License-Identifier: Apache-2.0
// Searches every pattern the specification declares for catastrophic backtracking in V8's engine (the
// TypeScript implementation's): prefix + pump × 2000 + suffix, then × 20000, flagging a match whose time
// grows more than 30× for the 10× input, or passes 200 ms. `backtrack.py` does the same through the
// Python port's own compile path. Rust's `regex` is linear by construction; Swift's `Regex` is not, and
// is probed through `timing.mjs` instead, since its patterns compile inside the runner.
//
//   node backtrack.mjs            last line: "suspects <n>"; each suspect names pattern, prefix, pump, suffix

import { readFileSync } from "node:fs"
import { ROOT } from "./ports.mjs"

const spec = JSON.parse(readFileSync(ROOT + "spec/ref-id.json", "utf8"))
const patterns = []
const walk = (value, path) => {
  if (typeof value === "string") {
    if (value.startsWith("^") && value.endsWith("$")) patterns.push([path, value])
  } else if (value && typeof value === "object" && !path.startsWith("vectors")) {
    for (const k in value) walk(value[k], path ? `${path}.${k}` : k)
  }
}
walk(spec, "")
const pumps = ["a", ".", "-", "/", "t", "i", "g", "1", "~", "@", ":", "%", "_", "a.", "a-", "/a", "/.", "..", "a/", ".a", "a.t", "git", "/..", "a@", "1,", "0"]
const prefixes = ["", "https://", "https://a.", "https://a.com/", "https://a.com", "ref:a:", "ref:1:a:", "a@", "a", "/", "~", "c:", "swh:1:cnt:", "+1", "2020-01-01T00:00:00.", "ref:a:b;", "ref:a:b#", "a="]
const suffixes = ["\n", "!", "\u0000", "/", "", "%", ";", "#", ".git"]
const time = (re, s) => { const t = process.hrtime.bigint(); re.test(s); return Number(process.hrtime.bigint() - t) / 1e6 }
const suspects = []
for (const [path, source] of patterns) {
  const re = new RegExp(source)
  for (const pre of prefixes) for (const pump of pumps) for (const suf of suffixes) {
    const t1 = time(re, pre + pump.repeat(2000) + suf)
    if (t1 < 2) continue
    const t2 = time(re, pre + pump.repeat(20000) + suf)
    if (t2 > 30 * Math.max(t1, 0.5) || t2 > 200) suspects.push([path, JSON.stringify(pre), JSON.stringify(pump), JSON.stringify(suf), `${t1.toFixed(1)}ms`, `${t2.toFixed(1)}ms`])
  }
}
console.log(`patterns ${patterns.length}`)
for (const s of suspects) console.log(s.join("  "))
console.log(`suspects ${suspects.length}`)
process.exitCode = suspects.length ? 1 : 0
