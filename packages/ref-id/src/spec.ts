// SPDX-License-Identifier: Apache-2.0
//
// The specification's vocabulary and its canonical serialisation, plus the seam through which a spec
// reaches this package. Behaviour only — the spec's own data is never restated here.
//
// THIS MODULE READS NOTHING. It used to open spec/ref-id.json itself through `node:fs` and hash it
// through `node:crypto`, which made every module that touches the spec — which is all of them —
// depend on a filesystem. Where the bytes come from is now the caller's decision, installed once by
// an entry point: `index.ts` installs the disk loader (`spec.node.ts`), `index.browser.ts` installs
// the generated constant (`spec.browser.ts`). That is the whole of Plan-004's browser build; nothing
// below knows which one it got.

import { RefIdError } from "./errors.ts"

/**
 * Thrown when the loaded spec's bytes do not match its sidecar digest.
 *
 * Both spec errors extend `RefIdError` so that one `instanceof` covers everything this package throws.
 * They carry `part: "spec"` because the part that failed is the specification itself rather than any
 * part of an identifier — the field stays meaningful instead of being left undefined for two of the
 * five errors.
 */
export class SpecIntegrityError extends RefIdError {
  constructor(message: string) {
    super("SpecIntegrityError", "spec", message)
  }
}

/** Thrown when the loaded spec declares a specVersion major, or a vocabulary, this package does not support. */
export class SpecVersionError extends RefIdError {
  constructor(message: string) {
    super("SpecVersionError", "spec", message)
  }
}

/**
 * The `ref:` specification, as published in `spec/ref-id.json`. Typed only as far as the code
 * reads it; the shapes of the tables and of `vectors` are spec data, read dynamically rather than
 * mirrored into a second declaration.
 *
 * @deprecated Use `Spec`, the name `spec.openRPC` declares (`components.schemas.Spec`). Kept as an
 * alias for one minor (Plan-005, Track 2).
 */
export interface RefIdSpec {
  specVersion: string
  scheme: string
  grammar: {
    dialect: string
    expression: string
    groups: string[]
    adaptations: Record<string, { replace: [string, string][]; anchor?: string }>
    adaptationsApplyTo: string
    anchors: string
    state: { separator: string; pair: string; unknownKey: string; repeatedKey: string }
    fragment: { separator: string; pair: string; path: string; repeatedKey: string }
  }
  version: { default: number; supported: number[]; maximum: number; maximumNote: string; mints: string[]; note: string }
  encoding: Record<string, { reserved: string[]; table?: Record<string, string>; note?: string }>
  dispatch: Record<string, { locator: string; validator: string; delegate: string; pattern?: string; versionTail?: boolean; reference?: string; declaredBy?: string }>
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
    canonicalisation: unknown[]
  }
}

/** `spec.openRPC`'s name for `RefIdSpec` (`components.schemas.Spec`) — opaque to a caller, who reads it
 * only through this package's own functions. */
export type Spec = RefIdSpec

/**
 * Canonical serialisation per `spec.canonicalisation.rules`: object keys sorted by UTF-16 code
 * unit, no whitespace outside strings, strings escaped as `JSON.stringify` does, numbers
 * restricted to integers whose magnitude does not exceed `spec.version.maximum` (an integral value
 * written with a fraction or an exponent, e.g. `1.0` or `1e2`, is that integer — `JSON.parse` already
 * reduces both to a plain integer `number` before this function ever sees them).
 *
 * `maximum` defaults to the loaded specification's own bound and is not meant to be supplied by an
 * ordinary caller; `spec.node.ts` passes it explicitly, read straight off the not-yet-verified document,
 * because that is the one call this function makes before a spec is loaded — asking `loadSpec()` for the
 * bound here would call back into the load this very call is part of.
 *
 * Every value this package refuses to canonicalise is a `SpecIntegrityError` — `openRPC` declares it
 * as `canonicalise`'s one error (`components.errors.SpecIntegrity`) — rather than a plain `Error`, so
 * that a caller's one `instanceof RefIdError` covers everything this package throws.
 */
export function canonicalise(value: unknown, maximum: number = loadSpec().version.maximum): string {
  if (value === null) {
    return "null"
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value > maximum || value < -maximum) {
      throw new SpecIntegrityError(`canonicalisation covers integers of magnitude at most ${maximum} only, got ${value}`)
    }
    return String(value)
  }
  if (typeof value === "string") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalise(item, maximum)).join(",")}]`
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(record[key], maximum)}`).join(",")}}`
  }
  throw new SpecIntegrityError(`value of type ${typeof value} has no canonical form`)
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

/** The major version this package was built against. Not spec data — the package's own contract. */
export const SUPPORTED_SPEC_MAJOR = "1"

/**
 * A source of the specification: a function an entry point installs, which returns a spec that has
 * already been established as the published one.
 *
 * "Already established" is the contract, and it is deliberately not checkable from here. The disk
 * source verifies bytes against the sidecar at the moment it reads them; the browser source carries a
 * constant that `scripts/gen-spec.mjs` refused to emit until that same verification passed, and that
 * the staleness guard re-establishes on every run. Re-hashing the constant here would compare a
 * constant against a digest compiled from it in the same build — a check that cannot fail, which reads
 * as a guarantee and is a tautology (Plan-004's Decision Log).
 */
export type SpecSource = () => RefIdSpec

let source: SpecSource | undefined
let cached: RefIdSpec | undefined

/**
 * Installs the source `loadSpec()` reads from. Called exactly once, by an entry point, before any
 * public function of this package runs — never by a consumer, because the entry point is what encodes
 * which environment this build is for.
 */
export function installSpecSource(load: SpecSource): void {
  source = load
  cached = undefined
}

/** The spec object, cached after the first successful load. */
export function loadSpec(): RefIdSpec {
  if (cached) {
    return cached
  }
  if (!source) {
    // Reachable only by importing a module of this package directly rather than through one of its
    // entry points — `exports` publishes no deep path, so a consumer cannot arrive here by accident.
    throw new SpecVersionError(
      "no specification source is installed; import this package through its entry point rather than a module inside it",
    )
  }
  cached = source()
  return cached
}
