// SPDX-License-Identifier: Apache-2.0
//
// sha256 over the UTF-8 bytes of the joined identifier strings, per `spec.digest`: declared order,
// no deduplication, and a refusal for a member that carries the join character — without it two
// different sequences could share one digest, and the envelope invariant would admit both.

import { createHash } from "node:crypto"
import { DigestError } from "./errors.ts"
import { FIELD } from "./grammar.ts"
import { loadSpec, part } from "./spec.ts"

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
  }
  const joined = snapshot.join(spec.digest.join)
  const hex = createHash(spec.digest.algorithm).update(joined, spec.digest.encoding as BufferEncoding).digest("hex")
  return `${spec.digest.algorithm}${FIELD}${hex}`
}
