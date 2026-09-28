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

import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { availableParallelism } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const spec = JSON.parse(readFileSync(join(ROOT, "spec/ref-id.json"), "utf8"))

/**
 * Every identifier the specification mentions as an input, deduplicated and in a stable order.
 *
 * Every group contributes, so the corpus grows whenever a vector is added, with nothing to remember.
 */
function corpus() {
  // Every identifier any vector group carries — inputs, both sides of a pair, a build's expected output,
  // an envelope's requested id and members. The groups were once listed here by name, and the ones left
  // out (relate, verdict, build, envelope) held an input one port canonicalised differently.
  const seen = new Set()
  // A parse, roundtrip or canonical input is an input whatever its prefix: `pkg:npm/x@1.0.0` is a parse
  // vector precisely because it lacks `ref:`, and the prefix filter below would drop it.
  for (const group of ["parse", "roundtrip", "canonical"]) {
    for (const vector of spec.vectors[group] ?? []) if (typeof vector.input === "string") seen.add(vector.input)
  }
  const walk = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("ref:")) seen.add(value)
    } else if (value && typeof value === "object") {
      for (const child of Object.values(value)) walk(child)
    }
  }
  walk(spec.vectors)
  // A literal newline or carriage return would break the line protocol, and the ports unescape these
  // on the way in — so they leave here escaped, exactly as those ports expect to receive them.
  return [...seen].map((input) => input.replace(/\n/g, "\\n").replace(/\r/g, "\\r"))
}

/**
 * Runs one implementation over the whole corpus and parses the one JSON object it prints per line.
 *
 * `stderr` is captured and re-thrown with the message, not discarded. It was discarded once, and the
 * cost was measured: this harness ran red in CI for two merges reporting only `could not run —
 * Command failed: node …`, while the child was saying `ENOENT … packages/ref-id/spec/ref-id.json` on
 * every line. A failure that names no cause is a failure nobody acts on.
 */
function port(command, args, inputs, { parse = true, raw = false } = {}) {
  return new Promise((resolvePort, rejectPort) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] })
    const out = []
    const err = []
    child.stdout.on("data", (chunk) => out.push(chunk))
    child.stderr.on("data", (chunk) => err.push(chunk))
    child.on("error", rejectPort)
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8")
      if (code !== 0) {
        const said = Buffer.concat(err).toString("utf8").trim() || stdout.trim()
        const message = `Command failed: ${command} ${args.join(" ")} (exit ${code})`
        rejectPort(new Error(said ? `${message}\n${said.split("\n").slice(0, 5).join("\n")}` : message))
        return
      }
      if (!parse) return resolvePort(raw ? stdout : [])
      try {
        resolvePort(stdout.trim().split("\n").map((line) => JSON.parse(line)))
      } catch (error) {
        rejectPort(error)
      }
    })
    child.stdin.on("error", () => {}) // a child that exits early reports through its exit code
    child.stdin.end(`${inputs.join("\n")}\n`)
  })
}

/**
 * At most `slots` runs at once: `limited(label, start)` waits for a slot, runs `start()`, and settles to
 * `{ rows }` or `{ error }`. The seconds each run took go to stderr, so a slow job says what it waited on.
 */
function limiter(slots) {
  const queue = []
  const release = () => {
    slots += 1
    queue.shift()?.()
  }
  return async (label, start) => {
    if (slots === 0) await new Promise((wake) => queue.push(wake))
    slots -= 1
    const began = Date.now()
    try {
      return await start().then((rows) => ({ rows }), (error) => ({ error }))
    } finally {
      console.error(`${label}: ${((Date.now() - began) / 1000).toFixed(1)} s`)
      release()
    }
  }
}

/**
 * Which fields are compared, and the one that is deliberately not.
 *
 * `delegated` and `nested` are shapes each implementation forms for itself. The **validity verdict of a
 * Package URL** is excluded by policy, not by convenience: a locator's validity belongs to the format,
 * and the four purl validators differ at the edge, as `docs/reference/implementation-differences.md`
 * measures. So a row where the ports disagree only on `status` between `ok` and `malformed`, for a `pkg`
 * locator, is reported as a known edge rather than as a failure. Every other field must match.
 *
 * THE EXEMPTION IS PER IMPLEMENTATION, NOT BLANKET. It is bought by the four validators being four
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

// **Every implementation speaks the protocol, and all are run the same way.** Calling the reference in-process
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
// **Each compiled port is built once, then run as its own binary.** The builds start at once, side by
// side; a binary is run directly rather than through `cargo run` or `swift run`, so the several runs of
// one port share no build lock. A run through the build tool and a run of the binary it built speak the
// same protocol from the same code: the path is shorter, not different.
const timed = (label, promise) => {
  const began = Date.now()
  return promise.finally(() => console.error(`${label}: ${((Date.now() - began) / 1000).toFixed(1)} s`))
}
const run = (command, args) => port(command, args, [], { parse: false, raw: true })
const rustBinary = timed("build rust", run("cargo", ["build", "--manifest-path", "crates/ref-id/Cargo.toml", "--example", "parse_lines", "--message-format=json-render-diagnostics"]))
  .then((out) => out.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((message) => message.target?.name === "parse_lines" && message.executable)?.executable)
  .then((binary) => (binary ? [binary, []] : Promise.reject(new Error("cargo build reported no parse_lines executable"))))
const swiftBinary = timed("build swift", run("swift", ["build", "-q", "--product", "ref-id-conformance"]))
  .then(() => run("swift", ["build", "--show-bin-path"]))
  .then((dir) => [join(dir.trim(), "ref-id-conformance"), []])

const typescript = Promise.resolve(["node", ["--experimental-strip-types", "packages/ref-id/parse-lines.ts"]])
const python = Promise.resolve(["uv", ["run", "-q", "--directory", "python", "python", "tools/parse_lines.py"]])

// [name, how it is launched, its parse arguments, its pair arguments, whether its pair pass is split]
const ports = [
  ["typescript", typescript, ["--canonical"], ["--pairs"], false],
  ["typescript-browser", typescript, ["--canonical", "--browser"], ["--pairs", "--browser"], false],
  ["rust", rustBinary, ["--canonical"], ["--pairs"], true],
  ["swift", swiftBinary, ["--parse", "--canonical"], ["--pairs"], true],
  ["python", python, ["--canonical"], ["--pairs"], true],
]
const pairPorts = ports

const pairs = inputs.flatMap((a) => inputs.map((b) => [a, b]))
const pairLines = pairs.flatMap(([a, b]) => [a, b])

// **Every run starts as soon as its own port can, and all are compared afterwards, in row order.** The
// interpreted ports start at once; a compiled one starts when its build finishes, while the others run.
// The slow pair passes are split into one slice per core, each slice a separate process, and their rows
// joined back in order. At most one run per core is live at a time, since the macOS runner has few
// cores and an unbounded start made the job slower there. None of this changes a verdict: every row is
// still judged against row 0, which is still the reference whether or not it finished first.
const slots = availableParallelism()
const limited = limiter(slots)
const launch = (launcher, label, args, lines) =>
  launcher.then(
    ([command, prefix]) => limited(label, () => port(command, [...prefix, ...args], lines)),
    (error) => ({ error }),
  )
const slices = (lines, count) => {
  const size = Math.ceil(lines.length / 2 / count) * 2 // whole pairs: two lines each
  return Array.from({ length: Math.ceil(lines.length / size) }, (_, i) => lines.slice(i * size, (i + 1) * size))
}
const pairRunsStarted = ports.map(([name, launcher, , pairArgs, split]) => {
  const parts = split ? slices(pairLines, slots) : [pairLines]
  return Promise.all(parts.map((lines, i) => launch(launcher, `${name} (pairs${parts.length > 1 ? ` ${i + 1}/${parts.length}` : ""})`, pairArgs, lines)))
    .then((settled) => settled.find((part) => part.error) ?? { rows: settled.flatMap((part) => part.rows) })
})
const parseRunsStarted = ports.map(([name, launcher, parseArgs]) => launch(launcher, name, parseArgs, inputs))
const [pairRuns, parseRuns] = await Promise.all([Promise.all(pairRunsStarted), Promise.all(parseRunsStarted)])

let failures = 0
let known = 0
let reference = null

for (const [index, [name]] of ports.entries()) {
  // THE REFERENCE IS ROW 0, AND IT IS NOT WHICHEVER ROW HAPPENS TO RUN FIRST. This used to read
  // `if (reference === null)`, so a reference that failed to start promoted the next row into its
  // place, silently. Measured on 2026-09-17: the TypeScript row could not run, the browser build
  // became the reference, and the run reported `157 inputs × 4 implementations, 1 disagreement` —
  // naming a reference that had never executed, and comparing Rust and Swift against a build that
  // was never meant to be the standard. The count was true and the claim underneath it was not.
  const isReference = index === 0
  const { rows, error } = parseRuns[index]
  if (error) {
    console.error(`${name}: could not run — ${error.message}`)
    failures += 1
    if (isReference) break
    continue
  }
  if (rows.length !== inputs.length) {
    console.error(`${name}: produced ${rows.length} rows for ${inputs.length} inputs`)
    failures += 1
    if (isReference) break
    continue
  }
  if (isReference) {
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
  const [referenceName] = ports[0]
  console.error(`${referenceName} is the reference and it did not run; nothing was compared`)
  process.exit(1)
}

const suffix = known > 0 ? `, ${known} known purl-validity edge${known === 1 ? "" : "s"}` : ""
console.log(`differential: ${inputs.length} inputs × ${ports.length} implementations, ${failures} disagreement${failures === 1 ? "" : "s"}${suffix}`)

// ---------------------------------------------------------------------------------------------------
// The pair pass (Plan-005, Track 5).
//
// Parse agreeing on every input did not make the comparisons agree. An adversarial review built 3025
// pairs and found `sameIdentifier` answering differently on an identifier at an unsupported version, and
// Swift comparing Unicode text by canonical equivalence where the others compare bytes — every suite
// green, because the vectors name only the pairs somebody thought of. So every ordered pair of the same
// corpus goes through every port, and every field of every answer must match the reference row.
//
// Two lines per pair rather than a separator, because the grammar admits a tab inside a locator.


let pairFailures = 0
let pairReference = null
for (const [index, [name]] of pairPorts.entries()) {
  const isReference = index === 0
  const { rows, error } = pairRuns[index]
  if (error) {
    console.error(`${name} (pairs): could not run — ${error.message}`)
    pairFailures += 1
    if (isReference) break
    continue
  }
  if (rows.length !== pairs.length) {
    console.error(`${name} (pairs): produced ${rows.length} rows for ${pairs.length} pairs`)
    pairFailures += 1
    if (isReference) break
    continue
  }
  if (isReference) {
    pairReference = rows
    continue
  }
  let shown = 0
  for (const [row, [a, b]] of pairs.entries()) {
    for (const key of ["covers", "coversReversed", "samePackage", "sameIdentifier", "relate", "verdict"]) {
      const [mine, theirs] = [JSON.stringify(pairReference[row][key]), JSON.stringify(rows[row][key])]
      if (mine === theirs) continue
      pairFailures += 1
      // Every disagreement counts; the first few are printed, because one defect usually disagrees on
      // hundreds of pairs and the log would bury the cause under its echoes.
      if (shown < 20) console.error(`${name} (pairs): ${a}  vs  ${b}\n  ${key}: reference ${mine}, ${name} ${theirs}`)
      shown += 1
    }
  }
}
if (pairReference === null) {
  console.error(`${pairPorts[0][0]} is the reference for pairs and it did not run; no pair was compared`)
  process.exit(1)
}
console.log(`differential: ${pairs.length} pairs × ${pairPorts.length} implementations, ${pairFailures} disagreement${pairFailures === 1 ? "" : "s"}`)
process.exit(failures === 0 && pairFailures === 0 ? 0 : 1)
