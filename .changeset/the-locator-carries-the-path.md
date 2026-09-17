---
"@entelekheia/ref-id": minor
---

The locator carries the path to a file, and the fragment names what is declared inside that file.

A `folder` locator continues into the subtree it names, one segment per directory, so
`ref:folder:acme-tools/docs/guide.md#Setup` names a heading in a file rather than hanging that
heading on the corpus. A `pkg` locator carries a path after its version, which leaves for the
Package URL as that format's own subpath component — `ref:pkg:npm/x@1.0.0/docs/guide.md` now
canonicalises to `pkg:npm/x@1.0.0#docs/guide.md` instead of folding the path into the version as
`@1.0.0%2Fdocs%2Fguide.md`. With no version declared there is no marker separating the name from the
path, so a file in an unversioned corpus is named through `folder`.

`covers` follows: the general stem now reaches the specific one when it is equal **or a whole
segment prefix** of it, so a corpus covers the files under it. The segment boundary is load-bearing —
`acme-tools` does not cover `acme-tools-extra`. A path stays in the stem and only the version leaves
it, so one file at two releases is one package and two files in one release are not.

One conformance vector is revoked: a corpus name may now contain a path separator.
