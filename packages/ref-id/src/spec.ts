// SPDX-License-Identifier: Apache-2.0
//
// Loads spec/ref-id.json, verifies its digest against the sidecar, and checks the specVersion
// major. Behaviour only — the spec's own data is never restated here.

import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

/** Thrown when the loaded spec's bytes do not match its sidecar digest. */
export class SpecIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpecIntegrityError"
  }
}

/** Thrown when the loaded spec declares a specVersion major, or a vocabulary, this package does not support. */
export class SpecVersionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpecVersionError"
  }
}

/**
 * The `ref:` specification, as published in `spec/ref-id.json`. Typed only as far as the code
 * reads it; the shapes of the tables and of `vectors` are spec data, read dynamically rather than
 * mirrored into a second declaration.
 */
export interface RefIdSpec {
  specVersion: string
  scheme: string
  grammar: {
    dialect: string
    expression: string
    groups: string[]
    adaptations: Record<string, { replace: [string, string][] }>
    adaptationsApplyTo: string
    anchors: string
    state: { separator: string; pair: string; unknownKey: string; repeatedKey: string }
    fragment: { separator: string; pair: string; path: string; repeatedKey: string }
  }
  version: { default: number; supported: number[]; mints: string[]; note: string }
  encoding: Record<string, { reserved: string[]; table?: Record<string, string>; note?: string }>
  dispatch: Record<string, { locator: string; validator: string; delegate: string; pattern?: string; reference?: string; declaredBy?: string }>
  delegation: Record<string, string>
  statuses: string[]
  parts: string[]
  unknownType: string
  roles: Record<string, string[]>
  qualifiers: Record<string, { role: string; forms: string[] }>
  forms: Record<string, { pattern?: string; reference?: string; nested?: boolean; depth?: number; encoding?: string; digest?: boolean }>
  refinements: Record<string, { pattern: string; range?: string; boundSeparator?: string; reference?: string }>
  unknownRefinement: string
  resolutionStates: string[]
  stateLevels: string[]
  fragmentGrammars: Record<string, { declaredName: string; tieBreak: string }>
  digest: {
    algorithm: string
    over: string
    order: string
    join: string
    encoding: string
    dedupe: boolean
    output: string
  }
  canonicalisation: { form: string; rules: string[]; sidecar: string }
  envelope: {
    fields: Record<string, string>
    selfReference: string
    setsField: string
    digestForms: string
    invariant: string
    onFailure: string
  }
  vectors: {
    parse: unknown[]
    roundtrip: string[]
    build: unknown[]
    digest: unknown[]
    envelope: unknown[]
  }
}

/**
 * Canonical serialisation per `spec.canonicalisation.rules`: object keys sorted by UTF-16 code
 * unit, no whitespace outside strings, strings escaped as `JSON.stringify` does, numbers
 * restricted to integers.
 */
export function canonicalise(value: unknown): string {
  if (value === null) {
    return "null"
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`canonicalisation covers integers only, got ${value}`)
    }
    return String(value)
  }
  if (typeof value === "string") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalise(item)).join(",")}]`
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(record[key])}`).join(",")}}`
  }
  throw new Error(`value of type ${typeof value} has no canonical form`)
}

/** The major version this package was built against. Not spec data — the package's own contract. */
const SUPPORTED_SPEC_MAJOR = "1"

function readText(location: URL | string): string {
  return readFileSync(location, "utf8")
}

function validate(rawJson: string, rawSidecar: string): RefIdSpec {
  const parsed = JSON.parse(rawJson) as unknown
  const canonical = canonicalise(parsed)
  const computed = createHash("sha256").update(canonical, "utf8").digest("hex")
  const expected = rawSidecar.trim()
  if (computed !== expected) {
    throw new SpecIntegrityError(
      `spec/ref-id.json does not match its sidecar digest (expected ${expected}, computed ${computed})`,
    )
  }
  const spec = parsed as RefIdSpec
  const major = String(spec.specVersion).split(".")[0]
  if (major !== SUPPORTED_SPEC_MAJOR) {
    throw new SpecVersionError(
      `spec/ref-id.json declares specVersion ${spec.specVersion}; this package supports major ${SUPPORTED_SPEC_MAJOR}`,
    )
  }
  return spec
}

/**
 * A status name this code needs, checked against the vocabulary the spec declares. Code names a
 * status because it has to choose one; the spec owns the list, and naming one the spec lacks is a
 * version mismatch, reported as such rather than silently emitted.
 */
export function status(spec: RefIdSpec, name: string): string {
  if (!spec.statuses.includes(name)) {
    throw new SpecVersionError(`this package names the status "${name}", which spec ${spec.specVersion} does not declare`)
  }
  return name
}

/**
 * A part name this code needs, checked against the vocabulary the spec declares: one of `spec.parts`,
 * or a declared qualifier or refinement key (the two placeholders in that list). Same contract as
 * `status()`: naming a part the spec lacks is a version mismatch, reported rather than emitted.
 */
export function part(spec: RefIdSpec, name: string): string {
  if (spec.parts.includes(name) || Object.hasOwn(spec.qualifiers, name) || Object.hasOwn(spec.refinements, name)) {
    return name
  }
  throw new SpecVersionError(`this package names the part "${name}", which spec ${spec.specVersion} does not declare`)
}

/**
 * Loads and validates a spec + sidecar pair from an arbitrary directory. Exposed for the
 * spec-integrity tests; `loadSpec()` is the entry point every other module uses.
 */
export function loadSpecFrom(dir: string): RefIdSpec {
  const raw = readText(`${dir}/ref-id.json`)
  const sidecar = readText(`${dir}/ref-id.json.sha256`)
  return validate(raw, sidecar)
}

let cached: RefIdSpec | undefined

/** The validated spec object, cached after the first successful load. */
export function loadSpec(): RefIdSpec {
  if (cached) {
    return cached
  }
  const jsonUrl = new URL("../spec/ref-id.json", import.meta.url)
  const sidecarUrl = new URL("../spec/ref-id.json.sha256", import.meta.url)
  const raw = readText(jsonUrl)
  const sidecar = readText(sidecarUrl)
  cached = validate(raw, sidecar)
  return cached
}
