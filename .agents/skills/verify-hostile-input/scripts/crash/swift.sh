#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Builds the Swift hostile-input battery in a scratch directory against this checkout's package, and runs
# it. The manifest is written here, at run time, so no committed file carries a machine path; SwiftPM
# names a path dependency after its last path component, so the product is resolved from that name. Each
# case runs in a child process: a trap shows as `SIGNAL`, and any such line is a finding.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../../.." && pwd)
SCRATCH=${REFID_SCRATCH:-$(mktemp -d -t ref-id-attack-swift)}
mkdir -p "$SCRATCH/battery/Sources/crash"
cp "$HERE/swift/Sources/crash/main.swift" "$SCRATCH/battery/Sources/crash/main.swift"
cat > "$SCRATCH/battery/Package.swift" <<EOF
// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "crash",
  platforms: [.macOS(.v13)],
  dependencies: [.package(path: "$ROOT")],
  targets: [.executableTarget(name: "crash", dependencies: [.product(name: "RefId", package: "$(basename "$ROOT")")])]
)
EOF
swift build -q --package-path "$SCRATCH/battery"
REFID_ROOT=$ROOT REFID_SCRATCH=$SCRATCH "$SCRATCH/battery/.build/debug/crash"
