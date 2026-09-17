// SPDX-License-Identifier: Apache-2.0
//
// Resolves what is deterministic about a `ref:` identifier and refuses, by name, what needs a
// judgement. Every refusal carries the evidence that produced it, so the caller answers that one
// question instead of re-deriving the whole problem. Tables, patterns and statuses come from
// `spec/ref-id.json` through the package; none of them is restated here.

import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "../../../..")

/** `loadSpec()` reads the copy beside the package, which the build step mirrors and git ignores. */
function mirrorSpec(): void {
  const dest = join(ROOT, "packages/ref-id/spec")
  mkdirSync(dest, { recursive: true })
  for (const name of ["ref-id.json", "ref-id.json.sha256"]) {
    copyFileSync(join(ROOT, "spec", name), join(dest, name))
  }
}

mirrorSpec()
const refId = await import(join(ROOT, "packages/ref-id/src/index.ts"))
const spec = refId.loadSpecFrom(join(ROOT, "spec"))

type Refusal = { refusal: string; because: string; evidence: Record<string, unknown> }
type Corpus = { type: string; locator: string; manifest: string; dir: string }

function refuse(refusal: string, because: string, evidence: Record<string, unknown> = {}): Refusal {
  return { refusal, because, evidence }
}

function emit(value: unknown): never {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  process.exit("refusal" in (value as object) ? 2 : 0)
}

function rel(path: string): string {
  return relative(ROOT, path) || "."
}

// ---------------------------------------------------------------- corpus

/** A manifest declaring workspaces excludes a file that lies under none of them. */
function npmExcludes(manifest: Record<string, unknown>, dir: string, target: string): boolean {
  const globs = manifest.workspaces
  if (!Array.isArray(globs)) {
    return false
  }
  const within = relative(dir, target)
  return !globs.some((glob) => {
    const literal = String(glob).split("*")[0]
    return within.startsWith(literal)
  })
}

function cargoName(text: string): string | undefined {
  const pkg = text.split(/^\[/m).find((section) => section.startsWith("package]"))
  return pkg?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1]
}

/** Manifests are tried in the order the target's own language suggests, then in declaration order. */
function manifestOrder(target: string): string[] {
  const all = ["package.json", "Cargo.toml", "Package.swift"]
  const first = target.endsWith(".rs") ? "Cargo.toml" : target.endsWith(".swift") ? "Package.swift" : "package.json"
  return [first, ...all.filter((name) => name !== first)]
}

function nearestCorpus(target: string): Corpus | Refusal {
  let dir = statSync(target).isDirectory() ? target : dirname(target)
  const skipped: string[] = []
  for (;;) {
    for (const name of manifestOrder(target)) {
      const path = join(dir, name)
      if (!existsSync(path)) {
        continue
      }
      const text = readFileSync(path, "utf8")
      if (name === "package.json") {
        const manifest = JSON.parse(text) as Record<string, unknown>
        if (npmExcludes(manifest, dir, target)) {
          skipped.push(`${rel(path)} (its workspaces exclude this path)`)
          continue
        }
        if (typeof manifest.name === "string") {
          return { type: "pkg", locator: `npm/${manifest.name}`, manifest: rel(path), dir }
        }
        skipped.push(`${rel(path)} (declares no name)`)
        continue
      }
      if (name === "Cargo.toml") {
        const crate = cargoName(text)
        if (crate) {
          return { type: "pkg", locator: `cargo/${crate}`, manifest: rel(path), dir }
        }
        skipped.push(`${rel(path)} (a workspace manifest, declaring no package)`)
        continue
      }
      // A Swift manifest declares no subtree of its own, so it claims only Swift sources. Without this
      // it reaches every file the npm workspaces exclude, and answers for `docs/` as readily as for a
      // module.
      const swiftScope = target.endsWith(".swift") || relative(dir, target).startsWith("Sources")
      const swift = swiftScope ? text.match(/name:\s*"([^"]+)"/)?.[1] : undefined
      if (swift) {
        return refuse(
          "manifest-not-purl-mappable",
          "a Swift package is named by its source host and organisation, which the manifest does not carry",
          { manifest: rel(path), declaredName: swift, pass: `--type pkg --locator swift/<host>/<org>/${swift}` },
        )
      }
    }
    const parent = dirname(dir)
    if (dir === ROOT || parent === dir) {
      return refuse("no-corpus", "no manifest reaching this path declares a name", {
        target: rel(target),
        skipped,
        answer: "declare a folder corpus for the subtree, then pass --type folder --locator <declared name>",
      })
    }
    dir = parent
  }
}

// ---------------------------------------------------------------- declared names

function frontMatter(text: string): string | undefined {
  return text.startsWith("---\n") ? text.slice(4).split("\n---")[0] : undefined
}

/** The declared names a file offers, with the fragment grammar each one came from. */
function candidates(target: string): { model: string; names: string[]; note?: string } {
  const text = readFileSync(target, "utf8")
  if (/\.(md|markdown)$/.test(target)) {
    const stamp = frontMatter(text)?.match(/^vibe-ops-template:\s*(\S+)/m)?.[1]
    if (stamp) {
      return {
        model: "governed-record",
        names: [],
        note: `stamped ${stamp}; the provider of that type declares the form of the name, and the file does not carry it`,
      }
    }
    const headings = [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((match) => match[1])
    return { model: "markdown", names: headings }
  }
  if (/\.(ts|tsx|mts|js|mjs|jsx)$/.test(target)) {
    const symbols = [...text.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|type|interface|enum)\s+(\w+)/gm)]
    return { model: "code-symbol", names: symbols.map((match) => match[1]) }
  }
  if (target.endsWith(".behavior")) {
    const states = [...text.matchAll(/^\s*state\s+(\w+)/gm)].map((match) => match[1])
    return { model: "behavior-state", names: states, note: "a state is named within its agent, never within its file" }
  }
  return { model: "unknown", names: [], note: `no fragment grammar covers ${target.split(".").pop()}` }
}

// ---------------------------------------------------------------- where a file is named from

/**
 * Whether the package manager ships this file, and at which version — asked of the manager itself.
 *
 * `npm pack --dry-run --json` lists exactly what a publish would upload, so the `files` field, the
 * ignore files and every default npm applies are answered by npm rather than re-implemented here. A
 * re-implementation is the drift this script exists to avoid, and it would be wrong in the direction
 * that matters: a file this says is shipped, and is not, mints an identifier that resolves to nothing.
 *
 * Only npm is asked. A crate would need `cargo package --list` and a Swift package has no equivalent,
 * so both fall through to the tree, which is correct rather than merely convenient — a file nobody
 * publishes is named by where it was declared, never by a release it is absent from.
 */
function publishedAs(corpus: Corpus, target: string): { version: string; path: string } | undefined {
  if (!corpus.locator.startsWith("npm/")) return undefined
  const wanted = relative(corpus.dir, target)
  try {
    const out = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: corpus.dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    const packed = (JSON.parse(out) as { version?: string; files?: { path: string }[] }[])[0]
    if (!packed?.version || !packed.files?.some((file) => file.path === wanted)) return undefined
    return { version: packed.version, path: wanted }
  } catch {
    return undefined
  }
}

/**
 * The name a subtree declares for itself, nearest ancestor winning — the one line
 * `dispatch.folder.declaredBy` has always described and nothing has ever read.
 *
 * A `.ref-id` file holds that name and nothing else. It is a declaration rather than a derivation, so
 * moving the subtree does not rename what is inside it, which is the whole reason identity is not a
 * path. Blank lines and `#` comments are skipped; the first remaining line is the name.
 */
function declaredCorpus(from: string): { name: string; root: string; declaredIn: string } | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const path = join(dir, ".ref-id")
    if (existsSync(path)) {
      const name = readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("#"))
      if (name) return { name, root: dir, declaredIn: rel(path) }
    }
    if (dir === ROOT || dirname(dir) === dir) return undefined
  }
}

/**
 * The corpus name a `folder` locator carries, for a file the package manager does not ship.
 *
 * A declaration wins over a derivation, so `.ref-id` is consulted before the manifest. A scoped package
 * name (`@acme/tools`) does not fit the declared-name pattern, and shortening it to its last segment
 * would make two scopes collide under one corpus — so with no declaration to fall back on, this refuses
 * and names the file to write, rather than choosing between two wrong names.
 */
function folderCorpus(target: string, corpus?: Corpus): { locator: string } | Refusal {
  const declared = declaredCorpus(corpus?.dir ?? dirname(target))
  const name = declared?.name ?? corpus?.locator.replace(/^(npm|cargo)\//, "") ?? ""
  // The path runs from whatever declared the name, never from somewhere else — a path measured from the
  // manifest while the name came from an ancestor drops the segments between them, and two files with
  // the same name in two packages collide under one identifier. That collision is what this plan exists
  // to remove, so it is worth the extra line here.
  const path = relative(declared?.root ?? corpus?.dir ?? dirname(target), target)
  const candidate = `${name}/${path}`
  return refId.parse(`ref:folder:${candidate}`).status === "ok"
    ? { locator: candidate }
    : refuse("corpus-undeclared", "no subtree reaching this file declares a name a corpus can carry", {
        manifest: corpus?.manifest,
        triedName: name,
        declaredIn: declared?.declaredIn,
        pattern: spec.dispatch.folder.pattern,
        answer: `write the corpus name into a .ref-id file at the subtree root, or pass --type folder --locator <corpus>/${path}`,
      })
}

// ---------------------------------------------------------------- modes

function mint(args: Map<string, string[]>): never {
  let type = args.get("type")?.[0]
  let locator = args.get("locator")?.[0]
  const fragment = args.get("fragment")?.[0]
  const qualifiers = (args.get("qualifier") ?? []).map((pair) => {
    const at = pair.indexOf("=")
    return [pair.slice(0, at), pair.slice(at + 1)] as [string, string]
  })
  const path = args.get("path")?.[0]

  if (path) {
    const target = resolve(ROOT, path)
    if (!existsSync(target)) {
      emit(refuse("no-such-path", "nothing is at that path", { target: path }))
    }
    // A manifest is how a released artifact is found, not how a corpus is. A subtree that declares its
    // own name is a corpus with no manifest anywhere above it — documentation beside a package, a
    // repository that publishes nothing — so a manifest that reaches nothing is only fatal when no
    // declaration reaches the file either.
    const resolved = nearestCorpus(target)
    const corpus = "refusal" in resolved ? undefined : resolved
    if (!corpus && !declaredCorpus(dirname(target))) {
      emit(resolved)
    }
    type ??= corpus?.type ?? "folder"
    locator ??= corpus?.locator ?? ""
    // `--corpus` names the package itself and stays unversioned, so a record's identifier survives the
    // releases it sits through. A file is the other act: the locator continues into the corpus and
    // reaches the file, and where it continues from is what the two branches below decide.
    if (!args.has("corpus") && !statSync(target).isDirectory() && !args.get("locator")) {
      const shipped = corpus && publishedAs(corpus, target)
      if (corpus && shipped) {
        type = "pkg"
        locator = `${corpus.locator}@${shipped.version}/${shipped.path}`
      } else {
        const named = folderCorpus(target, corpus)
        if ("refusal" in named) {
          emit(named)
        }
        type = "folder"
        locator = named.locator
      }
    }
    if (!fragment && !args.has("corpus")) {
      const found = candidates(target)
      emit(
        refuse("target-undeclared", "the corpus resolved; which declared name inside it is the target is undecided", {
          corpus: `${corpus.type}:${corpus.locator}`,
          manifest: corpus.manifest,
          fragmentGrammar: found.model,
          declaredNames: found.names,
          note: found.note,
          answer: "pass --fragment <declared name>, or --corpus when the package itself is the target",
        }),
      )
    }
  }

  if (!type || !locator) {
    emit(refuse("build-refused", "a type and a locator are required", { type, locator }))
  }
  if (!(type in spec.dispatch)) {
    emit(
      refuse("uncovered-type", "the type parses and is absent from the dispatch table", {
        type,
        registered: Object.keys(spec.dispatch),
        answer: `run this script's cover mode for ${type}`,
      }),
    )
  }

  try {
    const identifier = refId.build({ type, locator, fragment, qualifiers })
    const parsed = refId.parse(identifier)
    emit({ ref: refId.canonical(identifier), status: parsed.status, type, locator, fragment: fragment ?? null })
  } catch (error) {
    const failure = error as { part?: string; message?: string }
    emit(refuse("build-refused", failure.message ?? String(error), { part: failure.part ?? null, type, locator }))
  }
}

function sweep(args: Map<string, string[]>): never {
  const where = args.get("path")?.[0] ?? "."
  // A file teaching the scheme carries deliberate counter-examples, and a parser cannot tell one from a
  // defect. Excluding such a path is the caller's judgement, so it is an argument.
  const excluded = args.get("exclude") ?? []
  const files = execFileSync("git", ["ls-files", "--", where], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((file) => !excluded.some((prefix) => file.startsWith(prefix)))
  const found = new Map<string, { status: string; part?: string; files: Set<string> }>()
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(join(ROOT, file), "utf8")
    } catch {
      continue
    }
    for (const match of text.matchAll(/\bref:[A-Za-z0-9][^\s"'`,)\]}<>]*/g)) {
      const identifier = match[0].replace(/[.,;:]+$/, "")
      const seen = found.get(identifier)
      if (seen) {
        seen.files.add(file)
        continue
      }
      const parsed = refId.parse(identifier)
      found.set(identifier, { status: parsed.status, part: parsed.part, files: new Set([file]) })
    }
  }
  const byStatus: Record<string, number> = {}
  const attention: unknown[] = []
  for (const [identifier, seen] of found) {
    byStatus[seen.status] = (byStatus[seen.status] ?? 0) + 1
    if (seen.status !== "ok") {
      attention.push({ ref: identifier, status: seen.status, part: seen.part ?? null, files: [...seen.files] })
    }
  }
  emit({ scanned: files.length, distinct: found.size, byStatus, attention })
}

function cover(args: Map<string, string[]>): never {
  const type = args.get("_")?.[0] ?? args.get("type")?.[0]
  if (!type) {
    emit(refuse("build-refused", "cover needs the type to report on", {}))
  }
  const registered = type in spec.dispatch
  const specText = readFileSync(join(ROOT, "spec/ref-id.json"), "utf8")
  const vectors = [...specText.matchAll(new RegExp(`ref:(?:[0-9]+:)?${type}:[^"]*`, "g"))].map((match) => match[0])
  const fields = new Set<string>()
  for (const entry of Object.values(spec.dispatch)) {
    for (const key of Object.keys(entry as object)) {
      fields.add(key)
    }
  }
  emit({
    type,
    registered,
    entry: registered ? spec.dispatch[type] : null,
    vectorsUsingIt: [...new Set(vectors)],
    fieldsOtherEntriesCarry: [...fields],
    reseal: "node scripts/seal-spec.mjs",
  })
}

// ---------------------------------------------------------------- entry

const argv = process.argv.slice(2)
const mode = argv[0] ?? "mint"
const args = new Map<string, string[]>()
for (let index = 1; index < argv.length; index += 1) {
  const token = argv[index]
  if (token.startsWith("--")) {
    const [key, inline] = token.slice(2).split("=")
    const value = inline ?? (argv[index + 1]?.startsWith("--") ? "" : (argv[++index] ?? ""))
    args.set(key, [...(args.get(key) ?? []), value])
    continue
  }
  args.set("_", [...(args.get("_") ?? []), token])
}

if (mode === "mint") {
  mint(args)
} else if (mode === "sweep") {
  sweep(args)
} else if (mode === "cover") {
  cover(args)
} else {
  emit(refuse("build-refused", `no mode named ${mode}`, { modes: ["mint", "sweep", "cover"] }))
}
