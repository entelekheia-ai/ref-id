// SPDX-License-Identifier: Apache-2.0
//
// sha256 over the UTF-8 bytes of the joined identifier strings, per `spec.digest`: declared order,
// no deduplication, and a refusal for a member that carries the join character — without it two
// different sequences could share one digest, and the envelope invariant would admit both.

import { createHash } from "node:crypto"
import { DigestError } from "./errors.ts"
import { loadSpec } from "./spec.ts"

/** Digests an ordered, non-deduplicated sequence of identifier strings. */
export function digest(members: readonly string[]): string {
  const spec = loadSpec()
  for (const member of members) {
    if (typeof member !== "string" || member.includes(spec.digest.join)) {
      throw new DigestError("member", "a member must be one identifier string and cannot carry the join character")
    }
  }
  const joined = members.join(spec.digest.join)
  const hex = createHash(spec.digest.algorithm).update(joined, spec.digest.encoding as BufferEncoding).digest("hex")
  return `${spec.digest.algorithm}:${hex}`
}
