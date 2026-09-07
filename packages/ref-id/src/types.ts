// SPDX-License-Identifier: Apache-2.0

/** A `key=value` pair, in the order it appeared in the input, values kept verbatim. */
export type Pair = [key: string, value: string]

/** One of `spec.statuses` — the vocabulary is data, so the type is open. */
export type ParseStatus = string

export interface ParsedFragment {
  path: string
  refinements: Pair[]
}

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
  fragment: ParsedFragment | null
  /** On `malformed`: which part failed — one of `spec.parts`. */
  part?: string
}

export type NestedQualifierValue = { nested: string }

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
