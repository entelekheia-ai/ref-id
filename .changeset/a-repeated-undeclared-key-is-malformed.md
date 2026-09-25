---
"@entelekheia/ref-id": patch
---

A repeated qualifier or refinement key that the specification does not declare now parses as `malformed`
at that key, as a repeated declared key always did. `parse('ref:ai-model:anthropic/x;effort=low;effort=medium')`
threw `SpecVersionError` instead — the error meant for a package naming a part its spec lacks, raised here
for a key the identifier itself carried. Fixed in the three implementations, and bound by two new parse
vectors so a fourth cannot reintroduce it with every suite green.
