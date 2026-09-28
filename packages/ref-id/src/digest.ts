// SPDX-License-Identifier: Apache-2.0
//
// sha256 over the UTF-8 bytes of the joined identifier strings, per `spec.digest`: declared order,
// no deduplication, and a refusal for a member that carries the join character — without it two
// different sequences could share one digest, and the envelope invariant would admit both.
//
// `spec.digest.unicode`: a member holding a lone surrogate is refused, never replaced. Encoding it
// anyway would have the UTF-8 step silently substitute U+FFFD for the unpaired half, which is exactly
// the two-sequences-one-digest hazard the join-character refusal above exists for, just reached through
// a different door.

import { hashHex } from "./hash.ts"
import { DigestError } from "./errors.ts"
import { FIELD } from "./grammar.ts"
import { loadSpec, part } from "./spec.ts"

// `String.prototype.isWellFormed` is ES2024; this package's `lib` (tsconfig.json, outside this
// implementer's write set) is ES2023. Node 20+ ships the method regardless of which `lib` `tsc` was
// told about, so the gap is in the type declarations only — closed here with the same ambient merge the
// DOM lib itself would add, rather than by widening a config file this change may not touch.
declare global {
  interface String {
    isWellFormed(): boolean
  }
}

/** Digests an ordered, non-deduplicated sequence of identifier strings. */
export function digest(members: readonly string[]): string {
  const spec = loadSpec()
  if (!Array.isArray(members)) {
    throw new DigestError(part(spec, "member"), "members must be an array of strings")
  }
  const snapshot = Array.from(members)
  for (const member of snapshot) {
    if (typeof member !== "string" || member.includes(spec.digest.join)) {
      throw new DigestError(part(spec, "member"), "a member must be a string that does not carry the join character")
    }
    if (!member.isWellFormed()) {
      throw new DigestError(part(spec, "member"), "a member must not carry a lone surrogate")
    }
  }
  const joined = snapshot.join(spec.digest.join)
  const hex = hashHex(spec.digest.algorithm, spec.digest.encoding, joined)
  return `${spec.digest.algorithm}${FIELD}${hex}`
}
