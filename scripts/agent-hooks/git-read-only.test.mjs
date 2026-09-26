// git-read-only.test.mjs — every case runs the script as a real child process, JSON on stdin, exactly as
// Claude Code invokes a PreToolUse hook.

import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, "git-read-only.mjs")

function runHook(payload, extraArgs = []) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload)
  return spawnSync(process.execPath, [script, "test-agent", ...extraArgs], { input, encoding: "utf8" })
}

function runBash(command, extraArgs = []) {
  return runHook({ tool_name: "Bash", tool_input: { command } }, extraArgs)
}

// --- state-changing git commands: every one of these must be blocked (exit 2) --------------------------

const BLOCKED = [
  "git commit -m x",
  "cd /x && git add a",
  "git -C /x reset --hard",
  'git -C "/path with spaces/x" reset --hard',
  "git -C '/a b' stash",
  'bash -c "git stash"',
  "sh -c 'git reset --hard'",
  "(git stash)",
  "$(git stash)",
  "`git stash`",
  "echo a | xargs git add",
  "xargs -I{} git checkout {}",
  "env FOO=1 git commit",
  "FOO=1 git commit",
  "sudo -u me git commit",
  "time git commit",
  "nice -n 5 git commit",
  "git -c core.x=y commit",
  'git -c user.name="A B" commit',
  "git --git-dir=/x commit",
  "git --git-dir /x/.git commit",
  "git --work-tree=/x reset",
  "git -- commit",
  "git branch -f main HEAD",
  "git branch -D x",
  "git update-ref refs/heads/x HEAD",
  "git worktree remove x",
  "git tag -d x",
  "git mv a b",
  "git rm a",
  "git pull",
  "git revert HEAD",
  "git am x.patch",
  "git apply x.patch",
  "git notes add",
  "git gc --prune=now",
  "git reflog expire --all",
  "git symbolic-ref HEAD refs/heads/x",
  "git read-tree HEAD",
  "git checkout-index -a",
  "git switch -c x",
  "git restore --staged .",
  "git stash push -u -m t",
  "GIT_DIR=/x git commit",
  "command git commit",
  "/usr/bin/git commit",
  '"/usr/bin/git" commit',
  "\\git commit",
  "git\tcommit",
  "if true; then git commit; fi",
  "! git commit",
  "{ git commit; }",
  "find . -exec git add {} \\;",
  "timeout 5 git commit",
  "nohup git commit",
  "rtk git commit",
  "git config alias.ci commit && git ci -m x",
  "git config --show-origin --remove-section x",
  "git config --get --unset user.name",
  "git fsck --lost-found",
  "git sparse-checkout set x",
  "git bisect start",
  "git submodule update",
  "git replace a b",
  "git -P commit",
  "git --no-pager commit",
  "git -C /x -c a=b commit",
  "git -C/x commit",
  "x=1; git commit",
  "npm test&&git commit",
  "echo ok || git reset",
  'FOO="a b" git commit',
  "env -i git commit",
  'git -C "$HOME" commit',
  // added per brief item 6:
  "cat <<'EOF'\n(git stash)\nEOF\ngit commit",
  "git ci -m x", // unknown alias

  // --- second-review fixes -------------------------------------------------------------------------

  // item 2: command substitution inside double quotes, and heredoc detection honouring quoting.
  'echo "$(git commit -m x)"',
  'echo "`git commit -m x`"',
  'echo "a<<X"\ngit commit -m x',

  // item 6: wrapper and shell forms.
  "nice -10 git commit -m x",
  "time -p git commit -m x",
  "command -p git commit -m x",
  "exec -a g git commit -m x",
  "timeout -s KILL 10 git commit -m x",
  "timeout -k 5 10 git commit -m x",
  'env -S "git commit -m x"',
  "eval git commit -m x",
  'bash -lc "git commit -m x"',
  'sh -e -c "git commit -m x"',

  // item 1: read-only subcommands that still write.
  "git tag --sort=refname newtag",
  'git tag --format="%(refname)" newtag',
  "git branch --delete foo --list",
  "git branch --contains HEAD --delete foo",
  "git branch --force main HEAD~1 --list",
  "git remote -v add evil https://x.invalid",
  "git remote -v remove origin",
  "git log --output=/Users/x/file",
  "git diff --output=README.md",
  "git show --output=README.md HEAD",
  "git archive -o README.md HEAD",
  "git archive --output=README.md HEAD",
  "git fetch . HEAD:refs/heads/new",
  'git fetch --upload-pack="touch /tmp/pwn" .',
  "git fetch -u .",
  "git symbolic-ref -d HEAD",
  "git symbolic-ref --delete HEAD",
]

// --- read-only git commands: every one of these must be allowed (exit 0) --------------------------------

const ALLOWED = [
  "git status",
  "git diff 8155a4f..100b387",
  "git log --oneline",
  "git show HEAD:a",
  "git -C /x log",
  "git worktree add /tmp/x 8155a4f",
  "git worktree list",
  "git branch --show-current",
  "git stash list",
  "git grep commit",
  "git log --grep=reset",
  "git show HEAD -- src/checkout.ts",
  "git diff -- restore.js",
  'git log -S "git commit"',
  'echo "git commit"',
  'rg "git commit" .',
  "git log --format=%s | grep merge",
  "git config --get alias.ci",
  "git blame -- clean.sh",
  "git ls-files add",
  "git diff --stat HEAD~1 -- stash.md",
  "git rev-parse HEAD",
  "git -C /x diff --name-only",
  "git cat-file -p HEAD",
  "git log -n 5 -- merge.c",
  "git show --stat commit",
  "git help commit",
  "git commit --help",
  "git merge-base a b",
  "git fetch",
  "git fetch --prune",
  "git apply --check x.patch",
  "git apply --stat x.patch",
  "cat > f <<'E'\n(git stash)\nE",
  "git log --author add",
  "git diff --no-index a b",
  // added per brief item 6:
  "cat <<'EOF'\nnot a command\nEOF",
  "git -C '/a b' stash list",
  'bash -c "git status"',
  "echo a | xargs echo hi",
  "sudo -u me git status",
  'rg "search for git commit in history" README.md',

  // --- second-review fixes -------------------------------------------------------------------------

  // item 5: allow these read-only forms now refused.
  "git reflog -n 5",
  "git reflog --all",
  "git remote --verbose",
  "git config user.name",
  "git config --get-urlmatch http https://x",
  "git notes",
  "git submodule",
  "git show-branch",
  "git check-ref-format refs/heads/x",
  "git hash-object README.md",

  // item 1: the ALLOWED counterparts of the tag/remote/fetch/output/archive/symbolic-ref fixes.
  "git tag -l newtag",
  "git tag --sort=refname -l",
  "git remote show origin",
  "git remote get-url origin",
  "git symbolic-ref HEAD",

  // item 6: wrapper forms that must still allow a genuinely read-only git command.
  "nice -10 git status",
  "time -p git status",
  "command -p git status",
  "exec -a g git status",
  "timeout -s KILL 10 git status",
  'env -S "git status"',
  "eval git status",
  'bash -lc "git status"',
  'sh -e -c "git status"',
]

for (const cmd of BLOCKED) {
  test(`blocks: ${cmd}`, () => {
    const r = runBash(cmd)
    assert.equal(r.status, 2, `expected exit 2 for: ${cmd}\nstderr: ${r.stderr}\nstdout: ${r.stdout}`)
    assert.match(r.stderr, /test-agent:/)
  })
}

for (const cmd of ALLOWED) {
  test(`allows: ${cmd}`, () => {
    const r = runBash(cmd)
    assert.equal(r.status, 0, `expected exit 0 for: ${cmd}\nstderr: ${r.stderr}\nstdout: ${r.stdout}`)
  })
}

// --- fail-closed parsing (item 3) ---------------------------------------------------------------------

test("a substitution chain nested past the depth cap refuses with exit 2 and a parse-failure message, not a crash", () => {
  const nested = "$(".repeat(60) + "git commit -m x" + ")".repeat(60)
  const r = runBash(nested)
  assert.equal(r.status, 2, `expected a clean refusal, not a crash\nstderr: ${r.stderr}\nstdout: ${r.stdout}`)
  assert.match(r.stderr, /could not be parsed/)
})

test("a substitution chain within the depth cap still parses and blocks the git command inside it", () => {
  const nested = "$(".repeat(40) + "git commit -m x" + ")".repeat(40)
  const r = runBash(nested)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /not read-only/)
})

// --- message wording (item 4) -------------------------------------------------------------------------

test("a known git verb that is not read-only says 'is not read-only'", () => {
  const r = runBash("git commit -m x")
  assert.equal(r.status, 2)
  assert.match(r.stderr, /is not read-only/)
})

test("only a subcommand git does not know says 'unknown subcommand or alias'", () => {
  const r = runBash("git ci -m x")
  assert.equal(r.status, 2)
  assert.match(r.stderr, /unknown subcommand or alias/)
})

test("a --writes-under-tmp refusal names the allowed roots", () => {
  const r = runHook({ tool_name: "Write", tool_input: { file_path: "/etc/hosts" } }, ["--writes-under-tmp"])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /\/tmp/)
  assert.match(r.stderr, /\/private\/tmp/)
  assert.match(r.stderr, /\/var\/folders/)
  assert.match(r.stderr, /\$TMPDIR/)
})

// --- malformed / edge-case stdin ---------------------------------------------------------------------

test("malformed JSON on stdin never blocks, but warns on stderr", () => {
  const r = runHook("this is not json")
  assert.equal(r.status, 0)
  assert.match(r.stderr, /test-agent:/)
})

test("an empty JSON object allows the call", () => {
  const r = runHook({})
  assert.equal(r.status, 0)
})

test("a non-Bash, non-write tool is allowed untouched", () => {
  const r = runHook({ tool_name: "Read", tool_input: { file_path: "/etc/hosts" } })
  assert.equal(r.status, 0)
})

// --- --writes-under-tmp mode --------------------------------------------------------------------------

test("--writes-under-tmp allows a Write under the real tmp directory", () => {
  const tmpFile = path.join(os.tmpdir(), "git-read-only-test-allowed.txt")
  const r = runHook({ tool_name: "Write", tool_input: { file_path: tmpFile } }, ["--writes-under-tmp"])
  assert.equal(r.status, 0, r.stderr)
})

test("--writes-under-tmp blocks a Write outside tmp, naming the path", () => {
  const target = "/Users/someone/Development/repo/src/file.ts"
  const r = runHook({ tool_name: "Write", tool_input: { file_path: target } }, ["--writes-under-tmp"])
  assert.equal(r.status, 2)
  assert.match(r.stderr, new RegExp(target.replace(/[/]/g, "\\/")))
})

test("--writes-under-tmp blocks an Edit outside tmp", () => {
  const r = runHook({ tool_name: "Edit", tool_input: { file_path: "/etc/hosts" } }, ["--writes-under-tmp"])
  assert.equal(r.status, 2)
})

test("--writes-under-tmp allows a NotebookEdit under tmp", () => {
  const tmpFile = path.join(os.tmpdir(), "nb.ipynb")
  const r = runHook({ tool_name: "NotebookEdit", tool_input: { notebook_path: tmpFile } }, ["--writes-under-tmp"])
  assert.equal(r.status, 0, r.stderr)
})

test("without --writes-under-tmp, a Write outside tmp is allowed (write-restriction is opt-in)", () => {
  const r = runHook({ tool_name: "Write", tool_input: { file_path: "/etc/hosts" } })
  assert.equal(r.status, 0)
})

test("--writes-under-tmp still applies the git rules to a Bash command", () => {
  const r = runBash("git commit -m x", ["--writes-under-tmp"])
  assert.equal(r.status, 2)
})

test("--writes-under-tmp allows a read-only Bash git command", () => {
  const r = runBash("git status", ["--writes-under-tmp"])
  assert.equal(r.status, 0, r.stderr)
})

// --- --deny=<subcommands> mode: only the listed subcommands are refused -------------------------------
// For an agent that owns an isolated worktree and must check revisions out in it, but must never touch
// the shared stash or publish anything.

const DENY = ["--deny=stash,commit,push"]

for (const command of [
  "git stash list",
  "git -C /w stash push -m x",
  "bash -c 'git commit -m x'",
  "xargs git push",
  'echo "$(git commit -m x)"',
]) {
  test(`--deny refuses a listed subcommand: ${command}`, () => {
    const r = runBash(command, DENY)
    assert.equal(r.status, 2, `stderr: ${r.stderr}`)
    assert.match(r.stderr, /refused for this agent/)
  })
}

for (const command of [
  "git checkout --detach abc123",
  "git checkout -- .",
  "git switch main",
  "git reset --hard",
  "rg 'git commit' .",
  "git log --oneline",
]) {
  test(`--deny allows what it does not list: ${command}`, () => {
    const r = runBash(command, DENY)
    assert.equal(r.status, 0, `stderr: ${r.stderr}`)
  })
}
