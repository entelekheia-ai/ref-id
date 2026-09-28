# ref-id

**The `ref:` identifier scheme, as a Python package held to the specification's conformance vectors.**
An identifier names a thing by what somebody declared about it — a package, a folder, a domain, a mailbox,
an agent — never by where a file happens to sit.

The specification is data: `ref-id.json` (grammar, tables, digest rules, conformance vectors) ships inside
the package byte-for-byte and is verified against its digest at load. The package implements the behaviour
the vectors bind — parse, serialise, build, comparison, digest and the envelope invariant — and restates
none of the specification's tables. It is one of four implementations of the scheme (TypeScript, Rust,
Swift, Python) that a differential test holds to the same answers on every input the specification names.

## Install

```sh
pip install ref-id
```

Python 3.11 or later. The one dependency is `packageurl-python`, which validates Package URL locators.

## Usage

Parse an identifier, then re-serialise it. `parse` never raises for an identifier problem: a malformed
string comes back with `status == "malformed"` and the part that failed; an unknown type comes back
`uncovered`, carried whole.

```python
import ref_id

parsed = ref_id.parse("ref:pkg:npm/@acme/scanner-core@0.1.0#Observation")
assert parsed.status == "ok"
assert parsed.type == "pkg"
assert parsed.delegated == "pkg:npm/@acme/scanner-core@0.1.0"
assert ref_id.serialise(parsed) == "ref:pkg:npm/@acme/scanner-core@0.1.0#Observation"
```

The other entry points: `build(ref_id.BuildParts(...))` composes an identifier from declared parts and
refuses what the grammar cannot carry; `digest([...])` hashes an ordered list of identifiers the way the
specification prescribes; `validate_envelope(requested_id, envelope)` checks a stored record against the
identifier it was requested under. `covers(general, specific)`, `same_package(a, b)` and
`same_identifier(a, b)` compare two identifiers — each accepts a `str` or a `ParseResult` — and
`relate(a, b)` reports the full per-dimension relation the others reduce from, while `verdict(a, b)` reads
it once location qualifiers are hints: an identity axis, a content axis and what decided each.
`canonical_identifier` and `canonicalise` produce canonical forms. `load_spec()` returns the embedded
specification, `load_spec_from(directory)` one read from a directory holding `ref-id.json` and its
`.sha256` sidecar.

Every function but `validate_envelope` takes its arguments by position only, as the specification declares
them unlabelled. Results are frozen dataclasses; `to_json()` gives the specification's own field names.
Errors are `RefIdError` and its five kinds.

`packageurl-python` decides whether a Package URL locator is valid and how its `canonical` field is spelled,
and the other implementations use other validators. Where they differ is measured in
[Known differences between implementations](https://github.com/entelekheia-ai/ref-id/blob/main/docs/reference/implementation-differences.md).

## License

Apache-2.0. Source, specification and issues: <https://github.com/entelekheia-ai/ref-id>.
