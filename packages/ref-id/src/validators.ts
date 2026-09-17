// SPDX-License-Identifier: Apache-2.0
//
// The one registry that maps a NAME the spec uses to behaviour: the owning validators (by
// `dispatch.<type>.validator`), the ways a delegated string is formed (by `dispatch.<type>.delegate`),
// the refinement range constraints (by `refinements.<key>.range`), and the policies this package
// implements (`unknownKey`, `repeatedKey`). A validator or delegate name the spec uses and this file
// does not know degrades to `uncovered`; a range or policy name it does not know is a version
// mismatch and is refused loudly, because silently skipping a constraint is the drift the guardrail
// forbids.

import { PackageURL } from "packageurl-js"
import { FIELD, pattern } from "./grammar.ts"
import { SpecVersionError, type RefIdSpec } from "./spec.ts"

export type Validation = { ok: true; canonical?: string } | { ok: false }

type DispatchEntry = RefIdSpec["dispatch"][string]

const validators: Record<string, (spec: RefIdSpec, entry: DispatchEntry, delegated: string) => Validation> = {
  "package-url": (_spec, _entry, delegated) => {
    const { base, subpath } = splitSubpath(delegated)
    try {
      const purl = PackageURL.fromString(base)
      if (subpath === undefined) return { ok: true, canonical: purl.toString() }
      const withPath = new PackageURL(purl.type, purl.namespace, purl.name, purl.version, purl.qualifiers, subpath)
      return { ok: true, canonical: withPath.toString() }
    } catch {
      return { ok: false }
    }
  },
  "declared-name": (spec, entry, delegated) => ({ ok: pattern(spec, entry.pattern ?? "").test(delegated) }),
  // A number whose shape is right and whose check digit is wrong is a typo, not an identifier — and it
  // is the one error a pattern cannot see. Both registered schemes reduce to the same weighted sum, so
  // one function serves them; neither adds a dependency, which the portability guardrail requires.
  "check-digit": (spec, entry, delegated) => ({
    ok: pattern(spec, entry.pattern ?? "").test(delegated) && checkDigitHolds(delegated),
  }),
}

/**
 * Where a Package URL locator stops being the package and starts being a path inside it.
 *
 * An `@` that opens a segment — preceded by `/`, or first in the string — belongs to a namespace and is
 * part of the name. An `@` inside a segment closes the name: the version runs from it to the next `/`,
 * and whatever follows that `/` is the subpath. Without a version there is no marker at all, so
 * `npm/a/b/c` stays a namespaced package and carries no subpath — a file inside a corpus nobody
 * versioned is named through `folder`, whose locator needs no such marker.
 *
 * The subpath leaves here as the Package URL's own `#subpath` component, which is what that component
 * means; the scheme's `#` is the declared name one level below the file and has no purl equivalent.
 */
function splitSubpath(delegated: string): { base: string; subpath?: string } {
  for (let index = 1; index < delegated.length; index += 1) {
    if (delegated[index] !== "@" || delegated[index - 1] === "/") continue
    const slash = delegated.indexOf("/", index)
    return slash < 0 ? { base: delegated } : { base: delegated.slice(0, slash), subpath: delegated.slice(slash + 1) }
  }
  return { base: delegated }
}

/**
 * The check digit of a registered article number.
 *
 * A ten-character book number weights its digits 10..1 and is correct when the sum is divisible by
 * eleven, which is why its last character may be `X` for the value ten. Every other length is a GS1
 * trade item number: the digits before the last are weighted 3 and 1 alternately from the right, and the
 * last is whatever brings the total up to a multiple of ten.
 */
function checkDigitHolds(value: string): boolean {
  if (value.length === 10) {
    const weighted = [...value].reduce((sum, char, index) => sum + (char === "X" ? 10 : Number(char)) * (10 - index), 0)
    return weighted % 11 === 0
  }
  const digits = [...value].map(Number)
  const declared = digits.at(-1)
  const weighted = digits
    .slice(0, -1)
    .reverse()
    .reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (weighted % 10)) % 10 === declared
}

/** How `dispatch.<type>.delegate` forms the delegated string, and whether a producer may pass the format's own scheme back in. */
const delegators: Record<string, { form: (type: string, locator: string) => string; foldsType: boolean }> = {
  "type-prefixed": { form: (type, locator) => `${type}${FIELD}${locator}`, foldsType: true },
  verbatim: { form: (_type, locator) => locator, foldsType: false },
}

/** The constraints a refinement may declare beyond its pattern, by the name `refinements.<key>.range` uses. */
const ranges: Record<string, (value: string, boundSeparator: string) => boolean> = {
  ascending: (value, boundSeparator) => {
    const bounds = value.split(boundSeparator).map(Number)
    return bounds.length < 2 || (bounds[0] ?? 0) <= (bounds[1] ?? 0)
  },
}

/** The policies this package implements, by the name the spec declares them under. */
const policies = { unknownKey: "carry-through", repeatedKey: "malformed" } as const

const policiesChecked = new WeakSet<RefIdSpec>()

/** Refuses a spec whose declared policies or range names are ones this package does not implement. */
export function assertImplemented(spec: RefIdSpec): void {
  if (policiesChecked.has(spec)) {
    return
  }
  const declared: [string, string | undefined][] = [
    ["grammar.state.unknownKey", spec.grammar.state.unknownKey],
    ["unknownRefinement", spec.unknownRefinement],
    ["grammar.state.repeatedKey", spec.grammar.state.repeatedKey],
    ["grammar.fragment.repeatedKey", spec.grammar.fragment.repeatedKey],
  ]
  for (const [field, value] of declared) {
    const implemented = field.endsWith("repeatedKey") ? policies.repeatedKey : policies.unknownKey
    if (value !== implemented) {
      throw new SpecVersionError(`spec.${field} declares ${JSON.stringify(value)}; this package implements only ${JSON.stringify(implemented)}`)
    }
  }
  for (const [key, refinement] of Object.entries(spec.refinements)) {
    if (refinement.range !== undefined && !Object.hasOwn(ranges, refinement.range)) {
      throw new SpecVersionError(`spec.refinements.${key}.range declares ${JSON.stringify(refinement.range)}, which this package does not implement`)
    }
  }
  policiesChecked.add(spec)
}

/** The string handed to the validator, or undefined when the type is not dispatched or its delegate mode is unknown here. */
export function delegatedString(spec: RefIdSpec, type: string, locator: string): string | undefined {
  const entry = spec.dispatch[type]
  const delegator = entry ? delegators[entry.delegate] : undefined
  return delegator ? delegator.form(type, locator) : undefined
}

/** True when a producer may pass the intact format string (`pkg:npm/x`) as the locator of this type. */
export function foldsType(spec: RefIdSpec, type: string): boolean {
  const entry = spec.dispatch[type]
  return entry ? (delegators[entry.delegate]?.foldsType ?? false) : false
}

/** Runs the owning validator, or undefined when the spec names one this package does not implement. */
export function validateLocator(spec: RefIdSpec, entry: DispatchEntry, delegated: string): Validation | undefined {
  const validator = validators[entry.validator]
  return validator ? validator(spec, entry, delegated) : undefined
}

/** True when the value satisfies the refinement's declared range constraint (or it declares none). */
export function rangeHolds(refinement: RefIdSpec["refinements"][string], value: string): boolean {
  if (refinement.range === undefined) {
    return true
  }
  const check = ranges[refinement.range]
  return check ? check(value, refinement.boundSeparator ?? "") : true
}
