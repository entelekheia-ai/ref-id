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
    try {
      return { ok: true, canonical: PackageURL.fromString(delegated).toString() }
    } catch {
      return { ok: false }
    }
  },
  "declared-name": (spec, entry, delegated) => ({ ok: pattern(spec, entry.pattern ?? "").test(delegated) }),
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
