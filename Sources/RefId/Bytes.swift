// SPDX-License-Identifier: Apache-2.0

/// The four string operations the scheme needs, done on bytes and Unicode scalars — never on `Character`.
///
/// The specification compares identifiers byte for byte (`identifierEquivalence.comparison`). Swift's
/// `String ==`, `hasPrefix`, `split(separator:)` and `firstIndex(of:)` all work on grapheme clusters under
/// Unicode canonical equivalence, so a composed and a decomposed `é` compare equal, and a `/` followed by a
/// combining mark is one `Character` that no longer matches `/`. The TypeScript and Rust ports compare
/// bytes; every comparison or delimiter search over an identifier's parts goes through these, so this
/// port does too. Keys the grammar restricts to ASCII (`[a-z][a-z0-9-]*`) may use plain `String`.
extension String {
    /// Equal byte for byte.
    func equalsBytes(_ other: String) -> Bool {
        utf8.elementsEqual(other.utf8)
    }

    /// Starts with `prefix`, byte for byte.
    func hasBytePrefix(_ prefix: String) -> Bool {
        utf8.starts(with: prefix.utf8)
    }

    /// Split on every occurrence of one delimiter scalar.
    func split(byScalar delimiter: Unicode.Scalar, omittingEmpty: Bool) -> [String] {
        unicodeScalars.split(separator: delimiter, omittingEmptySubsequences: omittingEmpty).map { String(Substring($0)) }
    }

    /// The text before and after the first delimiter scalar; `nil` when there is none. Slices the scalar
    /// view itself, because slicing a `String` rounds an index down to a character boundary.
    func splitOnce(byScalar delimiter: Unicode.Scalar) -> (before: String, after: String)? {
        guard let index = unicodeScalars.firstIndex(of: delimiter) else { return nil }
        return (String(Substring(unicodeScalars[..<index])), String(Substring(unicodeScalars[unicodeScalars.index(after: index)...])))
    }
}

/// `equalsBytes` over optionals: both absent is equal, one absent is not.
func equalsBytes(_ a: String?, _ b: String?) -> Bool {
    switch (a, b) {
    case (nil, nil): return true
    case let (x?, y?): return x.equalsBytes(y)
    default: return false
    }
}
