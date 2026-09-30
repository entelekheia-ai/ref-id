// swift-tools-version: 5.9
// SPDX-License-Identifier: Apache-2.0
//
// The Swift port of the ref: identifier scheme. The manifest sits at the repository root because
// Swift Package Manager resolves a git dependency's manifest only there; the specification it
// embeds is a copy of spec/ref-id.json, held byte-identical by a test.

import PackageDescription

let package = Package(
    name: "RefId",
    // The floor is Swift's `Regex` (the grammar is compiled from the specification at runtime), which
    // every Apple platform ships from the same release onwards. A platform left out defaults to a
    // deployment target older than `Regex`, and the package then fails to build there.
    platforms: [.macOS(.v13), .iOS(.v16), .macCatalyst(.v16), .tvOS(.v16), .watchOS(.v9), .visionOS(.v1)],
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
