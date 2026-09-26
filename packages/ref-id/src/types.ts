// SPDX-License-Identifier: Apache-2.0

/** A `key=value` pair, in the order it appeared in the input, values kept verbatim. */
export type Pair = [key: string, value: string]

/** One of `spec.statuses` — the vocabulary is data, so the type is open. */
export type ParseStatus = string

export interface Fragment {
  path: string
  refinements: Pair[]
}

/** @deprecated Use `Fragment`. Kept as an alias for one minor (Plan-005, Track 2). */
export type ParsedFragment = Fragment

export interface ParseResult {
  input: string
  status: ParseStatus
  version: number
  explicitVersion: boolean
  /** The version token as written, when explicit — so that serialising returns the same bytes. */
  versionText?: string
  type: string
  /** The captured group, verbatim. */
  locator: string
  /** The string handed to the owning validator, formed per `dispatch.<type>.delegate`; absent when the type is not dispatched. */
  delegated?: string
  /** The validator's own canonical spelling of `delegated`, when the format defines one. Informational; identity is the string. */
  canonical?: string
  qualifiers: Pair[]
  /** The decoded identifier behind each qualifier value that nests one. */
  nested?: Record<string, string>
  fragment: Fragment | null
  /** On `malformed`: which part failed — one of `spec.parts`. */
  part?: string
}

export type NestedQualifierValue = { nested: string }

/** An identifier as a string, or the `ParseResult` `parse()` returned for one — every operation that
 * takes an identifier takes either, and a pair may mix them (`spec.openRPC.components.schemas.IdentifierOrParsed`). */
export type IdentifierOrParsed = string | ParseResult

/** One relation between two identifiers in one dimension of `relate()`'s result. */
export type Relation = "equal" | "covers" | "coveredBy" | "differ"

/** One qualifier's relation; carries `nested` only where both values are nested `ref:` identifiers the
 * operation accepts, in which case `relation` is that nested result reduced by `comparison.relate.reduction`. */
export interface QualifierRelation {
  relation: Relation
  nested?: RelateResult
}

/** What `relate(a, b)` returns for a pair it accepts (`comparison.relate`); `null` for a pair it refuses. */
export interface RelateResult {
  type: Relation
  version: Relation
  locatorStem: Relation
  locatorVersion: Relation
  fragmentPath: Relation
  fragmentRefinements: Record<string, Relation>
  qualifiers: Record<string, QualifierRelation>
}

/** `verdict()`'s identity axis: whether the two name the same thing, as far as their parts can tell
 * (`comparison.verdict.axes.identity`). */
export type VerdictIdentity = "same" | "covers" | "coveredBy" | "distinct" | "undetermined"

/** `verdict()`'s content axis: whether the two carry the same frozen bytes, read from the qualifiers
 * whose `verdict.axis` is `content` (`comparison.verdict.axes.content`). */
export type VerdictContent = "same" | "different" | "unknown"

/** What `verdict(a, b)` returns for a pair `relate` accepts (`comparison.verdict`); `null` for a pair it
 * refuses. `decidedBy` names, by path in `relate`'s result, the members that produced each axis's
 * value — `comparison.verdict.result.decidedBy` states the order and the population rule per value. */
export interface VerdictResult {
  identity: VerdictIdentity
  content: VerdictContent
  decidedBy: {
    identity: string[]
    content: string[]
  }
}

export interface BuildParts {
  type: string
  /** For a type-prefixed dispatch, either the bare group (`npm/x@1.0.0`) or the intact format string (`pkg:npm/x@1.0.0`). */
  locator: string
  qualifiers?: [key: string, value: string | NestedQualifierValue][]
  fragment?: string | { path: string; refinements?: Pair[] }
  /** Never reaches the identifier — location is an attribute of the node, not its name. */
  location?: unknown
}

export interface EnvelopeResult {
  admissible: boolean
  reason?: string
}
