# Known differences between implementations

The four implementations — TypeScript (`@entelekheia/ref-id`), Rust (`ref-id`), Swift (`RefId`) and Python
(`ref-id`) — give the same answer on every input the specification's conformance vectors name, and a
differential test runs all four over that corpus on every change. The differences below sit outside it, in
the one place the scheme hands its answer to someone else: **a Package URL locator is validated, and
spelled in its canonical form, by a Package URL library**, and the four implementations use four different
ones.

| Implementation | Package URL validator | Measured at |
|---|---|---|
| TypeScript | `packageurl-js` | 2.0.1 |
| Rust | the `packageurl` crate | 0.7.0 |
| Swift | an in-house grammar (no maintained Swift library exists) | — |
| Python | `packageurl-python` | 0.17.6 |

**Identity is unaffected.** Comparison — `same_identifier`, `same_package`, `covers`, `relate`, `verdict`
— reads the identifier as written and never passes through the Package URL canonical form. Every pair
below that is two spellings of one locator compares the same way in all four implementations.

What differs is whether a locator is accepted at all, and the informational `canonical` field of a parse
result.

## Validity

An identifier accepted by one implementation and `malformed` at `locator` in another. Every row is the
parse of the identifier in the first column; `ok` means the implementation accepts it.

| Identifier | TypeScript | Rust | Swift | Python |
|---|---|---|---|---|
| `ref:pkg:npm/acme/@1` — an empty name after a namespace | ok | malformed | malformed | ok, read as `pkg:npm/acme@1` |
| `ref:pkg:npm/foo@1.0.0/` — a version ending in `/` | ok | malformed | ok | ok |
| `ref:pkg:npm/@x@1.0.0` — a scoped name with nothing after the scope | ok | ok | malformed | malformed |
| `ref:pkg: npm/x@1` — whitespace before the type | ok | malformed | malformed | ok |
| `ref:pkg:npm/a@1%zz` — an escape that does not decode, in the version | malformed | ok | ok | ok |
| `ref:pkg:npm/a%zz@1` — the same in the name | malformed | ok | ok | ok |
| `ref:pkg:npm/%zz/a@1` — the same in the namespace | malformed | ok | ok | ok |
| `ref:pkg:npm/a@1?x=%zz` — the same in a qualifier value | malformed | ok | ok | ok |
| `ref:pkg:npm/a@1%C3` — a truncated UTF-8 sequence | malformed | malformed | ok | ok |

One difference reaches a nested identifier. Inside a `by=` value, an encoded `#` in an npm namespace —
`ref:folder:a;by=ref:pkg:npm/@ac%23me/profiles@0.1.0` — is `ok` in TypeScript and `malformed` at `by` in
the other three. At the top level the same locator is accepted by all four.

## The canonical form

For an identifier every implementation accepts, the `canonical` field — the library's own spelling of the
delegated Package URL — can still differ.

| Identifier | TypeScript | Rust | Swift | Python |
|---|---|---|---|---|
| `ref:pkg:npm/@AcMe/X@2.0.0` | `pkg:npm/%40acme/x@2.0.0` | `pkg:npm/%40AcMe/x@2.0.0` | `pkg:npm/%40AcMe/X@2.0.0` | `pkg:npm/%40AcMe/x@2.0.0` |
| `ref:pkg:pypi/Ref_ID@1` | `pkg:pypi/ref-id@1` | `pkg:pypi/ref-id@1` | `pkg:pypi/Ref_ID@1` | `pkg:pypi/ref-id@1` |
| `ref:pkg:npm/x@1%2F2` | `pkg:npm/x@1%2F2` | `pkg:npm/x@1/2` | `pkg:npm/x@1%2F2` | `pkg:npm/x@1/2` |
| `ref:pkg:npm/x@1&2` | `pkg:npm/x@1%262` | `pkg:npm/x@1&2` | `pkg:npm/x@1%262` | `pkg:npm/x@1%262` |
| `ref:pkg:npm/x@1+2` | `pkg:npm/x@1+2` | `pkg:npm/x@1%2B2` | `pkg:npm/x@1+2` | `pkg:npm/x@1%2B2` |
| `ref:pkg:npm/a@1?x=%zz` | malformed | `pkg:npm/a@1?x=%25zz` | `pkg:npm/a@1?x=%zz` | `pkg:npm/a@1?x=%25zz` |
| `ref:pkg:npm/a@1%C3` | malformed | malformed | `pkg:npm/a@1%25C3` | `pkg:npm/a@1%EF%BF%BD` |

The specification does not yet fix the canonical spelling per Package URL type, so no implementation is
wrong here; each follows its library.

## Writing identifiers that travel

- **Store the identifier as written**, or its `canonical_identifier`, never the `canonical` field. The
  field is informational and depends on which implementation produced it.
- **An identifier minted by one implementation and read by another** is safe as long as its Package URL
  avoids the shapes in the validity table: a percent-escape that does not decode, a trailing `/`, an empty
  name, whitespace, and an encoded `#` in a nested npm namespace.
- **Treat a `malformed` at `locator` on a `pkg` identifier that another implementation accepted** as one
  of the rows above before treating it as a defect.
