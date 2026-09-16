// SPDX-License-Identifier: Apache-2.0
//
// The two questions equality cannot answer. `sameIdentifier` says whether two strings name one thing,
// which is what a digest and an envelope need and is deliberately strict. A store wants two other
// answers: whether two identifiers name the same released thing at different versions, and whether a
// partial identifier stands for a whole family of complete ones. Neither is equality, and neither can be
// expressed by relaxing it, because they disagree with each other on direction.

import { parse } from "./parse.ts"
import { loadSpec, status } from "./spec.ts"
import type { ParseResult } from "./types.ts"

/**
 * The locator without its version, and the version it carried.
 *
 * A version is the last `@`-introduced run when nothing follows it but the end — so `npm/x@1.0.0` has
 * one and `npm/@acme/x` does not, its `@` opening a namespace segment rather than closing the name. A
 * locator whose format writes its version another way keeps it here, which is correct: this reads the
 * scheme's own convention, never each delegated format's.
 */
function split(locator: string): { stem: string; version?: string } {
  const at = locator.lastIndexOf("@")
  if (at <= 0 || locator.slice(at + 1).includes("/")) return { stem: locator }
  return { stem: locator.slice(0, at), version: locator.slice(at + 1) }
}

function read(identifier: string | ParseResult): ParseResult | undefined {
  const spec = loadSpec()
  const parsed = typeof identifier === "string" ? parse(identifier) : identifier
  return parsed.status === status(spec, "malformed") ? undefined : parsed
}

/**
 * Whether two identifiers name the same released thing, at whatever version each declares.
 *
 * Symmetric, and version-blind in exactly one place: the locator. Type, declared name and qualifiers all
 * still distinguish, because two readings taken at different moments are two readings of one trait, not
 * one reading — and collapsing them is the defect `when` exists to prevent.
 *
 * A malformed identifier names nothing, so it is the same as nothing, including itself.
 */
export function samePackage(a: string | ParseResult, b: string | ParseResult): boolean {
  const [x, y] = [read(a), read(b)]
  if (!x || !y) return false
  if (x.type !== y.type) return false
  if (split(x.locator).stem !== split(y.locator).stem) return false
  if ((x.fragment?.path ?? null) !== (y.fragment?.path ?? null)) return false
  return sameQualifiers(x, y)
}

function sameQualifiers(x: ParseResult, y: ParseResult): boolean {
  if (x.qualifiers.length !== y.qualifiers.length) return false
  const theirs = new Map(y.qualifiers)
  return x.qualifiers.every(([key, value]) => theirs.get(key) === value)
}

/**
 * Whether the first identifier is the second with less declared — the general covering the specific.
 *
 * **Asymmetric, and the direction is the whole point.** `pkg:npm/x` covers `pkg:npm/x@1.0.0`, and
 * `pkg:npm/x@1.0.0` does not cover `pkg:npm/x`: a name that declares no version stands for every version
 * of itself, while a name that declares one stands for that version alone. The same holds for the
 * declared name and for each qualifier — what the first leaves unsaid, the second may say freely; what
 * the first says, the second must say identically.
 *
 * This is what makes a partial identifier a query. A store keyed by identifier answers "every reading of
 * this trait" by asking which of its keys a trait-only identifier covers, with no query language at all.
 *
 * Every identifier covers itself, so the relation is reflexive; `samePackage` is not a special case of
 * it, because that one ignores a version both sides declare and this one refuses two that disagree.
 */
export function covers(general: string | ParseResult, specific: string | ParseResult): boolean {
  const [x, y] = [read(general), read(specific)]
  if (!x || !y) return false
  if (x.type !== y.type) return false

  const [gen, spe] = [split(x.locator), split(y.locator)]
  if (gen.stem !== spe.stem) return false
  if (gen.version !== undefined && gen.version !== spe.version) return false

  const path = x.fragment?.path
  if (path !== undefined && path !== y.fragment?.path) return false

  const theirs = new Map(y.qualifiers)
  return x.qualifiers.every(([key, value]) => theirs.get(key) === value)
}
