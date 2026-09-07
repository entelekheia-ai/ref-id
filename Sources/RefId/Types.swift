// SPDX-License-Identifier: Apache-2.0

/// A `key=value` pair, in the order it appeared in the input, value kept verbatim.
public struct Pair: Equatable, Sendable {
    public let key: String
    public let value: String
    public init(_ key: String, _ value: String) {
        self.key = key
        self.value = value
    }
}

public struct Fragment: Equatable, Sendable {
    public let path: String
    public let refinements: [Pair]
    public init(path: String, refinements: [Pair]) {
        self.path = path
        self.refinements = refinements
    }
}

/// What `parse` returns. `status` is one of `spec.statuses`; `part` one of `spec.parts` on `malformed`.
public struct ParseResult: Equatable, Sendable {
    public var input: String
    public var status: String
    public var version: Int
    public var explicitVersion: Bool
    /// The version token as written, when explicit — so that serialising returns the same bytes.
    public var versionText: String?
    public var type: String
    /// The captured group, verbatim.
    public var locator: String
    /// The string handed to the owning validator, formed per `dispatch.<type>.delegate`; nil when the type is not dispatched.
    public var delegated: String?
    /// The validator's own canonical spelling of `delegated`, when the format defines one.
    public var canonical: String?
    public var qualifiers: [Pair]
    /// The decoded identifier behind each qualifier value that nests one.
    public var nested: [String: String]?
    public var fragment: Fragment?
    public var part: String?

    /// The result as the JSON shape the specification's vectors describe — what a conformance test compares.
    public func asJSON() -> [String: Any] {
        var out: [String: Any] = [
            "input": input,
            "status": status,
            "version": version,
            "explicitVersion": explicitVersion,
            "type": type,
            "locator": locator,
            "qualifiers": qualifiers.map { [$0.key, $0.value] },
        ]
        out["fragment"] = fragment.map { ["path": $0.path, "refinements": $0.refinements.map { [$0.key, $0.value] }] as [String: Any] } ?? NSNull()
        if let versionText { out["versionText"] = versionText }
        if let delegated { out["delegated"] = delegated }
        if let canonical { out["canonical"] = canonical }
        if let nested { out["nested"] = nested }
        if let part { out["part"] = part }
        return out
    }
}

public enum QualifierValue: Equatable, Sendable {
    case plain(String)
    case nested(String)
}

public enum FragmentParts: Equatable, Sendable {
    case path(String)
    case full(path: String, refinements: [Pair])
}

/// The parts a producer hands to `build`. `location` never reaches the identifier.
public struct BuildParts {
    public var type: String
    /// For a type-prefixed dispatch, either the bare group (`npm/x@1.0.0`) or the intact format string (`pkg:npm/x@1.0.0`).
    public var locator: String
    public var qualifiers: [(String, QualifierValue)]
    public var fragment: FragmentParts?
    public var location: Any?
    public init(type: String, locator: String, qualifiers: [(String, QualifierValue)] = [], fragment: FragmentParts? = nil, location: Any? = nil) {
        self.type = type
        self.locator = locator
        self.qualifiers = qualifiers
        self.fragment = fragment
        self.location = location
    }
}

public struct EnvelopeResult: Equatable, Sendable {
    public let admissible: Bool
    public let reason: String?
}

/// Every error this package raises. `parse` raises none for an identifier problem.
public enum RefIdError: Error, Equatable {
    /// `build` was given a part the grammar cannot carry.
    case build(part: String, message: String)
    /// `digest` was given a member that is not one identifier string.
    case digest(part: String, message: String)
    /// `serialise` was given a result that has no faithful string form.
    case serialise(part: String, message: String)
    /// The embedded specification does not match its sidecar digest.
    case specIntegrity(String)
    /// The embedded specification declares a version or vocabulary this package does not support.
    case specVersion(String)

    public var part: String? {
        switch self {
        case .build(let part, _), .digest(let part, _), .serialise(let part, _): return part
        case .specIntegrity, .specVersion: return nil
        }
    }
}

import Foundation
