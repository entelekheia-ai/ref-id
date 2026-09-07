// SPDX-License-Identifier: Apache-2.0
//
// Decomposes a `ref:` identifier string against the loaded spec. Order of validation and
// delegation to owning validators is the behaviour ADR-0001 keeps in code; every table, pattern
// and key it consults comes from the spec object, never restated here.
//
// Order, and the precedence it produces: grammar → version → state and fragment decomposition →
// (unsupported version stops here, decomposed and unvalidated) → the two sides must not trade
// keys → qualifier values against their forms → refinement values against their patterns →
// dispatch: unknown type is `uncovered`, else the locator goes to its validator. So a validator
// failure (`malformed` with the part) outranks `uncovered`, which outranks `ok`.

import { decodeReserved, tableFor } from "./encoding.ts"
import { fragmentPairGrammar, schemePrefix, statePairGrammar, topLevelGrammar } from "./grammar.ts"
import { loadSpec, status, type RefIdSpec } from "./spec.ts"
import type { Pair, ParsedFragment, ParseResult } from "./types.ts"
import { delegatedString, validateLocator } from "./validators.ts"

function malformed(spec: RefIdSpec, input: string, part: string, base: Partial<ParseResult>): ParseResult {
  const result: ParseResult = {
    input,
    status: status(spec, "malformed"),
    version: base.version ?? spec.version.default,
    explicitVersion: base.explicitVersion ?? false,
    type: base.type ?? "",
    locator: base.locator ?? "",
    qualifiers: base.qualifiers ?? [],
    fragment: base.fragment ?? null,
    part,
  }
  if (base.versionText !== undefined) {
    result.versionText = base.versionText
  }
  return result
}

type Decomposed<T> = { ok: true; value: T } | { ok: false }

function decomposeState(spec: RefIdSpec, raw: string): Decomposed<Pair[]> {
  const pairGrammar = statePairGrammar(spec)
  const qualifiers: Pair[] = []
  for (const segment of raw.split(spec.grammar.state.separator)) {
    const match = pairGrammar.exec(segment)
    if (!match?.groups) {
      return { ok: false }
    }
    qualifiers.push([match.groups.key ?? "", match.groups.value ?? ""])
  }
  return { ok: true, value: qualifiers }
}

function decomposeFragment(spec: RefIdSpec, raw: string): Decomposed<ParsedFragment> {
  const pairGrammar = fragmentPairGrammar(spec)
  const segments = raw.split(spec.grammar.fragment.separator)
  const path = segments[0] ?? ""
  if (path === "") {
    return { ok: false }
  }
  const refinements: Pair[] = []
  for (const segment of segments.slice(1)) {
    const match = pairGrammar.exec(segment)
    if (!match?.groups) {
      return { ok: false }
    }
    refinements.push([match.groups.key ?? "", match.groups.value ?? ""])
  }
  return { ok: true, value: { path, refinements } }
}

/** A qualifier value that nests an identifier: decoded with the form's table and parsed one level down. */
function tryNested(spec: RefIdSpec, form: RefIdSpec["forms"][string], value: string, depth: number): string | undefined {
  const maxDepth = form.depth ?? 0
  if (depth >= maxDepth || !value.startsWith(schemePrefix(spec))) {
    return undefined
  }
  const decoded = decodeReserved(value, tableFor(spec, form))
  const inner = parseInternal(spec, decoded, depth + 1)
  // A nested identifier stays readable whatever its type or version; only a malformed one is refused.
  return inner.status === status(spec, "malformed") ? undefined : decoded
}

function matchForms(
  spec: RefIdSpec,
  formNames: readonly string[],
  value: string,
  depth: number,
): { matches: false } | { matches: true; nested?: string } {
  for (const formName of formNames) {
    const form = spec.forms[formName]
    if (!form) {
      continue
    }
    if (form.nested) {
      const nested = tryNested(spec, form, value, depth)
      if (nested !== undefined) {
        return { matches: true, nested }
      }
      continue
    }
    if (form.pattern && new RegExp(form.pattern).test(value)) {
      return { matches: true }
    }
  }
  return { matches: false }
}

/** The extra constraint a refinement declares beyond its pattern. An unknown constraint name is not enforced here. */
const ranges: Record<string, (value: string) => boolean> = {
  ascending: (value) => {
    const bounds = value.split(",").map(Number)
    return bounds.length < 2 || (bounds[0] ?? 0) <= (bounds[1] ?? 0)
  },
}

function parseInternal(spec: RefIdSpec, input: string, depth: number): ParseResult {
  const match = topLevelGrammar(spec).exec(input)
  if (!match?.groups) {
    return malformed(spec, input, "grammar", {})
  }
  const { version: versionText, type = "", locator = "", state, fragment: fragmentRaw } = match.groups

  const explicitVersion = versionText !== undefined
  const version = explicitVersion ? Number(versionText) : spec.version.default
  const head: Partial<ParseResult> = { version, explicitVersion, type, locator }
  if (explicitVersion) {
    head.versionText = versionText
  }

  let qualifiers: Pair[] = []
  if (state !== undefined) {
    const decomposed = decomposeState(spec, state)
    if (!decomposed.ok) {
      return malformed(spec, input, "state", head)
    }
    qualifiers = decomposed.value
  }
  head.qualifiers = qualifiers

  let fragment: ParsedFragment | null = null
  if (fragmentRaw !== undefined) {
    const decomposed = decomposeFragment(spec, fragmentRaw)
    if (!decomposed.ok) {
      return malformed(spec, input, "fragment", head)
    }
    fragment = decomposed.value
  }
  head.fragment = fragment

  const base: ParseResult = {
    input,
    status: status(spec, "ok"),
    version,
    explicitVersion,
    type,
    locator,
    qualifiers,
    fragment,
  }
  if (explicitVersion) {
    base.versionText = versionText
  }
  const delegated = delegatedString(spec, type, locator)
  if (delegated !== undefined) {
    base.delegated = delegated
  }

  if (!spec.version.supported.includes(version)) {
    return { ...base, status: status(spec, "unsupported") }
  }

  // Qualifiers say which state; refinements say which part. The two sides never trade contents.
  for (const [key] of qualifiers) {
    if (Object.hasOwn(spec.refinements, key)) {
      return malformed(spec, input, key, head)
    }
  }
  if (fragment) {
    for (const [key] of fragment.refinements) {
      if (Object.hasOwn(spec.qualifiers, key)) {
        return malformed(spec, input, key, head)
      }
    }
  }

  const nested: Record<string, string> = {}
  for (const [key, value] of qualifiers) {
    const declared = spec.qualifiers[key]
    if (!declared) {
      continue // an unknown key is carried through, untouched
    }
    const result = matchForms(spec, declared.forms, value, depth)
    if (!result.matches) {
      return malformed(spec, input, key, head)
    }
    if (result.nested !== undefined) {
      nested[key] = result.nested
    }
  }
  if (Object.keys(nested).length > 0) {
    base.nested = nested
  }

  if (fragment) {
    for (const [key, value] of fragment.refinements) {
      const declared = spec.refinements[key]
      if (!declared) {
        continue
      }
      if (!new RegExp(declared.pattern).test(value)) {
        return malformed(spec, input, key, head)
      }
      const range = declared.range ? ranges[declared.range] : undefined
      if (range && !range(value)) {
        return malformed(spec, input, key, head)
      }
    }
  }

  const entry = spec.dispatch[type]
  if (!entry || delegated === undefined) {
    return { ...base, status: spec.unknownType }
  }
  const validation = validateLocator(entry, delegated)
  if (validation === undefined) {
    return { ...base, status: spec.unknownType } // a validator this package does not implement
  }
  if (!validation.ok) {
    return malformed(spec, input, "locator", head)
  }
  if (validation.canonical !== undefined) {
    base.canonical = validation.canonical
  }
  return base
}

/** Parses a `ref:` identifier string against the loaded spec. Never throws for an identifier problem. */
export function parse(input: string): ParseResult {
  const spec = loadSpec()
  if (typeof input !== "string") {
    return malformed(spec, String(input), "grammar", {})
  }
  return parseInternal(spec, input, 0)
}
