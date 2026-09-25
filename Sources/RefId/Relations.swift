// SPDX-License-Identifier: Apache-2.0
//
// The two questions equality cannot answer. `sameIdentifier` says whether two strings name one thing,
// which is what a digest and an envelope need and is deliberately strict. A store wants two other
// answers: whether two identifiers name the same released thing at different versions, and whether a
// partial identifier stands for a whole family of complete ones. Neither is equality, and neither can be
// expressed by relaxing it, because they disagree with each other on direction. `relate` reports the
// relation in every dimension instead of reducing it to one boolean; `covers`, `coveredBy` and
// `samePackage` are declared as reductions of it (`spec.comparison.relate.reductions`). Ported from
// packages/ref-id/src/relations.ts and canonical.ts — read those files' comments for the full rationale;
// this restates none of the spec's own tables.
//
// Every identifier-taking function below accepts a `String` or a `ParseResult`, mixed freely
// (`spec.openRPC`'s `IdentifierOrParsed`), through plain overloads over a shared `…Core` implementation
// — not a generic function, because a generic referenced by full name (`covers(_:_:)`) needs its type
// parameter from context, and the surface reference `let _: (String, String) -> Bool = covers(_:_:)`
// gives none; a concrete overload resolves unambiguously instead.

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
/// Walks the locator's `utf8` bytes, for the reason `Bytes.swift` gives: the rule depends on the byte
/// before each `@`, so it needs positions, and a `Character` walk would fold a combining mark into the
/// `/` before it.
private func split(_ spec: Spec, _ type: String, _ locator: String) -> Split {
    guard versionTail(spec, type) else { return Split(stem: locator, version: nil) }
    let bytes = Array(locator.utf8)
    let at = UInt8(ascii: "@")
    let slash = UInt8(ascii: "/")
    guard bytes.count > 1 else { return Split(stem: locator, version: nil) }
    for index in 1..<bytes.count {
        guard bytes[index] == at, bytes[index - 1] != slash else { continue }
        guard let slashIndex = bytes[index...].firstIndex(of: slash) else {
            return Split(
                stem: String(decoding: bytes[..<index], as: UTF8.self),
                version: String(decoding: bytes[(index + 1)...], as: UTF8.self)
            )
        }
        let stem = String(decoding: bytes[..<index], as: UTF8.self) + String(decoding: bytes[slashIndex...], as: UTF8.self)
        let version = String(decoding: bytes[(index + 1)..<slashIndex], as: UTF8.self)
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
    general.equalsBytes(specific) || specific.hasBytePrefix(general + "/")
}

/// The identifier, when this package vouches for how it was decomposed — `ok` or `uncovered` only.
/// `malformed` has no decomposition to compare, and `unsupported` has one read by the wrong grammar.
private func read(_ spec: Spec, _ identifier: String) -> ParseResult? {
    guard let parsed = try? parse(identifier) else { return nil }
    return read(spec, parsed)
}

/// As above, for an identifier already parsed — no re-parse, only the status gate.
private func read(_ spec: Spec, _ parsed: ParseResult) -> ParseResult? {
    guard let ok = try? spec.status("ok"), let uncovered = try? spec.status("uncovered") else { return nil }
    return (parsed.status == ok || parsed.status == uncovered) ? parsed : nil
}

/// Whether every pair the first declares appears identically in the second. The keys are safe to hold in
/// a `String`-keyed dictionary as written — `grammar.state.pair` and `grammar.fragment.pair` restrict a
/// key to `[a-z][a-z0-9-]*`, plain ASCII with no Unicode-equivalence ambiguity — but a value is
/// unrestricted, so it is compared with `equalsBytes`, never `==`.
private func subsumes(_ theirs: [Pair], _ mine: [Pair]) -> Bool {
    var map: [String: String] = [:]
    for pair in theirs { map[pair.key] = pair.value }
    return mine.allSatisfy { pair in
        guard let value = map[pair.key] else { return false }
        return equalsBytes(value, pair.value)
    }
}

/// Whether two pair lists hold the same pairs, order aside.
private func equalPairs(_ a: [Pair], _ b: [Pair]) -> Bool {
    a.count == b.count && subsumes(b, a)
}

/// A nested identifier decoded from a qualifier value, read the same way a top-level identifier is —
/// `nil` when this operation refuses it (a scheme version this package does not implement, or malformed,
/// which `Parse.swift` never carries into `nested` in the first place).
private func readNested(_ spec: Spec, _ decoded: String?) -> ParseResult? {
    guard let decoded else { return nil }
    return read(spec, decoded)
}

// MARK: - covers

/// Whether every qualifier the general side declares is declared by the specific side, identically —
/// except a qualifier whose value on both sides is a nested `ref:` this operation accepts, compared with
/// `covers` on the decoded pair. A nested pair this operation refuses, or nested on one side only, falls
/// back to the byte comparison every other qualifier value gets.
private func qualifiersCover(_ spec: Spec, _ general: [Pair], _ specific: [Pair], _ generalNested: [String: String]?, _ specificNested: [String: String]?) -> Bool {
    var specificMap: [String: String] = [:]
    for pair in specific { specificMap[pair.key] = pair.value }
    for pair in general {
        guard let specificValue = specificMap[pair.key] else { return false }
        if let gx = readNested(spec, generalNested?[pair.key]), let sy = readNested(spec, specificNested?[pair.key]) {
            if !coversCore(spec, gx, sy) { return false }
            continue
        }
        if !equalsBytes(pair.value, specificValue) { return false }
    }
    return true
}

private func coversCore(_ spec: Spec, _ x: ParseResult?, _ y: ParseResult?) -> Bool {
    guard let x, let y else { return false }
    if x.type != y.type || x.version != y.version { return false }
    let (gen, spe) = (split(spec, x.type, x.locator), split(spec, y.type, y.locator))
    if !stemReaches(gen.stem, spe.stem) { return false }
    if let gv = gen.version, !equalsBytes(gv, spe.version) { return false }
    if let path = x.fragment?.path, !equalsBytes(path, y.fragment?.path) { return false }
    if !subsumes(y.fragment?.refinements ?? [], x.fragment?.refinements ?? []) { return false }
    return qualifiersCover(spec, x.qualifiers, y.qualifiers, x.nested, y.nested)
}

/// Whether the first identifier is the second with less declared — the general covering the specific.
///
/// Asymmetric, and the direction is the whole point: `pkg:npm/x` covers `pkg:npm/x@1.0.0`, and the
/// reverse does not hold. What the first leaves unsaid, the second may say freely; what the first says,
/// the second must say identically — including, one level deep, a qualifier that nests a `ref:`
/// identifier on both sides. Every identifier this package vouches for covers itself; one it does not —
/// malformed, or at an identifier version it does not implement — covers nothing, itself included.
public func covers(_ general: String, _ specific: String) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return coversCore(spec, read(spec, general), read(spec, specific))
}

public func covers(_ general: String, _ specific: ParseResult) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return coversCore(spec, read(spec, general), read(spec, specific))
}

public func covers(_ general: ParseResult, _ specific: String) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return coversCore(spec, read(spec, general), read(spec, specific))
}

public func covers(_ general: ParseResult, _ specific: ParseResult) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return coversCore(spec, read(spec, general), read(spec, specific))
}

// MARK: - samePackage

/// Whether two pair lists hold the same pairs, order aside — except a qualifier whose value on both
/// sides is a nested `ref:` this operation accepts, compared with `samePackage` on the decoded pair. A
/// nested pair this operation refuses, or nested on one side only, falls back to byte equality.
private func qualifiersSamePackage(_ spec: Spec, _ a: [Pair], _ b: [Pair], _ aNested: [String: String]?, _ bNested: [String: String]?) -> Bool {
    guard a.count == b.count else { return false }
    var bMap: [String: String] = [:]
    for pair in b { bMap[pair.key] = pair.value }
    for pair in a {
        guard let bValue = bMap[pair.key] else { return false }
        if let ax = readNested(spec, aNested?[pair.key]), let bx = readNested(spec, bNested?[pair.key]) {
            if !samePackageCore(spec, ax, bx) { return false }
            continue
        }
        if !equalsBytes(pair.value, bValue) { return false }
    }
    return true
}

private func samePackageCore(_ spec: Spec, _ x: ParseResult?, _ y: ParseResult?) -> Bool {
    guard let x, let y else { return false }
    if x.type != y.type || x.version != y.version { return false }
    if !equalsBytes(split(spec, x.type, x.locator).stem, split(spec, y.type, y.locator).stem) { return false }
    if !equalsBytes(x.fragment?.path, y.fragment?.path) { return false }
    if !equalPairs(x.fragment?.refinements ?? [], y.fragment?.refinements ?? []) { return false }
    return qualifiersSamePackage(spec, x.qualifiers, y.qualifiers, x.nested, y.nested)
}

/// Whether two identifiers name the same released thing, at whatever version each declares.
///
/// Symmetric, and version-blind in exactly one place: the locator of a type whose dispatch entry
/// declares `versionTail`. Everything else still distinguishes — including, one level deep, a qualifier
/// that nests a `ref:` identifier on both sides, so one engine at two releases is one engine. A malformed
/// identifier, and one at an identifier version this package does not implement, name nothing here and so
/// are the same as nothing, including themselves.
public func samePackage(_ a: String, _ b: String) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return samePackageCore(spec, read(spec, a), read(spec, b))
}

public func samePackage(_ a: String, _ b: ParseResult) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return samePackageCore(spec, read(spec, a), read(spec, b))
}

public func samePackage(_ a: ParseResult, _ b: String) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return samePackageCore(spec, read(spec, a), read(spec, b))
}

public func samePackage(_ a: ParseResult, _ b: ParseResult) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return samePackageCore(spec, read(spec, a), read(spec, b))
}

// MARK: - canonicalIdentifier / sameIdentifier

/// UTF-16 code unit order — the order `identifierEquivalence.canonicalForm` declares for both qualifier
/// and refinement keys.
private func precedesByUTF16(_ a: String, _ b: String) -> Bool {
    Array(a.utf16).lexicographicallyPrecedes(Array(b.utf16))
}

/// A qualifier value, written in its own canonical form when it nests a `ref:` identifier this operation
/// accepts — decode, canonicalise, re-encode with the same form's table — and left verbatim otherwise:
/// no declared nesting form for the key, or a nested value this operation refuses (a scheme version it
/// does not implement). `nestedDecoded` is `parsed.nested[key]`, already decoded by `Parse.swift`.
private func canonicalQualifierValue(_ spec: Spec, key: String, value: String, nestedDecoded: String?) throws -> String {
    guard let nestedDecoded, let form = nestingForm(spec, key: key) else { return value }
    let nestedCanonical = try canonicalIdentifierCore(spec, try parse(nestedDecoded))
    return Encoding.encode(nestedCanonical, table: Encoding.table(spec, form: form))
}

/// `identifierEquivalence.canonicalForm`: re-serialise with qualifiers and refinements each sorted by
/// key (UTF-16 code unit order), a nested identifier in a qualifier value written in its own canonical
/// form, and the version slot omitted when it holds `version.default` — `ref:1:` and `ref:` are one
/// version. Every other part verbatim, including the order inside one refinement value (`lines=1,20` is
/// a range, not a set). A malformed identifier has no canonical form: `serialise` refuses it, naming the
/// part that failed.
private func canonicalIdentifierCore(_ spec: Spec, _ parsed: ParseResult) throws -> String {
    var parsed = parsed
    parsed.qualifiers = try parsed.qualifiers.map { pair in
        Pair(pair.key, try canonicalQualifierValue(spec, key: pair.key, value: pair.value, nestedDecoded: parsed.nested?[pair.key]))
    }
    parsed.qualifiers.sort { precedesByUTF16($0.key, $1.key) }
    if let fragment = parsed.fragment {
        var refinements = fragment.refinements
        refinements.sort { precedesByUTF16($0.key, $1.key) }
        parsed.fragment = Fragment(path: fragment.path, refinements: refinements)
    }
    if parsed.explicitVersion && parsed.version == spec.int("version", "default") {
        parsed.explicitVersion = false
        parsed.versionText = nil
    }
    return try serialise(parsed)
}

/// The canonical form of an identifier — see `identifierEquivalence.canonicalForm` and
/// `canonicalIdentifierCore` above for exactly what it does.
public func canonicalIdentifier(_ identifier: String) throws -> String {
    let spec = try loadSpec()
    return try canonicalIdentifierCore(spec, try parse(identifier))
}

public func canonicalIdentifier(_ identifier: ParseResult) throws -> String {
    try canonicalIdentifierCore(try loadSpec(), identifier)
}

private func sameIdentifierCore(_ spec: Spec, _ x: ParseResult?, _ y: ParseResult?) -> Bool {
    guard let x, let y, let a = try? canonicalIdentifierCore(spec, x), let b = try? canonicalIdentifierCore(spec, y) else { return false }
    return equalsBytes(a, b)
}

/// Whether two identifiers name one thing: their canonical spellings are equal byte for byte
/// (`identifierEquivalence.comparison`). Order of qualifiers and of refinement keys does not distinguish;
/// everything else does, compared with `equalsBytes` rather than `==` so that two Unicode spellings of one
/// text (`café`, NFC vs. NFD) are never mistaken for one identifier.
///
/// Gated on the same status check `covers` and `samePackage` use — `ok` or `uncovered` only. A malformed
/// identifier has no canonical form and refuses at `canonicalIdentifierCore`'s call to `serialise`; an
/// **unsupported** one *would* serialise (it round-trips its own unparsed parts), so without this gate it
/// would wrongly compare equal to itself. Never throws: an identifier with no usable decomposition names
/// nothing, so it is the same as nothing, including itself, exactly like `covers` and `samePackage`.
public func sameIdentifier(_ a: String, _ b: String) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return sameIdentifierCore(spec, read(spec, a), read(spec, b))
}

public func sameIdentifier(_ a: String, _ b: ParseResult) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return sameIdentifierCore(spec, read(spec, a), read(spec, b))
}

public func sameIdentifier(_ a: ParseResult, _ b: String) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return sameIdentifierCore(spec, read(spec, a), read(spec, b))
}

public func sameIdentifier(_ a: ParseResult, _ b: ParseResult) -> Bool {
    guard let spec = try? loadSpec() else { return false }
    return sameIdentifierCore(spec, read(spec, a), read(spec, b))
}

// MARK: - relate

/// The relation between two optional declared values in one dimension: `equal` when both are absent or
/// equal, `covers` when only the second is declared, `coveredBy` for the mirror, `differ` when both
/// declare different values — `spec.comparison.relate.result.locatorVersion` and its siblings.
private func declaredRelation(_ a: String?, _ b: String?) -> Relation {
    switch (a, b) {
    case (nil, nil): return .equal
    case let (x?, y?): return equalsBytes(x, y) ? .equal : .differ
    case (nil, _?): return .covers
    case (_?, nil): return .coveredBy
    }
}

/// The locator stem relation: `equal`, `covers` when the first is a whole-segment prefix of the second,
/// `coveredBy` for the mirror, `differ` otherwise.
private func stemRelation(_ a: String, _ b: String) -> Relation {
    if equalsBytes(a, b) { return .equal }
    if stemReaches(a, b) { return .covers }
    if stemReaches(b, a) { return .coveredBy }
    return .differ
}

/// A keyed dimension (fragment refinements): one member per key either side declares, by the four-case
/// rule on the raw value. No nested descent here — nesting is a qualifier shape, not a refinement one.
private func relateKeyedPairs(_ a: [Pair], _ b: [Pair]) -> [String: Relation] {
    var aMap: [String: String] = [:]
    for pair in a { aMap[pair.key] = pair.value }
    var bMap: [String: String] = [:]
    for pair in b { bMap[pair.key] = pair.value }
    var out: [String: Relation] = [:]
    for key in Set(aMap.keys).union(bMap.keys) { out[key] = declaredRelation(aMap[key], bMap[key]) }
    return out
}

/// The qualifiers dimension: one member per key either side declares, each a relation on the raw value —
/// except where both sides nest a `ref:` this operation accepts, where the member also carries `nested`,
/// the decoded pair's own `RelateResult`, reduced into `relation`.
private func relateQualifiers(_ spec: Spec, _ a: [Pair], _ b: [Pair], _ aNested: [String: String]?, _ bNested: [String: String]?) -> [String: QualifierRelation] {
    var aMap: [String: String] = [:]
    for pair in a { aMap[pair.key] = pair.value }
    var bMap: [String: String] = [:]
    for pair in b { bMap[pair.key] = pair.value }
    var out: [String: QualifierRelation] = [:]
    for key in Set(aMap.keys).union(bMap.keys) {
        if let ax = readNested(spec, aNested?[key]), let bx = readNested(spec, bNested?[key]),
           let nested = relateCore(spec, ax, bx) {
            out[key] = QualifierRelation(relation: reduce(nested), nested: nested)
        } else {
            out[key] = QualifierRelation(relation: declaredRelation(aMap[key], bMap[key]))
        }
    }
    return out
}

/// A result reduced to one relation: `equal` when every relation in it is `equal`; `covers` when every
/// one is `equal` or `covers`; `coveredBy` when every one is `equal` or `coveredBy`; `differ` otherwise.
/// "Every relation" means the five fixed dimensions, each refinement, and each qualifier's relation.
private func reduce(_ result: RelateResult) -> Relation {
    var all: [Relation] = [result.type, result.version, result.locatorStem, result.locatorVersion, result.fragmentPath]
    all.append(contentsOf: result.fragmentRefinements.values)
    all.append(contentsOf: result.qualifiers.values.map { $0.relation })
    if all.allSatisfy({ $0 == .equal }) { return .equal }
    if all.allSatisfy({ $0 == .equal || $0 == .covers }) { return .covers }
    if all.allSatisfy({ $0 == .equal || $0 == .coveredBy }) { return .coveredBy }
    return .differ
}

private func relateCore(_ spec: Spec, _ x: ParseResult?, _ y: ParseResult?) -> RelateResult? {
    guard let x, let y else { return nil }
    let (xs, ys) = (split(spec, x.type, x.locator), split(spec, y.type, y.locator))
    return RelateResult(
        type: x.type == y.type ? .equal : .differ,
        version: x.version == y.version ? .equal : .differ,
        locatorStem: stemRelation(xs.stem, ys.stem),
        locatorVersion: declaredRelation(xs.version, ys.version),
        fragmentPath: declaredRelation(x.fragment?.path, y.fragment?.path),
        fragmentRefinements: relateKeyedPairs(x.fragment?.refinements ?? [], y.fragment?.refinements ?? []),
        qualifiers: relateQualifiers(spec, x.qualifiers, y.qualifiers, x.nested, y.nested)
    )
}

/// How two identifiers relate in each dimension `spec.comparison.dimensions` names; `nil` for a pair
/// that has no parts to relate — malformed, or at a scheme version this package does not implement.
/// `covers`, `coveredBy` and `samePackage` are declared as reductions of this result
/// (`spec.comparison.relate.reductions`); this package computes them directly rather than by calling
/// `relate` and reducing, but both paths answer from the same rule and the vectors bind them to agree.
public func relate(_ a: String, _ b: String) -> RelateResult? {
    guard let spec = try? loadSpec() else { return nil }
    return relateCore(spec, read(spec, a), read(spec, b))
}

public func relate(_ a: String, _ b: ParseResult) -> RelateResult? {
    guard let spec = try? loadSpec() else { return nil }
    return relateCore(spec, read(spec, a), read(spec, b))
}

public func relate(_ a: ParseResult, _ b: String) -> RelateResult? {
    guard let spec = try? loadSpec() else { return nil }
    return relateCore(spec, read(spec, a), read(spec, b))
}

public func relate(_ a: ParseResult, _ b: ParseResult) -> RelateResult? {
    guard let spec = try? loadSpec() else { return nil }
    return relateCore(spec, read(spec, a), read(spec, b))
}
