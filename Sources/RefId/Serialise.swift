// SPDX-License-Identifier: Apache-2.0
//
// Reassembles a ParseResult into the exact bytes it was parsed from. Every part is emitted verbatim.

private func pairs(_ entries: [Pair], _ separator: String) -> String {
    entries.map { $0.key + Structure.pair + $0.value }.joined(separator: separator)
}

/// `serialise(parse(s)) == s` for every parseable input, including uncovered and unsupported ones.
/// A malformed result has no faithful form and is refused.
public func serialise(_ parsed: ParseResult) throws -> String {
    let spec = try loadSpec()
    if parsed.status == (try spec.status("malformed")) {
        throw RefIdError.serialise(part: try spec.part(parsed.part ?? "grammar"), message: "a malformed identifier cannot be serialised without losing the part that failed")
    }
    var out = schemePrefix(spec)
    if parsed.explicitVersion {
        out += (parsed.versionText ?? String(parsed.version)) + Structure.field
    }
    out += parsed.type + Structure.field + parsed.locator
    if !parsed.qualifiers.isEmpty {
        let separator = spec.string("grammar", "state", "separator")
        out += separator + pairs(parsed.qualifiers, separator)
    }
    if let fragment = parsed.fragment {
        out += Structure.fragmentIntroducer + fragment.path
        if !fragment.refinements.isEmpty {
            let separator = spec.string("grammar", "fragment", "separator")
            out += separator + pairs(fragment.refinements, separator)
        }
    }
    return out
}
