// SPDX-License-Identifier: Apache-2.0
//
// The form two identifiers are compared in. `;a=1;b=2` and `;b=2;a=1` name one thing, so identity is
// judged on this rather than on the bytes a producer happened to write.

import { parse } from "./parse.ts"
import { serialise } from "./serialise.ts"
import { loadSpec, status } from "./spec.ts"
import type { ParseResult } from "./types.ts"

/**
 * The canonical form of an identifier: the same identifier with its qualifiers sorted by key.
 *
 * Sorting is by UTF-16 code unit, the order this specification already uses for its own file, and it is
 * the cheapest canonicalisation rather than the point. What is load-bearing is that one deterministic
 * order exists, so any two implementations reach the same answer about whether two identifiers are one.
 *
 * Every other part is left exactly as parsed. **Refinements are not sorted** — they sit on the fragment
 * side and are positional, `lines=1,20` being a range, so reordering them would change what is named.
 *
 * A malformed identifier has no canonical form and is refused, for the reason `serialise` gives: there is
 * no faithful way to write back a string whose failing part was never decomposed.
 */
export function canonical(identifier: string | ParseResult): string {
  const spec = loadSpec()
  const parsed = typeof identifier === "string" ? parse(identifier) : identifier
  if (parsed.status === status(spec, "malformed")) return serialise(parsed) // throws, naming the failing part
  const sorted = [...parsed.qualifiers].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return serialise({ ...parsed, qualifiers: sorted })
}

/** Whether two identifiers name one thing. Order of qualifiers does not distinguish; everything else does. */
export function sameIdentifier(a: string | ParseResult, b: string | ParseResult): boolean {
  return canonical(a) === canonical(b)
}
