---
description: "The scheme is data and the code consumes it — invariants that make a green test suite lie when broken."
trigger: always_on
---

## Repo guardrails

- **Never restate `spec/ref-id.json` in code.** A dispatch table, qualifier key list, refinement key,
  resolution state or the grammar expression written into `packages/` is a second copy that drifts. Read
  the spec; test against its vectors.
- **Never edit `spec/ref-id.json` without regenerating its digest.** The package embeds the digest of the
  canonical serialisation and refuses a spec that does not match; a hand edit without the regeneration
  step is a build failure, and silencing that check defeats the reason the digest exists.
- **Never dedupe or reorder members when computing a set digest.** Order is the declared order; a
  repeated identifier is a distinct member. Both are conformance vectors and both fail loudly.
- **Never throw on an unknown locator type.** It parses, it is comparable, and it degrades to
  `uncovered`. Throwing turns a later extension into data loss for whoever already stored identifiers.
- **Never drop a qualifier key you do not recognise when re-serialising.** Carry it through byte for byte;
  the roundtrip vectors cover exactly this.
- **Never add a dependency with a native runtime.** The package must stay portable by port, not by
  binding; `packageurl-js` and Node's `crypto` are the whole runtime surface.
