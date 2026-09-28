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

    /// The Objective-C type-encoding letters `NSNumber.objCType` reports for an unsigned integral
    /// storage type (`unsigned char`, `unsigned int`, `unsigned short`, `unsigned long`, `unsigned long
    /// long`). Distinct from `"c"` (signed/plain `char`, the encoding `Bool` also produces — handled
    /// separately, above, via the `CFBoolean` check).
    private static let unsignedObjCTypes: Set<Character> = ["C", "I", "S", "L", "Q"]

    /// An NSNumber that JSONSerialization parsed from an integer literal; a non-integral value, one
    /// whose magnitude exceeds `maximum`, or one Swift's `Int64` cannot hold at all, is refused — never
    /// trapped. Covers a `Double` (`1.0`, `1e2`, including one at or past `Int64.max`, e.g.
    /// `9223372036854775808.0`), a literal already inside the platform's integer range
    /// (`9007199254740992`), and an unsigned storage type whose value is beyond `Int64.max`
    /// (`NSNumber(value: UInt64.max)`, which `int64Value` would silently wrap to `-1`).
    private static func integerValue(_ number: NSNumber, maximum: Int64) -> Int64? {
        let objCType = String(cString: number.objCType)
        switch objCType {
        case "d", "f":
            // `Int64(exactly:)` never traps: it returns `nil` for a fractional value and for one
            // outside `Int64`'s range, including exactly `Double(Int64.max)` (which rounds up to
            // `2^63`, one past `Int64.max`) rather than trapping the way `Int64(double)` would.
            guard let integer = Int64(exactly: number.doubleValue) else { return nil }
            return integer.magnitude <= maximum.magnitude ? integer : nil
        default:
            if let first = objCType.first, unsignedObjCTypes.contains(first) {
                let unsigned = number.uint64Value
                guard unsigned <= UInt64(Int64.max) else { return nil }
                let integer = Int64(unsigned)
                return integer.magnitude <= maximum.magnitude ? integer : nil
            }
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
