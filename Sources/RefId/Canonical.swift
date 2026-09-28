// SPDX-License-Identifier: Apache-2.0
//
// The canonical serialisation `spec.canonicalisation.rules` fix: object keys sorted by UTF-16 code
// unit, no whitespace outside strings, strings escaped exactly as ECMAScript JSON.stringify does,
// integers only. Written for the object graph Foundation's JSONSerialization produces.

import Foundation

enum Canonical {
    /// `maximum`: `spec.canonicalisation.rules`' magnitude bound (`version.maximum`, the same key the
    /// version literal check reads) — a caller with a loaded `Spec` passes it; `SpecLoader.validate`,
    /// which runs before a `Spec` exists, reads it straight out of the still-raw parsed JSON instead.
    static func serialise(_ value: Any, maximum: Int64) throws -> String {
        var out = ""
        try write(value, maximum: maximum, into: &out)
        return out
    }

    private static func utf16Less(_ a: String, _ b: String) -> Bool {
        a.utf16.lexicographicallyPrecedes(b.utf16)
    }

    private static func write(_ value: Any, maximum: Int64, into out: inout String) throws {
        switch value {
        case is NSNull:
            out += "null"
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                out += number.boolValue ? "true" : "false"
            } else if let integer = integerValue(number, maximum: maximum) {
                out += String(integer)
            } else {
                throw RefIdError.specIntegrity("canonicalisation covers integers only, got \(number)")
            }
        case let string as String:
            out += escape(string)
        case let array as [Any]:
            out += "["
            for (index, item) in array.enumerated() {
                if index > 0 { out += "," }
                try write(item, maximum: maximum, into: &out)
            }
            out += "]"
        case let dictionary as [String: Any]:
            out += "{"
            for (index, key) in dictionary.keys.sorted(by: utf16Less).enumerated() {
                if index > 0 { out += "," }
                out += escape(key)
                out += ":"
                try write(dictionary[key]!, maximum: maximum, into: &out)
            }
            out += "}"
        default:
            throw RefIdError.specIntegrity("value of type \(Swift.type(of: value)) has no canonical form")
        }
    }

    /// An NSNumber that JSONSerialization parsed from an integer literal; a non-integral value, or one
    /// whose magnitude exceeds `maximum`, is refused — whether it arrived as a `Double` (`1.0`, `1e2`)
    /// or as a literal already inside the platform's integer range (`9007199254740992`).
    private static func integerValue(_ number: NSNumber, maximum: Int64) -> Int64? {
        let objCType = String(cString: number.objCType)
        switch objCType {
        case "d", "f":
            let double = number.doubleValue
            return double == double.rounded() && abs(double) <= Double(maximum) ? Int64(double) : nil
        default:
            let integer = number.int64Value
            return integer.magnitude <= maximum.magnitude ? integer : nil
        }
    }

    /// ECMAScript JSON.stringify's string escaping: quote, backslash and control characters only.
    static func escape(_ string: String) -> String {
        var out = "\""
        for scalar in string.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
        return out
    }
}
