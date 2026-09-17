// SPDX-License-Identifier: Apache-2.0
//
// The two questions equality cannot answer. `sameIdentifier` says whether two strings name one thing,
// which is what a digest and an envelope need and is deliberately strict. A store wants two other
// answers: whether two identifiers name the same released thing at different versions, and whether a
// partial identifier stands for a whole family of complete ones. Neither is equality, and neither can be
// expressed by relaxing it, because they disagree with each other on direction.

import { parse } from "./parse.ts"
import { loadSpec, status, type RefIdSpec } from "./spec.ts"
import type { Pair, ParseResult } from "./types.ts"

/**
 * The locator without its version, and the version it carried.
 *
 * **Whether a locator carries a version at all is the type's business, not this function's**, so it is
 * read from `dispatch.<type>.versionTail` rather than guessed from the punctuation. An `@` means a
 * released version in a Package URL and a host path; it separates a mailbox from its domain, keys a
 * quantisation on a served model, and appears in neither a telephone number nor an article number.
 * Guessing reported two different mailboxes as one thing.
 *
 * Within a type that does carry one, the version is the last `@`-introduced run with nothing but the end
 * after it — so `npm/x@1.0.0` has one and `npm/@acme/x` does not, its `@` opening a namespace segment
 * rather than closing the name.
 */
function split(spec: RefIdSpec, type: string, locator: string): { stem: string; version?: string } {
  if (!spec.dispatch[type]?.versionTail) return { stem: locator }
  const at = locator.lastIndexOf("@")
  if (at <= 0 || locator.slice(at + 1).includes("/")) return { stem: locator }
  return { stem: locator.slice(0, at), version: locator.slice(at + 1) }
}

/**
 * The identifier, when this package vouches for how it was decomposed.
 *
 * `ok` and `uncovered` both carry a decomposition this grammar produced — an uncovered type parses, and
 * only its locator's own grammar is unknown. `malformed` has no decomposition to compare, and
 * `unsupported` has one produced by the wrong grammar: a later identifier version is minted for a change
 * to normalisation, percent-encoding, separators or shape, so its parts read through this version's
 * expression are not reliably its parts.
 */
function read(identifier: string | ParseResult): ParseResult | undefined {
  const spec = loadSpec()
  const parsed = typeof identifier === "string" ? parse(identifier) : identifier
  const usable = [status(spec, "ok"), status(spec, "uncovered")]
  return usable.includes(parsed.status) ? parsed : undefined
}

/** Whether every pair the first declares appears identically in the second. */
function subsumes(theirs: Pair[], mine: Pair[]): boolean {
  const map = new Map(theirs)
  return mine.every(([key, value]) => map.get(key) === value)
}

/** Whether two pair lists hold the same pairs, order aside. */
function equal(a: Pair[], b: Pair[]): boolean {
  return a.length === b.length && subsumes(b, a)
}

/**
 * Whether two identifiers name the same released thing, at whatever version each declares.
 *
 * Symmetric, and version-blind in exactly one place: the locator of a type that declares it carries a
 * version. Everything else still distinguishes — the declared name, its refinements, and every
 * qualifier — because two readings taken at different moments are two readings of one trait rather than
 * one reading, and collapsing them is the defect `when` exists to prevent.
 *
 * A malformed identifier, and one at an identifier version this package does not implement, name nothing
 * here and so are the same as nothing, including themselves.
 */
export function samePackage(a: string | ParseResult, b: string | ParseResult): boolean {
  const spec = loadSpec()
  const [x, y] = [read(a), read(b)]
  if (!x || !y) return false
  if (x.type !== y.type || x.version !== y.version) return false
  if (split(spec, x.type, x.locator).stem !== split(spec, y.type, y.locator).stem) return false
  if ((x.fragment?.path ?? null) !== (y.fragment?.path ?? null)) return false
  if (!equal(x.fragment?.refinements ?? [], y.fragment?.refinements ?? [])) return false
  return equal(x.qualifiers, y.qualifiers)
}

/**
 * Whether the first identifier is the second with less declared — the general covering the specific.
 *
 * **Asymmetric, and the direction is the whole point.** `pkg:npm/x` covers `pkg:npm/x@1.0.0`, and
 * `pkg:npm/x@1.0.0` does not cover `pkg:npm/x`: a name that declares no version stands for every version
 * of itself, while a name that declares one stands for that version alone. The same holds for the
 * declared name, for each of its refinements, and for each qualifier — what the first leaves unsaid, the
 * second may say freely; what the first says, the second must say identically.
 *
 * This is what makes a partial identifier a query. A store keyed by identifier answers "every reading of
 * this trait" by asking which of its keys a trait-only identifier covers, with no query language at all.
 *
 * Every identifier this package vouches for covers itself; one it does not — malformed, or at an
 * identifier version it does not implement — covers nothing, itself included.
 */
export function covers(general: string | ParseResult, specific: string | ParseResult): boolean {
  const spec = loadSpec()
  const [x, y] = [read(general), read(specific)]
  if (!x || !y) return false
  if (x.type !== y.type || x.version !== y.version) return false

  const [gen, spe] = [split(spec, x.type, x.locator), split(spec, y.type, y.locator)]
  if (gen.stem !== spe.stem) return false
  if (gen.version !== undefined && gen.version !== spe.version) return false

  const path = x.fragment?.path
  if (path !== undefined && path !== y.fragment?.path) return false
  if (!subsumes(y.fragment?.refinements ?? [], x.fragment?.refinements ?? [])) return false

  return subsumes(y.qualifiers, x.qualifiers)
}
