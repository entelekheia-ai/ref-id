---
"@entelekheia/ref-id": minor
---

Spec 1.5.0: location enters an identifier as a hint, never as identity (ADR-0006).

- Three location qualifiers — `path=` (a directory opening on `~`, `{tmp}`, `{config}`, `{data}` or
  `{cache}`, or an absolute path outside them), `origin=` (a repository's `https` address in one
  spelling) and `corpus=` (a manifest or a nested `ref:` that declares the name).
- `verdict(a, b)`: what two identifiers mean together once some qualifiers are hints — an identity axis
  (`same`, `covers`, `coveredBy`, `distinct`, `undetermined`), a content axis read from `state=`, and
  `decidedBy`. It agrees with `covers` on every pair.
- A `folder` locator segment that is exactly `.` or `..` is now `malformed` at the locator.

**What a 1.4.0 reader sees change:** `path=`, `origin=` and `corpus=` were unknown keys and carried
through whatever their value; a value outside their forms is now `malformed` at the key, and so is any of
the three written after `#`. A `folder` locator with a `.` or `..` segment was `ok` and is now `malformed`.
Everything else keeps its parse.
