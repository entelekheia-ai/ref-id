// SPDX-License-Identifier: Apache-2.0
//
// Reads one identifier per line on stdin (with `\n` and `\r` escaped as `\\n` / `\\r`) and prints one
// canonical JSON result per line — the same line protocol the Rust and Swift ports speak.
//
// It exists for parity, and parity here is not cosmetic. Without it the differential test called this
// package in-process while calling the other two as child processes, so the reference was judged by a
// path the ports never take: a defect living only in the protocol's own serialisation would have been
// invisible in exactly the implementation the others are compared against.
//
// `--canonical` keeps the delegated locator's canonical spelling. The default drops it, because the
// validity verdict of a Package URL belongs to the format and the three validators differ at the edge;
// canonicalisation is a separate question, and the two are not excluded together.
//
// `--browser` selects the browser entry point instead of the Node one — the same runner, the same
// protocol, one import apart (Plan-004, Track 3). That single difference is the point: the browser
// build gets its spec from a compiled-in constant and its sha256 from a different implementation, and
// the differential harness is what holds the two answers against each other. A suite of its own would
// compare each build against its own expectations, which is exactly the check that stayed green while
// the three language ports canonicalised a Package URL three different ways.
//
// `--pairs` (Plan-005, Track 5) switches to the second pass an adversarial review demanded: the four
// implementations agreed on every parse and still disagreed on comparisons no vector named. stdin then
// carries two lines per pair — `a`, then `b`, escaped the same way `--parse` escapes a line — and stdout
// carries one canonical-JSON line per pair: `covers`, `coversReversed` (`covers(b, a)`), `samePackage`,
// `sameIdentifier`, `relate` (the full result, or `null`) and `verdict` (the same). Two lines rather than one line with a
// separator, because the grammar admits a tab inside a locator.

const withCanonical = process.argv.includes("--canonical")
const asBrowser = process.argv.includes("--browser")
const pairsMode = process.argv.includes("--pairs")

// Dynamic, because the two entry points are the thing under test and a static import would pull both
// module graphs into this process — including the Node one, whose filesystem loader is precisely what
// the browser build does not have.
const { canonicalise, covers, parse, relate, samePackage, sameIdentifier, serialise, verdict } = asBrowser
  ? await import("./src/index.browser.ts")
  : await import("./src/index.ts")

const stdin: string = await new Promise((resolve) => {
  let text = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => (text += chunk))
  process.stdin.on("end", () => resolve(text))
})

const unescape = (line: string): string => line.replace(/\\n/g, "\n").replace(/\\r/g, "\r")

let failures = 0
const lines = stdin.split("\n").filter((line) => line.length > 0)

// Neither mode calls process.exit() after writing: stdout to a pipe is asynchronous, and exiting drops what is
// still queued. The pair pass lost 12 049 of 39 601 rows that way on the macOS runner the day the corpus grew
// by two vectors — the differential then reported the reference as not having run. `exitCode` lets the
// queue drain.
if (pairsMode && lines.length % 2 !== 0) {
  console.error(`parse-lines --pairs: ${lines.length} lines is not an even number of lines (two per pair)`)
  process.exitCode = 1
} else if (pairsMode) {
  for (let index = 0; index < lines.length; index += 2) {
    const a = unescape(lines[index]!)
    const b = unescape(lines[index + 1]!)
    console.log(
      canonicalise({
        covers: covers(a, b),
        coversReversed: covers(b, a),
        samePackage: samePackage(a, b),
        sameIdentifier: sameIdentifier(a, b),
        relate: relate(a, b),
        verdict: verdict(a, b),
      }),
    )
  }
} else {
  runParse()
}

function runParse(): void {
  for (const line of lines) {
    const input = unescape(line)
    let result
    try {
      result = parse(input)
    } catch (error) {
      failures += 1
      console.log(canonicalise({ threw: String(error) }))
      continue
    }
    const row: Record<string, unknown> = { ...result }
    // Shapes each implementation forms for itself, and never part of the comparison.
    delete row.nested
    delete row.delegated
    if (!withCanonical) {
      delete row.canonical
    }
    try {
      row.serialised = serialise(result)
    } catch {
      // A result the serialiser refuses carries no `serialised` field — the ports do the same.
    }
    console.log(canonicalise(row))
  }
  process.exitCode = failures === 0 ? 0 : 1
}
