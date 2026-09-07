// SPDX-License-Identifier: Apache-2.0
//
// Percent-encode/decode helpers driven by an `encoding.<name>.table` from the spec — never a
// hardcoded character list. Which table applies to a form is the form's own `encoding` field.

enum Encoding {
    /// The encoding table a form declares, or none when the form declares no encoding.
    static func table(_ spec: Spec, form: [String: Any]) -> [String: String] {
        guard let name = form["encoding"] as? String else { return [:] }
        return spec.table("encoding", name, "table")
    }

    static func containsAny(_ raw: String, _ characters: [Character]) -> Bool {
        raw.contains { characters.contains($0) }
    }

    /// One left-to-right pass over the source characters; a produced percent-form is never re-scanned.
    static func encode(_ raw: String, table: [String: String]) -> String {
        if table.isEmpty { return raw }
        var out = ""
        for character in raw {
            out += table[String(character)] ?? String(character)
        }
        return out
    }

    /// One left-to-right pass over the encoded text; decoding `%2523` yields `%23`, never `#`.
    static func decode(_ encoded: String, table: [String: String]) -> String {
        if table.isEmpty { return encoded }
        let reverse = Dictionary(uniqueKeysWithValues: table.map { ($1, $0) })
        let forms = Array(reverse.keys)
        var out = ""
        var index = encoded.startIndex
        while index < encoded.endIndex {
            if let form = forms.first(where: { encoded[index...].hasPrefix($0) }) {
                out += reverse[form] ?? form
                index = encoded.index(index, offsetBy: form.count)
            } else {
                out.append(encoded[index])
                index = encoded.index(after: index)
            }
        }
        return out
    }

    /// True when every `%` in the value begins one of the table's percent-forms — the strict nested encoding.
    static func strictlyEncoded(_ value: String, table: [String: String]) -> Bool {
        let forms = Array(table.values)
        var index = value.startIndex
        while let at = value[index...].firstIndex(of: "%") {
            guard forms.contains(where: { value[at...].hasPrefix($0) }) else { return false }
            index = value.index(after: at)
        }
        return true
    }
}
