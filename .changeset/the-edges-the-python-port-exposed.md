---
"@entelekheia/ref-id": minor
---

Spec 1.6.0: the edges a fourth implementation exposed are now rules, each bound by vectors.

- `canonicalise` defines its numbers: an integer whose magnitude is at most `version.maximum`
  (9007199254740991) is written as that integer, an integral value written as `1.0` or `1e2` is that
  integer, and any other number is refused with `SpecIntegrityError`. A new `canonicalisation` vector
  group binds it, with raw JSON text as input.
- A version literal above `version.maximum` parses as `unsupported`, `versionText` keeping the literal and
  `version` reporting the maximum — before, `version` was a rounded float.
- `digest` refuses a member holding a lone surrogate with `DigestError`, instead of encoding it as U+FFFD,
  which let two different members digest alike; `validateEnvelope` inherits the refusal.
- `parse` no longer throws on a qualifier key that names an `Object.prototype` member (`constructor`); every
  lookup keyed by a qualifier, refinement or type is an own-property test.
- A refinement declaring `maximum` (`lines`, `item`, `para`, each pointing at `/version/maximum`) refuses,
  as malformed at that refinement, any integer above it — before, a `lines` bound past 2^53 was admitted
  after losing precision.
- `loadSpecFrom` and `canonicalise` refuse with `SpecIntegrityError` instead of letting `SyntaxError`,
  `RangeError` or a file-system error escape.
- A dialect adaptation declares an `anchor`, replacing only the `$` that ends a pattern.
