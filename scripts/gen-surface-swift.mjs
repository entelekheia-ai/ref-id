#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Generate Sources/RefIdConformance/Surface.generated.swift from spec/ref-id.json's `openRPC`
 * document alone: one typed reference per declared method, so a missing symbol, a moved argument
 * label or a changed type fails the conformance executable's build — the Swift toolchain here
 * ships neither XCTest nor the Swift Testing macros, so a compile-time binding is the check.
 *
 * Reads nothing from Sources/RefId/**: every mapping below is declared by the specification
 * itself, not discovered by scanning the library's source.
 *
 * `IdentifierOrParsed` is a union the openRPC document declares but Swift has no union type for:
 * every parameter of that shape gets two references for the whole method — one with every such
 * parameter typed String, one with every such parameter typed ParseResult — rather than the full
 * cartesian product over parameters, because the spec's own vectors never mix the two on one call.
 *
 * Argument labels: every parameter is `_` unless the method carries `x-argument-labels: true`, in
 * which case every parameter's label is its own declared name (today only `validateEnvelope`:
 * `requestedId:envelope:`).
 *
 * A bare `{}` (any-JSON) schema maps to `Any?` everywhere — a fixed rule, not read from the
 * library. `canonicalise`'s `value: {}` is therefore referenced as `(Any?) throws -> String`; the
 * library spells this method `canonicalJSON(_ value: Any)` (non-optional `Any`), a divergence this
 * script leaves for the build to report rather than reconciling.
 *
 * A `{"$ref": "#/components/schemas/Spec"}` result (`loadSpec`, `loadSpecFrom`) maps to Swift
 * `Spec`. A string the specification marks `x-kind: "directory"` (`loadSpecFrom`'s `directory`) is a
 * filesystem path, which Swift takes as a `URL`.
 *
 * `errors` on a method (whatever `components.errors` kind — `x-error-type` names `RefIdError`,
 * which has five: Build, Digest, Serialise, SpecIntegrity, SpecVersion) means `throws`; a method
 * with no `errors` key does not throw. Nothing about which kind of error changes the reference.
 *
 * Usage:
 *   node scripts/gen-surface-swift.mjs           # regenerate the committed file
 *   node scripts/gen-surface-swift.mjs --check   # regenerate in memory, diff, exit 1 if stale
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(ROOT, "Sources/RefIdConformance/Surface.generated.swift")

const spec = JSON.parse(readFileSync(join(ROOT, "spec/ref-id.json"), "utf8"))
const doc = spec.openRPC
const schemas = doc.components.schemas
const casing = doc["x-casing"]?.swift
if (casing !== "camelCase") {
  throw new Error(`openRPC.x-casing.swift is ${JSON.stringify(casing)}; this generator only knows camelCase (canonical names as-is)`)
}

// ---------------------------------------------------------------------------------------------
// Schema -> Swift type. Declared entirely by the specification; nothing here reads Sources/RefId.
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
  Spec: "Spec",
}

/** Maps one openRPC schema to a Swift type. Returns `{ type }` or `{ isIdentifierOrParsed: true }`. */
function schemaToSwiftType(schema) {
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
    const inner = schemaToSwiftType(nonNull[0])
    if (inner.isIdentifierOrParsed) throw new Error("oneOf around IdentifierOrParsed not expected")
    return { type: `${inner.type}?` }
  }
  if (schema.type === "boolean") return { type: "Bool" }
  if (schema.type === "string" && schema["x-kind"] === "directory") return { type: "URL" }
  if (schema.type === "string") return { type: "String" }
  if (schema.type === "array") {
    const itemRef = refName(schema.items)
    if (itemRef && REF_TYPE[itemRef]) return { type: `[${REF_TYPE[itemRef]}]` }
    throw new Error(`array item schema not handled: ${JSON.stringify(schema.items)}`)
  }
  if (Object.keys(schema).length === 0) {
    // Bare `{}` — any JSON. Fixed mapping: Any? everywhere.
    return { type: "Any?" }
  }
  throw new Error(`schema not handled: ${JSON.stringify(schema)}`)
}

// ---------------------------------------------------------------------------------------------
// Build the reference list
// ---------------------------------------------------------------------------------------------

const declaredMethods = doc.methods.map((m) => m.name) // x-casing.swift is identity (camelCase already)

const lines = []

for (const method of doc.methods) {
  const paramNames = method.params.map((p) => p.name)
  const paramTypes = method.params.map((p) => schemaToSwiftType(p.schema))
  const resultType = schemaToSwiftType(method.result?.schema)
  if (resultType.isIdentifierOrParsed) throw new Error(`${method.name}: a result of IdentifierOrParsed is not handled`)
  const throwsClause = Array.isArray(method.errors) && method.errors.length > 0 ? "throws " : ""
  const useLabels = method["x-argument-labels"] === true
  const labels = paramNames.map((name) => (useLabels ? name : "_"))
  const callLabels = labels.map((l) => `${l}:`).join("")
  const hasUnion = paramTypes.some((t) => t.isIdentifierOrParsed)

  function emit(variant, resolvedParamTypes) {
    const paramTypeList = resolvedParamTypes.join(", ")
    const arrow = resultType.type
    const refExpr = paramNames.length === 0 ? method.name : `${method.name}(${callLabels})`
    lines.push(`    // ${method.name}${variant ? ` — IdentifierOrParsed: ${variant} variant` : ""}`)
    lines.push(`    let _: (${paramTypeList}) ${throwsClause}-> ${arrow} = ${refExpr}`)
  }

  if (!hasUnion) {
    emit(null, paramTypes.map((t) => t.type))
  } else {
    emit("String", paramTypes.map((t) => (t.isIdentifierOrParsed ? "String" : t.type)))
    emit("ParseResult", paramTypes.map((t) => (t.isIdentifierOrParsed ? "ParseResult" : t.type)))
  }

  // A deprecated alias is bound with the method's own signature, by the full spelling `openRPC` declares
  // (labels included), so deleting it — or letting its signature drift from the method it stands for —
  // fails the runner's build, as a missing method does. Referencing it raises a deprecation warning,
  // which is the point of it being deprecated and does not fail the build.
  for (const alias of method["x-deprecated-aliases"]?.swift ?? []) {
    if (hasUnion) throw new Error(`${method.name}: an alias of a method taking IdentifierOrParsed is not handled`)
    lines.push(`    // ${method.name} — deprecated alias`)
    lines.push(`    let _: (${paramTypes.map((t) => t.type).join(", ")}) ${throwsClause}-> ${resultType.type} = ${alias}`)
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
