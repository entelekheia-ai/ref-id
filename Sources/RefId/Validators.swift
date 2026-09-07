// SPDX-License-Identifier: Apache-2.0
//
// The one registry that maps a NAME the spec uses to behaviour: the owning validators (by
// `dispatch.<type>.validator`), the ways a delegated string is formed (by `dispatch.<type>.delegate`),
// the refinement range constraints (by `refinements.<key>.range`) and the policies this package
// implements. A validator or delegate name the spec uses and this file does not know degrades to
// `uncovered`; a range or policy name it does not know is a version mismatch, refused loudly.
//
// Package URL: no maintained Swift library exists for the format, so the core grammar of purl-spec
// (scheme, type, optional namespace, name, optional version, qualifiers and subpath) is validated
// here — a declared exception to delegation, of the same kind as the SWHID pattern.

import Foundation

struct Validation {
    let ok: Bool
    let canonical: String?
}

enum Validators {
    typealias Validator = (Spec, [String: Any], String) throws -> Validation

    static let validators: [String: Validator] = [
        "package-url": { _, _, delegated in Validation(ok: PackageURL.isValid(delegated), canonical: nil) },
        "declared-name": { spec, entry, delegated in
            let pattern = entry["pattern"] as? String ?? ""
            return Validation(ok: try Grammar.of(spec).pattern(pattern).matches(delegated), canonical: nil)
        },
    ]

    struct Delegator {
        let form: (String, String) -> String
        let foldsType: Bool
    }

    static let delegators: [String: Delegator] = [
        "type-prefixed": Delegator(form: { type, locator in type + Structure.field + locator }, foldsType: true),
        "verbatim": Delegator(form: { _, locator in locator }, foldsType: false),
    ]

    static let ranges: [String: (String, String) -> Bool] = [
        "ascending": { value, boundSeparator in
            let bounds = boundSeparator.isEmpty ? [value] : value.components(separatedBy: boundSeparator)
            guard bounds.count >= 2, let first = Int(bounds[0]), let second = Int(bounds[1]) else { return true }
            return first <= second
        },
    ]

    static let policies = (unknownKey: "carry-through", repeatedKey: "malformed")

    private static var checked = Set<ObjectIdentifier>()
    private static let lock = NSLock()

    /// Refuses a spec whose declared policies or range names are ones this package does not implement.
    static func assertImplemented(_ spec: Spec) throws {
        lock.lock()
        defer { lock.unlock() }
        if checked.contains(ObjectIdentifier(spec)) { return }
        let declared: [(String, String, String)] = [
            ("grammar.state.unknownKey", spec.string("grammar", "state", "unknownKey"), policies.unknownKey),
            ("unknownRefinement", spec.string("unknownRefinement"), policies.unknownKey),
            ("grammar.state.repeatedKey", spec.string("grammar", "state", "repeatedKey"), policies.repeatedKey),
            ("grammar.fragment.repeatedKey", spec.string("grammar", "fragment", "repeatedKey"), policies.repeatedKey),
        ]
        for (field, value, implemented) in declared where value != implemented {
            throw RefIdError.specVersion("spec.\(field) declares \"\(value)\"; this package implements only \"\(implemented)\"")
        }
        for (key, refinement) in spec.dictionary("refinements") {
            if let range = (refinement as? [String: Any])?["range"] as? String, ranges[range] == nil {
                throw RefIdError.specVersion("spec.refinements.\(key).range declares \"\(range)\", which this package does not implement")
            }
        }
        checked.insert(ObjectIdentifier(spec))
    }

    static func delegatedString(_ spec: Spec, type: String, locator: String) -> String? {
        guard let entry = spec.dictionary("dispatch")[type] as? [String: Any],
              let mode = entry["delegate"] as? String, let delegator = delegators[mode] else { return nil }
        return delegator.form(type, locator)
    }

    static func foldsType(_ spec: Spec, type: String) -> Bool {
        guard let entry = spec.dictionary("dispatch")[type] as? [String: Any], let mode = entry["delegate"] as? String else { return false }
        return delegators[mode]?.foldsType ?? false
    }

    /// Runs the owning validator, or nil when the spec names one this package does not implement.
    static func validateLocator(_ spec: Spec, entry: [String: Any], delegated: String) throws -> Validation? {
        guard let name = entry["validator"] as? String, let validator = validators[name] else { return nil }
        return try validator(spec, entry, delegated)
    }

    static func rangeHolds(_ refinement: [String: Any], value: String) -> Bool {
        guard let range = refinement["range"] as? String, let check = ranges[range] else { return true }
        return check(value, refinement["boundSeparator"] as? String ?? "")
    }
}

/// The purl-spec core grammar: `pkg:type/[namespace/]name[@version][?qualifiers][#subpath]`.
enum PackageURL {
    static func isValid(_ purl: String) -> Bool {
        guard purl.hasPrefix("pkg:") else { return false }
        var rest = String(purl.dropFirst(4))
        if let hash = rest.firstIndex(of: "#") { rest = String(rest[..<hash]) }
        if let question = rest.firstIndex(of: "?") {
            let qualifiers = rest[rest.index(after: question)...]
            rest = String(rest[..<question])
            for pair in qualifiers.split(separator: "&", omittingEmptySubsequences: false) {
                guard let equals = pair.firstIndex(of: "="), pair.distance(from: pair.startIndex, to: equals) > 0 else { return false }
            }
        }
        while rest.hasPrefix("/") { rest = String(rest.dropFirst()) }
        guard let slash = rest.firstIndex(of: "/") else { return false }
        let type = rest[..<slash]
        guard let first = type.first, first.isASCII, first.isLetter,
              type.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "+" || $0 == "-") }) else { return false }
        let remainder = String(rest[rest.index(after: slash)...])
        // The version is the `@` inside the LAST segment (the name); an `@` in a namespace segment — an npm
        // scope written unencoded, which the reference validators accept — is not a version separator.
        var segments = remainder.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard var name = segments.popLast() else { return false }
        if let at = name.firstIndex(of: "@") {
            let version = name[name.index(after: at)...]
            guard !version.isEmpty else { return false }
            name = String(name[..<at])
        }
        guard !name.isEmpty else { return false }
        return true
    }
}
