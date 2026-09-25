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
        "package-url": { _, _, delegated in PackageURL.validate(delegated) },
        "declared-name": { spec, entry, delegated in
            let pattern = entry["pattern"] as? String ?? ""
            return Validation(ok: try Grammar.of(spec).pattern(pattern).matches(delegated), canonical: nil)
        },
        // A number whose shape is right and whose check digit is wrong is a typo, not an identifier —
        // and it is the one error a pattern cannot see. Both registered schemes reduce to the same
        // weighted sum, so one function serves them; neither adds a dependency, which the portability
        // guardrail requires.
        "check-digit": { spec, entry, delegated in
            let pattern = entry["pattern"] as? String ?? ""
            let matches = try Grammar.of(spec).pattern(pattern).matches(delegated)
            return Validation(ok: matches && checkDigitHolds(delegated), canonical: nil)
        },
    ]

    /// The check digit of a registered article number.
    ///
    /// A ten-character book number weights its digits 10..1 and is correct when the sum is divisible by
    /// eleven, which is why its last character may be `X` for the value ten. Every other length is a GS1
    /// trade item number: the digits before the last are weighted 3 and 1 alternately from the right, and
    /// the last is whatever brings the total up to a multiple of ten.
    static func checkDigitHolds(_ value: String) -> Bool {
        let characters = Array(value)
        if characters.count == 10 {
            let weighted = characters.enumerated().reduce(0) { sum, pair in
                let (index, char) = pair
                let digit = char == "X" ? 10 : (char.wholeNumberValue ?? 0)
                return sum + digit * (10 - index)
            }
            return weighted % 11 == 0
        }
        let digits = characters.map { $0.wholeNumberValue ?? 0 }
        guard let declared = digits.last else { return false }
        let weighted = digits.dropLast().reversed().enumerated().reduce(0) { sum, pair in
            let (index, digit) = pair
            return sum + digit * (index % 2 == 0 ? 3 : 1)
        }
        return (10 - (weighted % 10)) % 10 == declared
    }

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
///
/// No maintained Swift library exists for the format (see the file header), so both the validation and
/// the canonical serialisation are this package's own — the declared exception, of the same kind as the
/// SWHID pattern.
enum PackageURL {
    private struct Parsed {
        let type: String
        let namespace: [String]
        let name: String
        let version: String?
        let qualifiers: String?
    }

    /// Where a delegated `pkg:` string stops naming the package and starts being a path inside it.
    ///
    /// The same `@`-opens-a-segment rule as `Relations.split`, applied here to the whole `pkg:type/...`
    /// string rather than to a bare locator: an `@` preceded by `/`, or first in the string, opens a
    /// namespace segment and is part of the name; an `@` inside a segment closes the name and starts the
    /// version, which runs to the next `/` — everything after that `/` is the subpath. No such `@`, or
    /// one with nothing after it but the version, leaves the whole string as the base with no subpath.
    ///
    /// Walks `utf8` bytes, not `Character`s, for the same reason `Relations.split` does: `@` and `/` are
    /// each one ASCII byte that never occurs as a continuation byte of another code point, so a byte scan
    /// cannot mistake a combining mark for a boundary the way a grapheme-cluster walk can.
    private static func splitSubpath(_ delegated: String) -> (base: String, subpath: String?) {
        let bytes = Array(delegated.utf8)
        let at = UInt8(ascii: "@")
        let slash = UInt8(ascii: "/")
        guard bytes.count > 1 else { return (delegated, nil) }
        for index in 1..<bytes.count {
            guard bytes[index] == at, bytes[index - 1] != slash else { continue }
            guard let slashIndex = bytes[index...].firstIndex(of: slash) else { return (delegated, nil) }
            let base = String(decoding: bytes[..<slashIndex], as: UTF8.self)
            let subpath = String(decoding: bytes[(slashIndex + 1)...], as: UTF8.self)
            return (base, subpath.isEmpty ? nil : subpath)
        }
        return (delegated, nil)
    }

    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    private static func percentEncode(_ segment: String) -> String {
        segment.addingPercentEncoding(withAllowedCharacters: unreserved) ?? segment
    }

    /// The subpath's own canonical form: `.`/`..`/empty segments dropped, each remaining segment
    /// percent-encoded — purl-spec's subpath rule. `nil` when nothing survives the filter.
    private static func encodeSubpath(_ subpath: String) -> String? {
        let segments = subpath.split(byScalar: "/", omittingEmpty: true)
            .filter { $0 != "." && $0 != ".." }
        guard !segments.isEmpty else { return nil }
        return segments.map(percentEncode).joined(separator: "/")
    }

    private static func parse(_ purl: String) -> Parsed? {
        guard purl.hasPrefix("pkg:") else { return nil }
        // Every delimiter search below is by Unicode scalar, for the reason `Bytes.swift` gives.
        var rest = String(purl.dropFirst(4))
        var qualifiers: String?
        if let (before, query) = rest.splitOnce(byScalar: "?") {
            rest = before
            for pair in query.split(byScalar: "&", omittingEmpty: false) {
                guard let (key, _) = pair.splitOnce(byScalar: "="), !key.isEmpty else { return nil }
            }
            qualifiers = query
        }
        while rest.unicodeScalars.first == "/" { rest = String(Substring(rest.unicodeScalars.dropFirst())) }
        guard let (type, remainder) = rest.splitOnce(byScalar: "/") else { return nil }
        guard let first = type.first, first.isASCII, first.isLetter,
              type.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "+" || $0 == "-") }) else { return nil }
        // The version is the `@` inside the LAST segment (the name); an `@` in a namespace segment — an npm
        // scope written unencoded, which the reference validators accept — is not a version separator.
        var segments = remainder.split(byScalar: "/", omittingEmpty: false)
        guard var name = segments.popLast() else { return nil }
        var version: String?
        if let (before, tail) = name.splitOnce(byScalar: "@") {
            guard !tail.isEmpty else { return nil }
            version = tail
            name = before
        }
        guard !name.isEmpty else { return nil }
        return Parsed(type: type, namespace: segments, name: name, version: version, qualifiers: qualifiers)
    }

    /// Percent-encoding is applied to the decoded value, never to whatever spelling arrived.
    ///
    /// Encoding an already-encoded segment turns `%40acme` into `%2540acme`, a different name — so the
    /// segment is decoded first and the operation becomes idempotent, which is what lets two spellings
    /// of one package reach the same canonical form. A segment that is not valid encoding decodes to
    /// nothing, and is then passed through as written rather than mangled.
    private static func reEncode(_ segment: String) -> String {
        percentEncode(segment.removingPercentEncoding ?? segment)
    }

    /// The canonical spelling of a Package URL, per the specification's own normalisation rules.
    ///
    /// Three of them are not cosmetic, because two systems comparing identifiers by canonical form must
    /// agree or they disagree about whether two ids name one thing: the type is lower-cased, every
    /// name segment is encoded from its decoded value, and qualifiers are ordered by key. The reference
    /// implementation and the Rust port get all three from their purl libraries; this port has no
    /// maintained library to get them from, so they are written here and bound by vectors.
    private static func serialise(_ parsed: Parsed) -> String {
        var out = "pkg:" + parsed.type.lowercased() + "/"
        if !parsed.namespace.isEmpty {
            out += parsed.namespace.map(reEncode).joined(separator: "/") + "/"
        }
        out += reEncode(parsed.name)
        if let version = parsed.version { out += "@" + version }
        if let qualifiers = parsed.qualifiers, !qualifiers.isEmpty {
            let ordered = qualifiers
                .split(separator: "&", omittingEmptySubsequences: true)
                .sorted { left, right in
                    let key = { (pair: Substring) in pair.split(separator: "=", maxSplits: 1).first ?? pair }
                    return key(left).lexicographicallyPrecedes(key(right))
                }
                .joined(separator: "&")
            out += "?" + ordered
        }
        return out
    }

    /// Validates a delegated `pkg:` string and, when it is valid, its canonical spelling — the subpath
    /// carried as the Package URL's own `#subpath` component, never left inline after the version.
    static func validate(_ delegated: String) -> Validation {
        let (base, subpath) = splitSubpath(delegated)
        guard let parsed = parse(base) else { return Validation(ok: false, canonical: nil) }
        var canonical = serialise(parsed)
        if let subpath, let encoded = encodeSubpath(subpath) {
            canonical += "#" + encoded
        }
        return Validation(ok: true, canonical: canonical)
    }
}
