// SPDX-License-Identifier: Apache-2.0
//
// The two questions equality cannot answer. `sameIdentifier` says whether two strings name one thing,
// which is what a digest and an envelope need and is deliberately strict. A store wants two other
// answers: whether two identifiers name the same released thing at different versions, and whether a
// partial identifier stands for a whole family of complete ones. Neither is equality, and neither can be
// expressed by relaxing it, because they disagree with each other on direction.

import { parse } from "./parse.ts"
import { loadSpec, status, type RefIdSpec } from "./spec.ts"
import type { Pair, ParseResult, QualifierRelation, RelateResult, Relation } from "./types.ts"

/**
 * The locator without its version, and the version it carried.
 *
 * **Whether a locator carries a version at all is the type's business, not this function's**, so it is
 * read from `dispatch.<type>.versionTail` rather than guessed from the punctuation. An `@` means a
 * released version in a Package URL and a host path; it separates a mailbox from its domain, keys a
 * quantisation on a served model, and appears in neither a telephone number nor an article number.
 * Guessing reported two different mailboxes as one thing.
 *
 * Within a type that does carry one, an `@` that opens a segment — preceded by `/`, or first — belongs
 * to a namespace, so `npm/@acme/x` has no version. An `@` inside a segment closes the name: the version
 * runs from it to the next `/`, and whatever follows that `/` is a path inside the named thing.
 *
 * **The path stays in the stem, and only the version leaves it.** The stem answers *which thing*, and a
 * file at two releases is one file — so `npm/x@1.0.0/docs/guide.md` and `npm/x@2.0.0/docs/guide.md`
 * share the stem `npm/x/docs/guide.md` and are the same package, while two files in one release do not.
 */
function split(spec: RefIdSpec, type: string, locator: string): { stem: string; version?: string } {
  if (!spec.dispatch[type]?.versionTail) return { stem: locator }
  for (let index = 1; index < locator.length; index += 1) {
    if (locator[index] !== "@" || locator[index - 1] === "/") continue
    const slash = locator.indexOf("/", index)
    if (slash < 0) return { stem: locator.slice(0, index), version: locator.slice(index + 1) }
    return { stem: locator.slice(0, index) + locator.slice(slash), version: locator.slice(index + 1, slash) }
  }
  return { stem: locator }
}

/**
 * Whether the general identifier's stem reaches the specific one's.
 *
 * Equal stems name one thing. Otherwise the general one covers the specific when its stem is a whole
 * **segment** prefix of it — `acme-tools` reaching `acme-tools/docs/guide.md`. The segment boundary is
 * the whole of the rule: a bare string prefix would make `acme-tools` cover `acme-tools-extra`, two
 * corpora that share nothing but their first characters.
 */
function stemReaches(general: string, specific: string): boolean {
  return general === specific || specific.startsWith(`${general}/`)
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

/** Whether every pair the first declares appears identically in the second. Used for refinements, which
 * never nest (only a qualifier value can be a nested `ref:` identifier — `comparison.covers.rule`). */
function subsumes(theirs: Pair[], mine: Pair[]): boolean {
  const map = new Map(theirs)
  return mine.every(([key, value]) => map.get(key) === value)
}

/** Whether two pair lists hold the same pairs, order aside. Used for refinements. */
function equal(a: Pair[], b: Pair[]): boolean {
  return a.length === b.length && subsumes(b, a)
}

/**
 * Whether a general qualifier value reaches a specific one, descending into a nested `ref:` identifier
 * when both sides carry one this relation accepts (`comparison.covers.rule`, the descent). A nested pair
 * the relation refuses — malformed to it, or at a scheme version this package does not implement — falls
 * back to byte equality, and so does a digest, a timestamp, plain text, or a nested identifier on one
 * side only.
 */
function qualifierCovers(generalValue: string, specificValue: string, generalNested: string | undefined, specificNested: string | undefined): boolean {
  if (generalNested !== undefined && specificNested !== undefined) {
    const [gen, spe] = [read(generalNested), read(specificNested)]
    if (gen && spe) return covers(gen, spe)
  }
  return generalValue === specificValue
}

/** Whether every qualifier the general side declares is declared by the specific side with a value the
 * general one's covers, descending into a nested identifier where both sides carry one. */
function qualifiersCovered(general: ParseResult, specific: ParseResult): boolean {
  const specMap = new Map(specific.qualifiers)
  return general.qualifiers.every(([key, value]) => {
    const specificValue = specMap.get(key)
    return specificValue !== undefined && qualifierCovers(value, specificValue, general.nested?.[key], specific.nested?.[key])
  })
}

/** The symmetric counterpart of `qualifierCovers`, for `samePackage` (`comparison.samePackage.rule`). */
function qualifierSame(aValue: string, bValue: string, aNested: string | undefined, bNested: string | undefined): boolean {
  if (aNested !== undefined && bNested !== undefined) {
    const [a, b] = [read(aNested), read(bNested)]
    if (a && b) return samePackage(a, b)
  }
  return aValue === bValue
}

/** Whether two qualifier lists hold the same pairs, order aside, descending into a nested identifier
 * both sides carry at the same key. */
function qualifiersEqual(a: ParseResult, b: ParseResult): boolean {
  if (a.qualifiers.length !== b.qualifiers.length) return false
  const bMap = new Map(b.qualifiers)
  return a.qualifiers.every(([key, value]) => {
    const bValue = bMap.get(key)
    return bValue !== undefined && qualifierSame(value, bValue, a.nested?.[key], b.nested?.[key])
  })
}

/** `equal` when both are undefined or identical; `covers` when only the second is declared (the first
 * leaves it unsaid); `coveredBy` for the mirror; `differ` when both are declared and differ. The shared
 * shape of `comparison.relate.result`'s `locatorVersion`, `fragmentPath` and keyed dimensions. */
function optionalRelation(a: string | undefined, b: string | undefined): Relation {
  if (a === undefined && b === undefined) return "equal"
  if (a === undefined) return "covers"
  if (b === undefined) return "coveredBy"
  return a === b ? "equal" : "differ"
}

/** The `locatorStem` dimension: `equal`, or `covers`/`coveredBy` when one stem is a whole-segment prefix
 * of the other, or `differ`. */
function stemRelation(a: string, b: string): Relation {
  if (a === b) return "equal"
  if (stemReaches(a, b)) return "covers"
  if (stemReaches(b, a)) return "coveredBy"
  return "differ"
}

/** A `RelateResult` reduced to one relation, per `comparison.relate.reduction`: `equal` when every
 * relation in it is `equal`; `covers` when every one is `equal` or `covers`; `coveredBy` for the mirror;
 * `differ` otherwise. "Every relation" means the five fixed dimensions, each refinement, and each
 * qualifier's own (possibly already-reduced) relation. */
function reduceRelation(result: RelateResult): Relation {
  const relations: Relation[] = [
    result.type,
    result.version,
    result.locatorStem,
    result.locatorVersion,
    result.fragmentPath,
    ...Object.values(result.fragmentRefinements),
    ...Object.values(result.qualifiers).map((qualifier) => qualifier.relation),
  ]
  if (relations.every((relation) => relation === "equal")) return "equal"
  if (relations.every((relation) => relation === "equal" || relation === "covers")) return "covers"
  if (relations.every((relation) => relation === "equal" || relation === "coveredBy")) return "coveredBy"
  return "differ"
}

/** One qualifier's relation: descends into a nested identifier only where both sides declare the key
 * with a value this relation accepts; otherwise (or when the nested pair is refused) the raw values are
 * related by `optionalRelation`, which is byte equality once both are known to be declared. */
function qualifierRelation(
  aValue: string | undefined,
  bValue: string | undefined,
  aNested: string | undefined,
  bNested: string | undefined,
): QualifierRelation {
  if (aValue !== undefined && bValue !== undefined && aNested !== undefined && bNested !== undefined) {
    const [a, b] = [read(aNested), read(bNested)]
    if (a && b) {
      const nested = relate(a, b)
      if (nested) return { relation: reduceRelation(nested), nested }
    }
  }
  return { relation: optionalRelation(aValue, bValue) }
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
  return qualifiersEqual(x, y)
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
  if (!stemReaches(gen.stem, spe.stem)) return false
  if (gen.version !== undefined && gen.version !== spe.version) return false

  const path = x.fragment?.path
  if (path !== undefined && path !== y.fragment?.path) return false
  if (!subsumes(y.fragment?.refinements ?? [], x.fragment?.refinements ?? [])) return false

  return qualifiersCovered(x, y)
}

/**
 * How two identifiers relate in every dimension `comparison.dimensions` names, plus each qualifier key
 * either side declares — `covers`, `coveredBy` and `samePackage` are reductions of this same result
 * (`comparison.relate.reductions`), never a second computation that could disagree with it.
 *
 * Every dimension is computed on its own, whatever the others found: two identifiers of different types
 * still report their locators. The five fixed dimensions are always present; a keyed dimension —
 * `fragmentRefinements`, `qualifiers` — carries only the keys at least one side declares, and a
 * dimension neither side declares is `equal`.
 *
 * `null` for a pair this relation refuses — malformed, or at a scheme version this package does not
 * implement — which has no parts to relate.
 */
export function relate(a: string | ParseResult, b: string | ParseResult): RelateResult | null {
  const spec = loadSpec()
  const [x, y] = [read(a), read(b)]
  if (!x || !y) return null

  const [xLocator, yLocator] = [split(spec, x.type, x.locator), split(spec, y.type, y.locator)]

  const refinementKeys = new Set([...(x.fragment?.refinements ?? []).map(([key]) => key), ...(y.fragment?.refinements ?? []).map(([key]) => key)])
  const xRefinements = new Map(x.fragment?.refinements ?? [])
  const yRefinements = new Map(y.fragment?.refinements ?? [])
  const fragmentRefinements: Record<string, Relation> = {}
  for (const key of refinementKeys) {
    fragmentRefinements[key] = optionalRelation(xRefinements.get(key), yRefinements.get(key))
  }

  const qualifierKeys = new Set([...x.qualifiers.map(([key]) => key), ...y.qualifiers.map(([key]) => key)])
  const xQualifiers = new Map(x.qualifiers)
  const yQualifiers = new Map(y.qualifiers)
  const qualifiers: Record<string, QualifierRelation> = {}
  for (const key of qualifierKeys) {
    qualifiers[key] = qualifierRelation(xQualifiers.get(key), yQualifiers.get(key), x.nested?.[key], y.nested?.[key])
  }

  return {
    type: x.type === y.type ? "equal" : "differ",
    version: x.version === y.version ? "equal" : "differ",
    locatorStem: stemRelation(xLocator.stem, yLocator.stem),
    locatorVersion: optionalRelation(xLocator.version, yLocator.version),
    fragmentPath: optionalRelation(x.fragment?.path, y.fragment?.path),
    fragmentRefinements,
    qualifiers,
  }
}
