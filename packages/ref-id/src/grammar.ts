// SPDX-License-Identifier: Apache-2.0
//
// Builds the RegExp objects the spec declares — the top-level grammar, the state-pair grammar
// and the fragment-pair grammar — and holds the only structural literals this package writes.

import { SpecVersionError, type RefIdSpec } from "./spec.ts"

/**
 * The structural literals of the scheme, each written exactly once, here. Their source is
 * `spec.grammar.expression`: the field separator after the scheme, the version and the type; the
 * fragment introducer; and the line breaks the character classes exclude. `assertStructure` checks
 * the expression really carries them, so a spec that moved them is refused rather than misread.
 */
export const FIELD = ":"
export const FRAGMENT_INTRODUCER = "#"
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
  const carries = [`^${schemePrefix(spec)}`, FRAGMENT_INTRODUCER, "\\r", "\\n"]
  for (const literal of carries) {
    if (!expression.includes(literal)) {
      throw new SpecVersionError(`spec.grammar.expression does not carry ${JSON.stringify(literal)}; this package's structural literals do not match`)
    }
  }
  checked.add(spec)
}

/**
 * Applies the dialect's declared adaptations to an expression string, then compiles it. Every
 * `adaptations[dialect].replace` pair is applied in order — for `ecmascript-2018` that list is
 * empty, so the expression compiles unchanged.
 */
function compile(expression: string, dialect: string, adaptations: RefIdSpec["grammar"]["adaptations"]): RegExp {
  const replacements = adaptations[dialect]?.replace ?? []
  let adapted = expression
  for (const [from, to] of replacements) {
    adapted = adapted.split(from).join(to)
  }
  return new RegExp(adapted)
}

const compiled = new WeakMap<RefIdSpec, { top: RegExp; statePair: RegExp; fragmentPair: RegExp }>()

function grammars(spec: RefIdSpec) {
  let entry = compiled.get(spec)
  if (!entry) {
    assertStructure(spec)
    entry = {
      top: compile(spec.grammar.expression, spec.grammar.dialect, spec.grammar.adaptations),
      statePair: new RegExp(spec.grammar.state.pair),
      fragmentPair: new RegExp(spec.grammar.fragment.pair),
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
