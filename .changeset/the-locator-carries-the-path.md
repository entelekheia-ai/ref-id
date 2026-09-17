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

A mailbox carries the items served under it. `email` refused a path because its locator is an RFC 5322
addr-spec, and the dispatch entry stated the reason as a claim about the world — *"nothing lives under
it"*. What sits under a mailbox is the person's own items, named by whoever serves them, and the scheme
checks neither who minted an id nor that the item exists. The addr-spec is now the **first segment** of
the locator and nothing else, so an item id carrying an `@` — which an RFC 5322 Message-ID does — sits
after the first `/` and is never mistaken for the mailbox. A Message-ID is carried without the angle
brackets the RFC writes it between, which is the form a mail API hands over.

A second conformance vector is revoked: the one named *"nothing lives under a mailbox"*.

Every error this package throws is now a `RefIdError`. `SpecIntegrityError` and `SpecVersionError` sat
outside the hierarchy, so `catch (e) { if (e instanceof RefIdError) … }` silently missed the two
failures a consumer is least equipped to recover from — the specification not matching its own digest,
and declaring a major this build cannot honour. Both now extend it and carry `part: "spec"`.
