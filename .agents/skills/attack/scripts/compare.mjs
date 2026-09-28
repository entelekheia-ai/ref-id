// SPDX-License-Identifier: Apache-2.0
// Runs one corpus through every implementation's line protocol and groups the disagreements with the
// TypeScript reference by (implementation, Package URL or not, fields that differ).
//
//   node compare.mjs <corpus-file> [--pairs] [--browser]
//
// The last line is the verdict the skill branches on:
//   verdict: agree                              every implementation matches the reference on every row
//   verdict: package-url-edge-only <n>          the only differences sit on a Package URL locator and in
//                                               its status, part, serialised or canonical — the four
//                                               Package URL validators are different software and part
//                                               there; listed, and weighed against the known edges
//   verdict: disagree <n>                       anything else — each group is a candidate finding
// A `threw` row, a missing row or a non-zero exit is always reported, whatever else agrees. In `--pairs`
// mode a pair counts as a Package URL edge when either member already parts that way on its own parse,
// since its comparison then follows from the verdict rather than from the relation.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { ROOT, ports } from "./ports.mjs"

const file = process.argv[2]
const pairs = process.argv.includes("--pairs")
const input = readFileSync(file, "utf8")
const lines = input.split("\n").filter(Boolean)
const rows = pairs ? lines.length / 2 : lines.length

const results = {}
for (const [name, command, args] of ports(pairs ? "pairs" : "parse", { browser: process.argv.includes("--browser") })) {
  let out
  try {
    out = execFileSync(command, args, { cwd: ROOT, input, encoding: "utf8", maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"] })
  } catch (error) {
    out = error.stdout ?? ""
    console.log(`${name}: exit ${error.status} ${String(error.stderr).slice(0, 300)}`)
  }
  results[name] = out.split("\n").filter(Boolean).map((line) => JSON.parse(line))
}

// For --pairs: which members part on their own parse as a Package URL edge (a second run, parse mode).
let edgeInputs = new Set()
if (pairs) {
  const unique = [...new Set(lines)]
  const parsed = {}
  for (const [name, command, args] of ports("parse")) {
    const out = execFileSync(command, args, { cwd: ROOT, input: unique.join("\n") + "\n", encoding: "utf8", maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"] }).toString()
    parsed[name] = out.split("\n").filter(Boolean).map((line) => JSON.parse(line))
  }
  unique.forEach((line, i) => {
    const ref = parsed.typescript[i]
    if (line.includes("pkg:") && Object.keys(parsed).some((n) => parsed[n][i]?.status !== ref?.status || parsed[n][i]?.part !== ref?.part)) edgeInputs.add(line)
  })
}

const flat = (value, prefix = "", acc = {}) => {
  if (value && typeof value === "object" && !Array.isArray(value)) for (const k in value) flat(value[k], prefix ? `${prefix}.${k}` : k, acc)
  else acc[prefix] = JSON.stringify(value)
  return acc
}
const groups = new Map()
const edges = new Map()
const EDGE = new Set(["status", "part", "serialised", "canonical"])
for (let i = 0; i < rows; i++) {
  const reference = results.typescript[i]
  const row = pairs ? [lines[2 * i], lines[2 * i + 1]] : lines[i]
  const isPkg = JSON.stringify(row).includes("pkg:")
  for (const name of Object.keys(results).filter((n) => n !== "typescript")) {
    const other = results[name][i]
    const a = flat(reference ?? { missing: true })
    const b = flat(other ?? { missing: true })
    // `nested` and `delegated` are shapes each implementation forms for itself — the TypeScript protocol
    // drops them, the others print them — and the differential ignores them for the same reason.
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k] && !/(^|\.)(nested|delegated)($|\.)/.test(k))
    if (fields.length === 0) continue
    const threw = "threw" in b || "missing" in b || "threw" in a
    const key = `${name} ${isPkg ? "pkg" : "non-pkg"} ${fields.map((f) => f.replace(/\.\d+/g, "")).sort().join(",")}`
    const edge = pairs ? row.some((member) => edgeInputs.has(member)) : isPkg && fields.every((f) => EDGE.has(f))
    const target = !threw && edge ? edges : groups
    if (!target.has(key)) target.set(key, { count: 0, example: row, reference: fields.map((f) => `${f}=${a[f]}`).join(" "), theirs: fields.map((f) => `${f}=${b[f]}`).join(" ") })
    target.get(key).count++
  }
}
const show = (title, map) => {
  if (!map.size) return
  console.log(`== ${title}`)
  for (const [key, g] of [...map].sort((x, y) => y[1].count - x[1].count)) {
    console.log(`${g.count}  ${key}\n    input: ${JSON.stringify(g.example).slice(0, 220)}\n    typescript: ${g.reference.slice(0, 300)}\n    this one:   ${g.theirs.slice(0, 300)}`)
  }
}
show("disagreements", groups)
show("package-url-edge", edges)
console.log(`rows ${rows}, disagreement groups ${groups.size}, package-url-edge groups ${edges.size}`)
console.log(groups.size ? `verdict: disagree ${groups.size}` : edges.size ? `verdict: package-url-edge-only ${edges.size}` : "verdict: agree")
process.exitCode = groups.size ? 1 : 0
