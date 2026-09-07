// SPDX-License-Identifier: Apache-2.0
//
// Compiles every pattern the spec declares through this engine's declared adaptations, and holds the
// only structural literals this package writes.

import Foundation

/// The dialect this port compiles for. Its adaptation list, when the spec declares one, is applied to every pattern.
let dialect = "swift-regex"

/// The structural literals of the scheme, each written exactly once, here. Their sources are
/// `spec.grammar.expression` (the field separator, the fragment introducer, the line breaks the
/// character classes exclude) and the two pair grammars (the key/value separator).
/// `Grammar.assertStructure` checks the patterns really carry them.
enum Structure {
    static let field = ":"
    static let fragmentIntroducer = "#"
    static let pair = "="
    static let lineBreaks: [Character] = ["\r", "\n"]
}

func schemePrefix(_ spec: Spec) -> String { spec.scheme + Structure.field }

final class Grammar {
    let top: Regex<AnyRegexOutput>
    let statePair: Regex<AnyRegexOutput>
    let fragmentPair: Regex<AnyRegexOutput>
    private var others: [String: Regex<AnyRegexOutput>] = [:]
    private let spec: Spec
    private let lock = NSLock()

    private static var cache: [ObjectIdentifier: Grammar] = [:]
    private static let cacheLock = NSLock()

    static func of(_ spec: Spec) throws -> Grammar {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        if let grammar = cache[ObjectIdentifier(spec)] { return grammar }
        let grammar = try Grammar(spec)
        cache[ObjectIdentifier(spec)] = grammar
        return grammar
    }

    private init(_ spec: Spec) throws {
        self.spec = spec
        try Grammar.assertStructure(spec)
        top = try Grammar.compile(spec, spec.string("grammar", "expression"))
        statePair = try Grammar.compile(spec, spec.string("grammar", "state", "pair"))
        fragmentPair = try Grammar.compile(spec, spec.string("grammar", "fragment", "pair"))
    }

    private static func assertStructure(_ spec: Spec) throws {
        let expression = spec.string("grammar", "expression")
        for literal in ["^" + schemePrefix(spec), Structure.fragmentIntroducer, "\\r", "\\n"] where !expression.contains(literal) {
            throw RefIdError.specVersion("spec.grammar.expression does not carry \(literal); this package's structural literals do not match")
        }
        for pair in [spec.string("grammar", "state", "pair"), spec.string("grammar", "fragment", "pair")] where !pair.contains(")\(Structure.pair)(") {
            throw RefIdError.specVersion("a pair grammar does not separate key and value with \(Structure.pair); this package's structural literals do not match")
        }
    }

    /// Applies this dialect's declared adaptations, in order, then compiles.
    static func compile(_ spec: Spec, _ pattern: String) throws -> Regex<AnyRegexOutput> {
        var adapted = pattern
        if let replacements = spec.value(["grammar", "adaptations", dialect, "replace"]) as? [[String]] {
            for pair in replacements where pair.count == 2 {
                adapted = adapted.replacingOccurrences(of: pair[0], with: pair[1])
            }
        }
        do {
            return try Regex(adapted)
        } catch {
            throw RefIdError.specVersion("pattern \(pattern) does not compile in \(dialect): \(error)")
        }
    }

    /// Any other pattern the spec declares (a form, a dispatch entry, a refinement), compiled once and cached.
    func pattern(_ source: String) throws -> Regex<AnyRegexOutput> {
        lock.lock()
        defer { lock.unlock() }
        if let regex = others[source] { return regex }
        let regex = try Grammar.compile(spec, source)
        others[source] = regex
        return regex
    }
}

extension Regex where Output == AnyRegexOutput {
    /// Anchored patterns match the whole string or nothing.
    func matches(_ input: String) -> Bool {
        (try? wholeMatch(in: input)) != nil
    }
}
