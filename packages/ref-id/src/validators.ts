// SPDX-License-Identifier: Apache-2.0
//
// The owning validators, and the ways a delegated string is formed, each keyed by the name the
// spec's dispatch table uses. This is the one registry that maps a spec name to behaviour: a name
// the spec uses and this file does not know degrades to `uncovered`, never to an exception.

import { PackageURL } from "packageurl-js"
import { FIELD } from "./grammar.ts"
import type { RefIdSpec } from "./spec.ts"

export type Validation = { ok: true; canonical?: string } | { ok: false }

type DispatchEntry = RefIdSpec["dispatch"][string]

const validators: Record<string, (entry: DispatchEntry, delegated: string) => Validation> = {
  "package-url": (_entry, delegated) => {
    try {
      return { ok: true, canonical: PackageURL.fromString(delegated).toString() }
    } catch {
      return { ok: false }
    }
  },
  "declared-name": (entry, delegated) => ({ ok: new RegExp(entry.pattern ?? "").test(delegated) }),
}

/** How `dispatch.<type>.delegate` forms the delegated string, and whether a producer may pass the format's own scheme back in. */
const delegators: Record<string, { form: (type: string, locator: string) => string; foldsType: boolean }> = {
  "type-prefixed": { form: (type, locator) => `${type}${FIELD}${locator}`, foldsType: true },
  verbatim: { form: (_type, locator) => locator, foldsType: false },
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
export function validateLocator(entry: DispatchEntry, delegated: string): Validation | undefined {
  const validator = validators[entry.validator]
  return validator ? validator(entry, delegated) : undefined
}
