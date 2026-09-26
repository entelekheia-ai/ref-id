// SPDX-License-Identifier: Apache-2.0
//
// Runs `identify.ts` as a subprocess against fixtures built under the OS temp directory, never against
// the real home, git config or SSH agent. `IDENTIFY_SCRIPT` lets the same suite run against another copy
// of the script (see the skill's Gate step), so a path here is never hardcoded past this constant.

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "../../../..")
const SCRIPT = process.env.IDENTIFY_SCRIPT ?? join(HERE, "identify.ts")

// Mirrors `identify.ts`'s own `mirrorSpec()` so importing the package directly (for `verdict`) works from
// a fresh checkout too, without depending on a prior `mint` call having run first.
mkdirSync(join(ROOT, "packages/ref-id/spec"), { recursive: true })
for (const name of ["ref-id.json", "ref-id.json.sha256"]) {
  copyFileSync(join(ROOT, "spec", name), join(ROOT, "packages/ref-id/spec", name))
}
const refId: typeof import("../../../../packages/ref-id/src/index.ts") = await import(
  join(ROOT, "packages/ref-id/src/index.ts")
)

function tmpDir(prefix = "identify-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function withTmp<T>(fn: (dir: string) => T): T {
  const dir = tmpDir()
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function git(dir: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] })
}

function initRepo(dir: string, opts: { remote?: string } = {}): void {
  mkdirSync(dir, { recursive: true })
  git(dir, "init", "-q", "-b", "main")
  if (opts.remote) git(dir, "remote", "add", "origin", opts.remote)
}

function commitAll(dir: string, message = "init"): void {
  git(dir, "add", "-A")
  git(dir, "-c", "user.email=test@example.invalid", "-c", "user.name=test", "commit", "-q", "-m", message)
}

/** A blank per-test HOME, no real user config/credentials/SSH agent ever reaches the subprocess, and the
 * subprocess resolves the same temp directory the fixtures were built under (so `{tmp}` matches). */
function baseEnv(home: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_NOSYSTEM: "1",
  }
  for (const key of ["TMPDIR", "TMP", "TEMP"]) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return { ...env, ...extra }
}

interface RunResult {
  exitCode: number
  stdout: string
  json: any
}

function run(args: string[], env: NodeJS.ProcessEnv): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env })
    return { exitCode: 0, stdout, json: JSON.parse(stdout) }
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string }
    const stdout = failure.stdout ?? ""
    return { exitCode: failure.status ?? 1, stdout, json: stdout ? JSON.parse(stdout) : undefined }
  }
}

/** Shared assertion: a `folder` locator this script names never carries a `.` or `..` segment
 * (a consumer mapping the locator onto a path would otherwise inherit a traversal). */
function assertNoDotSegments(locator: string): void {
  for (const segment of locator.split("/")) {
    assert.notEqual(segment, ".", `locator "${locator}" contains a "." segment`)
    assert.notEqual(segment, "..", `locator "${locator}" contains a ".." segment`)
  }
}

test("a remote carrying userinfo never leaks the credential, and origin is omitted", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "https://alice:SECRET@example.invalid/Org%20X/repo.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, stdout, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.equal(json.status, "ok")
      assert.ok(!stdout.includes("SECRET"), "the credential must never reach stdout")
      assert.ok(!stdout.includes("alice:SECRET"))
      assert.equal(typeof json.originOmitted, "string", "the value does not fit origin-url, so it is dropped rather than kept")
      assert.ok(!json.ref.includes("origin="))
      if (json.type === "folder") assertNoDotSegments(json.locator)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a file outside any git repository is named from the nearest package.json", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "foo" }))
      writeFileSync(join(dir, "a.md"), "hi\n")
      const { exitCode, json } = run(["mint", "--path", join(dir, "a.md"), "--fragment", "x"], baseEnv(home))
      assert.equal(exitCode, 0)
      assert.equal(json.status, "ok")
      assert.equal(json.type, "folder")
      assert.equal(json.locator, "foo/a.md")
      assert.ok(json.ref.startsWith("ref:folder:foo/a.md"))
      assert.ok(json.ref.includes("corpus=package.json"))
      assertNoDotSegments(json.locator)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a scoped manifest is skipped for the nearest name that fits the folder pattern", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "acme-root" }))
      mkdirSync(join(dir, "sub"))
      writeFileSync(join(dir, "sub", "package.json"), JSON.stringify({ name: "@acme/x" }))
      writeFileSync(join(dir, "sub", "a.md"), "hi\n")
      const { exitCode, json } = run(["mint", "--path", join(dir, "sub", "a.md"), "--fragment", "x"], baseEnv(home))
      assert.equal(exitCode, 0)
      assert.equal(json.status, "ok")
      assert.equal(json.type, "folder")
      // The parent's name opens the locator; the path is measured from the parent, not from `sub/`.
      assert.equal(json.locator, "acme-root/sub/a.md")
      assert.ok(json.ref.includes("corpus=package.json"))
      assertNoDotSegments(json.locator)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a non-default port drops origin=; the default port is stripped and origin= is kept", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const nonDefault = join(dir, "repo-nondefault")
      initRepo(nonDefault, { remote: "https://example.invalid:8443/org/repo" })
      writeFileSync(join(nonDefault, "a.md"), "hi\n")
      commitAll(nonDefault)
      const port = run(["mint", "--path", join(nonDefault, "a.md"), "--fragment", "x", "--offline"], baseEnv(home))
      assert.equal(port.exitCode, 0)
      assert.ok(!port.json.ref.includes("origin="), "a non-default port is a different address, not a second spelling")
      assert.equal(typeof port.json.originOmitted, "string")

      const defaultPort = join(dir, "repo-defaultport")
      initRepo(defaultPort, { remote: "https://example.invalid:443/org/repo" })
      writeFileSync(join(defaultPort, "a.md"), "hi\n")
      commitAll(defaultPort)
      const stripped = run(["mint", "--path", join(defaultPort, "a.md"), "--fragment", "x", "--offline"], baseEnv(home))
      assert.equal(stripped.exitCode, 0)
      assert.ok(stripped.json.ref.includes("origin=https://example.invalid/org/repo"))
      assert.equal(stripped.json.originOmitted, undefined)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a global insteadOf rewrite to a local bare repo never turns a private origin public", () => {
  withTmp((dir) => {
    // The alias below only ever reaches the isolated `ls-remote` this script runs to check visibility:
    // the repo's own remote is stored with a different case, so the ambient `git config --get-all
    // remote.origin.url` lookup (unisolated, and identical in both the reviewed and the pre-review
    // script) does not itself apply the rewrite — only an unisolated visibility check would.
    const bareBase = join(dir, "rewrite-base")
    const barePath = join(bareBase, "org", "repo")
    mkdirSync(barePath, { recursive: true })
    execFileSync("git", ["init", "--bare", "-q", barePath])
    const seed = join(dir, "seed")
    initRepo(seed)
    writeFileSync(join(seed, "f"), "hi\n")
    commitAll(seed)
    execFileSync("git", ["push", "-q", barePath, "main"], { cwd: seed })

    const repo = join(dir, "repo")
    initRepo(repo, { remote: "https://EXAMPLE.INVALID/org/repo.git" })
    writeFileSync(join(repo, "a.md"), "hi\n")
    commitAll(repo)

    const globalConfig = join(dir, "global.gitconfig")
    writeFileSync(globalConfig, `[url "file://${bareBase}/"]\n\tinsteadOf = https://example.invalid/\n`)
    const home = join(dir, "blank-home")
    mkdirSync(home, { recursive: true })

    // Deliberately no --offline: this is the one test that must exercise the real (isolated) network
    // check, against the reserved host example.invalid, whose DNS is guaranteed to fail.
    const { exitCode, json } = run(
      ["mint", "--path", join(repo, "a.md"), "--fragment", "x"],
      baseEnv(home, { GIT_CONFIG_GLOBAL: globalConfig }),
    )
    assert.equal(exitCode, 0)
    assert.equal(json.visibility, "private", "the rewrite must not leak through the visibility check")
    assert.ok(json.variants, "a non-public visibility carries both variants")
    assert.ok(json.variants.private.ref.includes("origin=https://example.invalid/org/repo"))
    assert.ok(!json.variants.public.ref.includes("origin="))
    assertNoDotSegments(json.locator)
  })
})

test("--offline makes no request and reports both variants with a warning", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "https://example.invalid/org/repo" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"], baseEnv(home))
      assert.equal(exitCode, 0)
      assert.equal(json.visibility, "unknown")
      assert.match(json.visibilityBy, /--offline/)
      assert.ok(json.variants)
      assert.ok(json.variants.public.ref.startsWith("ref:folder:repo/a.md"))
      assert.ok(!json.variants.public.ref.includes("origin="))
      assert.ok(!json.variants.public.ref.includes("path="))
      assert.ok(json.variants.private.ref.includes("origin=https://example.invalid/org/repo"))
      assert.equal(typeof json.variants.warning, "string")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("two files at different paths in one repository mint distinct identifiers", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "https://example.invalid/org/repo" })
      writeFileSync(join(repo, "README.md"), "root\n")
      mkdirSync(join(repo, "crates", "x"), { recursive: true })
      writeFileSync(join(repo, "crates", "x", "README.md"), "crate\n")
      // The crate is deliberately named the same as the repository — proves that coincidence does not
      // collapse the two identifiers, since the `folder` corpus name comes from the repository, not
      // from this manifest.
      writeFileSync(join(repo, "crates", "x", "Cargo.toml"), '[package]\nname = "repo"\nversion = "0.1.0"\n')
      commitAll(repo)
      const root = run(["mint", "--path", join(repo, "README.md"), "--fragment", "x", "--offline"], baseEnv(home))
      const nested = run(
        ["mint", "--path", join(repo, "crates", "x", "README.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(root.exitCode, 0)
      assert.equal(nested.exitCode, 0)
      const verdict = refId.verdict(root.json.ref, nested.json.ref)
      assert.equal(verdict?.identity, "distinct")
      assertNoDotSegments(root.json.locator)
      assertNoDotSegments(nested.json.locator)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("the same file minted from a repo and from its worktree is the same identifier", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "https://example.invalid/org/repo" })
      writeFileSync(join(repo, "note.md"), "hello\n")
      commitAll(repo)
      const worktree = join(dir, "wt")
      execFileSync("git", ["worktree", "add", "-q", "-b", "wtbranch", worktree], { cwd: repo })
      const fromRepo = run(["mint", "--path", join(repo, "note.md"), "--fragment", "x", "--offline"], baseEnv(home))
      const fromWorktree = run(
        ["mint", "--path", join(worktree, "note.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(fromRepo.exitCode, 0)
      assert.equal(fromWorktree.exitCode, 0)
      const verdict = refId.verdict(fromRepo.json.ref, fromWorktree.json.ref)
      assert.equal(verdict?.identity, "same")
      assertNoDotSegments(fromRepo.json.locator)
      assertNoDotSegments(fromWorktree.json.locator)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("--root given through a symbolic link mints a locator with no . or .. segment", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const real = join(dir, "real")
      mkdirSync(join(real, "sub"), { recursive: true })
      writeFileSync(join(real, "sub", "a.md"), "hi\n")
      const link = join(dir, "link")
      symlinkSync(real, link)
      const { exitCode, json } = run(
        ["mint", "--path", join(link, "sub", "a.md"), "--root", link, "--fragment", "x"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.equal(json.locator, "real/sub/a.md")
      assertNoDotSegments(json.locator)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a repo with no remote is named ~/ under HOME and {tmp}/ under the temp directory", () => {
  const homeFixture = tmpDir("identify-home-")
  const spoofTmp = tmpDir("identify-spooftmp-")
  const elsewhere = tmpDir("identify-elsewhere-")
  const secondHome = tmpDir("identify-home2-")
  try {
    // Give the subprocess its own, different notion of "temp" so this fixture — itself built under the
    // real OS temp directory — is not ALSO a match for `{tmp}` once it doubles as HOME.
    const underHome = join(homeFixture, "proj")
    initRepo(underHome)
    writeFileSync(join(underHome, "a.md"), "hi\n")
    const homeResult = run(
      ["mint", "--path", join(underHome, "a.md"), "--fragment", "x"],
      baseEnv(homeFixture, { TMPDIR: spoofTmp, TMP: spoofTmp, TEMP: spoofTmp }),
    )
    assert.equal(homeResult.exitCode, 0)
    assert.ok(homeResult.json.ref.includes("path=~/proj"), homeResult.stdout)
    assert.ok(!homeResult.json.ref.includes(homeFixture), "no real path segment reaches the identifier")

    const underTmp = join(elsewhere, "proj2")
    initRepo(underTmp)
    writeFileSync(join(underTmp, "a.md"), "hi\n")
    const tmpResult = run(["mint", "--path", join(underTmp, "a.md"), "--fragment", "x"], baseEnv(secondHome))
    assert.equal(tmpResult.exitCode, 0)
    assert.match(tmpResult.json.ref, /path=\{tmp\}\/.*\/proj2/, tmpResult.stdout)
  } finally {
    rmSync(homeFixture, { recursive: true, force: true })
    rmSync(spoofTmp, { recursive: true, force: true })
    rmSync(elsewhere, { recursive: true, force: true })
    rmSync(secondHome, { recursive: true, force: true })
  }
})

test("origin= is the remote the repository records, not the caller's insteadOf rewrite of it", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "https://github.com/acme/tools.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      // A mirror configured on this machine alone: `git remote get-url` would apply it.
      const gitconfig = join(home, "gitconfig")
      writeFileSync(gitconfig, '[url "https://mirror.example.invalid/"]\n\tinsteadOf = https://github.com/\n')
      const { exitCode, json, stdout } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home, { GIT_CONFIG_GLOBAL: gitconfig }),
      )
      assert.equal(exitCode, 0)
      assert.ok(json.ref.includes("origin=https://github.com/acme/tools"), `ref was ${json.ref}`)
      assert.ok(!stdout.includes("mirror.example.invalid"), "a machine-local rewrite must not reach the identifier")
      // The `.git` suffix on the remote names the corpus, not the locator: `tools`, not `tools.git`.
      assert.equal(json.locator, "tools/a.md")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("an SSH remote names the same corpus and origin= as its https equivalent", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "git@github.com:acme/tools.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.ok(json.ref.includes("origin=https://github.com/acme/tools"), `ref was ${json.ref}`)
      assert.equal(json.locator, "tools/a.md")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a mixed-case https remote folds into a lowercase corpus name, matching origin=", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "https://GitHub.com/Acme/Tools.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.equal(json.locator, "tools/a.md")
      assert.ok(json.ref.includes("origin=https://github.com/acme/tools"), `ref was ${json.ref}`)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("an SSH host alias with a suffix omits origin=, naming the alias", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "git@github.com-work:acme/tools.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.ok(!json.ref.includes("origin="), `ref was ${json.ref}`)
      assert.equal(typeof json.originOmitted, "string")
      assert.match(json.originOmitted, /github\.com-work/)
      assert.match(json.originOmitted, /local alias from ssh config/)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a single-word SSH alias omits origin=, naming the alias", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "git@work:acme/tools.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.ok(!json.ref.includes("origin="), `ref was ${json.ref}`)
      assert.equal(typeof json.originOmitted, "string")
      assert.match(json.originOmitted, /\bwork\b/)
      assert.match(json.originOmitted, /local alias from ssh config/)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("an ssh:// URL with an alias host omits origin=, naming the alias", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "ssh://github.com-work/acme/tools.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.ok(!json.ref.includes("origin="), `ref was ${json.ref}`)
      assert.equal(typeof json.originOmitted, "string")
      assert.match(json.originOmitted, /github\.com-work/)
      assert.match(json.originOmitted, /local alias from ssh config/)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("an SSH host whose last label is an IDN xn-- label is accepted", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "git@example.xn--p1ai:acme/tools.git" })
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      assert.ok(json.ref.includes("origin=https://example.xn--p1ai/acme/tools"), `ref was ${json.ref}`)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

test("a remote made with `git remote set-url --add` names the corpus and origin= from the first value, not the last", () => {
  withTmp((dir) => {
    const home = tmpDir("identify-home-")
    try {
      const repo = join(dir, "repo")
      initRepo(repo, { remote: "https://github.com/acme/first" })
      git(repo, "remote", "set-url", "--add", "origin", "https://github.com/acme/second")
      writeFileSync(join(repo, "a.md"), "hi\n")
      commitAll(repo)
      const { exitCode, json } = run(
        ["mint", "--path", join(repo, "a.md"), "--fragment", "x", "--offline"],
        baseEnv(home),
      )
      assert.equal(exitCode, 0)
      // `git config --get` alone would answer with the last value written (`second`); `git remote
      // get-url` and `fetch` both use the first, which is the value this locator and origin= must match.
      assert.ok(json.ref.includes("origin=https://github.com/acme/first"), `ref was ${json.ref}`)
      assert.equal(json.locator, "first/a.md")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
