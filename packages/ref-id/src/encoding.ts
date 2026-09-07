// SPDX-License-Identifier: Apache-2.0
//
// Percent-encode/decode helpers driven by an `encoding.<name>.table` from the spec — never a
// hardcoded character list. Which table applies to a form is the form's own `encoding` field.

import type { RefIdSpec } from "./spec.ts"

/** The encoding table a form declares, or none when the form declares no encoding. */
export function tableFor(spec: RefIdSpec, form: { encoding?: string }): Record<string, string> {
  if (!form.encoding) {
    return {}
  }
  return spec.encoding[form.encoding]?.table ?? {}
}

/** True when `raw` contains any of the given characters. */
export function containsAny(raw: string, characters: readonly string[]): boolean {
  return characters.some((character) => raw.includes(character))
}

/**
 * Encodes each reserved character in `raw` to its declared percent-form, in one left-to-right
 * pass over the *source* characters (so a percent-form produced by this pass is never itself
 * re-scanned).
 */
export function encodeReserved(raw: string, table: Record<string, string>): string {
  if (Object.keys(table).length === 0) {
    return raw
  }
  let out = ""
  for (const char of raw) {
    out += table[char] ?? char
  }
  return out
}

/**
 * Decodes each percent-form declared in `table` back to its single character, in one
 * left-to-right pass over `encoded` (so decoding `%2523` yields `%23`, never `#`).
 */
export function decodeReserved(encoded: string, table: Record<string, string>): string {
  const forms = Object.values(table)
  if (forms.length === 0) {
    return encoded
  }
  const reverse = new Map<string, string>()
  for (const [char, form] of Object.entries(table)) {
    reverse.set(form, char)
  }
  const pattern = new RegExp(forms.map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g")
  return encoded.replace(pattern, (match) => reverse.get(match) ?? match)
}
