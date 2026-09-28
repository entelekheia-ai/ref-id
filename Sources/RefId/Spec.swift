// SPDX-License-Identifier: Apache-2.0
//
// Loads the embedded spec/ref-id.json, verifies its digest against the sidecar, and checks the
// specVersion major. The spec's own data is never restated here: it is read dynamically from the
// parsed JSON, through the accessors below.

import Foundation

/// The `ref:` specification, read dynamically. Every table the code consults is looked up here.
public final class Spec: @unchecked Sendable {
    let root: [String: Any]

    init(root: [String: Any]) {
        self.root = root
    }

    // MARK: dynamic access

    func value(_ path: [String]) -> Any? {
        var current: Any = root
        for key in path {
            guard let dictionary = current as? [String: Any], let next = dictionary[key] else { return nil }
            current = next
        }
        return current
    }

    func string(_ path: String...) -> String { value(path) as? String ?? "" }
    func optionalString(_ path: String...) -> String? { value(path) as? String }
    /// `int64Value`, not `intValue`: a table entry (`version.maximum`) can carry a magnitude past
    /// `Int32`, and `intValue` would silently truncate it.
    func int(_ path: String...) -> Int { Int((value(path) as? NSNumber)?.int64Value ?? 0) }
    /// Same lookup as `int(_:)`, kept as `Int64` for a magnitude the platform `Int` might not hold
    /// (irrelevant on the 64-bit platforms this package targets, but the type says what is guaranteed).
    func int64(_ path: String...) -> Int64 { (value(path) as? NSNumber)?.int64Value ?? 0 }
    func bool(_ path: String...) -> Bool {
        guard let number = value(path) as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return false }
        return number.boolValue
    }
    func strings(_ path: String...) -> [String] { value(path) as? [String] ?? [] }
    func ints(_ path: String...) -> [Int] { (value(path) as? [NSNumber])?.map { $0.intValue } ?? [] }
    func dictionary(_ path: String...) -> [String: Any] { value(path) as? [String: Any] ?? [:] }
    func array(_ path: String...) -> [Any] { value(path) as? [Any] ?? [] }
    func table(_ path: String...) -> [String: String] { value(path) as? [String: String] ?? [:] }

    /// Resolves a JSON Pointer (RFC 6901) written as a spec field's value — e.g. a refinement's
    /// `maximum` naming `/version/maximum` — against this document itself. Only the unescaped case is
    /// needed: every pointer this spec writes names plain object keys, never one containing `~` or `/`.
    func pointer(_ ptr: String) -> Any? {
        guard ptr.hasPrefix("/") else { return nil }
        return value(ptr.dropFirst().split(separator: "/").map(String.init))
    }

    /// An integer read through a JSON Pointer into this document, as `Int64` for a magnitude an `Int`
    /// might not hold.
    func int64(atPointer ptr: String) -> Int64? { (pointer(ptr) as? NSNumber)?.int64Value }

    public var specVersion: String { string("specVersion") }
    public var scheme: String { string("scheme") }
    var statuses: [String] { strings("statuses") }
    var parts: [String] { strings("parts") }
    var unknownType: String { string("unknownType") }

    /// A status name this code needs, checked against the vocabulary the spec declares.
    func status(_ name: String) throws -> String {
        guard statuses.contains(name) else {
            throw RefIdError.specVersion("this package names the status \"\(name)\", which spec \(specVersion) does not declare")
        }
        return name
    }

    /// A part name this code needs: one of `spec.parts`, or a declared qualifier or refinement key.
    func part(_ name: String) throws -> String {
        if parts.contains(name) || dictionary("qualifiers")[name] != nil || dictionary("refinements")[name] != nil {
            return name
        }
        throw RefIdError.specVersion("this package names the part \"\(name)\", which spec \(specVersion) does not declare")
    }
}

/// The major version this package was built against. Not spec data — the package's own contract.
private let supportedSpecMajor = "1"

enum SpecLoader {
    static func validate(json: Data, sidecar: String) throws -> Spec {
        let parsed = try JSONSerialization.jsonObject(with: json)
        // Bootstrap: no `Spec` exists yet to read `version.maximum` from, so it comes straight out of
        // the still-raw parsed JSON — the same field `canonicalise(_:)` reads once the `Spec` loads.
        let maximum = (((parsed as? [String: Any])?["version"] as? [String: Any])?["maximum"] as? NSNumber)?.int64Value ?? Int64.max
        let canonical = try Canonical.serialise(parsed, maximum: maximum)
        let computed = SHA256.hex(Array(canonical.utf8))
        let expected = sidecar.trimmingCharacters(in: .whitespacesAndNewlines)
        guard computed == expected else {
            throw RefIdError.specIntegrity("spec/ref-id.json does not match its sidecar digest (expected \(expected), computed \(computed))")
        }
        guard let root = parsed as? [String: Any] else {
            throw RefIdError.specIntegrity("spec/ref-id.json is not an object")
        }
        let spec = Spec(root: root)
        let major = spec.specVersion.split(separator: ".").first.map(String.init) ?? ""
        guard major == supportedSpecMajor else {
            throw RefIdError.specVersion("spec/ref-id.json declares specVersion \(spec.specVersion); this package supports major \(supportedSpecMajor)")
        }
        return spec
    }

    /// Loads and validates a spec + sidecar pair from a directory. Exposed for the integrity tests.
    static func load(from directory: URL) throws -> Spec {
        let json = try Data(contentsOf: directory.appendingPathComponent("ref-id.json"))
        let sidecar = try String(contentsOf: directory.appendingPathComponent("ref-id.json.sha256"), encoding: .utf8)
        return try validate(json: json, sidecar: sidecar)
    }

    static func embeddedURLs() throws -> (json: URL, sidecar: URL) {
        guard let json = Bundle.module.url(forResource: "ref-id", withExtension: "json"),
              let sidecar = Bundle.module.url(forResource: "ref-id.json", withExtension: "sha256") else {
            throw RefIdError.specIntegrity("the embedded specification resources are missing from the bundle")
        }
        return (json, sidecar)
    }

    private static let cached: Result<Spec, Error> = Result {
        let urls = try embeddedURLs()
        let json = try Data(contentsOf: urls.json)
        let sidecar = try String(contentsOf: urls.sidecar, encoding: .utf8)
        return try validate(json: json, sidecar: sidecar)
    }

    /// The validated embedded spec, loaded once.
    static func embedded() throws -> Spec {
        try cached.get()
    }
}

/// A specification read from a directory holding `ref-id.json` and its sidecar, verified the same way
/// as the embedded one.
public func loadSpecFrom(_ directory: URL) throws -> Spec {
    try SpecLoader.load(from: directory)
}

/// Deprecated spelling of `loadSpecFrom(_:)`, kept so a call written against it still compiles.
@available(*, deprecated, renamed: "loadSpecFrom(_:)")
public func loadSpec(from directory: URL) throws -> Spec {
    try SpecLoader.load(from: directory)
}

/// The validated spec this package embeds.
public func loadSpec() throws -> Spec {
    try SpecLoader.embedded()
}

// MARK: - surface for the conformance runner (an executable target cannot use @testable)

extension Spec {
    public func vectorClass(_ name: String) -> [[String: Any]] { array("vectors", name).compactMap { $0 as? [String: Any] } }
    public func roundtripVectors() -> [String] { strings("vectors", "roundtrip") }
    /// Every vector group name `spec.vectors` declares — so a runner can prove it executes all of
    /// them, not just the ones it happened to name by hand.
    public func vectorClasses() -> [String] { Array(dictionary("vectors").keys) }
    public func grammarExpression() -> String { string("grammar", "expression") }
}

/// The embedded specification's resource URLs — exposed so a runner can prove the copy is byte-identical to the repository's file.
public func embeddedSpecURLs() throws -> (json: URL, sidecar: URL) { try SpecLoader.embeddedURLs() }

/// The canonical JSON serialisation the specification's own digest is computed over.
public func canonicalise(_ value: Any?) throws -> String {
    try Canonical.serialise(value ?? NSNull(), maximum: try loadSpec().int64("version", "maximum"))
}

/// Deprecated spelling of `canonicalise(_:)`, kept so a call written against it still compiles.
@available(*, deprecated, renamed: "canonicalise(_:)")
public func canonicalJSON(_ value: Any?) throws -> String { try canonicalise(value) }

/// SHA-256 of a UTF-8 string, lowercase hex — the digest the sidecar carries.
public func sha256Hex(_ text: String) -> String { SHA256.hex(Array(text.utf8)) }
