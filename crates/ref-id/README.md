# ref-id

**The `ref:` identifier scheme, as a Rust crate held to the specification's conformance vectors.**
An identifier names a thing by what somebody declared about it — a package, a folder, a domain, a mailbox, an agent — never by where a file happens to sit.

The specification is data: `spec/ref-id.json` (grammar, tables, digest rules, 113 conformance vectors) is embedded in the crate byte-for-byte and verified against its digest at load. The crate implements the behaviour the vectors bind — parse, serialise, build, digest, and the envelope invariant — and restates none of the specification's tables.

## Install

```sh
cargo add ref-id
```

## Usage

Parse an identifier, then re-serialise it. `parse` never errs for an identifier problem: a malformed
string comes back with `status == "malformed"` and the part that failed; an unknown type comes back
`uncovered`, carried whole.

```rust
use ref_id::{parse, serialise};

let parsed = parse("ref:pkg:npm/@acme/scanner-core@0.1.0#Observation")?;
assert_eq!(parsed.status, "ok");
assert_eq!(parsed.r#type, "pkg");
assert_eq!(parsed.delegated.as_deref(), Some("pkg:npm/@acme/scanner-core@0.1.0"));
assert_eq!(serialise(&parsed)?, "ref:pkg:npm/@acme/scanner-core@0.1.0#Observation");
# Ok::<(), ref_id::RefIdError>(())
```

The other entry points: `build(&BuildParts)` composes an identifier from declared parts and refuses
what the grammar cannot carry; `digest(&[String])` hashes an ordered set of identifiers the way the
specification prescribes; `validate_envelope(id, &json)` checks a stored record against the identifier
it was requested under. `load_spec()` exposes the embedded specification, `load_spec_from(dir)` a
directory holding `ref-id.json` and its `.sha256` sidecar.

The scheme itself — the grammar, the types, the qualifiers `state`, `by`, `over` and `when`, the
fragment grammars — is documented in the repository's `docs/reference/the-ref-scheme.md`.

## Requirements

Rust 2021 edition, no platform assumptions; the regular
expression engine needs no dialect adaptation for this grammar, which the specification records.

## License

Apache-2.0.
