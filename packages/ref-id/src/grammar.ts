// SPDX-License-Identifier: Apache-2.0
//
// Compiles every pattern the spec declares — the top-level grammar, the two pair grammars, and any
// form, dispatch or refinement pattern — through the dialect's declared adaptations, and holds the
// only structural literals this package writes.

import { SpecVersionError, type RefIdSpec } from "./spec.ts"

/**
 * The structural literals of the scheme, each written exactly once, here. Their sources are
 * `spec.grammar.expression` (the field separator after the scheme, the version and the type; the
 * fragment introducer; the line breaks the character classes exclude) and the two pair grammars (the
 * key/value separator). `assertStructure` checks the patterns really carry them, so a spec that moved
 * them is refused rather than misread.
 */
export const FIELD = ":"
export const FRAGMENT_INTRODUCER = "#"
export const PAIR = "="
export const LINE_BREAKS = ["\r", "\n"] as const

/** `ref:` — the scheme name from the spec followed by the field separator. */
export function schemePrefix(spec: RefIdSpec): string {
  return `${spec.scheme}${FIELD}`
}

const checked = new WeakSet<RefIdSpec>()

function assertStructure(spec: RefIdSpec): void {
  if (checked.has(spec)) {
    return
  }
  const expression = spec.grammar.expression
  for (const literal of [`^${schemePrefix(spec)}`, FRAGMENT_INTRODUCER, "\\r", "\\n"]) {
    if (!expression.includes(literal)) {
      throw new SpecVersionError(`spec.grammar.expression does not carry ${JSON.stringify(literal)}; this package's structural literals do not match`)
    }
  }
  for (const pair of [spec.grammar.state.pair, spec.grammar.fragment.pair]) {
    if (!pair.includes(`)${PAIR}(`)) {
      throw new SpecVersionError(`a pair grammar does not separate key and value with ${JSON.stringify(PAIR)}; this package's structural literals do not match`)
    }
  }
  checked.add(spec)
}

/**
 * Compiles one pattern string for the spec's declared dialect: every `adaptations[dialect].replace`
 * pair is applied in order — for `ecmascript-2018` the list is empty, so the pattern compiles
 * unchanged. A port applies its own dialect's list to every pattern in the file the same way.
 */
export function compilePattern(spec: RefIdSpec, pattern: string): RegExp {
  const replacements = spec.grammar.adaptations[spec.grammar.dialect]?.replace ?? []
  let adapted = pattern
  for (const [from, to] of replacements) {
    adapted = adapted.split(from).join(to)
  }
  return new RegExp(adapted)
}

const compiled = new WeakMap<RefIdSpec, { top: RegExp; statePair: RegExp; fragmentPair: RegExp; others: Map<string, RegExp> }>()

function grammars(spec: RefIdSpec) {
  let entry = compiled.get(spec)
  if (!entry) {
    assertStructure(spec)
    entry = {
      top: compilePattern(spec, spec.grammar.expression),
      statePair: compilePattern(spec, spec.grammar.state.pair),
      fragmentPair: compilePattern(spec, spec.grammar.fragment.pair),
      others: new Map(),
    }
    compiled.set(spec, entry)
  }
  return entry
}

/** The top-level `ref:` grammar, compiled for the spec's declared dialect. */
export function topLevelGrammar(spec: RefIdSpec): RegExp {
  return grammars(spec).top
}

/** The `key=value` grammar for one qualifier (state) pair. */
export function statePairGrammar(spec: RefIdSpec): RegExp {
  return grammars(spec).statePair
}

/** The `key=value` grammar for one refinement pair. */
export function fragmentPairGrammar(spec: RefIdSpec): RegExp {
  return grammars(spec).fragmentPair
}

/** Any other pattern the spec declares (a form, a dispatch entry, a refinement), compiled once and cached. */
export function pattern(spec: RefIdSpec, source: string): RegExp {
  const cache = grammars(spec).others
  let regexp = cache.get(source)
  if (!regexp) {
    regexp = compilePattern(spec, source)
    cache.set(source, regexp)
  }
  return regexp
}
