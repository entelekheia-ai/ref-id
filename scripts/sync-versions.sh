#!/bin/sh
# One version line for every implementation. changesets versions packages/ref-id/package.json; this copies
# that version into the crate manifest and the Python project, so `changeset version` (run as `npm run version`) leaves every manifest
# agreeing. Swift has no manifest version: its release is the `v<version>` tag the workflow pushes.
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./packages/ref-id/package.json').version")
perl -pi -e 'BEGIN { $v = shift } s/^version = "[^"]+"/version = "$v"/ && ($done++ == 0) or 1' "$version" crates/ref-id/Cargo.toml
cargo update -p ref-id --offline >/dev/null 2>&1 || true
echo "crate ref-id -> $version"
perl -pi -e 'BEGIN { $v = shift } s/^version = "[^"]+"/version = "$v"/ && ($done++ == 0) or 1' "$version" python/pyproject.toml
(cd python && uv lock -q)
echo "python ref-id -> $version"
