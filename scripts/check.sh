#!/usr/bin/env bash
# check.sh — the canonical way to run this repository's full governance gate by hand.
#
# Running the governance runner directly composes only its built-in checks and silently omits every
# fragment this repository owns, while still reporting "N checks, 0 failed". This script sets what has
# to be set, so the correct invocation has a name shorter than the mistake. It is also what
# .githooks/pre-commit runs, so this gives the identical result without committing.
#
# Unlike the hook it always runs the fragments' self-test: a manual check has no per-commit cost to
# protect and should give the strongest guarantee available. It reports the same way the hook does —
# only what failed or warned — with one difference: a fully clean run still prints the summary line,
# because this run was *asked for* and whoever typed the command is owed an answer. The hook was not
# asked for and says nothing at all. GATE_VERBOSE=1 prints everything, in both.
set -uo pipefail

SELF_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$SELF_DIR" rev-parse --show-toplevel)
CHECK_DIR="$ROOT/scripts/checks"

if [ -x "$CHECK_DIR/self-test.sh" ]; then
  if ! "$CHECK_DIR/self-test.sh"; then
    echo "check.sh: the fragments' self-test failed — a check has stopped detecting what it was written for." >&2
    exit 1
  fi
fi

if [ ! -f "$CHECK_DIR/_run.sh" ]; then
  echo "check.sh: $CHECK_DIR/_run.sh not found — scripts/checks/ is missing or moved." >&2
  echo "The gate cannot check its own composition without it." >&2
  exit 1
fi
# shellcheck source=scripts/checks/_run.sh
. "$CHECK_DIR/_run.sh"
run_composed_checks "$ROOT"
RC=$?

if [ "${GATE_VERBOSE:-}" = "1" ]; then
  printf '%s\n' "$RUN_OUTPUT"
  exit "$RC"
fi

if [ "$RC" -ne 0 ]; then
  run_actionable_lines
  exit "$RC"
fi

# Clean: the warnings, then the runner's own summary line — which is also the only place the composed
# check count is visible without GATE_VERBOSE=1, and that count is what a reader would need in order to
# notice a fragment directory that stopped composing. Grepped rather than tailed: the summary's
# position is the runner's business, its shape is a contract.
printf '%s\n' "$RUN_OUTPUT" | grep -E '^WARN ' || true
printf '%s\n' "$RUN_OUTPUT" | grep -E '^[0-9]+ checks, [0-9]+ failed'
exit 0
