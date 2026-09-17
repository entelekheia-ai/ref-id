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

import { canonicalise, parse, serialise } from "./src/index.ts"

const withCanonical = process.argv.includes("--canonical")

const stdin: string = await new Promise((resolve) => {
  let text = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => (text += chunk))
  process.stdin.on("end", () => resolve(text))
})

let failures = 0
const lines = stdin.split("\n").filter((line) => line.length > 0)

for (const line of lines) {
  const input = line.replace(/\\n/g, "\n").replace(/\\r/g, "\r")
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

process.exit(failures === 0 ? 0 : 1)
