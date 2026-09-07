// SPDX-License-Identifier: Apache-2.0
//
// The envelope invariant from spec.envelope: an identifier carrying a digest is admissible only
// with an object whose sets entry for that qualifier recomputes to it, served under its own id.

import Foundation

/// Refuses an envelope whose self-reference or recomputed digests do not hold.
public func validateEnvelope(requestedId: String, envelope: Any?) throws -> EnvelopeResult {
    let spec = try loadSpec()
    let selfReference = spec.string("envelope", "selfReference")
    let setsField = spec.string("envelope", "setsField")
    guard let record = envelope as? [String: Any] else {
        return EnvelopeResult(admissible: false, reason: "envelope is not an object")
    }
    guard let id = record[selfReference] as? String, id == requestedId else {
        return EnvelopeResult(admissible: false, reason: "envelope.\(selfReference) does not match the requested identifier")
    }

    let parsed = try parse(requestedId)
    let refusedStatuses = [try spec.status("malformed"), try spec.status("unsupported")]
    if refusedStatuses.contains(parsed.status) {
        return EnvelopeResult(admissible: false, reason: "the requested identifier is \(parsed.status)")
    }

    let grammar = try Grammar.of(spec)
    var digestForms: [Regex<AnyRegexOutput>] = []
    for (name, form) in spec.dictionary("forms") {
        guard let form = form as? [String: Any], (form["digest"] as? NSNumber)?.boolValue == true else { continue }
        guard let pattern = form["pattern"] as? String else {
            throw RefIdError.specVersion("spec.forms.\(name) declares digest: true without a pattern; this package cannot recognise it")
        }
        digestForms.append(try grammar.pattern(pattern))
    }
    let sets = record[setsField] as? [String: Any]

    for pair in parsed.qualifiers where digestForms.contains(where: { $0.matches(pair.value) }) {
        guard let members = sets?[pair.key] as? [String] else {
            return EnvelopeResult(admissible: false, reason: "\(setsField).\(pair.key) is missing or is not an array of strings")
        }
        let recomputed: String
        do {
            recomputed = try digest(members)
        } catch RefIdError.digest {
            return EnvelopeResult(admissible: false, reason: "\(setsField).\(pair.key) carries a member with the join character")
        }
        if recomputed != pair.value {
            return EnvelopeResult(admissible: false, reason: "\(setsField).\(pair.key) does not recompute to the declared digest")
        }
    }
    return EnvelopeResult(admissible: true, reason: nil)
}
