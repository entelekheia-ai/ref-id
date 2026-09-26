#!/usr/bin/env node
// git-read-only.mjs — a Claude Code PreToolUse hook that refuses every git invocation whose subcommand is
// not read-only, and (in --writes-under-tmp mode) refuses a Write/Edit/NotebookEdit outside a tmp
// directory.
//
//   node git-read-only.mjs <agent-name> [--writes-under-tmp] [--deny=<subcommand>,…]
//
// Reads the hook's JSON payload on stdin. Exits 2 with a one-line reason on stderr to block the tool
// call; exits 0 to allow it. Malformed JSON on stdin never blocks on its own bug: it prints a warning to
// stderr and exits 0.
//
// The git-command parser does not regex-match the whole string. It strips heredoc bodies, splits the
// command into "simple commands" the way a shell would (on ; & && || | newline ( ) { } ! backticks and
// $( ... ), respecting quoting), and then, for each simple command, strips leading shell keywords,
// environment assignments and known wrapper programs (sudo, nice, timeout, nohup, env, command, exec,
// time, stdbuf, xargs, rtk, and bash|sh|zsh|dash -c <string>, which recurses into the string) before
// deciding whether what remains is a git invocation and, if so, whether its subcommand is allowed.

import path from "node:path"

const agentName = process.argv[2] ?? "git-read-only"
const writesUnderTmp = process.argv.includes("--writes-under-tmp")
// --deny=a,b,c replaces the read-only allowlist with a short denylist, for an agent that owns an isolated
// worktree and checks revisions out in it but must never touch the shared stash or publish.
const denyArg = process.argv.find((a) => a.startsWith("--deny="))
const denyList = denyArg ? new Set(denyArg.slice("--deny=".length).split(",").filter(Boolean)) : null

// --- stdin -----------------------------------------------------------------------------------------

function readStdin() {
  return new Promise((resolve) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (data += chunk))
    process.stdin.on("end", () => resolve(data))
    process.stdin.on("error", () => resolve(data))
  })
}

function block(reason) {
  console.error(`${agentName}: ${reason}`)
  process.exit(2)
}

function allow() {
  process.exit(0)
}

// --- heredoc stripping -------------------------------------------------------------------------------
//
// Removes heredoc bodies (<<EOF / <<'EOF' / <<-EOF, up to the terminator line) before anything else, so a
// heredoc's data is never mistaken for a command. A here-string (<<<word) is left alone: it has no body.
//
// A "<<" is only a heredoc start outside quotes: quote state (single or double) is tracked character by
// character and carried from one line to the next, so a "<<" written inside a quoted string on its own
// line (e.g. echo "a<<X") is never mistaken for the start of a heredoc whose body would otherwise swallow
// every following line looking for a terminator that never arrives.

const HEREDOC_WORD_RE = /^(-)?\s*(?:'([^']*)'|"([^"]*)"|(\\?[A-Za-z_][A-Za-z0-9_]*))/

function stripHeredocs(input) {
  const lines = input.split("\n")
  const out = []
  let i = 0
  let carryInSingle = false
  let carryInDouble = false
  while (i < lines.length) {
    const line = lines[i]
    const terminators = []
    let inSingle = carryInSingle
    let inDouble = carryInDouble
    let j = 0
    while (j < line.length) {
      const c = line[j]
      if (inSingle) {
        if (c === "'") inSingle = false
        j++
        continue
      }
      if (inDouble) {
        if (c === "\\" && j + 1 < line.length) {
          j += 2
          continue
        }
        if (c === '"') inDouble = false
        j++
        continue
      }
      if (c === "\\" && j + 1 < line.length) {
        j += 2
        continue
      }
      if (c === "'") {
        inSingle = true
        j++
        continue
      }
      if (c === '"') {
        inDouble = true
        j++
        continue
      }
      if (c === "<" && line[j + 1] === "<" && line[j + 2] !== "<") {
        const m = HEREDOC_WORD_RE.exec(line.slice(j + 2))
        if (m) {
          const dash = Boolean(m[1])
          const term = (m[2] ?? m[3] ?? m[4] ?? "").replace(/^\\/, "")
          if (term) terminators.push({ dash, term })
          j += 2 + m[0].length
          continue
        }
      }
      j++
    }
    carryInSingle = inSingle
    carryInDouble = inDouble
    out.push(line)
    i++
    for (const { dash, term } of terminators) {
      while (i < lines.length) {
        const bodyLine = lines[i]
        const compare = dash ? bodyLine.replace(/^\t+/, "") : bodyLine
        i++
        if (compare === term) break
      }
    }
  }
  return out.join("\n")
}

// --- command substitutions: `...` and $( ... ) --------------------------------------------------------
//
// Found outside single quotes (which suppress substitution entirely). Each one's inner text is
// recursively split into its own simple commands (pushed onto `collector`), and the substitution itself
// is replaced by a single space in the outer text — it is a command boundary, not part of a word.

// Command substitutions and wrapper unwrapping (bash -c, env -S, eval, …) all recurse into
// splitCommandString again. A pathologically deep chain of either — most simply $(...) nested past 50
// levels — must refuse outright rather than exhaust the call stack: an uncaught RangeError would crash
// the hook process, which (being a bug, not a policy decision) could leave the caller uncertain whether
// the tool call was actually blocked. MAX_SUBSTITUTION_DEPTH bounds it explicitly, well under any
// platform's real stack limit, so the refusal is deterministic rather than a stack-size gamble.
const MAX_SUBSTITUTION_DEPTH = 50
class TooDeepError extends Error {}

function extractSubstitutions(str, collector, depth) {
  let out = ""
  let i = 0
  let inSingle = false
  let inDouble = false
  while (i < str.length) {
    const c = str[i]
    if (inSingle) {
      out += c
      if (c === "'") inSingle = false
      i++
      continue
    }
    // Backslash-escaping and quote-toggling apply the same whether or not we're inside double quotes.
    // Command substitution ($( ... ) and `...`) is never suppressed by double quotes — only single quotes
    // suppress it — so the checks below run in both states; only single quotes take an early continue.
    if (c === "\\" && i + 1 < str.length) {
      out += c + str[i + 1]
      i += 2
      continue
    }
    if (c === "'") {
      if (!inDouble) inSingle = true
      out += c
      i++
      continue
    }
    if (c === '"') {
      inDouble = !inDouble
      out += c
      i++
      continue
    }
    if (c === "`") {
      let j = i + 1
      let inner = ""
      while (j < str.length && str[j] !== "`") {
        if (str[j] === "\\" && j + 1 < str.length) {
          inner += str[j + 1]
          j += 2
          continue
        }
        inner += str[j]
        j++
      }
      collector.push(...splitCommandString(inner, depth + 1))
      out += " "
      i = j + 1
      continue
    }
    if (c === "$" && str[i + 1] === "(") {
      let parenDepth = 1
      let j = i + 2
      let inner = ""
      let s1 = false
      let d1 = false
      while (j < str.length && parenDepth > 0) {
        const cc = str[j]
        if (s1) {
          inner += cc
          if (cc === "'") s1 = false
          j++
          continue
        }
        if (d1) {
          if (cc === "\\" && j + 1 < str.length) {
            inner += cc + str[j + 1]
            j += 2
            continue
          }
          inner += cc
          if (cc === '"') d1 = false
          j++
          continue
        }
        if (cc === "'") {
          s1 = true
          inner += cc
          j++
          continue
        }
        if (cc === '"') {
          d1 = true
          inner += cc
          j++
          continue
        }
        if (cc === "\\" && j + 1 < str.length) {
          inner += cc + str[j + 1]
          j += 2
          continue
        }
        if (cc === "(") {
          parenDepth++
          inner += cc
          j++
          continue
        }
        if (cc === ")") {
          parenDepth--
          j++
          if (parenDepth === 0) break
          inner += cc
          continue
        }
        inner += cc
        j++
      }
      collector.push(...splitCommandString(inner, depth + 1))
      out += " "
      i = j
      continue
    }
    out += c
    i++
  }
  return out
}

// --- splitting on shell metacharacters -----------------------------------------------------------------
//
// ; & && || | newline ( ) { } and a standalone ! token, all outside quotes.

function splitOnMetachars(str) {
  const chunks = []
  let cur = ""
  let inSingle = false
  let inDouble = false
  let i = 0
  const push = () => {
    chunks.push(cur)
    cur = ""
  }
  while (i < str.length) {
    const c = str[i]
    if (inSingle) {
      cur += c
      if (c === "'") inSingle = false
      i++
      continue
    }
    if (inDouble) {
      if (c === "\\" && i + 1 < str.length) {
        cur += c + str[i + 1]
        i += 2
        continue
      }
      cur += c
      if (c === '"') inDouble = false
      i++
      continue
    }
    if (c === "'") {
      inSingle = true
      cur += c
      i++
      continue
    }
    if (c === '"') {
      inDouble = true
      cur += c
      i++
      continue
    }
    if (c === "\\" && i + 1 < str.length) {
      cur += c + str[i + 1]
      i += 2
      continue
    }
    if (c === "\n" || c === ";" || c === "(" || c === ")" || c === "{" || c === "}") {
      push()
      i++
      continue
    }
    if (c === "&") {
      push()
      i += str[i + 1] === "&" ? 2 : 1
      continue
    }
    if (c === "|") {
      push()
      i += str[i + 1] === "|" ? 2 : 1
      continue
    }
    if (c === "!" && cur.trim() === "" && (i === 0 || /\s/.test(str[i - 1])) && (i + 1 >= str.length || /\s/.test(str[i + 1]))) {
      push()
      i++
      continue
    }
    cur += c
    i++
  }
  push()
  return chunks
}

// --- word-splitting one simple command's text, with shell quoting --------------------------------------

function wordSplit(str) {
  const words = []
  let cur = ""
  let curHasContent = false
  let inSingle = false
  let inDouble = false
  let i = 0
  while (i < str.length) {
    const c = str[i]
    if (inSingle) {
      if (c === "'") {
        inSingle = false
        i++
        continue
      }
      cur += c
      i++
      continue
    }
    if (inDouble) {
      if (c === '"') {
        inDouble = false
        i++
        continue
      }
      if (c === "\\" && i + 1 < str.length && '\\$`"\n'.includes(str[i + 1])) {
        cur += str[i + 1]
        i += 2
        continue
      }
      cur += c
      i++
      continue
    }
    if (c === "'") {
      inSingle = true
      curHasContent = true
      i++
      continue
    }
    if (c === '"') {
      inDouble = true
      curHasContent = true
      i++
      continue
    }
    if (c === "\\" && i + 1 < str.length) {
      if (str[i + 1] === "\n") {
        i += 2
        continue
      }
      cur += str[i + 1]
      curHasContent = true
      i += 2
      continue
    }
    if (/\s/.test(c)) {
      if (cur.length || curHasContent) {
        words.push(cur)
        cur = ""
        curHasContent = false
      }
      i++
      continue
    }
    cur += c
    curHasContent = true
    i++
  }
  if (cur.length || curHasContent) words.push(cur)
  return words
}

// --- one command string -> every simple command in it, as an array of words ----------------------------
//
// Recurses into command substitutions found inside it. Does NOT recurse into bash -c <string>: that
// requires stripping wrapper words first, which happens one level up (see collectGitCommands).

function splitCommandString(raw, depth = 0) {
  if (depth > MAX_SUBSTITUTION_DEPTH) throw new TooDeepError("substitution or wrapper nesting too deep")
  const collector = []
  const stripped = stripHeredocs(raw)
  const noSubs = extractSubstitutions(stripped, collector, depth)
  for (const chunk of splitOnMetachars(noSubs)) {
    const words = wordSplit(chunk)
    if (words.length) collector.push(words)
  }
  return collector
}

// --- stripping keywords, assignments and wrapper programs off one simple command ------------------------

const basename = (p) => p.split("/").pop()
const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until"])
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/
const XARGS_VALUE_FLAGS = ["-I", "-n", "-P", "-L", "-d", "-s"]

function stripWrappers(words) {
  let i = 0
  while (i < words.length) {
    const w = words[i]
    if (KEYWORDS.has(w) || w === "!") {
      i++
      continue
    }
    if (ASSIGNMENT_RE.test(w)) {
      i++
      continue
    }
    const base = basename(w)
    if (base === "sudo") {
      i++
      while (i < words.length && words[i].startsWith("-")) {
        const opt = words[i]
        i += opt === "-u" || opt === "-g" || opt === "-C" ? 2 : 1
      }
      continue
    }
    if (base === "nice") {
      i++
      if (words[i] === "-n") i += 2
      else if (/^-\d+$/.test(words[i] ?? "")) i += 1 // "nice -10 cmd" — the adjustment as a bare -N
      continue
    }
    if (base === "timeout") {
      i++
      while (i < words.length && words[i].startsWith("-")) {
        const opt = words[i]
        if (opt === "-s" || opt === "--signal" || opt === "-k" || opt === "--kill-after") i += 2
        else i += 1
      }
      if (i < words.length) i++ // the duration
      continue
    }
    if (base === "nohup") {
      i++
      continue
    }
    if (base === "env") {
      i++
      while (i < words.length) {
        if (words[i] === "-i") {
          i++
          continue
        }
        if (words[i] === "-u" && words[i + 1] !== undefined) {
          i += 2
          continue
        }
        if (words[i] === "-S" && words[i + 1] !== undefined) {
          // "env -S STRING" splits STRING with shell-like rules and runs it: recurse into it as a new
          // command string, the same way "bash -c STRING" does.
          return { recurseInto: words[i + 1] }
        }
        if (words[i].startsWith("-S") && words[i].length > 2) {
          return { recurseInto: words[i].slice(2) }
        }
        if (ASSIGNMENT_RE.test(words[i])) {
          i++
          continue
        }
        break
      }
      continue
    }
    if (base === "eval") {
      // "eval ARGS..." re-parses its arguments, joined by a space, as a new command string.
      return { recurseInto: words.slice(i + 1).join(" ") }
    }
    if (base === "time") {
      i++
      while (words[i] === "-p" || words[i] === "-v") i++
      continue
    }
    if (base === "command") {
      i++
      while (words[i] === "-p" || words[i] === "-v" || words[i] === "-V") i++
      continue
    }
    if (base === "exec") {
      i++
      while (i < words.length && words[i].startsWith("-")) {
        if (words[i] === "-a" && words[i + 1] !== undefined) i += 2
        else i += 1
      }
      continue
    }
    if (base === "rtk") {
      i++
      continue
    }
    if (base === "stdbuf") {
      i++
      while (i < words.length && words[i].startsWith("-")) i++
      continue
    }
    if (base === "xargs") {
      i++
      while (i < words.length && words[i].startsWith("-")) {
        const opt = words[i]
        let matched = false
        for (const flag of XARGS_VALUE_FLAGS) {
          if (opt === flag) {
            i += 2
            matched = true
            break
          }
          if (opt.startsWith(flag) && opt.length > flag.length) {
            i += 1
            matched = true
            break
          }
        }
        if (!matched) i += 1
      }
      continue
    }
    if (base === "bash" || base === "sh" || base === "zsh" || base === "dash") {
      // Any number of leading option words (each either a lone "-c" or a short-option cluster that
      // contains a "c", e.g. "-lc") before the string argument counts as "-c <string>": bash -lc "..." and
      // sh -e -c "..." both mean "run this string".
      let j = i + 1
      let foundC = false
      while (j < words.length) {
        const w = words[j]
        if (w === "-c") {
          foundC = true
          j++
          break
        }
        if (/^-[A-Za-z]*c[A-Za-z]*$/.test(w)) {
          foundC = true
          j++
          break
        }
        if (w.startsWith("-")) {
          j++
          continue
        }
        break
      }
      if (foundC && words[j] !== undefined) {
        return { recurseInto: words[j] }
      }
    }
    break
  }
  return { words: words.slice(i) }
}

// --- deciding whether a git invocation's subcommand is read-only ---------------------------------------

const READONLY_SUBCOMMANDS = new Set([
  "status", "diff", "log", "show", "blame", "grep", "ls-files", "ls-tree", "ls-remote", "rev-parse",
  "rev-list", "merge-base", "describe", "cat-file", "for-each-ref", "show-ref", "shortlog", "name-rev",
  "check-ignore", "check-attr", "var", "version", "help", "count-objects", "whatchanged", "range-diff",
  "diff-tree", "diff-index", "diff-files", "cherry", "verify-commit", "verify-tag", "fsck",
  "show-branch", "check-ref-format", "hash-object",
])

// diff, log, show and the other diff-family subcommands can all be told to write their output to a file
// with --output/--output=; that is a write, however read-only the rest of the invocation looks.
const DIFF_OUTPUT_SUBCOMMANDS = new Set([
  "diff", "log", "show", "diff-tree", "diff-index", "diff-files", "range-diff", "whatchanged",
])
const hasOutputFlag = (args) => args.some((a) => a === "--output" || a.startsWith("--output="))

// A known git subcommand that is not read-only says so ("is not read-only"); only a subcommand git itself
// does not know (an unrecognised word, or an alias like "ci") says "unknown subcommand or alias". This
// list need not be exhaustive over every git subcommand that exists — it only has to cover the ones this
// hook's own tests exercise as a known write — an omission here just falls back to the "unknown" wording
// for that one uncommon subcommand, which still refuses the call either way.
const WRITE_SUBCOMMANDS = new Set([
  "add", "am", "bisect", "checkout", "checkout-index", "cherry-pick", "clean", "clone", "commit",
  "fast-export", "fast-import", "filter-branch", "format-patch", "gc", "init", "maintenance", "merge",
  "mv", "pack-refs", "prune", "pull", "push", "read-tree", "rebase", "repack", "replace",
  "request-pull", "reset", "restore", "revert", "rm", "send-email", "sparse-checkout", "rerere",
  "stripspace", "switch", "update-index", "update-ref",
])

const GLOBAL_EQ_OPTIONAL_VALUE = ["--git-dir", "--work-tree", "--namespace", "--config-env"]
const GLOBAL_BARE_FLAGS = new Set([
  "-p", "-P", "--paginate", "--no-pager", "--bare", "--no-replace-objects", "--literal-pathspecs",
  "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs", "--no-optional-locks",
])

function skipGlobalOptions(words) {
  let i = 1 // words[0] is "git"
  while (i < words.length) {
    const w = words[i]
    if (w === "--") {
      i++
      break
    }
    if (w === "-C" || w === "-c") {
      i += 2
      continue
    }
    if (w === "--exec-path" || w.startsWith("--exec-path=")) {
      i += 1
      continue
    }
    const eqFlag = GLOBAL_EQ_OPTIONAL_VALUE.find((f) => w === f || w.startsWith(`${f}=`))
    if (eqFlag) {
      i += w.includes("=") ? 1 : 2
      continue
    }
    if (GLOBAL_BARE_FLAGS.has(w)) {
      i += 1
      continue
    }
    break
  }
  return i
}

function checkConfig(args) {
  const readFlags = new Set([
    "--get", "--get-all", "--get-regexp", "--get-urlmatch", "--list", "-l", "--show-origin", "--show-scope",
  ])
  // A write flag makes the call a write even beside a read flag: --show-origin --remove-section writes.
  const writeFlags = new Set([
    "--unset", "--unset-all", "--remove-section", "--rename-section", "--add", "--replace-all", "--edit", "-e",
  ])
  if (args.some((a) => writeFlags.has(a.split("=")[0]))) return false
  let hasReadFlag = false
  let hasOtherFlag = false
  let positionals = 0
  for (const a of args) {
    if (readFlags.has(a)) {
      hasReadFlag = true
      continue
    }
    if (a.startsWith("-")) {
      hasOtherFlag = true
      continue
    }
    positionals++
  }
  // A bare "git config <key>" (no flags at all) is always a get, regardless of an explicit --get.
  if (!hasReadFlag && !hasOtherFlag && positionals === 1) return true
  // --get-urlmatch takes two positionals (a type and a URL), every other read form takes at most one.
  const cap = args.includes("--get-urlmatch") ? 3 : 2
  return hasReadFlag && positionals < cap
}

function checkBranch(args) {
  const refused = new Set([
    "-d", "-D", "--delete", "-f", "--force", "-m", "-M", "--move", "-c", "-C", "--copy", "-u",
    "--set-upstream-to", "--unset-upstream", "--edit-description",
  ])
  const listFlags = new Set(["--list", "-l", "--contains", "--merged", "--no-merged", "--points-at"])
  let sawList = false
  let positionals = 0
  for (const a of args) {
    if (refused.has(a) || a.startsWith("--set-upstream-to=")) return false
    if (listFlags.has(a) || a.startsWith("--points-at=")) {
      sawList = true
      continue
    }
    if (a.startsWith("-")) continue
    positionals++
  }
  return positionals === 0 || sawList
}

function checkTag(args) {
  // Only -l/--list puts this in list mode: --sort/--format/-n/--contains/--points-at no longer imply it
  // on their own, so "git tag --sort=refname newtag" (a create, decorated with a sort flag) is refused.
  const listFlags = new Set(["-l", "--list"])
  let sawList = false
  let positionals = 0
  for (const a of args) {
    if (listFlags.has(a)) {
      sawList = true
      continue
    }
    if (a.startsWith("-")) continue
    positionals++
  }
  return positionals === 0 || sawList
}

function checkApply(args) {
  const allowed = new Set(["--check", "--stat", "--numstat", "--summary"])
  const forbidden = new Set(["--apply", "--index", "--cached"])
  let hasAllowed = false
  for (const a of args) {
    if (forbidden.has(a)) return false
    if (allowed.has(a)) hasAllowed = true
  }
  return hasAllowed
}

function checkSymbolicRef(args) {
  if (args.some((a) => a === "-d" || a === "--delete")) return false
  return args.filter((a) => !a.startsWith("-")).length <= 1
}

function checkRemote(args) {
  // Skip leading options (e.g. -v/--verbose) to find the first positional: the remote subcommand.
  let i = 0
  while (i < args.length && args[i].startsWith("-")) i++
  const first = args[i]
  return first === undefined || first === "show" || first === "get-url"
}

function checkFetch(args) {
  for (const a of args) {
    if (a === "--upload-pack" || a.startsWith("--upload-pack=") || a === "-u") return false
    if (!a.startsWith("-") && a.includes(":")) return false
  }
  return true
}

function checkArchive(args) {
  return !args.some((a) => a === "-o" || a === "--output" || a.startsWith("--output="))
}

function checkGitInvocation(words) {
  const i = skipGlobalOptions(words)
  if (i >= words.length) return { ok: true }
  const sub = words[i]
  if (sub === "--version" || sub === "--help") return { ok: true }
  const rest = words.slice(i + 1)
  if (rest[0] === "-h" || rest[0] === "--help") return { ok: true }

  if (READONLY_SUBCOMMANDS.has(sub)) {
    if (DIFF_OUTPUT_SUBCOMMANDS.has(sub) && hasOutputFlag(rest)) return { ok: false }
    // fsck is a read, except that --lost-found writes the dangling objects it finds into .git/lost-found.
    if (sub === "fsck" && rest.includes("--lost-found")) return { ok: false }
    return { ok: true }
  }

  switch (sub) {
    case "reflog":
      // A bare option with no subcommand word (-n 5, --all) is still just a read.
      return { ok: rest.length === 0 || rest[0] === "show" || rest[0] === "exists" || rest[0].startsWith("-") }
    case "config":
      return { ok: checkConfig(rest) }
    case "branch":
      return { ok: checkBranch(rest) }
    case "tag":
      return { ok: checkTag(rest) }
    case "stash":
      return { ok: rest[0] === "list" || rest[0] === "show" }
    case "worktree":
      return { ok: rest[0] === "list" || rest[0] === "add" }
    case "remote":
      return { ok: checkRemote(rest) }
    case "notes":
      return { ok: rest.length === 0 || rest[0] === "show" || rest[0] === "list" }
    case "submodule":
      return { ok: rest.length === 0 || rest[0] === "status" || rest[0] === "summary" }
    case "apply":
      return { ok: checkApply(rest) }
    case "symbolic-ref":
      return { ok: checkSymbolicRef(rest) }
    case "fetch":
      return { ok: checkFetch(rest) }
    case "archive":
      return { ok: checkArchive(rest) }
    default:
      return { ok: false, unknown: !WRITE_SUBCOMMANDS.has(sub), sub }
  }
}

// --- top-level: every git invocation reachable from one Bash command string -----------------------------

function collectGitCommands(command) {
  const results = []
  const queue = splitCommandString(command)
  while (queue.length) {
    const words = queue.shift()
    const stripped = stripWrappers(words)
    if (stripped.recurseInto !== undefined) {
      queue.push(...splitCommandString(stripped.recurseInto))
      continue
    }
    const rem = stripped.words
    if (!rem.length) continue
    // find's -exec/-execdir carries an embedded command, terminated by a bare ";" or "+" word — not a
    // shell wrapper (it does not sit at the front of a simple command), so it is handled here rather than
    // in stripWrappers.
    if (basename(rem[0]) === "find") {
      for (let k = 1; k < rem.length; k++) {
        if (rem[k] !== "-exec" && rem[k] !== "-execdir") continue
        let end = k + 1
        while (end < rem.length && rem[end] !== ";" && rem[end] !== "+") end++
        const embedded = rem.slice(k + 1, end)
        if (embedded.length) queue.push(embedded)
        k = end
      }
      continue
    }
    if (basename(rem[0]) !== "git") continue
    results.push(rem)
  }
  return results
}

function checkBashCommand(command) {
  // Fail closed: any exception while parsing (including a substitution chain nested past
  // MAX_SUBSTITUTION_DEPTH) refuses the call rather than let a parser bug crash the hook process and
  // leave the caller unsure whether the tool call was actually blocked.
  let gitCommands
  try {
    gitCommands = collectGitCommands(command)
  } catch {
    return "this command could not be parsed, so it is refused rather than risk missing a git write"
  }
  for (const gitWords of gitCommands) {
    const shown = gitWords.slice(0, 6).join(" ")
    if (denyList) {
      const sub = gitWords[skipGlobalOptions(gitWords)]
      if (sub && denyList.has(sub)) return `git ${sub} is refused for this agent: ${shown}`
      continue
    }
    const result = checkGitInvocation(gitWords)
    if (!result.ok) {
      if (result.unknown) {
        return `unknown subcommand or alias (git ${result.sub}) is refused: ${shown}`
      }
      return `this git command is not read-only and is refused: ${shown}`
    }
  }
  return null
}

// --- tmp-only writes (--writes-under-tmp mode) -----------------------------------------------------------

function isUnderTmp(p) {
  const resolved = path.resolve(p)
  const roots = ["/tmp", "/private/tmp", "/var/folders"]
  if (process.env.TMPDIR) roots.push(path.resolve(process.env.TMPDIR))
  return roots.some((root) => {
    const clean = root.replace(/\/+$/, "")
    return resolved === clean || resolved.startsWith(`${clean}/`)
  })
}

// --- main ------------------------------------------------------------------------------------------------

async function main() {
  const raw = await readStdin()
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    console.error(`${agentName}: git-read-only hook could not parse its own stdin as JSON — allowing the call (this is a bug in the hook, not a policy decision)`)
    allow()
    return
  }

  const toolName = payload?.tool_name
  const toolInput = payload?.tool_input ?? {}

  if (toolName === "Bash") {
    const command = typeof toolInput.command === "string" ? toolInput.command : ""
    const reason = checkBashCommand(command)
    if (reason) block(reason)
    allow()
    return
  }

  if (writesUnderTmp && (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit")) {
    const target = toolInput.file_path ?? toolInput.notebook_path
    if (typeof target !== "string" || !isUnderTmp(target)) {
      block(
        `writes are restricted to a tmp directory in this mode (/tmp, /private/tmp, /var/folders, $TMPDIR); ` +
          `refusing ${toolName} to ${target ?? "(no path given)"}`,
      )
      return
    }
    allow()
    return
  }

  allow()
}

main()
