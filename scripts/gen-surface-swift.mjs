#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Generate Sources/RefIdConformance/Surface.generated.swift from spec/ref-id.json's `openRPC`
 * document: one typed reference per declared method, so a missing symbol, a moved argument label
 * or a changed type fails the conformance executable's build — the Swift toolchain here ships
 * neither XCTest nor the Swift Testing macros, so a compile-time binding is the check.
 *
 * `IdentifierOrParsed` is a union the openRPC document declares but Swift has no union type for:
 * every parameter of that shape gets two references for the whole method — one with every such
 * parameter typed String, one with every such parameter typed ParseResult — rather than the full
 * cartesian product over parameters, because the spec's own vectors never mix the two on one call.
 *
 * A bare `{}` (any-JSON) parameter schema has no Swift type of its own to derive: this script reads
 * what the library's own public functions declare for a parameter of that exact name (`Any` or
 * `Any?`) and uses that, so a change to the library's own choice shows up here without a second
 * hand-maintained table — and so two methods that both take `{}` but disagree on `Any` vs `Any?`
 * are reported rather than silently reconciled.
 *
 * A bare `{"type": "object"}` *result* schema (only `loadSpec`/`loadSpecFrom`) is not a plain JSON
 * dictionary in any implementation — the TypeScript reference returns a typed `RefIdSpec`, the
 * Swift port a `Spec` wrapper that verifies the embedded specification before handing it back.
 * JSON Schema has no way to spell an opaque implementation type, so this one mapping
 * (`{type: object}` -> `Spec`) is a declared exception here rather than a mechanical translation.
 *
 * Argument labels: the spec's `params` are positional and unlabeled by nature (openRPC does not
 * distinguish call-site labels), so every parameter defaults to `_`. The one way a generated
 * reference asks for a label is when the library already exposes a *public function of the exact
 * declared name* with a call-site label equal to the spec's own parameter name at that position —
 * `validateEnvelope(requestedId:envelope:)` today. A method the library does not expose under its
 * declared name (e.g. `canonicalise`, `loadSpecFrom`) always gets `_` labels: there is no
 * comparison to make.
 *
 * Usage:
 *   node scripts/gen-surface-swift.mjs           # regenerate the committed file
 *   node scripts/gen-surface-swift.mjs --check   # regenerate in memory, diff, exit 1 if stale
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(ROOT, "Sources/RefIdConformance/Surface.generated.swift")
const LIB_DIR = join(ROOT, "Sources/RefId")

const spec = JSON.parse(readFileSync(join(ROOT, "spec/ref-id.json"), "utf8"))
const doc = spec.openRPC
const schemas = doc.components.schemas
const casing = doc["x-casing"]?.swift
if (casing !== "camelCase") {
  throw new Error(`openRPC.x-casing.swift is ${JSON.stringify(casing)}; this generator only knows camelCase (canonical names as-is)`)
}

// ---------------------------------------------------------------------------------------------
// Read the Swift library's own public function signatures, so bare-`{}` parameter types and
// call-site labels are read from the source rather than hand-copied into a second table.
// ---------------------------------------------------------------------------------------------

/** { name, params: [{label, type}], throws } for every `public func` declaration found. */
function readLibrarySignatures() {
  const signatures = []
  for (const file of readdirSync(LIB_DIR)) {
    if (!file.endsWith(".swift")) continue
    const text = readFileSync(join(LIB_DIR, file), "utf8")
    const re = /public func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(throws\s*)?(?:->\s*([^\{\n]+))?/g
    let match
    while ((match = re.exec(text))) {
      const [, name, rawParams, throwsKw] = match
      const params = rawParams
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          // `_ name: Type`  |  `label name: Type`  |  `name: Type`
          const m = p.match(/^(?:(_|[A-Za-z_][A-Za-z0-9_]*)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/)
          if (!m) return { label: null, internalName: p, type: "?" }
          const [, explicitLabel, internalName, type] = m
          const label = explicitLabel === "_" ? null : explicitLabel ?? internalName
          return { label, internalName, type: type.trim() }
        })
      signatures.push({ name, params, throws: Boolean(throwsKw) })
    }
  }
  return signatures
}

const librarySignatures = readLibrarySignatures()

/** The public functions in the library that carry the exact declared method name (there may be more than one overload). */
function libraryFunctionsNamed(name) {
  return librarySignatures.filter((sig) => sig.name === name)
}

/** For a bare `{}` schema parameter, the type the library uses today for a parameter of that name — `Any` unless a declared function spells it `Any?`. Reports every distinct answer found, for the caller to compare across methods. */
function bareObjectParamType(paramName) {
  const found = librarySignatures.flatMap((sig) => sig.params.filter((p) => p.internalName === paramName && /^Any\??$/.test(p.type)))
  if (found.length === 0) return { type: "Any", source: "no matching library parameter found; defaulted to Any" }
  const distinct = [...new Set(found.map((f) => f.type))]
  return { type: found[0].type, source: `read from the library's own \`${paramName}\` parameter (${distinct.join(", ")})`, distinct }
}

// ---------------------------------------------------------------------------------------------
// Schema -> Swift type
// ---------------------------------------------------------------------------------------------

function refName(schema) {
  if (!schema || typeof schema !== "object" || !schema.$ref) return null
  return schema.$ref.split("/").pop()
}

const REF_TYPE = {
  Identifier: "String",
  ParseResult: "ParseResult",
  BuildParts: "BuildParts",
  EnvelopeResult: "EnvelopeResult",
  RelateResult: "RelateResult", // no Swift type declared today — see report; the reference still names it verbatim.
}

/**
 * Maps one openRPC schema to a Swift type. `paramName` is used only to resolve a bare `{}`
 * schema's type from the library. Returns `{ type, isIdentifierOrParsed }`; the caller expands
 * IdentifierOrParsed into two references.
 */
function schemaToSwiftType(schema, paramName) {
  const ref = refName(schema)
  if (ref === "IdentifierOrParsed") return { isIdentifierOrParsed: true }
  if (ref) {
    if (!(ref in REF_TYPE)) throw new Error(`no Swift mapping declared for $ref ${ref} — extend REF_TYPE in scripts/gen-surface-swift.mjs`)
    return { type: REF_TYPE[ref] }
  }
  if (schema.oneOf) {
    const nonNull = schema.oneOf.filter((s) => s.type !== "null")
    const hasNull = schema.oneOf.some((s) => s.type === "null")
    if (nonNull.length !== 1 || !hasNull) throw new Error(`oneOf shape not handled: ${JSON.stringify(schema)}`)
    const inner = schemaToSwiftType(nonNull[0], paramName)
    if (inner.isIdentifierOrParsed) throw new Error("oneOf around IdentifierOrParsed not expected")
    return { type: `${inner.type}?` }
  }
  if (schema.type === "boolean") return { type: "Bool" }
  if (schema.type === "string") return { type: "String" }
  if (schema.type === "array") {
    const itemRef = refName(schema.items)
    if (itemRef && REF_TYPE[itemRef]) return { type: `[${REF_TYPE[itemRef]}]` }
    throw new Error(`array item schema not handled: ${JSON.stringify(schema.items)}`)
  }
  if (schema.type === "object") {
    // `loadSpec` / `loadSpecFrom`'s declared result — no implementation returns a plain JSON
    // object for this; see the file header. Not used for any parameter today.
    return { type: "Spec" }
  }
  if (Object.keys(schema).length === 0) {
    // Bare `{}` — any JSON. Only ever seen on parameters (`envelope`, `value`) so far.
    const { type, source, distinct } = bareObjectParamType(paramName)
    if (distinct && distinct.length > 1) {
      console.warn(`[gen-surface-swift] inconsistent bare-object type across the library for parameter "${paramName}": ${distinct.join(" vs ")} — using ${type}`)
    }
    console.warn(`[gen-surface-swift] "${paramName}": {} -> ${type} (${source})`)
    return { type }
  }
  throw new Error(`schema not handled for param ${paramName}: ${JSON.stringify(schema)}`)
}

// ---------------------------------------------------------------------------------------------
// Argument labels
// ---------------------------------------------------------------------------------------------

/** `_` for every parameter, unless the library already exposes a function of the exact declared
 * name whose call-site label at that position equals the spec's own parameter name. */
function labelsFor(methodName, paramNames) {
  const candidates = libraryFunctionsNamed(methodName).filter((sig) => sig.params.length === paramNames.length)
  if (candidates.length === 0) return paramNames.map(() => "_")
  // Prefer a candidate whose labels already match everywhere it can; report the first candidate's labels otherwise.
  const sig = candidates.find((c) => c.params.every((p, i) => p.label === paramNames[i])) ?? candidates[0]
  return paramNames.map((name, i) => (sig.params[i]?.label === name ? name : "_"))
}

// ---------------------------------------------------------------------------------------------
// Build the reference list
// ---------------------------------------------------------------------------------------------

const declaredMethods = doc.methods.map((m) => m.name) // x-casing.swift is identity (camelCase already)

const lines = []
const knownDivergences = new Set()

for (const method of doc.methods) {
  const paramNames = method.params.map((p) => p.name)
  const paramTypes = method.params.map((p) => schemaToSwiftType(p.schema, p.name))
  const resultType = schemaToSwiftType(method.result?.schema ?? { type: "object" }, method.result?.name ?? "result")
  if (resultType.isIdentifierOrParsed) throw new Error(`${method.name}: a result of IdentifierOrParsed is not handled`)
  const throwsClause = Array.isArray(method.errors) && method.errors.length > 0 ? "throws " : ""
  const labels = labelsFor(method.name, paramNames)
  const callLabels = labels.map((l) => `${l}:`).join("")
  const hasUnion = paramTypes.some((t) => t.isIdentifierOrParsed)

  function emit(variant, resolvedParamTypes, comment) {
    const paramTypeList = resolvedParamTypes.join(", ")
    const arrow = resultType.type
    const refExpr = paramNames.length === 0 ? method.name : `${method.name}(${callLabels})`
    lines.push(`    // ${method.name}${variant ? ` — IdentifierOrParsed: ${variant} variant` : ""}${comment ? ` (${comment})` : ""}`)
    lines.push(`    let _: (${paramTypeList}) ${throwsClause}-> ${arrow} = ${refExpr}`)
  }

  if (!hasUnion) {
    emit(null, paramTypes.map((t) => t.type))
  } else {
    emit("String", paramTypes.map((t) => (t.isIdentifierOrParsed ? "String" : t.type)))
    emit("ParseResult", paramTypes.map((t) => (t.isIdentifierOrParsed ? "ParseResult" : t.type)))
  }
}

const methodsArrayLiteral = declaredMethods.map((name) => `"${name}"`).join(", ")

const generated = `// SPDX-License-Identifier: Apache-2.0
//
// GENERATED by scripts/gen-surface-swift.mjs from spec/ref-id.json's \`openRPC\` document.
// Do not hand-edit — regenerate with \`node scripts/gen-surface-swift.mjs\`, or check staleness
// with \`node scripts/gen-surface-swift.mjs --check\`.
//
// One typed reference per declared method (two for a parameter of shape \`IdentifierOrParsed\`,
// which Swift has no union type for: one reference with every such parameter as String, one with
// every such parameter as ParseResult). A missing symbol, a moved argument label or a changed
// type fails this executable's build — the point of the exercise, since Command Line Tools ship
// neither XCTest nor the Swift Testing macros for a target test to fail instead.
//
// \`declaredMethods\` plus \`checkDeclaredMethodsMatchSpec()\` catch the other direction: a spec
// change that adds or removes a method without this file being regenerated, for the (currently
// hypothetical) case where every reference above still happens to type-check.

import Foundation
import RefId

/// Every method name \`openRPC.methods\` declares (\`x-casing.swift\` is camelCase — canonical
/// names as-is, so this is the spec's own method names, unchanged).
let declaredMethods: [String] = [${methodsArrayLiteral}]

/// Binds every declared method to a typed reference. A line here that fails to compile says its
/// own method is missing, or its label/type has moved, at that line's own comment.
func checkSurfaceReferences() {
${lines.join("\n")}
}

/// Compares \`declaredMethods\` against the embedded specification's own \`openRPC.methods\`, in
/// both directions, reading the raw JSON directly rather than through \`Spec\` (an executable
/// target has no \`@testable\` access to its internal accessors). Returns one problem string per
/// divergence; empty means the two names agree.
func checkDeclaredMethodsMatchSpec() throws -> [String] {
    let urls = try embeddedSpecURLs()
    guard let json = try JSONSerialization.jsonObject(with: try Data(contentsOf: urls.json)) as? [String: Any],
          let openRPC = json["openRPC"] as? [String: Any],
          let methods = openRPC["methods"] as? [[String: Any]] else {
        return ["embedded ref-id.json has no openRPC.methods array to compare against"]
    }
    let specMethods = Set(methods.compactMap { $0["name"] as? String })
    let generated = Set(declaredMethods)
    var problems: [String] = []
    for name in specMethods.subtracting(generated).sorted() {
        problems.append("spec/ref-id.json's openRPC declares method \\"\\(name)\\" that Surface.generated.swift does not — regenerate with scripts/gen-surface-swift.mjs")
    }
    for name in generated.subtracting(specMethods).sorted() {
        problems.append("Surface.generated.swift declares method \\"\\(name)\\" that spec/ref-id.json's openRPC no longer does — regenerate with scripts/gen-surface-swift.mjs")
    }
    return problems
}
`

if (process.argv.includes("--check")) {
  let existing
  try {
    existing = readFileSync(OUT, "utf8")
  } catch {
    console.error(`${OUT} does not exist — run without --check to generate it`)
    process.exit(1)
  }
  if (existing !== generated) {
    console.error(`Sources/RefIdConformance/Surface.generated.swift is stale — run: node scripts/gen-surface-swift.mjs`)
    process.exit(1)
  }
  console.log("Surface.generated.swift is up to date")
} else {
  writeFileSync(OUT, generated)
  console.log(`wrote ${OUT}`)
}
