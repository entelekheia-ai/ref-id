// swift-tools-version: 5.9
// SPDX-License-Identifier: Apache-2.0
//
// The Swift port of the ref: identifier scheme. The manifest sits at the repository root because
// Swift Package Manager resolves a git dependency's manifest only there; the specification it
// embeds is a copy of spec/ref-id.json, held byte-identical by a test.

import PackageDescription

let package = Package(
    name: "RefId",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "RefId", targets: ["RefId"]),
        .executable(name: "ref-id-conformance", targets: ["RefIdConformance"]),
    ],
    targets: [
        .target(
            name: "RefId",
            resources: [.copy("Resources/ref-id.json"), .copy("Resources/ref-id.json.sha256")]
        ),
        // The conformance runner is an executable rather than a test target so that it runs on a
        // toolchain without XCTest or the Swift Testing macros (Command Line Tools alone). It is the gate:
        // `swift run ref-id-conformance` exits non-zero on any failed vector.
        .executableTarget(name: "RefIdConformance", dependencies: ["RefId"]),
    ]
)
