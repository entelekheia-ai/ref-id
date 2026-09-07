// SPDX-License-Identifier: Apache-2.0
//
// Assembles a `ref:` identifier string from its parts. A part the grammar cannot carry is refused
// with a BuildError naming it — the builder never emits a string that means something else, which
// is proven at the end by parsing what was built and comparing it with what was asked. The
// nested-value encoding comes from the form's own table; a locator is never encoded.

import { containsAny, encodeReserved, tableFor } from "./encoding.ts"
import { BuildError } from "./errors.ts"
import { FIELD, FRAGMENT_INTRODUCER, LINE_BREAKS, PAIR, schemePrefix, statePairGrammar, topLevelGrammar } from "./grammar.ts"
import { loadSpec, part, status, type RefIdSpec } from "./spec.ts"
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

function refuse(spec: RefIdSpec, failedPart: string, why: string): never {
  throw new BuildError(part(spec, failedPart), `cannot build: ${why}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Builds a `ref:` identifier string. `parts.location` is ignored — it never reaches the identity. */
export function build(parts: BuildParts): string {
  const spec = loadSpec()
  if (!isRecord(parts) || typeof parts.type !== "string") {
    refuse(spec, "type", "parts must be an object with a string type")
  }
  if (typeof parts.locator !== "string") {
    refuse(spec, "locator", "the locator must be a string")
  }
  const separators = [spec.grammar.state.separator, FRAGMENT_INTRODUCER, ...LINE_BREAKS]

  let locator = parts.locator
  const fold = `${parts.type}${FIELD}`
  if (foldsType(spec, parts.type) && locator.startsWith(fold)) {
    locator = locator.slice(fold.length)
  }
  if (locator === "" || containsAny(locator, separators)) {
    refuse(spec, "locator", "a locator is handed to its validator verbatim and cannot carry a reserved character")
  }

  let out = `${schemePrefix(spec)}${parts.type}${FIELD}${locator}`

  const qualifiers = parts.qualifiers ?? []
  if (!Array.isArray(qualifiers)) {
    refuse(spec, "state", "qualifiers must be an array of pairs")
  }
  if (qualifiers.length > 0) {
    const pairGrammar = statePairGrammar(spec)
    const rendered: string[] = []
    for (const entry of qualifiers) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") {
        refuse(spec, "state", "a qualifier is a [key, value] pair with a string key")
      }
      const [key, value] = entry
      let encoded: string
      if (typeof value === "string") {
        if (value.startsWith(schemePrefix(spec)) || containsAny(value, separators)) {
          refuse(spec, key, "a nested identifier is passed as { nested }, never as a plain string")
        }
        encoded = value
      } else if (isRecord(value) && typeof value.nested === "string") {
        const form = nestingForm(spec, key)
        if (!form) {
          refuse(spec, key, "this qualifier declares no nesting form")
        }
        encoded = encodeReserved(value.nested, tableFor(spec, form))
      } else {
        refuse(spec, key, "a qualifier value is a string or { nested: string }")
      }
      const rendering = `${key}${PAIR}${encoded}`
      if (!pairGrammar.test(rendering)) {
        refuse(spec, key, "the key does not fit the pair grammar")
      }
      rendered.push(rendering)
    }
    out += `${spec.grammar.state.separator}${rendered.join(spec.grammar.state.separator)}`
  }

  let wantedPath: string | undefined
  let wantedRefinements: Pair[] = []
  if (parts.fragment !== undefined) {
    const separator = spec.grammar.fragment.separator
    if (typeof parts.fragment === "string") {
      wantedPath = parts.fragment
    } else if (isRecord(parts.fragment) && typeof parts.fragment.path === "string") {
      wantedPath = parts.fragment.path
      wantedRefinements = parts.fragment.refinements ?? []
      if (!Array.isArray(wantedRefinements)) {
        refuse(spec, "fragment", "refinements must be an array of pairs")
      }
    } else {
      refuse(spec, "fragment", "a fragment is a string or { path, refinements }")
    }
    if (wantedPath === "" || containsAny(wantedPath, [separator, ...LINE_BREAKS])) {
      refuse(spec, "fragment", "a declared-name path cannot be empty or carry the refinement separator")
    }
    for (const entry of wantedRefinements) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") {
        refuse(spec, "fragment", "a refinement is a [key, value] pair of strings")
      }
      if (containsAny(entry[1], [separator, ...LINE_BREAKS])) {
        refuse(spec, entry[0], "a refinement value cannot carry the separator")
      }
    }
    out += `${FRAGMENT_INTRODUCER}${wantedPath}`
    if (wantedRefinements.length > 0) {
      out += `${separator}${wantedRefinements.map(([key, value]) => `${key}${PAIR}${value}`).join(separator)}`
    }
  }

  // The last word is the grammar's: what was built must decompose to exactly what was asked.
  if (!topLevelGrammar(spec).test(out)) {
    refuse(spec, "grammar", "the assembled string does not match the grammar")
  }
  const check = parse(out)
  if (check.status === status(spec, "malformed")) {
    refuse(spec, check.part ?? "grammar", "the assembled string is malformed")
  }
  if (check.explicitVersion || check.type !== parts.type) {
    refuse(spec, "type", "the type re-split into other parts")
  }
  if (check.locator !== locator) {
    refuse(spec, "locator", "the locator re-split into other parts")
  }
  if (check.qualifiers.length !== qualifiers.length) {
    refuse(spec, "state", "a qualifier re-split into other parts")
  }
  if ((check.fragment?.path ?? undefined) !== wantedPath || (check.fragment?.refinements.length ?? 0) !== wantedRefinements.length) {
    refuse(spec, "fragment", "the fragment re-split into other parts")
  }
  return out
}
