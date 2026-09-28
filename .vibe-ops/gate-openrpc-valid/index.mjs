// SPDX-License-Identifier: Apache-2.0
/**
 * Hold the `openRPC` document of the specification to OpenRPC and to the rest of the specification —
 * `scripts/check-openrpc.mjs`, moved.
 *
 * `openRPC` declares the public surface every implementation exposes. It must validate against the
 * OpenRPC meta-schema, and it is tied to the specification around it in two directions: `x-rule` is a
 * JSON Pointer into the whole specification naming the key that states a method's rule, and `x-vectors`
 * names the vector group that binds it — every group the specification declares must be claimed by some
 * method.
 *
 * Depends on `ajv`, `@open-rpc/meta-schema` and `@json-schema-tools/meta-schema`, imported dynamically
 * so a clone with no `npm ci` gets `skipped`, never a load failure that takes the whole run down.
 * Reads `spec/ref-id.json` with `readFileSync` + `JSON.parse`, never through the `ref-id` package.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { pointerToLine } from "../_json-pointer-line.mjs"

const RULE = "openrpc-invalid"
const SPEC_PATH = "spec/ref-id.json"

async function loadDependencies() {
  let ajvModule
  try {
    ajvModule = await import("ajv")
  } catch (error) {
    return { missing: "ajv", cause: error }
  }
  let openrpcMetaSchemaModule
  try {
    openrpcMetaSchemaModule = await import("@open-rpc/meta-schema")
  } catch (error) {
    return { missing: "@open-rpc/meta-schema", cause: error }
  }
  let jsonSchemaMetaSchemaModule
  try {
    jsonSchemaMetaSchemaModule = await import("@json-schema-tools/meta-schema")
  } catch (error) {
    return { missing: "@json-schema-tools/meta-schema", cause: error }
  }
  return {
    Ajv: ajvModule.default,
    metaSchema: openrpcMetaSchemaModule.default,
    jsonSchemaMetaSchema: jsonSchemaMetaSchemaModule.default,
  }
}

const resolve = (root, pointer) =>
  pointer
    .split("/")
    .slice(1)
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), root)

const walk = (node, path_, visit) => {
  if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${path_}/${index}`, visit))
  else if (node && typeof node === "object")
    for (const [key, value] of Object.entries(node)) {
      visit(key, value, path_)
      walk(value, `${path_}/${key}`, visit)
    }
}

export default {
  definition: {
    id: "openrpc-valid",
    version: 1,
    summary: "The openRPC document validates against OpenRPC and stays tied to the rules and vectors it names",
    defaultPaths: [SPEC_PATH],
  },

  async run(ctx) {
    let raw
    try {
      raw = readFileSync(path.join(ctx.repoRoot, SPEC_PATH), "utf8")
    } catch {
      return { findings: [], skipped: `${SPEC_PATH} is not present in this tree` }
    }

    let spec
    try {
      spec = JSON.parse(raw)
    } catch (error) {
      return {
        findings: [{ rule: RULE, file: SPEC_PATH, evidence: `spec/ref-id.json could not be parsed as JSON: ${error.message}` }],
        examined: 0,
      }
    }

    const doc = spec?.openRPC
    if (doc === undefined) return { findings: [], skipped: "spec/ref-id.json declares no openRPC document" }

    const deps = await loadDependencies()
    if (deps.missing !== undefined) return { findings: [], skipped: `dependency "${deps.missing}" is not installed — run npm ci` }
    const { Ajv, metaSchema, jsonSchemaMetaSchema } = deps

    const findings = []
    const push = (pointer, message) => findings.push({ rule: RULE, file: SPEC_PATH, line: pointerToLine(raw, pointer), evidence: message })

    // The OpenRPC meta-schema declares its own `$schema`, not a draft Ajv ships, in substance draft-07;
    // it refers to the JSON Schema meta-schema by id, registered under both spellings because the
    // OpenRPC meta-schema refers to it without the trailing slash its own `$id` carries. `format` is
    // annotation here, not assertion.
    const ajv = new Ajv({ strict: false, validateSchema: false, allErrors: true, validateFormats: false })
    const { $id, ...jsonSchemaBody } = jsonSchemaMetaSchema.default ?? jsonSchemaMetaSchema
    ajv.addSchema({ ...jsonSchemaBody, $id })
    ajv.addSchema({ ...jsonSchemaBody, $id: $id.replace(/\/$/, "") })
    const validateDocument = ajv.compile(metaSchema.default ?? metaSchema)
    if (!validateDocument(doc)) push("/openRPC", `openRPC is not a valid OpenRPC document: ${ajv.errorsText(validateDocument.errors)}`)

    walk(doc, "", (key, value, relPath) => {
      if (key !== "$ref") return
      if (typeof value !== "string" || !value.startsWith("#/") || resolve(doc, value.slice(1)) === undefined)
        push(`/openRPC${relPath}`, `${relPath}: $ref ${JSON.stringify(value)} resolves to nothing inside openRPC`)
    })

    // Each value type must be a schema a draft-07 validator accepts, resolved against the document itself.
    const schemaAjv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
    schemaAjv.addSchema({ components: doc.components }, "openrpc")
    for (const name of Object.keys(doc.components?.schemas ?? {})) {
      try {
        schemaAjv.getSchema(`openrpc#/components/schemas/${name}`)
      } catch (error) {
        push(`/openRPC/components/schemas/${name}`, `components.schemas.${name}: ${error.message}`)
      }
    }

    const groups = new Set(Object.keys(spec.vectors ?? {}))
    const claimed = new Set()
    const methods = doc.methods ?? []
    methods.forEach((method, index) => {
      const methodPointer = `/openRPC/methods/${index}`
      const rule = method["x-rule"]
      if (typeof rule !== "string" || resolve(spec, rule) === undefined)
        push(methodPointer, `${method.name}: x-rule ${JSON.stringify(rule)} names no key of the specification`)
      const vectors = method["x-vectors"]
      if (vectors === null) {
        if (typeof method["x-vectors-reason"] !== "string") push(methodPointer, `${method.name}: x-vectors is null and no x-vectors-reason says why`)
      } else if (!groups.has(vectors)) push(methodPointer, `${method.name}: x-vectors ${JSON.stringify(vectors)} is not a vector group`)
      else claimed.add(vectors)
    })
    for (const group of groups) if (!claimed.has(group)) push(`/vectors/${group}`, `vector group ${group} is claimed by no method`)

    const names = methods.map((method) => method.name)
    for (const name of new Set(names)) {
      const indices = names.flatMap((other, index) => (other === name ? [index] : []))
      if (indices.length > 1) push(`/openRPC/methods/${indices[0]}`, `method ${name} is declared twice`)
    }

    return { findings, examined: methods.length }
  },
}
