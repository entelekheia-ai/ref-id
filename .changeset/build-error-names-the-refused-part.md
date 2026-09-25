---
"@entelekheia/ref-id": patch
---

`BuildError`'s message names the refused part — `cannot build: the assembled string is malformed — refused at
the locator` — in the TypeScript, Rust and Swift implementations, and each suite now checks that every build
error vector's part appears in the message. A part that `parse` reported while checking the assembled string
is carried verbatim, so a key the spec does not declare no longer turns a build refusal into a
`SpecVersionError`. The reference and the `identify` skill state what an `unknown` locator admits: one `:`
closing the species and one trailing `@`, so a composed label carrying more fits only in the fragment.
