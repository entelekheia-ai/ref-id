// SPDX-License-Identifier: Apache-2.0
// The line-protocol runners of every implementation, resolved from the repository this skill sits in.
// `build.sh` must have run once, so the Rust example and the Swift runner exist as binaries.

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

/** Each implementation as [name, command, args] for a mode: "parse" (with the canonical spelling) or "pairs". */
export function ports(mode, { browser = false } = {}) {
  const flag = mode === "pairs" ? "--pairs" : "--canonical"
  const rust = ROOT + "target/debug/examples/parse_lines"
  const swift = ROOT + ".build/debug/ref-id-conformance"
  const python = ROOT + "python/.venv/bin/python"
  const list = [
    ["typescript", "node", ["--experimental-strip-types", "packages/ref-id/parse-lines.ts", flag]],
    ["rust", rust, [flag]],
    ["swift", swift, mode === "pairs" ? ["--pairs"] : ["--parse", "--canonical"]],
    ["python", python, ["python/tools/parse_lines.py", flag]],
  ]
  if (browser) list.splice(1, 0, ["typescript-browser", "node", ["--experimental-strip-types", "packages/ref-id/parse-lines.ts", flag, "--browser"]])
  for (const [name, command] of list) {
    if (command !== "node" && !existsSync(command)) throw new Error(`${name}: ${command} is missing — run scripts/build.sh first`)
  }
  return list
}

/** Escapes one identifier for the line protocol. */
export const escape = (text) => text.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
