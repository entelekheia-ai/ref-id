// SPDX-License-Identifier: Apache-2.0
//
// Assembles a `ref:` identifier string from its parts. A part the grammar cannot carry is refused
// with a BuildError naming it — the builder never emits a string that means something else. The
// nested-value encoding comes from the form's own table; a locator is never encoded.

import { containsAny, encodeReserved, tableFor } from "./encoding.ts"
import { BuildError } from "./errors.ts"
import { FIELD, FRAGMENT_INTRODUCER, LINE_BREAKS, schemePrefix, statePairGrammar, topLevelGrammar } from "./grammar.ts"
import { loadSpec, status, type RefIdSpec } from "./spec.ts"
import { parse } from "./parse.ts"
import type { BuildParts, Pair } from "./types.ts"
import { foldsType } from "./validators.ts"

/** The form, among a qualifier's declared forms, that nests an identifier — where the encoding table lives. */
function nestingForm(spec: RefIdSpec, key: string): RefIdSpec["forms"][string] | undefined {
  const declared = spec.qualifiers[key]
  if (!declared) {
    return undefined
  }
  return declared.forms.map((name) => spec.forms[name]).find((form) => form?.nested)
}

function refuse(part: string, why: string): never {
  throw new BuildError(part, `cannot build: ${why}`)
}

/** Builds a `ref:` identifier string. `parts.location` is ignored — it never reaches the identity. */
export function build(parts: BuildParts): string {
  const spec = loadSpec()
  const separators = [spec.grammar.state.separator, FRAGMENT_INTRODUCER, ...LINE_BREAKS]

  let locator = parts.locator
  const fold = `${parts.type}${FIELD}`
  if (foldsType(spec, parts.type) && locator.startsWith(fold)) {
    locator = locator.slice(fold.length)
  }
  if (locator === "" || containsAny(locator, separators)) {
    refuse("locator", "a locator is handed to its validator verbatim and cannot carry a reserved character")
  }

  let out = `${schemePrefix(spec)}${parts.type}${FIELD}${locator}`

  if (parts.qualifiers && parts.qualifiers.length > 0) {
    const pairGrammar = statePairGrammar(spec)
    const rendered: string[] = []
    for (const [key, value] of parts.qualifiers) {
      let encoded: string
      if (typeof value === "string") {
        if (value.startsWith(schemePrefix(spec)) || containsAny(value, separators)) {
          refuse(key, "a nested identifier is passed as { nested }, never as a plain string")
        }
        encoded = value
      } else {
        const form = nestingForm(spec, key)
        if (!form) {
          refuse(key, "this qualifier declares no nesting form")
        }
        encoded = encodeReserved(value.nested, tableFor(spec, form))
      }
      const pair = `${key}=${encoded}`
      if (!pairGrammar.test(pair)) {
        refuse(key, "the key does not fit the pair grammar")
      }
      rendered.push(pair)
    }
    out += `${spec.grammar.state.separator}${rendered.join(spec.grammar.state.separator)}`
  }

  if (parts.fragment !== undefined) {
    const separator = spec.grammar.fragment.separator
    const path = typeof parts.fragment === "string" ? parts.fragment : parts.fragment.path
    const refinements: Pair[] = typeof parts.fragment === "string" ? [] : (parts.fragment.refinements ?? [])
    if (path === "" || containsAny(path, [separator, ...LINE_BREAKS])) {
      refuse("fragment", "a declared-name path cannot be empty or carry the refinement separator")
    }
    for (const [key, value] of refinements) {
      if (containsAny(value, [separator, ...LINE_BREAKS])) {
        refuse(key, "a refinement value cannot carry the separator")
      }
    }
    out += `${FRAGMENT_INTRODUCER}${path}`
    if (refinements.length > 0) {
      out += `${separator}${refinements.map(([key, value]) => `${key}=${value}`).join(separator)}`
    }
  }

  // The last word is the grammar's: what was built must decompose to what was asked.
  if (!topLevelGrammar(spec).test(out)) {
    refuse("grammar", "the assembled string does not match the grammar")
  }
  const check = parse(out)
  if (check.status === status(spec, "malformed")) {
    refuse(check.part ?? "grammar", "the assembled string is malformed")
  }
  return out
}
