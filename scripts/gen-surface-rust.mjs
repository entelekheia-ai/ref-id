#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Generate `crates/ref-id/tests/surface.rs` from `openRPC` — a compile-time binding per declared method,
 * so the Rust surface fails to build the moment a function goes missing or its signature moves.
 *
 * Each method becomes one or two `const _: fn(...) -> ... = ref_id::<snake_case name>;` items, all types
 * fully qualified (`ref_id::Foo`, `serde_json::Value`) so that one item referring to a name that does not
 * exist is a self-contained compile error rather than a broken `use` that would take every other item in
 * the file down with it. A schema maps to a Rust type by a small fixed table (`rustType` below):
 * `Identifier` as a parameter is `&str`, as a result `String`; `ParseResult` as a parameter is
 * `&ref_id::ParseResult`, as a result `ref_id::ParseResult`; any other named schema (`BuildParts`,
 * `EnvelopeResult`, `RelateResult`, `Spec`, …) follows the same parameter/result shape by its bare name,
 * whether or not that name actually exists in the crate — a name that does not exist is exactly the
 * failure this file exists to produce. Two document-level fields adjust that mapping without ever
 * naming a method: a result whose method carries `"x-result-cached": true` (only `loadSpec`, today) is
 * wrapped `&'static`, because the crate hands back a process-wide singleton rather than a fresh owned
 * value; and the `Result` error type for every method with declared `errors` is `x-error-type` at the
 * document root (`RefIdError`), read rather than written as a literal, so a rename of that type in the
 * specification is a regeneration away rather than a hunt through this file. `IdentifierOrParsed` is not
 * a real Rust type, so a parameter of that shape produces two bindings instead of one: the whole method
 * repeated once with every such parameter as `&str`, once with every such parameter as
 * `&ref_id::ParseResult` — because today's functions are not generic over the two, and one of the two
 * bindings for `canonical_identifier`/`same_package`/`covers` is expected to fail until they are. A
 * method with declared `errors` returns `Result<T, ref_id::<x-error-type>>`; one without returns `T`
 * directly. Also emits `DECLARED`, the snake_cased method list, and a runtime `#[test]` that it equals
 * `spec.openRPC.methods` in both directions — so a spec change with no regeneration fails at runtime
 * even where every signature still happens to compile.
 *
 * `--check` regenerates in memory and diffs against the committed file instead of writing it, exiting
 * non-zero when they differ.
 *
 *   node scripts/gen-surface-rust.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const SPEC_PATH = new URL("../spec/ref-id.json", import.meta.url)
const OUT_PATH = new URL("../crates/ref-id/tests/surface.rs", import.meta.url)

const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"))
const doc = spec.openRPC
// The `Result` error type every method with declared `errors` returns, named by the document root
// rather than written here as a literal — so a rename in the specification is a regeneration away.
const ERROR_TYPE = doc["x-error-type"]
if (!ERROR_TYPE) {
  console.error('gen-surface-rust: openRPC document has no "x-error-type" at its root')
  process.exit(1)
}

const snakeCase = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Resolve a `$ref` to its bare schema name (the last path segment), or `undefined` for a non-`$ref` schema. */
const refName = (schema) => (schema && schema.$ref ? schema.$ref.split("/").pop() : undefined)

/** True when a schema is (or is) `IdentifierOrParsed` — handled by the caller, never mapped directly. */
const isIdentifierOrParsed = (schema) => refName(schema) === "IdentifierOrParsed"

/**
 * Map one schema to a fully-qualified Rust type. `asParam` distinguishes the parameter position
 * (borrowed) from the result position (owned). Returns `undefined` — and the caller must stop rather
 * than invent something — for a shape this table cannot express at all (unrecognised primitive shape,
 * or a `oneOf` this generator does not special-case).
 */
function rustType(schema, { asParam, method, param }) {
  const ref = refName(schema)
  if (ref === "Identifier") return asParam ? "&str" : "String"
  if (ref) return asParam ? `&ref_id::${ref}` : `ref_id::${ref}`
  // A string the specification marks `x-kind: "directory"` is a filesystem path, which Rust takes as
  // `&std::path::Path` — each language spells a path its own way, and the mark says which string is one.
  if (asParam && schema?.type === "string" && schema["x-kind"] === "directory") return "&std::path::Path"
  if (schema && schema.type === "boolean") return "bool"
  if (schema && schema.type === "array" && refName(schema.items) === "Identifier") return asParam ? "&[String]" : "Vec<String>"
  if (schema && Object.keys(schema).length === 0) return asParam ? "&serde_json::Value" : "serde_json::Value"
  if (schema && schema.oneOf) {
    const nonNull = schema.oneOf.filter((s) => s.type !== "null")
    const hasNull = schema.oneOf.some((s) => s.type === "null")
    if (hasNull && nonNull.length === 1) {
      const inner = rustType(nonNull[0], { asParam, method })
      return inner === undefined ? undefined : `Option<${inner}>`
    }
    return undefined
  }
  if (schema && schema.type === "string") return asParam ? "&str" : "String"
  return undefined
}

const lines = []
lines.push("// SPDX-License-Identifier: Apache-2.0")
lines.push("//! GENERATED by `scripts/gen-surface-rust.mjs` from `spec/ref-id.json`'s `openRPC` key. Do not hand-edit.")
lines.push("//!")
lines.push("//! One compile-time binding per declared method: a `const _: fn(...) -> ... = ref_id::<name>;` that")
lines.push("//! fails to build when the function is missing or its signature has moved. Every type is fully")
lines.push("//! qualified (`ref_id::Foo`) on purpose — a name that does not exist in the crate is exactly the kind")
lines.push("//! of failure this file exists to surface, self-contained to the one binding that names it.")
lines.push("//!")
lines.push("//! A parameter typed `IdentifierOrParsed` in the specification gets two bindings for the same method —")
lines.push("//! one with every such parameter as `&str`, one with every such parameter as `&ref_id::ParseResult` —")
lines.push("//! because `IdentifierOrParsed` is not itself a Rust type and today's functions are not generic over")
lines.push("//! the two; one binding of such a pair is expected to fail until the function is made generic.")
lines.push("#![allow(dead_code, non_upper_case_globals)]")
lines.push("")

const declared = []

for (const method of doc.methods) {
  const name = snakeCase(method.name)
  declared.push(name)
  const hasErrors = Array.isArray(method.errors) && method.errors.length > 0

  const iopIndexes = method.params.map((p, i) => (isIdentifierOrParsed(p.schema) ? i : -1)).filter((i) => i >= 0)

  const resultSchema = method.result ? method.result.schema : undefined
  let resultTy = resultSchema ? rustType(resultSchema, { asParam: false, method: method.name }) : "()"
  if (resultTy === undefined) {
    console.error(`gen-surface-rust: method "${method.name}" has a result schema this generator cannot map: ${JSON.stringify(resultSchema)}`)
    process.exit(1)
  }
  // `x-result-cached: true` (declared per method, only `loadSpec` today) means the crate hands back a
  // process-wide singleton rather than a freshly owned value.
  if (method["x-result-cached"]) resultTy = `&'static ${resultTy}`
  const returnTy = hasErrors ? `Result<${resultTy}, ref_id::${ERROR_TYPE}>` : resultTy

  const otherParamTys = method.params.map((p, i) => (iopIndexes.includes(i) ? undefined : rustType(p.schema, { asParam: true, method: method.name, param: p.name })))
  for (let i = 0; i < otherParamTys.length; i++) {
    if (!iopIndexes.includes(i) && otherParamTys[i] === undefined) {
      console.error(`gen-surface-rust: method "${method.name}" param "${method.params[i].name}" has a schema this generator cannot map: ${JSON.stringify(method.params[i].schema)}`)
      process.exit(1)
    }
  }

  const variants = iopIndexes.length > 0 ? ["&str", "&ref_id::ParseResult"] : [undefined]
  lines.push(`// ${method.name} -> ref_id::${name}`)
  for (const variant of variants) {
    const paramTys = method.params.map((p, i) => (iopIndexes.includes(i) ? variant : otherParamTys[i]))
    const sig = `fn(${paramTys.join(", ")}) -> ${returnTy}`
    // `const _:` is Rust's anonymous const — any number of them may appear in one scope, which is
    // exactly what a method with two IdentifierOrParsed-variant bindings needs.
    lines.push(`const _: ${sig} = ref_id::${name};`)
  }
  lines.push("")
}

lines.push("/// The methods `openRPC` declares, spelled the way this language spells them (`x-casing.rust`).")
lines.push(`pub const DECLARED: &[&str] = &[${declared.map((n) => `"${n}"`).join(", ")}];`)
lines.push("")
lines.push("/// A spec change without regeneration fails here even where every signature still happens to compile.")
lines.push("#[test]")
lines.push("fn declared_matches_spec() {")
lines.push("    // `Spec::value` is `pub(crate)`, so this reads the embedded JSON text directly rather than")
lines.push("    // through the `Spec` type — `embedded_spec_text` is the one public door to it (`load_spec`")
lines.push("    // returns a `Spec`, not the raw document `openRPC` lives in as arbitrary JSON).")
lines.push("    let (json, _sidecar) = ref_id::embedded_spec_text();")
lines.push("    let root: serde_json::Value = serde_json::from_str(json).unwrap();")
lines.push('    let methods = root["openRPC"]["methods"].as_array().cloned().unwrap_or_default();')
lines.push("    let snake = |name: &str| -> String {")
lines.push("        let mut out = String::new();")
lines.push("        for c in name.chars() {")
lines.push("            if c.is_ascii_uppercase() {")
lines.push("                out.push('_');")
lines.push("                out.push(c.to_ascii_lowercase());")
lines.push("            } else {")
lines.push("                out.push(c);")
lines.push("            }")
lines.push("        }")
lines.push("        out")
lines.push("    };")
lines.push('    let mut from_spec: Vec<String> = methods.iter().filter_map(|m| m.get("name").and_then(serde_json::Value::as_str)).map(snake).collect();')
lines.push("    from_spec.sort();")
lines.push("    let mut declared: Vec<String> = DECLARED.iter().map(|s| s.to_string()).collect();")
lines.push("    declared.sort();")
lines.push('    assert_eq!(declared, from_spec, "surface.rs\'s DECLARED list has drifted from openRPC.methods — regenerate with `node scripts/gen-surface-rust.mjs`");')
lines.push("}")
lines.push("")

const rendered = lines.join("\n")

if (process.argv.includes("--check")) {
  let existing
  try {
    existing = readFileSync(OUT_PATH, "utf8")
  } catch {
    console.error(`gen-surface-rust --check: ${fileURLToPath(OUT_PATH)} does not exist`)
    process.exit(1)
  }
  if (existing !== rendered) {
    console.error("gen-surface-rust --check: crates/ref-id/tests/surface.rs is stale — regenerate with `node scripts/gen-surface-rust.mjs`")
    process.exit(1)
  }
  console.log("gen-surface-rust --check: surface.rs is up to date")
} else {
  writeFileSync(OUT_PATH, rendered)
  console.log(`wrote ${fileURLToPath(OUT_PATH)}`)
}
