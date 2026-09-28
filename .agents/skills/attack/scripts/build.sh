#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Builds every implementation once, so the other scripts run binaries rather than rebuilding per call.
# Prints one line per implementation; a failed build stops the review, because a probe against a stale
# binary judges code that is no longer there.
set -eu
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
cd "$ROOT"
npm ci --silent >/dev/null 2>&1 || npm install --silent >/dev/null
npm run build --silent >/dev/null && echo "typescript: built"
cargo build -q --example parse_lines && echo "rust: target/debug/examples/parse_lines"
swift build -q --product ref-id-conformance && echo "swift: .build/debug/ref-id-conformance"
(cd python && uv sync -q) && echo "python: python/.venv"
