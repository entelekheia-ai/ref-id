// SPDX-License-Identifier: Apache-2.0
//
// Assembles a `ref:` identifier string from its parts. A part the grammar cannot carry is refused
// with `RefIdError.build` naming it — the builder never emits a string that means something else,
// which is proven at the end by parsing what was built and comparing it with what was asked.

import Foundation

private func nestingForm(_ spec: Spec, key: String) -> [String: Any]? {
    guard let declared = spec.dictionary("qualifiers")[key] as? [String: Any], let forms = declared["forms"] as? [String] else { return nil }
    for name in forms {
        if let form = spec.dictionary("forms")[name] as? [String: Any], (form["nested"] as? NSNumber)?.boolValue == true { return form }
    }
    return nil
}

private func refuse(_ spec: Spec, _ part: String, _ why: String) throws -> Never {
    throw RefIdError.build(part: try spec.part(part), message: "cannot build: " + why)
}

/// Builds a `ref:` identifier string. `parts.location` is ignored — it never reaches the identity.
public func build(_ parts: BuildParts) throws -> String {
    let spec = try loadSpec()
    let grammar = try Grammar.of(spec)
    let stateSeparator = spec.string("grammar", "state", "separator")
    let fragmentSeparator = spec.string("grammar", "fragment", "separator")
    let separators: [Character] = [Character(stateSeparator), Character(Structure.fragmentIntroducer)] + Structure.lineBreaks

    var locator = parts.locator
    let fold = parts.type + Structure.field
    if Validators.foldsType(spec, type: parts.type), locator.hasPrefix(fold) {
        locator = String(locator.dropFirst(fold.count))
    }
    if locator.isEmpty || Encoding.containsAny(locator, separators) {
        try refuse(spec, "locator", "a locator is handed to its validator verbatim and cannot carry a reserved character")
    }

    var out = schemePrefix(spec) + parts.type + Structure.field + locator

    if !parts.qualifiers.isEmpty {
        var rendered: [String] = []
        for (key, value) in parts.qualifiers {
            let encoded: String
            switch value {
            case .plain(let plain):
                if plain.hasPrefix(schemePrefix(spec)) || Encoding.containsAny(plain, separators) {
                    try refuse(spec, key, "a nested identifier is passed as .nested, never as a plain string")
                }
                encoded = plain
            case .nested(let inner):
                guard let form = nestingForm(spec, key: key) else { try refuse(spec, key, "this qualifier declares no nesting form") }
                encoded = Encoding.encode(inner, table: Encoding.table(spec, form: form))
            }
            let rendering = key + Structure.pair + encoded
            if !grammar.statePair.matches(rendering) {
                try refuse(spec, key, "the key does not fit the pair grammar")
            }
            rendered.append(rendering)
        }
        out += stateSeparator + rendered.joined(separator: stateSeparator)
    }

    var wantedPath: String?
    var wantedRefinements: [Pair] = []
    if let fragment = parts.fragment {
        switch fragment {
        case .path(let path): wantedPath = path
        case .full(let path, let refinements):
            wantedPath = path
            wantedRefinements = refinements
        }
        let path = wantedPath ?? ""
        if path.isEmpty || Encoding.containsAny(path, [Character(fragmentSeparator)] + Structure.lineBreaks) {
            try refuse(spec, "fragment", "a declared-name path cannot be empty or carry the refinement separator")
        }
        for pair in wantedRefinements where Encoding.containsAny(pair.value, [Character(fragmentSeparator)] + Structure.lineBreaks) {
            try refuse(spec, pair.key, "a refinement value cannot carry the separator")
        }
        out += Structure.fragmentIntroducer + path
        if !wantedRefinements.isEmpty {
            out += fragmentSeparator + wantedRefinements.map { $0.key + Structure.pair + $0.value }.joined(separator: fragmentSeparator)
        }
    }

    // The last word is the grammar's: what was built must decompose to exactly what was asked.
    if !grammar.top.matches(out) {
        try refuse(spec, "grammar", "the assembled string does not match the grammar")
    }
    let check = try parse(out)
    if check.status == (try spec.status("malformed")) {
        try refuse(spec, check.part ?? "grammar", "the assembled string is malformed")
    }
    if check.explicitVersion || check.type != parts.type {
        try refuse(spec, "type", "the type re-split into other parts")
    }
    if check.locator != locator {
        try refuse(spec, "locator", "the locator re-split into other parts")
    }
    if check.qualifiers.count != parts.qualifiers.count {
        try refuse(spec, "state", "a qualifier re-split into other parts")
    }
    if check.fragment?.path != wantedPath || (check.fragment?.refinements.count ?? 0) != wantedRefinements.count {
        try refuse(spec, "fragment", "the fragment re-split into other parts")
    }
    return out
}
