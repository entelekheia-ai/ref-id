// SPDX-License-Identifier: Apache-2.0
//
// The two questions equality cannot answer. `samePackage` says whether two identifiers name the same
// released thing at whatever version each declares; `covers` says whether a partial identifier stands
// for a whole family of complete ones. Neither is equality, and neither can be expressed by relaxing
// it, because they disagree with each other on direction. Ported from packages/ref-id/src/relations.ts
// — read that file's comments for the full rationale; this restates none of the spec's own tables.

import Foundation

/// Whether `dispatch.<type>.versionTail` is set. Read from the spec, never guessed from punctuation.
private func versionTail(_ spec: Spec, _ type: String) -> Bool {
    guard let entry = spec.dictionary("dispatch")[type] as? [String: Any] else { return false }
    return entry["versionTail"] as? Bool ?? false
}

private struct Split {
    let stem: String
    let version: String?
}

/// The locator without its version, and the version it carried — only for a type whose dispatch entry
/// declares `versionTail`.
///
/// Whether a locator carries a version at all is the type's business, so this reads `versionTail` rather
/// than guessing from punctuation. Within a type that does carry one, an `@` that opens a segment —
/// preceded by `/`, or first in the string — belongs to a namespace, so `npm/@acme/x` has no version. An
/// `@` inside a segment closes the name: the version runs from it to the next `/`, and whatever follows
/// that `/` is a path inside the named thing. **The path stays in the stem, and only the version leaves
/// it** — a file at two releases is one file, so `npm/x@1.0.0/docs/guide.md` and
/// `npm/x@2.0.0/docs/guide.md` share the stem `npm/x/docs/guide.md`.
///
/// Walks `Array(locator)` rather than `String.Index` arithmetic — a slice of an `Array<Character>` keeps
/// the original indices, which is what lets the found `@` and `/` positions be sliced back together.
private func split(_ spec: Spec, _ type: String, _ locator: String) -> Split {
    guard versionTail(spec, type) else { return Split(stem: locator, version: nil) }
    let characters = Array(locator)
    guard characters.count > 1 else { return Split(stem: locator, version: nil) }
    for index in 1..<characters.count {
        guard characters[index] == "@", characters[index - 1] != "/" else { continue }
        guard let slash = characters[index...].firstIndex(of: "/") else {
            return Split(stem: String(characters[..<index]), version: String(characters[(index + 1)...]))
        }
        let stem = String(characters[..<index]) + String(characters[slash...])
        let version = String(characters[(index + 1)..<slash])
        return Split(stem: stem, version: version)
    }
    return Split(stem: locator, version: nil)
}

/// Whether the general stem reaches the specific one.
///
/// Equal stems name one thing. Otherwise the general one covers the specific only when its stem is a
/// whole **segment** prefix of it — `acme-tools` reaching `acme-tools/docs/guide.md`. The segment
/// boundary is the whole of the rule: a bare string prefix would make `acme-tools` cover
/// `acme-tools-extra`, two corpora that share nothing but their first characters.
private func stemReaches(_ general: String, _ specific: String) -> Bool {
    general == specific || specific.hasPrefix(general + "/")
}

/// The identifier, when this package vouches for how it was decomposed — `ok` or `uncovered` only.
/// `malformed` has no decomposition to compare, and `unsupported` has one read by the wrong grammar.
private func read(_ spec: Spec, _ identifier: String) -> ParseResult? {
    guard let parsed = try? parse(identifier), let ok = try? spec.status("ok"), let uncovered = try? spec.status("uncovered") else { return nil }
    return (parsed.status == ok || parsed.status == uncovered) ? parsed : nil
}

/// Whether every pair the first declares appears identically in the second.
private func subsumes(_ theirs: [Pair], _ mine: [Pair]) -> Bool {
    var map: [String: String] = [:]
    for pair in theirs { map[pair.key] = pair.value }
    return mine.allSatisfy { map[$0.key] == $0.value }
}

/// Whether two pair lists hold the same pairs, order aside.
private func equalPairs(_ a: [Pair], _ b: [Pair]) -> Bool {
    a.count == b.count && subsumes(b, a)
}

/// Whether two identifiers name the same released thing, at whatever version each declares.
///
/// Symmetric, and version-blind in exactly one place: the locator of a type whose dispatch entry
/// declares `versionTail`. Everything else still distinguishes. A malformed identifier, and one at an
/// identifier version this package does not implement, name nothing here and so are the same as
/// nothing, including themselves.
public func samePackage(_ a: String, _ b: String) -> Bool {
    guard let spec = try? loadSpec(), let x = read(spec, a), let y = read(spec, b) else { return false }
    if x.type != y.type || x.version != y.version { return false }
    if split(spec, x.type, x.locator).stem != split(spec, y.type, y.locator).stem { return false }
    if (x.fragment?.path) != (y.fragment?.path) { return false }
    if !equalPairs(x.fragment?.refinements ?? [], y.fragment?.refinements ?? []) { return false }
    return equalPairs(x.qualifiers, y.qualifiers)
}

/// Whether the first identifier is the second with less declared — the general covering the specific.
///
/// Asymmetric, and the direction is the whole point: `pkg:npm/x` covers `pkg:npm/x@1.0.0`, and the
/// reverse does not hold. What the first leaves unsaid, the second may say freely; what the first says,
/// the second must say identically. Every identifier this package vouches for covers itself; one it
/// does not — malformed, or at an identifier version it does not implement — covers nothing, itself
/// included.
public func covers(_ general: String, _ specific: String) -> Bool {
    guard let spec = try? loadSpec(), let x = read(spec, general), let y = read(spec, specific) else { return false }
    if x.type != y.type || x.version != y.version { return false }
    let (gen, spe) = (split(spec, x.type, x.locator), split(spec, y.type, y.locator))
    if !stemReaches(gen.stem, spe.stem) { return false }
    if let gv = gen.version, gv != spe.version { return false }
    if let path = x.fragment?.path, path != y.fragment?.path { return false }
    if !subsumes(y.fragment?.refinements ?? [], x.fragment?.refinements ?? []) { return false }
    return subsumes(y.qualifiers, x.qualifiers)
}

/// The canonical form of an identifier: the same identifier with its qualifiers sorted by key.
///
/// Sorting is by UTF-16 code unit, the order this specification already uses for its own file. What is
/// load-bearing is that one deterministic order exists, so any two implementations reach the same answer
/// about whether two identifiers are one. Every other part is left exactly as parsed — refinements sit on
/// the fragment side and are positional, so reordering them would change what is named.
///
/// A malformed identifier has no canonical form: `serialise` refuses it, naming the part that failed.
public func canonicalIdentifier(_ identifier: String) throws -> String {
    var parsed = try parse(identifier)
    parsed.qualifiers.sort { Array($0.key.utf16).lexicographicallyPrecedes(Array($1.key.utf16)) }
    return try serialise(parsed)
}
