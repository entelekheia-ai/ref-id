// SPDX-License-Identifier: Apache-2.0
//
// sha256 over the UTF-8 bytes of the joined identifier strings, per `spec.digest`: declared order,
// no deduplication, and a refusal for a member that carries the join character.

/// Digests an ordered, non-deduplicated sequence of identifier strings.
public func digest(_ members: [String]) throws -> String {
    let spec = try loadSpec()
    let join = spec.string("digest", "join")
    for member in members where member.contains(join) {
        throw RefIdError.digest(part: try spec.part("member"), message: "a member must be a string that does not carry the join character")
    }
    let algorithm = spec.string("digest", "algorithm")
    guard algorithm == "sha256" else {
        throw RefIdError.specVersion("spec.digest.algorithm declares \(algorithm); this package implements sha256 only")
    }
    let joined = members.joined(separator: join)
    return algorithm + Structure.field + SHA256.hex(Array(joined.utf8))
}
