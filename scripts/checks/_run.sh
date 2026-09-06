# _run.sh — resolve the runner, compose it with this repository's own fragments, and prove they
# actually composed.
#
# Shared by .githooks/pre-commit and scripts/check.sh so both give the identical guarantee, instead of
# only the hook knowing how to invoke this correctly.
#
# THE REASON THIS EXISTS AS A SHARED FILE. A bare `check-agents-md.sh .`, run without
# VIBE_OPS_CHECK_DIRS, composes only the built-in checks and silently omits every fragment this
# repository owns — and still reports "N checks, 0 failed". Someone reaching for the runner directly
# to "just check by hand" gets a clean-looking run that checked none of this repository's own rules.
# scripts/check.sh exists so the correct invocation has a name shorter than the mistake.
#
# The leading underscore keeps this out of the runner's NN-*.sh fragment glob.
#
# Sets RUN_OUTPUT (the runner's stdout+stderr, or an error message) and RUN_RC. Returns 0 only if the
# runner ran AND this repository's fragment directory actually composed into it.

# Where the runner is. Three sources, in this order:
#
#   1. A snapshot copied into this repository at scripts/check-agents-md.sh. It is a SNAPSHOT: it does
#      not update itself, and refreshing it is a deliberate re-copy. First because it is the only source
#      that survives this repository being cloned alone, outside whatever workspace authored it.
#   2. A sibling `vibe-ops` checkout, at $RUNNER_IN_CHECKOUT under ../vibe-ops/, relative to this
#      repository's own root. This is the one to prefer INSIDE a workspace that keeps several
#      repositories beside a shared vibe-ops checkout (entelekheia's Plan-020): there is nothing to
#      refresh, because it is always the live tree, and it costs nothing to add — but it does not exist
#      at all once this repository is cloned on its own, which is exactly why it is not first.
#   3. ${CLAUDE_PLUGIN_ROOT}, when something actually set it.
#
# THE SNAPSHOT IS FIRST BECAUSE THE THIRD SOURCE IS USUALLY ABSENT, and that is easy to get wrong in
# the optimistic direction. Measured 2026-08-07: CLAUDE_PLUGIN_ROOT is unset in an agent's own shell,
# not merely in a git hook — it is exported for processes the plugin runtime spawns, and a command run
# through the agent's shell tool is not one of them. A hook launched from that shell inherits the same
# nothing. So a repository that wants a gate needs the copy, or the sibling, and the third branch
# covers a caller that genuinely has the variable — nothing here should assume one exists.
#
# THE TRADE-OFF THE SIBLING BRANCH MAKES, SAID OUT LOUD: a repository wired to prefer it has no gate at
# all when cloned alone — the sibling directory simply is not there. That is the right shape for a
# workspace-internal standard, shared by several repositories that are never expected to travel apart,
# and the wrong one for a repository that ships its gate to outside contributors. Moving such a
# repository to the snapshot instead needs no change here — branch 1 already wins over branch 2 the
# moment the copy exists.
# Where the runner sits INSIDE a vibe-ops checkout. It has not been at `scripts/` since the CLI was
# packaged, and branches 2 and 3 below went on naming that path afterwards — so the sibling branch this
# workspace's own repositories are wired to prefer resolved nothing, silently, and every one of them fell
# through to branch 1 or to the error. Named once here rather than spelled out three times, because that
# is how the two copies came to disagree with reality while the third stayed right.
RUNNER_IN_CHECKOUT="cli/packages/module-check/sh/check-agents-md.sh"

resolve_runner() { # $1 = repository root; prints the runner path, or nothing
  local root="$1"
  if [ -x "$root/scripts/check-agents-md.sh" ]; then
    printf '%s' "$root/scripts/check-agents-md.sh"
  elif [ -x "$root/../vibe-ops/$RUNNER_IN_CHECKOUT" ]; then
    printf '%s' "$root/../vibe-ops/$RUNNER_IN_CHECKOUT"
  elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -x "${CLAUDE_PLUGIN_ROOT}/../$RUNNER_IN_CHECKOUT" ]; then
    printf '%s' "${CLAUDE_PLUGIN_ROOT}/../$RUNNER_IN_CHECKOUT"
  fi
}

run_composed_checks() { # $1 = repository root
  local root="$1"
  local runner check_dir="$root/scripts/checks"
  runner=$(resolve_runner "$root")

  if [ -z "$runner" ]; then
    RUN_OUTPUT="no governance runner found.
Expected a snapshot at $root/scripts/check-agents-md.sh, a sibling checkout at
$root/../vibe-ops/$RUNNER_IN_CHECKOUT, or CLAUDE_PLUGIN_ROOT pointing at the plugin.
A hook cannot reach an installed plugin, so a repository with a gate needs the copy or the sibling."
    RUN_RC=2
    return 2
  fi

  # The directory itself missing entirely — moved, renamed, or never created — is checked before the
  # runner is even invoked, and reported by name rather than folded into the fallback below. Discovered
  # running this template for real (Plan-020 Track 3): the runner silently skips a fragment directory
  # that is not there ([ -d "$dir" ] || continue), so this is a failure of the gate itself, not of the
  # tree being checked.
  if [ ! -d "$check_dir" ]; then
    RUN_OUTPUT="$check_dir does not exist.
The gate cannot check this repository's own fragments without it — scripts/checks/ is missing or moved."
    RUN_RC=1
    return 1
  fi

  RUN_OUTPUT=$(VIBE_OPS_CHECK_DIRS="$check_dir" "$runner" "$root" 2>&1)
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
# else the runner prints — its banner, its composition list, one `ok` or `SKIP` per check — is the gate
# reporting that it worked, which is the expected case and needs no announcement.
#
# This holds INSIDE a failing run too, which is the part that is easy to get wrong. It is tempting to
# print everything when a commit is blocked, on the theory that the surrounding lines are context; they
# are not. The expensive reader is the agent, not the terminal, and a commit made through a tool call
# puts every printed line into a conversation that has to carry it for the rest of the session.
run_actionable_lines() {
  printf '%s\n' "$RUN_OUTPUT" | grep -E '^(FAIL|WARN) ' || printf '%s\n' "$RUN_OUTPUT"
}
