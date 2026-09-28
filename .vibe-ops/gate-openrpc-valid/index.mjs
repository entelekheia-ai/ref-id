// SPDX-License-Identifier: Apache-2.0
/**
 * Hold the `openRPC` document of the specification to OpenRPC and to the rest of the specification.
 *
 * `openRPC` declares the public surface every implementation exposes. It must validate against the
 * OpenRPC meta-schema, and it is tied to the specification around it in two directions: `x-rule` is a
 * JSON Pointer into the whole specification naming the key that states a method's rule, and `x-vectors`
 * names the vector group that binds it — every group the specification declares must be claimed by some
 * method.
 *
 * A SKIP MEANS THE INSTRUMENT IS ABSENT, NEVER THAT THE SPECIFICATION IS DEFECTIVE. The only legitimate
 * skips here are the spec file itself missing (a population question) and a dependency this gate needs
 * (`ajv`, `@open-rpc/meta-schema`, `@json-schema-tools/meta-schema`) not being resolvable at all — a
 * clone with no `npm ci`. Everything else a malformed specification can do — `openRPC` absent,
 * `methods` not an array, `components`/`components.schemas` missing or not an object, a method that is
 * not an object, a dependency that resolves but throws while loading — is a FINDING with a pointer,
 * never a throw that takes the whole run down and never a silent skip. A throw would refuse the
 * commit too, but anonymously and at the cost of every other gate's findings.
 *
 * Reads `spec/ref-id.json` with `readFileSync` + `JSON.parse`, never through the `ref-id` package.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { pointerToLine } from "../_json-pointer-line.mjs"

const RULE = "openrpc-invalid"
const SPEC_PATH = "spec/ref-id.json"

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const describeType = (value) => {
  if (value === undefined) return "absent"
  if (value === null) return "null"
  if (Array.isArray(value)) return "an array"
  return typeof value
}

/** JSON Pointer token escaping (RFC 6901): `~` first, then `/` — reversing the order double-escapes. */
const escapeToken = (token) => String(token).replaceAll("~", "~0").replaceAll("/", "~1")

/**
 * A specifier resolving to nothing at all — the package is not installed, or Node's own resolution
 * cannot find a file the package's `exports` map is willing to serve. Either way there is no code to
 * blame: the instrument is absent. Anything else (a module that resolves and then throws while
 * evaluating) is the package's own defect and must be a finding, not a skip.
 */
const isModuleAbsent = (error) => error?.code === "ERR_MODULE_NOT_FOUND" || error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"

async function loadDependencies() {
  const specifiers = ["ajv", "@open-rpc/meta-schema", "@json-schema-tools/meta-schema"]
  const modules = {}
  for (const specifier of specifiers) {
    try {
      modules[specifier] = await import(specifier)
    } catch (error) {
      if (isModuleAbsent(error)) return { skip: `dependency "${specifier}" is not installed — run npm ci` }
      return { defect: `dependency "${specifier}" could not be loaded: ${error.message}` }
    }
  }
  return {
    ok: {
      Ajv: modules["ajv"].default,
      metaSchema: modules["@open-rpc/meta-schema"].default,
      jsonSchemaMetaSchema: modules["@json-schema-tools/meta-schema"].default,
    },
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
      walk(value, `${path_}/${escapeToken(key)}`, visit)
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

    const findings = []
    const push = (pointer, message) => findings.push({ rule: RULE, file: SPEC_PATH, line: pointerToLine(raw, pointer), evidence: message })

    const doc = spec?.openRPC
    if (!isPlainObject(doc)) {
      push("/openRPC", `openRPC is ${describeType(doc)} — expected an object`)
      return { findings, examined: 0 }
    }

    const deps = await loadDependencies()
    if (deps.skip !== undefined) return { findings, skipped: deps.skip }
    if (deps.defect !== undefined) {
      findings.push({ rule: RULE, file: SPEC_PATH, evidence: deps.defect })
      return { findings, examined: 0 }
    }
    const { Ajv, metaSchema, jsonSchemaMetaSchema } = deps.ok

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

    const components = doc.components
    let schemaNames = []
    if (!isPlainObject(components)) {
      push("/openRPC/components", `openRPC.components is ${describeType(components)} — expected an object`)
    } else if (!isPlainObject(components.schemas)) {
      push("/openRPC/components/schemas", `openRPC.components.schemas is ${describeType(components.schemas)} — expected an object`)
    } else {
      schemaNames = Object.keys(components.schemas)
    }

    // Each value type must be a schema a draft-07 validator accepts, resolved against the document itself.
    if (schemaNames.length > 0) {
      const schemaAjv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
      schemaAjv.addSchema({ components }, "openrpc")
      for (const name of schemaNames) {
        try {
          schemaAjv.getSchema(`openrpc#/components/schemas/${name}`)
        } catch (error) {
          push(`/openRPC/components/schemas/${escapeToken(name)}`, `components.schemas.${name}: ${error.message}`)
        }
      }
    }

    const groups = new Set(Object.keys(spec.vectors ?? {}))
    const claimed = new Set()
    const methodsRaw = doc.methods
    const methods = Array.isArray(methodsRaw) ? methodsRaw : []
    if (!Array.isArray(methodsRaw)) push("/openRPC/methods", `openRPC.methods is ${describeType(methodsRaw)} — expected an array`)

    methods.forEach((method, index) => {
      const methodPointer = `/openRPC/methods/${index}`
      if (!isPlainObject(method)) {
        push(methodPointer, `openRPC.methods[${index}] is ${describeType(method)} — expected an object`)
        return
      }
      const rule = method["x-rule"]
      // A pointer with no leading "/" (including "") reduces to zero tokens and resolve() returns the
      // whole specification unchanged — always defined, so "" and a bare word like "comparison" used to
      // pass as though they named a real key. Requiring the leading slash closes both.
      if (typeof rule !== "string" || !rule.startsWith("/") || resolve(spec, rule) === undefined)
        push(methodPointer, `${method.name}: x-rule ${JSON.stringify(rule)} names no key of the specification`)
      const vectors = method["x-vectors"]
      if (vectors === null) {
        if (typeof method["x-vectors-reason"] !== "string") push(methodPointer, `${method.name}: x-vectors is null and no x-vectors-reason says why`)
      } else if (!groups.has(vectors)) push(methodPointer, `${method.name}: x-vectors ${JSON.stringify(vectors)} is not a vector group`)
      else claimed.add(vectors)
    })
    for (const group of groups) if (!claimed.has(group)) push(`/vectors/${escapeToken(group)}`, `vector group ${group} is claimed by no method`)

    const names = methods.map((method) => (isPlainObject(method) ? method.name : undefined))
    for (const name of new Set(names)) {
      if (name === undefined) continue
      const indices = names.flatMap((other, index) => (other === name ? [index] : []))
      if (indices.length > 1) push(`/openRPC/methods/${indices[0]}`, `method ${name} is declared twice`)
    }

    return { findings, examined: methods.length }
  },
}
