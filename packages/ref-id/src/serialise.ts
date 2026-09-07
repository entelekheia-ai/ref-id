// SPDX-License-Identifier: Apache-2.0
//
// Reassembles a ParseResult into the exact bytes it was parsed from — the inverse of parse.ts's
// structural decomposition. Every part is emitted verbatim: the locator, the qualifier values
// (known and unknown keys alike), the fragment path and its refinements.

import { SerialiseError } from "./errors.ts"
import { FIELD, FRAGMENT_INTRODUCER, schemePrefix } from "./grammar.ts"
import { loadSpec, status } from "./spec.ts"
import type { Pair, ParseResult } from "./types.ts"

function pairs(entries: readonly Pair[], separator: string): string {
  return entries.map(([key, value]) => `${key}=${value}`).join(separator)
}

/** `serialise(parse(s)) === s` for every parseable input, including uncovered and unsupported ones. A malformed result has no faithful form and is refused. */
export function serialise(parsed: ParseResult): string {
  const spec = loadSpec()
  if (parsed.status === status(spec, "malformed")) {
    throw new SerialiseError(parsed.part ?? "grammar", "a malformed identifier cannot be serialised without losing the part that failed")
  }

  let out = schemePrefix(spec)
  if (parsed.explicitVersion) {
    out += `${parsed.versionText ?? String(parsed.version)}${FIELD}`
  }
  out += `${parsed.type}${FIELD}${parsed.locator}`

  if (parsed.qualifiers.length > 0) {
    const separator = spec.grammar.state.separator
    out += `${separator}${pairs(parsed.qualifiers, separator)}`
  }

  if (parsed.fragment) {
    out += `${FRAGMENT_INTRODUCER}${parsed.fragment.path}`
    if (parsed.fragment.refinements.length > 0) {
      const separator = spec.grammar.fragment.separator
      out += `${separator}${pairs(parsed.fragment.refinements, separator)}`
    }
  }

  return out
}
