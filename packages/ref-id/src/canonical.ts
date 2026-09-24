// SPDX-License-Identifier: Apache-2.0
//
// The form two identifiers are compared in. `;a=1;b=2` and `;b=2;a=1` name one thing, so identity is
// judged on this rather than on the bytes a producer happened to write.

import { nestingForm } from "./build.ts"
import { encodeReserved, tableFor } from "./encoding.ts"
import { parse } from "./parse.ts"
import { serialise } from "./serialise.ts"
import { loadSpec, status } from "./spec.ts"
import type { Pair, ParseResult } from "./types.ts"

/** Sorts a pair list by key, UTF-16 code unit order — the order `identifierEquivalence.canonicalForm`
 * declares for both qualifiers and refinements. */
function byKey(pairs: readonly Pair[]): Pair[] {
  return [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * The canonical form of an identifier: its qualifiers sorted by key, its fragment's refinements sorted
 * by key, a nested identifier inside a qualifier value written in its own canonical form, and the
 * version slot omitted when it holds `spec.version.default` (`identifierEquivalence.canonicalForm`).
 *
 * Sorting is by UTF-16 code unit, the order this specification already uses for its own file, and it is
 * the cheapest canonicalisation rather than the point. What is load-bearing is that one deterministic
 * order exists, so any two implementations reach the same answer about whether two identifiers are one.
 *
 * A qualifier and a refinement are each a filter, and filters combine with AND, so neither key order
 * distinguishes. The order *inside* one refinement's or one nested identifier's own value does — that
 * value is left exactly as parsed except for the nested identifier's own canonicalisation.
 *
 * A malformed identifier has no canonical form and is refused, for the reason `serialise` gives: there is
 * no faithful way to write back a string whose failing part was never decomposed.
 */
export function canonicalIdentifier(identifier: string | ParseResult): string {
  const spec = loadSpec()
  const parsed = typeof identifier === "string" ? parse(identifier) : identifier
  if (parsed.status === status(spec, "malformed")) return serialise(parsed) // throws, naming the failing part

  const qualifiers = byKey(parsed.qualifiers).map(([key, value]): Pair => {
    const nested = parsed.nested?.[key]
    if (nested === undefined) return [key, value]
    const form = nestingForm(spec, key)
    if (!form) return [key, value]
    return [key, encodeReserved(canonicalIdentifier(nested), tableFor(spec, form))]
  })

  const fragment = parsed.fragment ? { ...parsed.fragment, refinements: byKey(parsed.fragment.refinements) } : parsed.fragment

  const atDefaultVersion = parsed.version === spec.version.default
  const explicitVersion = atDefaultVersion ? false : parsed.explicitVersion
  const versionText = atDefaultVersion ? undefined : parsed.versionText

  return serialise({ ...parsed, qualifiers, fragment, explicitVersion, versionText })
}

/** @deprecated Use `canonicalIdentifier`, the name `spec.openRPC` declares. Kept as an alias for one
 * minor (Plan-005, Track 2). */
export const canonical = canonicalIdentifier

/**
 * Whether two identifiers name one thing. Order of qualifiers does not distinguish; everything else does.
 *
 * An identifier with no decomposition — malformed, or at a scheme version this package does not
 * implement — names nothing, so it is the same identifier as nothing, itself included: the answer is
 * `false`, never a thrown refusal. That is what `identifierEquivalence.comparison` states and what the
 * `sameIdentifier` expectation of every comparison vector binds, in all three implementations.
 */
export function sameIdentifier(a: string | ParseResult, b: string | ParseResult): boolean {
  const spec = loadSpec()
  const usable = [status(spec, "ok"), status(spec, "uncovered")]
  const read = (identifier: string | ParseResult): ParseResult => (typeof identifier === "string" ? parse(identifier) : identifier)
  const [x, y] = [read(a), read(b)]
  if (!usable.includes(x.status) || !usable.includes(y.status)) return false
  return canonicalIdentifier(x) === canonicalIdentifier(y)
}
