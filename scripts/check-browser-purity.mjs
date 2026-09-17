#!/usr/bin/env node
/**
 * Proves, over the built artifact rather than by reading source, that the browser build's module
 * graph reaches no Node builtin and no `import.meta.url` (Plan-004, Track 2).
 *
 * WHY THE WHOLE CLOSURE AND NOT ONE FILE. `tsc` emits one module per source file, so
 * `dist/index.browser.js` is a handful of re-export lines: grepping it alone for `node:` returns 0
 * whatever the rest of the graph imports, which is a check that passes by construction. A bundler
 * does not stop at the entry point, so neither does this. The plan's own success criterion
 * (`grep -c "node:" dist/index.browser.js` → 0) stays true and is checked here as well; it is the
 * floor, not the guarantee.
 *
 * WHY A RESOLVER RATHER THAN A BUNDLER. Running a real bundler would be the strongest possible check
 * and would cost a devDependency with a native binary, which this repository's guardrails refuse. So
 * the walk resolves the way a bundler does — relative specifiers against the file, bare specifiers
 * through node_modules with the `browser` condition ahead of `import` — and reports what it could not
 * resolve rather than skipping it, because a specifier silently dropped is the same false green.
 *
 *   node scripts/check-browser-purity.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(ROOT, 'packages/ref-id/dist/index.browser.js')

/** The conditions a browser bundler applies, in the order it applies them. */
const CONDITIONS = ['browser', 'import', 'module', 'default']

/**
 * Removes comments, leaving strings, template literals and regex literals intact.
 *
 * This is not fastidiousness: the first run of this checker failed on its own entry point, because
 * `index.browser.ts`'s header comment contains the words `import.meta.url` while explaining that the
 * module does not use it. A checker that reads prose as code reports a defect that is not there, and
 * would just as happily miss one that is. Stripping cannot be a regex either — the compiled spec
 * constant is one enormous JSON string full of `//` inside URLs — so this walks the source in the
 * four states that matter.
 */
function stripComments(source) {
  let out = ''
  let state = 'code'
  let lastSignificant = ''
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (state === 'code') {
      if (char === '/' && next === '/') { state = 'line'; index += 1; out += ' '; continue }
      if (char === '/' && next === '*') { state = 'block'; index += 1; out += ' '; continue }
      if (char === '"' || char === "'" || char === '`') { state = char; out += char; continue }
      // A `/` opens a regex literal only where a value may begin; after an identifier or a closing
      // bracket it is division. The distinction matters because a regex may contain a quote.
      if (char === '/' && /[(,=:[!&|?{};+\-*%~^]/.test(lastSignificant)) { state = 'regex'; out += char; continue }
      out += char
      if (!/\s/.test(char)) lastSignificant = char
      continue
    }
    if (state === 'line') {
      if (char === '\n') { state = 'code'; out += char }
      continue
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; index += 1; out += ' ' }
      continue
    }
    // Inside a string, a template or a regex: copy through, honouring the escape.
    out += char
    if (char === '\\') { out += source[index + 1] ?? ''; index += 1; continue }
    if (state === 'regex' ? char === '/' : char === state) { state = 'code'; lastSignificant = char }
  }
  return out
}

/**
 * Every specifier a module imports: static `import`/`export ... from`, and `import()` with a string
 * literal. A regex over comment-stripped source rather than a parser, because the input is `tsc`
 * output, whose shape is not a matter of taste — and a dynamic `import()` with a computed specifier
 * is reported below rather than ignored, since that is exactly where a builtin could hide.
 */
function specifiers(code) {
  const found = new Set()
  const source = code
  for (const match of source.matchAll(/(?:^|[\s;}])(?:import|export)\s[^'"()]*?from\s*['"]([^'"]+)['"]/g)) {
    found.add(match[1])
  }
  for (const match of source.matchAll(/(?:^|[\s;}=(])import\s*['"]([^'"]+)['"]/g)) {
    found.add(match[1])
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.add(match[1])
  }
  // CommonJS, followed for the same reason as the rest: `packageurl-js` is CJS, so a walk that reads
  // only ESM syntax stopped at its `index.js` and never saw the fourteen modules it requires. It
  // reported a clean closure of 21 modules — a pass produced by not looking, which is the shape of
  // failure this whole file exists to refuse.
  for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.add(match[1])
  }
  const computed = [...source.matchAll(/\bimport\s*\(\s*(?!['"])/g)].length
    + [...source.matchAll(/\brequire\s*\(\s*(?!['"])/g)].length
  return { found: [...found], computed }
}

/** Picks the first matching condition out of an `exports` subtree, the way a bundler does. */
function pickCondition(node) {
  if (typeof node === 'string') return node
  if (node === null || typeof node !== 'object') return undefined
  for (const condition of CONDITIONS) {
    if (Object.hasOwn(node, condition)) {
      const picked = pickCondition(node[condition])
      if (picked) return picked
    }
  }
  return undefined
}

/** Resolves a bare specifier through node_modules, honouring `exports` and the browser condition. */
function resolveBare(specifier, fromDir) {
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  const subpath = `.${specifier.slice(name.length)}` === '.' ? '.' : `.${specifier.slice(name.length)}`

  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) {
      const manifest = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'))
      if (manifest.exports) {
        const entry = typeof manifest.exports === 'string' || !Object.keys(manifest.exports).some((key) => key.startsWith('.'))
          ? (subpath === '.' ? pickCondition(manifest.exports) : undefined)
          : pickCondition(manifest.exports[subpath])
        if (entry) return join(candidate, entry)
      }
      if (subpath !== '.') return withExtension(join(candidate, subpath))
      if (typeof manifest.browser === 'string') return join(candidate, manifest.browser)
      return withExtension(join(candidate, manifest.module ?? manifest.main ?? 'index.js'))
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function withExtension(path) {
  if (existsSync(path) && statSync(path).isFile()) return path
  for (const suffix of ['.js', '.mjs', '.cjs', '/index.js', '/index.cjs']) {
    if (existsSync(path + suffix)) return path + suffix
  }
  return path
}

const builtins = []
const metaUrls = []
const unresolved = []
const computedImports = []
const seen = new Set()
const queue = [ENTRY]

if (!existsSync(ENTRY)) {
  console.error(`check-browser-purity: ${ENTRY} does not exist — run \`npm run build\` first.`)
  process.exit(1)
}

while (queue.length > 0) {
  const file = queue.pop()
  if (seen.has(file)) continue
  seen.add(file)

  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    unresolved.push({ file, specifier: '(unreadable)' })
    continue
  }

  const code = stripComments(source)

  // `import.meta.url` resolves a path against the module's own location, which a bundled browser
  // module has no meaningful version of. It is checked per file for the same reason `node:` is, and
  // against the stripped source for the same reason too.
  if (/\bimport\.meta\.url\b/.test(code)) {
    metaUrls.push(file)
  }

  const { found, computed } = specifiers(code)
  if (computed > 0) computedImports.push({ file, count: computed })

  for (const specifier of found) {
    if (specifier.startsWith('node:') || (!specifier.startsWith('.') && !specifier.startsWith('/') && isBuiltinName(specifier))) {
      builtins.push({ file, specifier })
      continue
    }
    const resolved = specifier.startsWith('.')
      ? withExtension(resolve(dirname(file), specifier))
      : resolveBare(specifier, dirname(file))
    if (!resolved || !existsSync(resolved)) {
      unresolved.push({ file, specifier })
      continue
    }
    queue.push(resolved)
  }
}

/** A builtin named without the `node:` prefix — still a builtin, and still absent from a browser. */
function isBuiltinName(specifier) {
  return process.getBuiltinModule !== undefined && process.getBuiltinModule(specifier) !== undefined
}

const relative = (file) => file.replace(`${ROOT}/`, '')
let failed = false

for (const { file, specifier } of builtins) {
  console.error(`FAIL a Node builtin reaches the browser build: ${relative(file)} imports "${specifier}"`)
  failed = true
}
for (const file of metaUrls) {
  console.error(`FAIL import.meta.url reaches the browser build: ${relative(file)}`)
  failed = true
}
for (const { file, specifier } of unresolved) {
  console.error(`FAIL could not resolve "${specifier}" from ${relative(file)} — the walk is incomplete, so this is not a pass`)
  failed = true
}
for (const { file, count } of computedImports) {
  console.error(`FAIL ${relative(file)} has ${count} import()/require() with a computed specifier — this walk cannot follow it`)
  failed = true
}

if (failed) {
  process.exit(1)
}

if (process.env.VERBOSE === '1') {
  for (const file of [...seen].sort()) {
    console.log(`  ${relative(file)}`)
  }
}

console.log(`browser purity: ${seen.size} modules reachable from dist/index.browser.js, no node: specifier, no import.meta.url`)
