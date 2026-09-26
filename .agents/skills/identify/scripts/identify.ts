// SPDX-License-Identifier: Apache-2.0
//
// Resolves what is deterministic about a `ref:` identifier and refuses, by name, what needs a
// judgement. Every refusal carries the evidence that produced it, so the caller answers that one
// question instead of re-deriving the whole problem. Tables, patterns and statuses come from
// `spec/ref-id.json` through the package; none of them is restated here.

import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs"
import { devNull, homedir, tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
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
/** `name` is the bare declared name (never scoped-prefixed, never `npm/`- or `cargo/`-qualified) — what a
 * `folder` locator built from a manifest names, and what `corpus=` records the manifest for. */
type Corpus = { type: string; locator: string; name: string; manifest: string; dir: string }
/** Where a `folder` corpus's name and root directory came from, resolved before the locator is built. */
type Basis = { root: string; name: string; nameFrom: "origin" | "toplevel" | "manifest" | "root"; corpusQualifier?: string }

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

/** The nearest manifest declaring a name for `target`, searched upward from `from` (the target's own
 * directory by default) — `from` lets a caller continue past a manifest it has already ruled out. */
function nearestCorpus(target: string, from?: string): Corpus | Refusal {
  let dir = from ?? (statSync(target).isDirectory() ? target : dirname(target))
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
          return { type: "pkg", locator: `npm/${manifest.name}`, name: manifest.name, manifest: rel(path), dir }
        }
        skipped.push(`${rel(path)} (declares no name)`)
        continue
      }
      if (name === "Cargo.toml") {
        const crate = cargoName(text)
        if (crate) {
          return { type: "pkg", locator: `cargo/${crate}`, name: crate, manifest: rel(path), dir }
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
        answer: "pass --root <the directory whose name the corpus carries>, or --type folder --locator <corpus>/<path>",
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
 * The corpus name a `folder` locator carries, for a file the package manager does not ship.
 *
 * **`name` is the declared corpus name and `root` is where the locator's path is measured from** — the
 * two must come from the same source (ADR-0006's ordering: the git repository, or the manifest that
 * declared the name, or an explicit `--root`), because a path measured from one directory while the name
 * came from another drops the segments between them, and two files with the same name in two packages
 * collide under one identifier — the collision this whole plan exists to remove.
 *
 * Nothing is written to disk to record this, and nothing needs to be: the name is not a lookup key the
 * scheme resolves. `ref:folder:xpto/etc` matches inside `xpto` and nowhere else, and a reader that
 * wants the bytes has to find `xpto` for itself — the same way a reader of `ref:pkg:npm/x@1.0.0` has
 * to reach a registry. The identifier names; resolving is the reader's half.
 */
function folderCorpus(target: string, root: string, name: string): { locator: string } | Refusal {
  const path = relative(root, target)
  const candidate = `${name}/${path}`
  return refId.parse(`ref:folder:${candidate}`).status === "ok"
    ? { locator: candidate }
    : refuse("corpus-name-unusable", "the resolved name does not fit a declared corpus name", {
        root: rel(root),
        triedName: name,
        pattern: spec.dispatch.folder.pattern,
        answer: `pass --root <directory whose name the corpus carries>, or --type folder --locator <corpus>/${path}`,
      })
}

// ---------------------------------------------------------------- location hints (ADR-0006, Plan-006 Track 4)

/** The host of an SSH remote — scp form `user@host:path`, or an `ssh://` URL — with any port and userinfo
 * dropped, or `undefined` for any other spelling (including `https://`, which carries no alias risk this
 * check exists for). */
function sshRemoteHost(remote: string): string | undefined {
  const candidate = remote.trim()
  if (/^ssh:\/\//i.test(candidate)) {
    return candidate.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)/i)?.[1]
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) return undefined
  return candidate.match(/^(?:[\w.-]+@)?([^/:@]+):(.+)$/)?.[1]
}

/** Whether `host` looks like a real DNS name rather than a local SSH config alias (`github.com-work`,
 * `work`): it carries at least one dot, and its last label is either letters only (2–63 of them) or an IDN
 * `xn--` label. This is a shape test, never a lookup — nothing here resolves the host or reads `ssh -G` or
 * any ssh config, so a real host this shape rejects (a bare IPv4/IPv6 literal, a single-label intranet
 * name) is refused the same as an alias would be. */
function looksLikeDnsHost(host: string): boolean {
  const labels = host.split(".")
  if (labels.length < 2) return false
  const last = labels[labels.length - 1]
  return /^[a-z]{2,63}$/i.test(last) || /^xn--/i.test(last)
}

/** The git top level containing `target`, or `undefined` outside any repository. */
function gitTopLevel(target: string): string | undefined {
  const dir = statSync(target).isDirectory() ? target : dirname(target)
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
  }
}

/** The `origin` remote's URL as the repository records it — `undefined` when there is none. Read from the
 * configuration rather than through `git remote get-url`, which applies the caller's `url.*.insteadOf`
 * rewrites: a mirror configured on one machine would otherwise become the repository's `origin=`, naming
 * another authority that belongs to that machine alone. An SSH host alias stored in the remote itself
 * (not a rewrite) is a different case, caught downstream by `normaliseOrigin`.
 * `remote.origin.url` is multi-valued once `git remote set-url --add` has run, and
 * `git config --get` answers with the last value written, while `git remote get-url` (and `fetch`) use
 * the first — so this reads every value with `--get-all` and takes the first non-empty line, still
 * without applying any `insteadOf` rewrite. */
function gitOrigin(toplevel: string): string | undefined {
  try {
    const values = execFileSync("git", ["-C", toplevel, "config", "--get-all", "remote.origin.url"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return values
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0)
  } catch {
    return undefined
  }
}

/** A remote with any userinfo removed — the only spelling of a remote this script ever prints or reads a
 * name from, so a token written into a clone URL never reaches stdout or a corpus name. */
function redactRemote(remote: string): string {
  return remote.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]*@/i, "$1")
}

/** The repository name a remote URL names — its last path segment, `.git` and trailing slashes dropped —
 * read from the redacted remote, case kept as written. This is the fallback corpus name, used only when
 * `normaliseOrigin` returns `undefined` for the same remote (issue #37's SSH alias, a non-default port, an
 * unrecognised spelling): the corpus name otherwise comes from `normaliseOrigin`'s result, already
 * lowercased the way `origin=` is, so the two never disagree in case. Read from the redacted remote either
 * way, so no credential can become the name. */
function lastSegmentName(remote: string): string | undefined {
  const redacted = redactRemote(remote).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
  const stripped = redacted.replace(/\/+$/, "").replace(/\.git$/i, "")
  return stripped.split(/[/:]/).filter(Boolean).pop()
}

/**
 * `origin=`'s one spelling — an SSH remote rewritten to `https`, credentials and the default port
 * stripped, `.git` and a trailing separator dropped, the whole string lowercased — or `undefined` when
 * the result still does not fit `spec.forms["origin-url"].pattern`, which is read from the spec and
 * never restated. A remote written some other way (a non-default port, a percent-encoded name) is
 * reported without `origin=` rather than forced into it (Plan-006 Decision Log). An SSH remote (scp form
 * or `ssh://`) is also refused, before any rewrite, when its host does not look like a DNS name
 * (`looksLikeDnsHost`) — a host that is a local alias from `~/.ssh/config` (`github.com-work`, `work`)
 * names a machine only that config resolves, and the same repository cloned elsewhere would mint a
 * different `origin=` from it. Nothing here resolves the alias (`ssh -G`) or reads any ssh config; it is a
 * shape test that refuses the alias rather than following it (issue #37).
 */
function normaliseOrigin(remote: string): string | undefined {
  let candidate = remote.trim()
  const sshHost = sshRemoteHost(candidate)
  if (sshHost !== undefined && !looksLikeDnsHost(sshHost)) return undefined
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "https://")
  } else {
    const scp = candidate.match(/^(?:[\w.-]+@)?([^/:@]+):(.+)$/)
    if (!scp) return undefined
    candidate = `https://${scp[1]}/${scp[2]}`
  }
  candidate = candidate.replace(/^(https:\/\/)[^@/]+@/i, "$1")
  // Only the default port is a second spelling of the same address. Any other port names a different
  // service, is left in place, and makes the result fail the pattern — so `origin=` is omitted.
  candidate = candidate.replace(/^(https:\/\/[^/]+?):443(\/|$)/i, "$1$2")
  candidate = candidate.toLowerCase().replace(/\.git\/?$/, "").replace(/\/+$/, "")
  return new RegExp(spec.forms["origin-url"].pattern).test(candidate) ? candidate : undefined
}

/**
 * Whether `origin` is anonymously reachable, by one `git ls-remote` with credentials and prompts
 * disabled. Exit `0` is `public`; any other exit is `private` — a nonexistent remote answers the same
 * way a private one does, and both are the outcome that must not leak by default. `offline` skips the
 * network and answers `unknown` without ever making the request.
 */
function checkVisibility(origin: string, offline: boolean): { visibility: string; visibilityBy: string } {
  if (offline) {
    return { visibility: "unknown", visibilityBy: "--offline: no request made" }
  }
  // Anonymous means nothing of the caller's reaches the request: no global or system git config (so no
  // `url.*.insteadOf` can turn https into an SSH call the agent authenticates, and no `http.extraHeader`),
  // no home directory (so no `.netrc`), no SSH agent, https only, and a working directory outside any
  // repository. Anything less can report a private repository as public, which is the leak this check
  // exists to prevent.
  const isolated = mkdtempSync(join(tmpdir(), "ref-id-visibility-"))
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: isolated,
    USERPROFILE: isolated,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_ALLOW_PROTOCOL: "https",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "false",
    SSH_ASKPASS: "false",
  }
  try {
    execFileSync("git", ["-c", "credential.helper=", "ls-remote", "--heads", origin], {
      cwd: isolated,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 10_000,
      env,
    })
    return { visibility: "public", visibilityBy: "anonymous git ls-remote exit 0" }
  } catch (error) {
    const status = (error as { status?: number | null }).status
    return { visibility: "private", visibilityBy: `anonymous git ls-remote exit ${status ?? "unknown"}` }
  } finally {
    rmSync(isolated, { recursive: true, force: true })
  }
}

/**
 * `path=`'s one spelling for a local directory, or `undefined` when it does not fit
 * `spec.forms["local-path"].pattern`. A directory under the user's home, temporary, configuration, data
 * or cache directory is written through its token (`spec.forms["local-path"].tokens`) precisely so that
 * a user name never reaches an identifier — the pattern cannot tell a user name from any other directory
 * name, which is why the builder carries the obligation instead. macOS holds `{config}` and `{data}` at
 * the same directory; `{config}` is written first as an arbitrary, declared tie-break.
 */
function pathHintFor(dir: string): string | undefined {
  // Every base and the directory itself are compared in one spelling: `/` separators, lowercase drive.
  const real = (path: string) => (existsSync(path) ? realpathSync(path) : path)
  const slash = (path: string) => real(path).replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d: string) => `${d.toLowerCase()}:`)
  const home = slash(homedir())
  const env = (name: string) => (process.env[name] ? slash(process.env[name]!) : undefined)
  // The per-OS directories behind each token, most specific first, so a cache under the home directory
  // is written as {cache} rather than ~. Two tokens can name one directory, and the first listed wins:
  // {config} over {data} on macOS (both Application Support), {cache} over {tmp} on Windows (both
  // %LOCALAPPDATA%\Temp by default).
  const bases: [string, string | undefined][] =
    process.platform === "darwin"
      ? [["{config}", `${home}/Library/Application Support`], ["{cache}", `${home}/Library/Caches`]]
      : process.platform === "win32"
        ? [["{cache}", env("LOCALAPPDATA") && `${env("LOCALAPPDATA")}/Temp`], ["{config}", env("APPDATA")], ["{data}", env("LOCALAPPDATA")]]
        : [["{config}", env("XDG_CONFIG_HOME") ?? `${home}/.config`], ["{data}", env("XDG_DATA_HOME") ?? `${home}/.local/share`], ["{cache}", env("XDG_CACHE_HOME") ?? `${home}/.cache`]]
  bases.push(["{tmp}", slash(tmpdir())], ["~", home])
  const target = slash(dir)
  // Windows paths compare without case, so a home directory spelled with different casing than the
  // resolved path still reaches ~ rather than leaking the user name in an absolute path.
  const fold = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path)
  const hit = bases.find(([, base]) => base !== undefined && (fold(target) === fold(base) || fold(target).startsWith(`${fold(base)}/`)))
  const candidate = hit ? `${hit[0]}${target.slice(hit[1]!.length)}` : target
  return new RegExp(spec.forms["local-path"].pattern).test(candidate) ? candidate : undefined
}

/**
 * The `folder` corpus's name and root, in the order ADR-0006 and Plan-006 Track 4 fix: `--root` first
 * (an explicit claim overrides everything but `--locator`, which never reaches this function); inside a
 * git repository, the repository name from `origin` (or the top-level directory's base name when there
 * is no remote), with the path measured from the top level; and only outside any repository, or with
 * `--name-from-manifest`, the nearest manifest whose declared name fits the `folder` pattern, with
 * `corpus=` recording which manifest.
 */
function locationBasis(
  target: string,
  given: string | undefined,
  nameFromManifest: boolean,
  toplevel: string | undefined,
  originRaw: string | undefined,
  corpus: Corpus | undefined,
  corpusRefusal: Refusal | undefined,
): Basis | Refusal {
  if (given) {
    // Resolved like the target, so a root reached through a symbolic link is measured in the same
    // spelling as the file under it.
    const root = realpathSync(resolve(ROOT, given))
    return { root, name: basename(root), nameFrom: "root" }
  }
  const fromRepository = (): Basis | undefined => {
    if (!toplevel) return undefined
    // The corpus name folds case the way `origin=` does (issue #36): both must come from the same
    // spelling of the remote, or two clones differing only in the remote's case mint two identities for
    // one repository. `lastSegmentName` of the raw remote is only the fallback, for a remote
    // `normaliseOrigin` refuses (an SSH alias, a non-default port, an unrecognised spelling).
    const fromOrigin = originRaw ? (normaliseOrigin(originRaw)?.split("/").pop() ?? lastSegmentName(originRaw)) : undefined
    return fromOrigin
      ? { root: toplevel, name: fromOrigin, nameFrom: "origin" }
      : { root: toplevel, name: basename(toplevel), nameFrom: "toplevel" }
  }
  if (!nameFromManifest && toplevel) {
    return fromRepository()!
  }
  // The nearest manifest whose declared name fits the `folder` pattern. One that does not — a scoped npm
  // name — is skipped and the search continues above it; `corpus=` is written relative to the root the
  // other hints reach: the repository's top level when there is one, else the manifest's own directory.
  const fits = new RegExp(spec.dispatch.folder.pattern)
  const skipped: string[] = [...((corpusRefusal?.evidence.skipped as string[] | undefined) ?? [])]
  let candidate = corpus
  while (candidate) {
    if (fits.test(candidate.name)) {
      const manifestPath = resolve(ROOT, candidate.manifest)
      return {
        root: candidate.dir,
        name: candidate.name,
        nameFrom: "manifest",
        corpusQualifier: relative(toplevel ?? candidate.dir, manifestPath).replace(/\\/g, "/"),
      }
    }
    skipped.push(`${candidate.manifest} (its name ${candidate.name} does not fit the folder pattern)`)
    const parent = dirname(candidate.dir)
    const next = parent === candidate.dir || candidate.dir === toplevel ? undefined : nearestCorpus(target, parent)
    candidate = next && !("refusal" in next) ? next : undefined
  }
  const repository = fromRepository()
  if (repository) {
    return repository
  }
  return refuse("no-corpus", "no git repository and no manifest reaching this path declares a usable name", {
    target: rel(target),
    inGitRepo: Boolean(toplevel),
    skipped,
    answer: "pass --root <the directory whose name the corpus carries>, or --type folder --locator <corpus>/<path>",
  })
}

// ---------------------------------------------------------------- modes

function mint(args: Map<string, string[]>): never {
  let type = args.get("type")?.[0]
  let locator = args.get("locator")?.[0]
  const explicitLocator = Boolean(locator)
  const fragment = args.get("fragment")?.[0]
  const qualifiers = (args.get("qualifier") ?? []).map((pair) => {
    const at = pair.indexOf("=")
    return [pair.slice(0, at), pair.slice(at + 1)] as [string, string]
  })
  const path = args.get("path")?.[0]
  const nameFromManifest = args.has("name-from-manifest")
  const wantPathHint = args.has("path-hint")
  const offline = args.has("offline")

  // `nameSource` and `nameFrom` report where the locator's name came from (item 5): "given" only for a
  // name the caller wrote directly (`--locator`), "claimed" for every name this script derived, with
  // `nameFrom` naming which of the four sources supplied it.
  let nameSource: "given" | "claimed" | undefined
  let nameFrom: string | undefined
  // Location hints (ADR-0006): populated only for a `folder` locator this script names itself, from a
  // target inside a git repository — never for a manually supplied `--locator`.
  let basisRoot: string | undefined
  let originRaw: string | undefined
  let corpusQualifierPath: string | undefined

  if (path) {
    const spelled = resolve(ROOT, path)
    if (!existsSync(spelled)) {
      emit(refuse("no-such-path", "nothing is at that path", { target: path }))
    }
    // Git reports its top level through every symbolic link resolved, so the target is resolved the same
    // way: a path measured between a linked spelling and a resolved one climbs out through `..`.
    const target = realpathSync(spelled)
    // A manifest is how a released artifact is found, not how a corpus is. A subtree handed in with
    // `--root` is a corpus with no manifest anywhere above it — documentation beside a package, a
    // repository that publishes nothing — so a manifest that reaches nothing is only fatal when the
    // caller named no root either.
    const given = args.get("root")?.[0]
    const resolved = nearestCorpus(target)
    const corpus = "refusal" in resolved ? undefined : resolved
    // The git repository, when there is one, supplies both the corpus name (Track 4, item 1) and the
    // origin location hint (item 2) — two different questions answered from one lookup, so a target
    // named from a manifest (`--name-from-manifest`, or outside any repository) still carries `origin=`
    // when it happens to sit inside a repository.
    const toplevel = gitTopLevel(target)
    originRaw = toplevel ? gitOrigin(toplevel) : undefined
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
        nameSource = "claimed"
        nameFrom = "manifest"
      } else {
        const basis = locationBasis(
          target,
          given,
          nameFromManifest,
          toplevel,
          originRaw,
          corpus,
          "refusal" in resolved ? resolved : undefined,
        )
        if ("refusal" in basis) {
          emit(basis)
        }
        const named = folderCorpus(target, basis.root, basis.name)
        if ("refusal" in named) {
          emit(named)
        }
        type = "folder"
        locator = named.locator
        nameSource = "claimed"
        nameFrom = basis.nameFrom
        basisRoot = basis.root
        corpusQualifierPath = basis.corpusQualifier
      }
    } else if (corpus && !explicitLocator) {
      nameSource = "claimed"
      nameFrom = "manifest"
    }
    if (!fragment && !args.has("corpus")) {
      const found = candidates(target)
      // With `--root` and no manifest reaching the file, `corpus` is undefined and the `folder` branch above
      // is what resolved: report what was resolved, not the manifest that was not found.
      const leaf = type === "folder" && locator.includes("/") && !statSync(target).isDirectory()
      emit(
        refuse("target-undeclared", "the corpus resolved; which declared name inside it is the target is undecided", {
          corpus: corpus ? `${corpus.type}:${corpus.locator}` : `${type}:${locator}`,
          manifest: corpus?.manifest,
          fragmentGrammar: found.model,
          declaredNames: found.names,
          note: found.note,
          answer: leaf
            ? `pass --fragment <declared name>; when the file itself is the target, --type folder --locator ${dirname(locator)} --fragment ${basename(locator)} (the fragment is the leaf)`
            : "pass --fragment <declared name>, or --corpus when the package itself is the target",
        }),
      )
    }
  }

  if (explicitLocator) {
    nameSource = "given"
    nameFrom = undefined
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

  // Location qualifiers and visibility variants (ADR-0006, Plan-006 Track 4 items 2–4) apply only to a
  // `folder` locator this script named itself from inside a git repository — never to a manually built
  // identifier, whose caller chose its own qualifiers already.
  const report: Record<string, unknown> = {}
  if (nameSource) report.nameSource = nameSource
  if (nameFrom) report.nameFrom = nameFrom
  let variants: { private: unknown; public: unknown; warning: string } | undefined

  if (type === "folder" && basisRoot && !explicitLocator) {
    const shared: [string, string][] = []
    if (corpusQualifierPath) shared.push(["corpus", corpusQualifierPath])

    const originValue = originRaw ? normaliseOrigin(originRaw) : undefined
    if (originRaw && !originValue) {
      const redacted = redactRemote(originRaw)
      const sshHost = sshRemoteHost(redacted)
      report.originOmitted =
        sshHost !== undefined && !looksLikeDnsHost(sshHost)
          ? `the remote's SSH host (${sshHost}) looks like a local alias from ssh config, not a DNS name`
          : `the remote (${redacted}) does not fit origin-url`
    }
    // `path=` is written only when asked for, or when there is no remote to derive `origin=` from — a
    // repository already names itself through `origin=`, so `path=` would only repeat that information
    // while adding a machine-local detail (item 4).
    const pathValue = wantPathHint || !originRaw ? pathHintFor(basisRoot) : undefined

    if (originValue) {
      const visibility = checkVisibility(originValue, offline)
      report.visibility = visibility.visibility
      report.visibilityBy = visibility.visibilityBy
      if (visibility.visibility === "public") {
        qualifiers.push(...shared, ["origin", originValue])
        if (pathValue) qualifiers.push(["path", pathValue])
      } else {
        const privateQualifiers: [string, string][] = [...shared, ["origin", originValue]]
        if (pathValue) privateQualifiers.push(["path", pathValue])
        const publicQualifiers: [string, string][] = [...shared]
        const buildVariant = (variantQualifiers: [string, string][]) => {
          try {
            const identifier = refId.build({ type, locator, fragment, qualifiers: [...qualifiers, ...variantQualifiers] })
            return { ref: refId.canonicalIdentifier(identifier), status: refId.parse(identifier).status }
          } catch (error) {
            const failure = error as { part?: string; message?: string }
            return refuse("build-refused", failure.message ?? String(error), { part: failure.part ?? null })
          }
        }
        variants = {
          private: buildVariant(privateQualifiers),
          public: buildVariant(publicQualifiers),
          warning:
            "origin= exposes where this repository is hosted and by which organisation; visibility is not " +
            "public, so ref and variants.private carry origin= while variants.public omits it along with " +
            "path=. The locator itself still opens on the repository's name in both — pass --locator to " +
            "choose another name before sharing variants.public",
        }
        // `ref` is the private variant (Plan-006 item 3): the fuller identifier, for the caller who
        // already has access; `variants.public` is what to hand someone who may not.
        qualifiers.push(...privateQualifiers)
      }
    } else if (pathValue) {
      qualifiers.push(...shared, ["path", pathValue])
    } else if (shared.length) {
      qualifiers.push(...shared)
    }
  }

  try {
    const identifier = refId.build({ type, locator, fragment, qualifiers })
    const parsed = refId.parse(identifier)
    emit({
      ref: refId.canonicalIdentifier(identifier),
      status: parsed.status,
      type,
      locator,
      fragment: fragment ?? null,
      ...report,
      ...(variants ? { variants } : {}),
    })
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
