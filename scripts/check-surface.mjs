#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Hold the Rust and Swift public functions to the methods `openRPC` declares — both directions, by name.
 *
 * Each implementation's own suite already fails when a declared method is missing or its signature moved:
 * the Rust test binds every method to a typed function pointer, the Swift runner to a typed reference, and
 * the TypeScript suite imports each entry point and type-checks a generated file. What a compile-time
 * binding cannot see is the opposite direction — a public function nobody declared — and that is this
 * script's half. It reads each surface from something that parses the language rather than from a
 * regular expression over its text:
 *
 *   rust   the `pub use` and `pub fn` items of `crates/ref-id/src/lib.rs`, read by tree-sitter-rust through
 *          web-tree-sitter (WebAssembly, nothing built natively). Stable rustdoc emits no JSON, so the
 *          compiler's own listing is not available here without unstable flags.
 *   swift  the symbol graph the compiler emits for the `RefId` target, its list of every public symbol. Needs macOS and
 *          a build, so it runs where the Swift toolchain is.
 *
 * A public function no method declares, and that `x-extensions` does not list for the language, fails. A
 * declared method no function spells fails too, as a second witness beside the compile-time check. Types
 * are listed for reading and never fail: a language's types do not map one-to-one onto the value schemas.
 *
 *   node scripts/check-surface.mjs [--only rust|swift]
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Language, Parser } from "web-tree-sitter"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const spec = JSON.parse(readFileSync(join(ROOT, "spec/ref-id.json"), "utf8"))
const doc = spec.openRPC
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined

const CASING = { camelCase: (name) => name, snake_case: (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`) }
const declaredFor = (language) => {
  const spell = CASING[doc["x-casing"][language]]
  const methods = doc.methods.filter((method) => !(method["x-absent-from"] ?? []).includes(language)).map((method) => spell(method.name))
  return { methods: new Set(methods), extensions: new Set(doc["x-extensions"][language] ?? []) }
}

async function rustSurface() {
  await Parser.init()
  const require = createRequire(import.meta.url)
  const language = await Language.load(require.resolve("tree-sitter-rust/tree-sitter-rust.wasm"))
  const parser = new Parser()
  parser.setLanguage(language)
  const tree = parser.parse(readFileSync(join(ROOT, "crates/ref-id/src/lib.rs"), "utf8"))
  const names = new Set()
  const isPublic = (node) => node.namedChildren.some((child) => child.type === "visibility_modifier" && child.text === "pub")
  // The name a `use` item binds: the alias of `x as y`, otherwise the last segment of the path.
  const bound = (node) => {
    if (node.type === "use_as_clause") return node.childForFieldName("alias")?.text
    if (node.type === "scoped_identifier") return node.childForFieldName("name")?.text
    if (node.type === "identifier") return node.text
    return undefined
  }
  const collect = (node) => {
    if (node.type === "use_list") for (const child of node.namedChildren) collect(child)
    else if (node.type === "scoped_use_list") collect(node.childForFieldName("list"))
    else {
      const name = bound(node)
      if (name) names.add(name)
    }
  }
  for (const item of tree.rootNode.namedChildren) {
    if (!isPublic(item)) continue
    if (item.type === "use_declaration") collect(item.childForFieldName("argument"))
    if (item.type === "function_item") names.add(item.childForFieldName("name").text)
  }
  return names
}

function swiftSurface() {
  const out = mkdtempSync(join(tmpdir(), "ref-id-symbol-graph-"))
  try {
    // The library target alone. `swift package dump-symbol-graph` builds every target first, and the
    // conformance runner is exactly the target that fails to build while a declared method is missing —
    // so it would report nothing at the one moment there is something to report.
    execFileSync(
      "swift",
      ["build", "--target", "RefId", "-Xswiftc", "-emit-symbol-graph", "-Xswiftc", "-emit-symbol-graph-dir", "-Xswiftc", out],
      { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
    )
    const file = readdirSync(out).find((name) => name === "RefId.symbols.json")
    const graph = JSON.parse(readFileSync(join(out, file), "utf8"))
    const names = new Set()
    for (const symbol of graph.symbols) {
      if (symbol.accessLevel !== "public" || symbol.pathComponents.length !== 1) continue
      if (symbol.kind.identifier === "swift.func") names.add(symbol.names.title.replace(/\(.*$/, ""))
      else names.add(symbol.names.title)
    }
    return names
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

const languages = [
  { language: "rust", read: rustSurface },
  { language: "swift", read: swiftSurface },
].filter((entry) => !only || entry.language === only)

let failures = 0
for (const { language, read } of languages) {
  const exposed = await read()
  const { methods, extensions } = declaredFor(language)
  const functions = [...exposed].filter((name) => /^[a-z]/.test(name))
  const types = [...exposed].filter((name) => /^[A-Z]/.test(name)).sort()
  const missing = [...methods].filter((name) => !exposed.has(name)).sort()
  const undeclared = functions.filter((name) => !methods.has(name) && !extensions.has(name)).sort()
  failures += missing.length + undeclared.length
  console.log(`${language}`)
  console.log(`  declared methods missing: ${missing.join(", ") || "—"}`)
  console.log(`  public functions no method declares: ${undeclared.join(", ") || "—"}`)
  console.log(`  public types (listed, not checked): ${types.join(", ") || "—"}`)
}
if (failures) {
  console.error(`\n${failures} surface divergence(s)`)
  process.exit(1)
}
