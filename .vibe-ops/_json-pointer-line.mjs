// SPDX-License-Identifier: Apache-2.0
/**
 * Map a JSON Pointer into a JSON document's own source text to the 1-based line where its value
 * begins. Dependency-free, so every gate under `.vibe-ops/` stays a plain module: no `JSONC`/AST
 * library, just a location-tracking recursive-descent parse of the same grammar `JSON.parse` accepts.
 *
 * Best effort. A pointer this cannot resolve — a malformed document, a token that names nothing, a
 * numeric array index out of range — returns `undefined` rather than throwing; the caller then omits
 * `line` from its finding and keeps the pointer, which is always exact.
 */

/**
 * @param {string} text the raw JSON source
 * @param {string} pointer a JSON Pointer (`""` for the whole document, `/a/b/0` otherwise)
 * @returns {number | undefined}
 */
export function pointerToLine(text, pointer) {
  try {
    const start = locate(text, pointer)
    if (start === undefined) return undefined
    return text.slice(0, start).split("\n").length
  } catch {
    return undefined
  }
}

function locate(text, pointer) {
  const tokens = pointer === "" ? [] : pointer.split("/").slice(1).map(decodeToken)
  const len = text.length
  let i = 0

  const skipWs = () => {
    while (i < len && /\s/.test(text[i])) i++
  }

  const skipString = () => {
    i++ // opening quote
    while (i < len) {
      if (text[i] === "\\") {
        i += 2
        continue
      }
      if (text[i] === '"') {
        i++
        return
      }
      i++
    }
    throw new Error("unterminated string")
  }

  const parseValue = () => {
    skipWs()
    const valueStart = i
    const ch = text[i]
    if (ch === "{") return parseObject(valueStart)
    if (ch === "[") return parseArray(valueStart)
    if (ch === '"') {
      skipString()
      return { start: valueStart }
    }
    if (ch === undefined) throw new Error("unexpected end of input")
    // number, true, false, null — read until a structural character or whitespace ends it
    while (i < len && !",}] \t\n\r".includes(text[i])) i++
    if (i === valueStart) throw new Error(`unexpected character ${JSON.stringify(ch)}`)
    return { start: valueStart }
  }

  const parseObject = (objectStart) => {
    const members = {}
    i++ // '{'
    skipWs()
    if (text[i] === "}") {
      i++
      return { start: objectStart, members }
    }
    for (;;) {
      skipWs()
      if (text[i] !== '"') throw new Error("expected an object key")
      const keyStart = i
      skipString()
      const key = JSON.parse(text.slice(keyStart, i))
      skipWs()
      if (text[i] !== ":") throw new Error("expected ':'")
      i++
      members[key] = parseValue()
      skipWs()
      if (text[i] === ",") {
        i++
        continue
      }
      if (text[i] === "}") {
        i++
        break
      }
      throw new Error("expected ',' or '}'")
    }
    return { start: objectStart, members }
  }

  const parseArray = (arrayStart) => {
    const items = []
    i++ // '['
    skipWs()
    if (text[i] === "]") {
      i++
      return { start: arrayStart, items }
    }
    for (;;) {
      items.push(parseValue())
      skipWs()
      if (text[i] === ",") {
        i++
        continue
      }
      if (text[i] === "]") {
        i++
        break
      }
      throw new Error("expected ',' or ']'")
    }
    return { start: arrayStart, items }
  }

  let node = parseValue()
  for (const token of tokens) {
    if (node.members !== undefined) {
      if (!(token in node.members)) return undefined
      node = node.members[token]
      continue
    }
    if (node.items !== undefined) {
      const index = Number(token)
      if (!Number.isInteger(index) || node.items[index] === undefined) return undefined
      node = node.items[index]
      continue
    }
    return undefined
  }
  return node.start
}

function decodeToken(token) {
  return token.replaceAll("~1", "/").replaceAll("~0", "~")
}
