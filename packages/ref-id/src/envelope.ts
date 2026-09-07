// SPDX-License-Identifier: Apache-2.0
//
// The envelope invariant from spec.envelope: an identifier carrying a digest is admissible only
// with an object whose sets entry for that qualifier recomputes to it, served under its own id.

import { digest } from "./digest.ts"
import { DigestError } from "./errors.ts"
import { pattern } from "./grammar.ts"
import { parse } from "./parse.ts"
import { loadSpec, SpecVersionError, status } from "./spec.ts"
import type { EnvelopeResult } from "./types.ts"

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function ownField(record: Record<string, unknown>, field: string): unknown {
  return Object.hasOwn(record, field) ? record[field] : undefined
}

/** Refuses an envelope whose self-reference or recomputed digests do not hold. */
export function validateEnvelope(requestedId: string, envelope: unknown): EnvelopeResult {
  const spec = loadSpec()
  const setsField = spec.envelope.setsField
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    return { admissible: false, reason: "envelope is not an object" }
  }
  const record = envelope as Record<string, unknown>
  if (ownField(record, spec.envelope.selfReference) !== requestedId) {
    return { admissible: false, reason: `envelope.${spec.envelope.selfReference} does not match the requested identifier` }
  }

  const parsed = parse(requestedId)
  if (parsed.status === status(spec, "malformed") || parsed.status === status(spec, "unsupported")) {
    return { admissible: false, reason: `the requested identifier is ${parsed.status}` }
  }

  // spec.envelope.digestForms: every form declaring digest: true. One without a pattern cannot be recognised — a spec this package cannot honour.
  const digestForms = Object.entries(spec.forms)
    .filter(([, form]) => form.digest)
    .map(([name, form]) => {
      if (!form.pattern) {
        throw new SpecVersionError(`spec.forms.${name} declares digest: true without a pattern; this package cannot recognise it`)
      }
      return pattern(spec, form.pattern)
    })
  const sets = ownField(record, setsField)

  for (const [key, value] of parsed.qualifiers) {
    if (!digestForms.some((form) => form.test(value))) {
      continue
    }
    const entry = typeof sets === "object" && sets !== null && !Array.isArray(sets) ? ownField(sets as Record<string, unknown>, key) : undefined
    // One read, then a copy: the members that are checked are the members that are hashed.
    const members = Array.isArray(entry) ? Array.from(entry as unknown[]) : undefined
    if (!isStringArray(members)) {
      return { admissible: false, reason: `${setsField}.${key} is missing or is not an array of strings` }
    }
    let recomputed: string
    try {
      recomputed = digest(members)
    } catch (error) {
      if (error instanceof DigestError) {
        return { admissible: false, reason: `${setsField}.${key} carries a member with the join character` }
      }
      throw error
    }
    if (recomputed !== value) {
      return { admissible: false, reason: `${setsField}.${key} does not recompute to the declared digest` }
    }
  }

  return { admissible: true }
}
