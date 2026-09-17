// SPDX-License-Identifier: Apache-2.0
//
// Runs every implementation over the same inputs and fails on the first disagreement.
//
// Each port passes its own conformance suite against the vectors, which proves each one agrees with the
// specification. It does not prove they agree with *each other*: a field no vector constrains can be
// decided three different ways and every suite stays green. That is not hypothetical here — the three
// canonicalised a Package URL differently for as long as the protocol below dropped the field, and the
// suites never said so.
//
// The inputs are drawn from the vector groups themselves, so the corpus grows with the specification
// instead of with this file.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const spec = JSON.parse(readFileSync(join(ROOT, "spec/ref-id.json"), "utf8"))

/**
 * Every identifier the specification mentions as an input, deduplicated and in a stable order.
 *
 * Four vector groups contribute, and each contributes a different kind of input: `parse` brings the
 * malformed and the exotic, `comparison` brings both operands of every pair, `roundtrip` brings the
 * identifiers that must survive re-serialisation unchanged, and `canonical` brings the ones whose
 * qualifier order is deliberately wrong on the way in. Drawing from the specification rather than from
 * a list here means the corpus grows whenever a vector is added, with nothing to remember.
 */
function corpus() {
  const seen = new Set()
  for (const group of ["parse", "roundtrip", "canonical"]) {
    for (const vector of spec.vectors[group] ?? []) {
      const input = typeof vector === "string" ? vector : vector.input
      if (typeof input === "string") seen.add(input)
    }
  }
  for (const vector of spec.vectors.comparison) {
    for (const side of [vector.a, vector.b]) {
      if (typeof side === "string") seen.add(side)
    }
  }
  // A literal newline or carriage return would break the line protocol, and the two ports unescape these
  // on the way in — so they leave here escaped, exactly as those ports expect to receive them.
  return [...seen].map((input) => input.replace(/\n/g, "\\n").replace(/\r/g, "\\r"))
}

/** Runs one implementation over the whole corpus and parses the one JSON object it prints per line. */
function port(command, args, inputs) {
  const out = execFileSync(command, args, { cwd: ROOT, input: `${inputs.join("\n")}\n`, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  return out.trim().split("\n").map((line) => JSON.parse(line))
}

/**
 * Which fields are compared, and the one that is deliberately not.
 *
 * `delegated` and `nested` are shapes each implementation forms for itself. The **validity verdict of a
 * Package URL** is excluded by policy, not by convenience: a locator's validity belongs to the format,
 * and the three purl validators differ at the edge — `packageurl-js` accepts an empty name after a
 * namespace and a version ending in `/`, where the Rust crate and the in-house Swift validator refuse
 * them. So a row where the ports disagree only on `status` between `ok` and `malformed`, for a `pkg`
 * locator, is reported as a known edge rather than as a failure. Every other field must match.
 *
 * THE EXEMPTION IS PER IMPLEMENTATION, NOT BLANKET. It is bought by the three validators being three
 * different pieces of software; the browser build resolves the same `packageurl-js` the Node build
 * does, so there is no edge for it to land on, and a disagreement between those two on a purl verdict
 * would be a defect in the browser build wearing the exemption as a disguise.
 */
const SHARES_THE_REFERENCE_VALIDATOR = new Set(["typescript-browser"])

function compare(name, mine, theirs, input) {
  const differences = []
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)])
  keys.delete("delegated")
  keys.delete("nested")
  for (const key of keys) {
    const [a, b] = [JSON.stringify(mine[key]), JSON.stringify(theirs[key])]
    if (a !== b) differences.push({ key, reference: a, [name]: b })
  }
  const onlyVerdict = differences.length > 0 && differences.every((d) => d.key === "status" || d.key === "part")
  const isPkg = input.startsWith("ref:pkg:") || /^ref:[0-9]+:pkg:/.test(input)
  return { differences, known: onlyVerdict && isPkg && !SHARES_THE_REFERENCE_VALIDATOR.has(name) }
}

const inputs = corpus()

// **All three speak the protocol, and all three are run the same way.** Calling the reference in-process
// while spawning the other two would judge it by a path they never take, so a defect living only in the
// protocol's own serialisation would be invisible in exactly the implementation the others are compared
// against. The first row is the reference the other two are compared to; it is otherwise an ordinary port.
//
// **The browser build is a row here, not a suite of its own** (Plan-004, Track 3). It is a second
// build of the same source, and the failure it can reintroduce is the one this harness was written
// for — two implementations deciding an unconstrained field differently while both suites stay green.
// One build apart instead of one language apart changes nothing about that shape, so it is compared
// the same way: same corpus, same protocol, same child process, one import different.
//
// It runs the browser ENTRY POINT from source, exactly as the reference row runs its own — not the
// emitted dist/. What distinguishes that build is which spec source and which hash its entry installs,
// and both are installed identically from source. The property that belongs to the emitted artifact is
// a different one (no Node builtin survives into the closure), and it is proven where it lives, by
// scripts/check-browser-purity.mjs at postbuild.
const ports = [
  ["typescript", "node", ["--experimental-strip-types", "packages/ref-id/parse-lines.ts", "--canonical"]],
  ["typescript-browser", "node", ["--experimental-strip-types", "packages/ref-id/parse-lines.ts", "--canonical", "--browser"]],
  ["rust", "cargo", ["run", "-q", "--manifest-path", "crates/ref-id/Cargo.toml", "--example", "parse_lines", "--", "--canonical"]],
  ["swift", "swift", ["run", "-q", "ref-id-conformance", "--parse", "--canonical"]],
]

let failures = 0
let known = 0
let reference = null

for (const [name, command, args] of ports) {
  let rows
  try {
    rows = port(command, args, inputs)
  } catch (error) {
    console.error(`${name}: could not run — ${error.message.split("\n")[0]}`)
    failures += 1
    continue
  }
  if (rows.length !== inputs.length) {
    console.error(`${name}: produced ${rows.length} rows for ${inputs.length} inputs`)
    failures += 1
    continue
  }
  if (reference === null) {
    reference = rows
    continue
  }
  for (const [index, input] of inputs.entries()) {
    const { differences, known: isKnown } = compare(name, reference[index], rows[index], input)
    if (differences.length === 0) continue
    if (isKnown) {
      known += 1
      continue
    }
    failures += 1
    console.error(`${name}: ${input}`)
    for (const difference of differences) {
      console.error(`  ${difference.key}: reference ${difference.reference}, ${name} ${difference[name]}`)
    }
  }
}

if (reference === null) {
  console.error("the reference implementation did not run; nothing was compared")
  process.exit(1)
}

const suffix = known > 0 ? `, ${known} known purl-validity edge${known === 1 ? "" : "s"}` : ""
console.log(`differential: ${inputs.length} inputs × ${ports.length} implementations, ${failures} disagreement${failures === 1 ? "" : "s"}${suffix}`)
process.exit(failures === 0 ? 0 : 1)
