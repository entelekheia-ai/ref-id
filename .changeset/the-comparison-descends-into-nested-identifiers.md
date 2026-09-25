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

**Three spellings that named one thing are now one identifier.** The canonical form — what
`canonicalIdentifier` returns and `sameIdentifier` compares — sorts refinements by key as it already sorted
qualifiers (each is a filter, and filters combine with AND), writes a nested identifier in its own canonical
form, and omits the version slot when it holds the default version: `ref:1:pkg:npm/x` and `ref:pkg:npm/x`
are one identifier. A `sameIdentifier` result or a canonical form a store kept may change for such
spellings; `parse` still reports `explicitVersion`, and `serialise` still writes back what was read.

Comparison is byte for byte in every implementation: two Unicode spellings of one text (composed and
decomposed) are two identifiers, and a segment boundary is the byte `/`.

The public surface is declared in the specification, and this release aligns the package with it:

- `canonical` is now `canonicalIdentifier`; `canonical` remains as a deprecated alias.
- The types `Fragment` (was `ParsedFragment`), `Spec` (was `RefIdSpec`), `RelateResult`, `Relation`,
  `QualifierRelation` and `IdentifierOrParsed` are exported; the old names remain as deprecated aliases.
- `canonicalise` raises a `SpecIntegrityError` for the values the specification's canonicalisation refuses
  (a non-integer number, an unmappable type), where it raised a plain `Error`.

The Rust crate and the Swift package gain the same operations under the same names — `same_identifier`
and `sameIdentifier`, `relate`, identifiers accepted as a string or a parse result (in Rust through a
trait implemented for `str`, `String` and `ParseResult`, so `&String` arguments keep compiling) — and the Swift
package's `canonicalJSON(_:)` and `loadSpec(from:)` become `canonicalise(_:)` and `loadSpecFrom(_:)`, the
old names kept as deprecated aliases.
