#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Builds the Rust hostile-input battery in a scratch directory against this checkout's crate, and runs it.
# The manifest is written here, at run time, so no committed file carries a machine path. Each case runs
# in a child process: an abort (stack overflow, panic) shows as `exit=None` or a non-zero exit, and any
# such line is a finding.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../../.." && pwd)
SCRATCH=${REFID_SCRATCH:-$(mktemp -d -t ref-id-attack-rust)}
mkdir -p "$SCRATCH/battery/src"
cp "$HERE/rust/src/main.rs" "$SCRATCH/battery/src/main.rs"
cat > "$SCRATCH/battery/Cargo.toml" <<EOF
[package]
name = "ref-id-attack-battery"
version = "0.0.0"
edition = "2021"
[dependencies]
ref-id = { path = "$ROOT/crates/ref-id" }
serde_json = "1"
[workspace]
EOF
cargo build -q --manifest-path "$SCRATCH/battery/Cargo.toml"
REFID_ROOT=$ROOT REFID_SCRATCH=$SCRATCH "$SCRATCH/battery/target/debug/ref-id-attack-battery"
