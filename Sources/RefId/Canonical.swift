// SPDX-License-Identifier: Apache-2.0
//
// The canonical serialisation `spec.canonicalisation.rules` fix: object keys sorted by UTF-16 code
// unit, no whitespace outside strings, strings escaped exactly as ECMAScript JSON.stringify does,
// integers only. Written for the object graph Foundation's JSONSerialization produces.

import Foundation

enum Canonical {
    static func serialise(_ value: Any) throws -> String {
        var out = ""
        try write(value, into: &out)
        return out
    }

    private static func utf16Less(_ a: String, _ b: String) -> Bool {
        a.utf16.lexicographicallyPrecedes(b.utf16)
    }

    private static func write(_ value: Any, into out: inout String) throws {
        switch value {
        case is NSNull:
            out += "null"
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                out += number.boolValue ? "true" : "false"
            } else if let integer = integerValue(number) {
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
                try write(item, into: &out)
            }
            out += "]"
        case let dictionary as [String: Any]:
            out += "{"
            for (index, key) in dictionary.keys.sorted(by: utf16Less).enumerated() {
                if index > 0 { out += "," }
                out += escape(key)
                out += ":"
                try write(dictionary[key]!, into: &out)
            }
            out += "}"
        default:
            throw RefIdError.specIntegrity("value of type \(Swift.type(of: value)) has no canonical form")
        }
    }

    /// An NSNumber that JSONSerialization parsed from an integer literal; a Double is refused.
    private static func integerValue(_ number: NSNumber) -> Int64? {
        let objCType = String(cString: number.objCType)
        switch objCType {
        case "d", "f":
            let double = number.doubleValue
            return double == double.rounded() && abs(double) < 9_007_199_254_740_992 ? Int64(double) : nil
        default:
            return number.int64Value
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
