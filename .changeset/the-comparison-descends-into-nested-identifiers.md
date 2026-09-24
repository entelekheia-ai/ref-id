---
"@entelekheia/ref-id": minor
---

`covers` and `samePackage` descend one level into a nested identifier. Where a qualifier's value is a
nested `ref:` on both sides, the pair is compared with the same relation on the decoded identifiers, so
`…;by=ref:pkg:github/ggml-org/llama.cpp` now covers `…;by=ref:pkg:github/ggml-org/llama.cpp@b10931`, and two
releases of one engine are the same package. A digest, a timestamp, plain text, a nested identifier facing a
digest, and a nested pair at a scheme version the relation refuses are still compared byte for byte.
**A comparison result a store kept may flip from `false` to `true`** — for such a pair only; no identifier
changes meaning.

New: `relate(a, b)` reports how two identifiers relate in each dimension — type, scheme version, locator
stem and version, declared-name path, each refinement and each qualifier — as `equal`, `covers`,
`coveredBy` or `differ`, with a `nested` result for a qualifier holding a nested identifier on both sides,
and `null` for a pair that has no parts to relate. `covers`, `coveredBy` and `samePackage` are its
reductions.

`sameIdentifier` answers `false`, rather than throwing, when either identifier is malformed or at a scheme
version this package does not implement: such an identifier names nothing, itself included.

The public surface is declared in the specification, and this release aligns the package with it:

- `canonical` is now `canonicalIdentifier`; `canonical` remains as a deprecated alias.
- The types `Fragment` (was `ParsedFragment`), `Spec` (was `RefIdSpec`), `RelateResult`, `Relation`,
  `QualifierRelation` and `IdentifierOrParsed` are exported; the old names remain as deprecated aliases.
- `canonicalise` raises a `SpecIntegrityError`, where it raised a plain `Error`, so every error the package
  throws is a `RefIdError`.

The Rust crate and the Swift package gain the same operations under the same names — `same_identifier`
and `sameIdentifier`, `relate`, identifiers accepted as a string or a parse result — and the Swift
package's `canonicalJSON(_:)` and `loadSpec(from:)` become `canonicalise(_:)` and `loadSpecFrom(_:)`, the
old names kept as deprecated aliases.
