# _run.sh — run the governance gate, compose it with this repository's own fragments, and prove they
# actually composed.
#
# Shared by .githooks/pre-commit and scripts/check.sh so both give the identical guarantee, instead of
# only the hook knowing how to invoke this correctly.
#
# THE REASON THIS EXISTS AS A SHARED FILE. A bare `vibe-ops check .`, run without
# VIBE_OPS_CHECK_DIRS, composes only the built-in checks and silently omits every fragment this
# repository owns — and still reports "N checks, 0 failed". Someone reaching for the gate directly
# to "just check by hand" gets a clean-looking run that checked none of this repository's own rules.
# scripts/check.sh exists so the correct invocation has a name shorter than the mistake.
#
# The leading underscore keeps this out of the gate's NN-*.sh fragment glob.
#
# Sets RUN_OUTPUT (the gate's stdout+stderr, or an error message) and RUN_RC. Returns 0 only if the
# gate ran AND this repository's fragment directory actually composed into it.

# THE GATE IS `vibe-ops` ON PATH, AND THERE IS NO FALLBACK. This file used to resolve a shell runner
# from three places — a snapshot copied into scripts/, a sibling vibe-ops checkout, then
# ${CLAUDE_PLUGIN_ROOT} — because that runner was a standalone shell script that needed no install.
# It is not one any more: the checks are composed by the CLI, so the CLI is the requirement.
#
# WHAT THAT COSTS, SAID OUT LOUD: the snapshot branch existed so that this repository, cloned alone by
# someone who has none of this tooling, still had a working gate. It no longer does. An outside
# contributor who clones and commits gets the failure below rather than a check — a real regression,
# accepted deliberately, because the alternative is keeping a second implementation of every check alive
# in shell forever.
#
# The requirement is not new to anyone who has the plugin: the plugin's own MCP server is started as
# `vibe-ops mcp` from PATH, and its skill-scoped hooks name the same binary. A machine without it
# already gets a loud failure there, by design; this is the same precondition, now also on the gate.
CLI_INSTALL_RECIPE="npm link -w @entelekheia/vibe-ops-cli   # from a vibe-ops checkout"

run_composed_checks() { # $1 = repository root
  local root="$1"
  local check_dir="$root/scripts/checks"

  if ! command -v vibe-ops >/dev/null 2>&1; then
    RUN_OUTPUT="no \`vibe-ops\` on PATH — this repository's gate cannot run.
The governance checks are composed by the vibe-ops CLI, so the CLI is required to commit here.
Install it with:
  $CLI_INSTALL_RECIPE
There is deliberately no fallback: a gate that silently passes because its checker is missing is worse
than one that refuses."
    RUN_RC=2
    return 2
  fi

  # The directory itself missing entirely — moved, renamed, or never created — is checked before the
  # gate is even invoked, and reported by name rather than folded into the fallback below. Discovered
  # running this template for real (Plan-020 Track 3): the gate silently skips a fragment directory
  # that is not there ([ -d "$dir" ] || continue), so this is a failure of the gate itself, not of the
  # tree being checked.
  if [ ! -d "$check_dir" ]; then
    RUN_OUTPUT="$check_dir does not exist.
The gate cannot check this repository's own fragments without it — scripts/checks/ is missing or moved."
    RUN_RC=1
    return 1
  fi

  # --verbose, and it is load-bearing rather than taste — measured, not assumed. `vibe-ops check`
  # filters its own output by default, and the line it drops is `N checks, M failed`: the CLI returns
  # that as the module's summary and renders it with a prefix, so the bare form both check.sh and the
  # hook grep for never appears. Without --verbose a clean run prints NOTHING and exits 0 — a gate that
  # says nothing whether or not it ran. (The composition list survives the filter either way; it is the
  # summary that does not, which is the opposite of what it looks like from the filter's own regex.)
  # This function captures everything and filters at print time (run_actionable_lines), so asking for
  # the full run costs the caller no noise.
  RUN_OUTPUT=$(VIBE_OPS_CHECK_DIRS="$check_dir" vibe-ops check --verbose "$root" 2>&1)
  RUN_RC=$?

  if [ "$RUN_RC" -ne 0 ]; then
    return "$RUN_RC"
  fi

  # Gate integrity, checked before "0 failed" is believed — but only when this directory actually
  # holds a fragment to lose. A freshly installed harness's scripts/checks/ is legitimately empty
  # until its first /vibe-ops:new-signal, and asserting composition against nothing would fail every
  # fresh install before it had written a single rule of its own — measured directly rolling this
  # template out to five repositories that want the built-in checks and nothing repo-specific yet.
  # Once a fragment exists, its absence from the output is exactly the silent failure this assertion
  # exists to catch: a renamed fragment, or a glob pattern that stopped matching, still reporting
  # "0 failed".
  local own_fragments
  own_fragments=$(find "$check_dir" -maxdepth 1 -name '[0-9][0-9]-*.sh' 2>/dev/null)
  if [ -n "$own_fragments" ] && ! printf '%s\n' "$RUN_OUTPUT" | grep -q "$check_dir"; then
    RUN_OUTPUT="$RUN_OUTPUT

$check_dir holds a fragment, but none of them were composed into the run:
$own_fragments
The gate reported success without running this repository's own checks."
    RUN_RC=1
    return 1
  fi

  return 0
}

# The only lines that ask a reader to do something: what failed, and what was warned about. Everything
# else the gate prints — its banner, its composition list, one `ok` or `SKIP` per check — is the gate
# reporting that it worked, which is the expected case and needs no announcement.
#
# This holds INSIDE a failing run too, which is the part that is easy to get wrong. It is tempting to
# print everything when a commit is blocked, on the theory that the surrounding lines are context; they
# are not. The expensive reader is the agent, not the terminal, and a commit made through a tool call
# puts every printed line into a conversation that has to carry it for the rest of the session.
run_actionable_lines() {
  printf '%s\n' "$RUN_OUTPUT" | grep -E '^(FAIL|WARN) ' || printf '%s\n' "$RUN_OUTPUT"
}
