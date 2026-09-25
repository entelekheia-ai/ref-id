#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Hold the `openRPC` document of the specification to OpenRPC and to the rest of the specification.
 *
 * `openRPC` declares the public surface every implementation exposes: one method per operation, the
 * value types under `components.schemas`. It is one OpenRPC document embedded as a value, so it can be
 * extracted and handed to any OpenRPC tool — which only holds while it validates against the OpenRPC
 * meta-schema. It is also tied to the specification around it in two directions, and a tie nothing
 * checks is the one that drifts:
 *
 *   - `x-rule` is a JSON Pointer into the whole specification naming the key that states a method's
 *     rule, so a renamed rule key leaves a pointer to nothing;
 *   - `x-vectors` names the vector group that binds a method, and every group the specification declares
 *     must be claimed by some method — a group no operation owns is behaviour nothing declares.
 *
 * Reads the specification alone and runs no implementation. Whether each implementation's surface
 * matches this document is each implementation's own suite's question.
 *
 *   node scripts/check-openrpc.mjs
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import Ajv from "ajv"
import metaSchema from "@open-rpc/meta-schema"
import jsonSchemaMetaSchema from "@json-schema-tools/meta-schema"

const spec = JSON.parse(readFileSync(fileURLToPath(new URL("../spec/ref-id.json", import.meta.url)), "utf8"))
const doc = spec.openRPC
const failures = []

// The OpenRPC meta-schema declares its own `$schema`, which is not a draft Ajv ships (it is draft-07 in
// substance), and it describes every schema it holds by referring to the JSON Schema meta-schema its
// authors publish, so that one is registered first — under both spellings of its id, because the
// OpenRPC meta-schema refers to it without the trailing slash its own `$id` carries. `format` is
// annotation here, not assertion.
const ajv = new Ajv({ strict: false, validateSchema: false, allErrors: true, validateFormats: false })
const { $id, ...jsonSchemaBody } = jsonSchemaMetaSchema.default ?? jsonSchemaMetaSchema
ajv.addSchema({ ...jsonSchemaBody, $id })
ajv.addSchema({ ...jsonSchemaBody, $id: $id.replace(/\/$/, "") })
const validateDocument = ajv.compile(metaSchema.default ?? metaSchema)
if (!validateDocument(doc)) failures.push(`openRPC is not a valid OpenRPC document: ${ajv.errorsText(validateDocument.errors)}`)

const resolve = (root, pointer) =>
  pointer
    .split("/")
    .slice(1)
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), root)

const walk = (node, path, visit) => {
  if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${path}/${index}`, visit))
  else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) { visit(key, value, path); walk(value, `${path}/${key}`, visit) }
}
walk(doc, "", (key, value, path) => {
  if (key !== "$ref") return
  if (typeof value !== "string" || !value.startsWith("#/") || resolve(doc, value.slice(1)) === undefined)
    failures.push(`${path}: $ref ${JSON.stringify(value)} resolves to nothing inside openRPC`)
})

// Each value type must be a schema a draft-07 validator accepts, resolved against the document itself.
const schemaAjv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
schemaAjv.addSchema({ components: doc.components }, "openrpc")
for (const name of Object.keys(doc.components.schemas)) {
  try { schemaAjv.getSchema(`openrpc#/components/schemas/${name}`) } catch (error) { failures.push(`components.schemas.${name}: ${error.message}`) }
}

const groups = new Set(Object.keys(spec.vectors))
const claimed = new Set()
for (const method of doc.methods) {
  const rule = method["x-rule"]
  if (typeof rule !== "string" || resolve(spec, rule) === undefined) failures.push(`${method.name}: x-rule ${JSON.stringify(rule)} names no key of the specification`)
  const vectors = method["x-vectors"]
  if (vectors === null) {
    if (typeof method["x-vectors-reason"] !== "string") failures.push(`${method.name}: x-vectors is null and no x-vectors-reason says why`)
  } else if (!groups.has(vectors)) failures.push(`${method.name}: x-vectors ${JSON.stringify(vectors)} is not a vector group`)
  else claimed.add(vectors)
}
for (const group of groups) if (!claimed.has(group)) failures.push(`vector group ${group} is claimed by no method`)

const names = doc.methods.map((method) => method.name)
for (const name of new Set(names)) if (names.filter((other) => other === name).length > 1) failures.push(`method ${name} is declared twice`)

console.log(`openRPC: ${doc.methods.length} methods, ${Object.keys(doc.components.schemas).length} value types, ${groups.size} vector groups all claimed`)
if (failures.length) {
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
