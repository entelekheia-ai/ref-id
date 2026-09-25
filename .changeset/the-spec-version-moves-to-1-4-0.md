---
"@entelekheia/ref-id": minor
---

The specification now calls itself `specVersion` 1.4.0. The type registry, the path moving into the locator,
`relate` and the `ai-model` provider all changed since 1.3.0 without the document's version moving, so 0.3.0,
0.4.0 and the release before this one embedded different registries under one `specVersion`. A consumer that
pins `specVersion` can tell this release apart from them; 1.3.0 is ambiguous and needs the package version
read beside it.

A `folder` identifier's fragment is the leaf: the locator carries the path down to the file's directory, so a
file is `ref:folder:acme-tools/docs#guide.md` and never `ref:folder:acme-tools#docs/guide.md`. The parse vector
that spelled a path in the fragment, and the example in the reference, now use the leaf form. No parser
enforces the rule — the fragment's grammar belongs to whoever mints — so an identifier written the other way
still parses, and names the same file under a second spelling that `sameIdentifier` reports as different.
