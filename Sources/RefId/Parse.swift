// SPDX-License-Identifier: Apache-2.0
//
// Decomposes a `ref:` identifier string against the loaded spec. Order, and the precedence it
// produces: grammar → version → state and fragment decomposition, including the repeated-key policy
// → (unsupported version stops here, decomposed and unvalidated) → the two sides must not trade keys
// → qualifier values against their forms → refinement values against their patterns and range
// constraints → dispatch: unknown type is `uncovered`, else the locator goes to its validator.

import Foundation

private enum Decomposed<T> {
    case ok(T)
    case failed(part: String)
}

private struct Parser {
    let spec: Spec
    let grammar: Grammar

    func malformed(_ input: String, _ failedPart: String, _ head: ParseResult?) throws -> ParseResult {
        var result = head ?? ParseResult(input: input, status: "", version: spec.int("version", "default"), explicitVersion: false, type: "", locator: "", qualifiers: [], fragment: nil)
        result.input = input
        result.status = try spec.status("malformed")
        result.delegated = nil
        result.canonical = nil
        result.nested = nil
        result.part = try spec.part(failedPart)
        return result
    }

    func group(_ match: Regex<AnyRegexOutput>.Match, _ name: String) -> String? {
        guard let element = match[name] as AnyRegexOutput.Element?, let substring = element.substring else { return nil }
        return String(substring)
    }

    /// Splits `key=value` segments with the given pair grammar; a repeated key is malformed at that key.
    func pairs(_ regex: Regex<AnyRegexOutput>, _ segments: [String], _ failedPart: String) -> Decomposed<[Pair]> {
        var out: [Pair] = []
        var seen = Set<String>()
        for segment in segments {
            guard let match = try? regex.wholeMatch(in: segment), let key = group(match, "key") else { return .failed(part: failedPart) }
            if seen.contains(key) { return .failed(part: key) }
            seen.insert(key)
            out.append(Pair(key, group(match, "value") ?? ""))
        }
        return .ok(out)
    }

    func state(_ raw: String) -> Decomposed<[Pair]> {
        pairs(grammar.statePair, raw.components(separatedBy: spec.string("grammar", "state", "separator")), "state")
    }

    func fragment(_ raw: String) -> Decomposed<Fragment> {
        let segments = raw.components(separatedBy: spec.string("grammar", "fragment", "separator"))
        let path = segments.first ?? ""
        if path.isEmpty { return .failed(part: "fragment") }
        switch pairs(grammar.fragmentPair, Array(segments.dropFirst()), "fragment") {
        case .failed(let part): return .failed(part: part)
        case .ok(let refinements): return .ok(Fragment(path: path, refinements: refinements))
        }
    }

    /// A qualifier value that nests an identifier: strictly encoded, decoded with the form's table, parsed one level down.
    func tryNested(_ form: [String: Any], _ value: String, depth: Int) throws -> String? {
        let maxDepth = (form["depth"] as? NSNumber)?.intValue ?? 0
        guard depth < maxDepth, value.hasPrefix(schemePrefix(spec)) else { return nil }
        let table = Encoding.table(spec, form: form)
        guard Encoding.strictlyEncoded(value, table: table) else { return nil }
        let decoded = Encoding.decode(value, table: table)
        let inner = try parse(decoded, depth: depth + 1)
        return inner.status == (try spec.status("malformed")) ? nil : decoded
    }

    func matchForms(_ names: [String], _ value: String, depth: Int) throws -> (matches: Bool, nested: String?) {
        for name in names {
            guard let form = spec.dictionary("forms")[name] as? [String: Any] else { continue }
            if (form["nested"] as? NSNumber)?.boolValue == true {
                if let nested = try tryNested(form, value, depth: depth) { return (true, nested) }
                continue
            }
            if let pattern = form["pattern"] as? String, try grammar.pattern(pattern).matches(value) { return (true, nil) }
        }
        return (false, nil)
    }

    func parse(_ input: String, depth: Int) throws -> ParseResult {
        guard let match = try? grammar.top.wholeMatch(in: input) else { return try malformed(input, "grammar", nil) }
        let versionText = group(match, "version")
        let type = group(match, "type") ?? ""
        let locator = group(match, "locator") ?? ""
        let stateRaw = group(match, "state")
        let fragmentRaw = group(match, "fragment")

        let explicitVersion = versionText != nil
        let version = versionText.flatMap { Int($0) } ?? spec.int("version", "default")
        var head = ParseResult(input: input, status: "", version: version, explicitVersion: explicitVersion, versionText: versionText, type: type, locator: locator, qualifiers: [], fragment: nil)

        if let stateRaw {
            switch state(stateRaw) {
            case .failed(let part): return try malformed(input, part, head)
            case .ok(let qualifiers): head.qualifiers = qualifiers
            }
        }
        if let fragmentRaw {
            switch fragment(fragmentRaw) {
            case .failed(let part): return try malformed(input, part, head)
            case .ok(let fragment): head.fragment = fragment
            }
        }

        var base = head
        base.status = try spec.status("ok")
        base.delegated = Validators.delegatedString(spec, type: type, locator: locator)

        if !spec.ints("version", "supported").contains(version) {
            base.status = try spec.status("unsupported")
            return base
        }

        let refinementsTable = spec.dictionary("refinements")
        let qualifiersTable = spec.dictionary("qualifiers")
        for pair in head.qualifiers where refinementsTable[pair.key] != nil {
            return try malformed(input, pair.key, head)
        }
        if let fragment = head.fragment {
            for pair in fragment.refinements where qualifiersTable[pair.key] != nil {
                return try malformed(input, pair.key, head)
            }
        }

        var nested: [String: String] = [:]
        for pair in head.qualifiers {
            guard let declared = qualifiersTable[pair.key] as? [String: Any] else { continue } // unknownKey: carry-through
            let forms = declared["forms"] as? [String] ?? []
            let result = try matchForms(forms, pair.value, depth: depth)
            if !result.matches { return try malformed(input, pair.key, head) }
            if let value = result.nested { nested[pair.key] = value }
        }
        if !nested.isEmpty { base.nested = nested }

        if let fragment = head.fragment {
            for pair in fragment.refinements {
                guard let declared = refinementsTable[pair.key] as? [String: Any] else { continue } // unknownRefinement: carry-through
                let pattern = declared["pattern"] as? String ?? ""
                if try !grammar.pattern(pattern).matches(pair.value) || !Validators.rangeHolds(declared, value: pair.value) {
                    return try malformed(input, pair.key, head)
                }
            }
        }

        guard let entry = spec.dictionary("dispatch")[type] as? [String: Any], let delegated = base.delegated else {
            base.status = spec.unknownType
            return base
        }
        guard let validation = try Validators.validateLocator(spec, entry: entry, delegated: delegated) else {
            base.status = spec.unknownType
            return base
        }
        if !validation.ok { return try malformed(input, "locator", head) }
        base.canonical = validation.canonical
        return base
    }
}

/// Parses a `ref:` identifier string against the embedded spec. Never throws for an identifier problem;
/// it throws only when the embedded specification itself cannot be honoured.
public func parse(_ input: String) throws -> ParseResult {
    let spec = try loadSpec()
    try Validators.assertImplemented(spec)
    return try Parser(spec: spec, grammar: Grammar.of(spec)).parse(input, depth: 0)
}
