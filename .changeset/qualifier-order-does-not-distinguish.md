---
'@entelekheia/ref-id': minor
---

Qualifier order does not distinguish: `;a=1;b=2` and `;b=2;a=1` are one identifier.

`specVersion` 1.3.0. The 1.2.0 rule said only that written order must be preserved on re-serialisation and
left open whether two orders were two identifiers. They are not — the qualifiers are a keyed set, each key
at most once, and a set has no order. Leaving it open put a producer's incidental choice inside the
identity of the thing it named, so an edit that changed nothing about the subject renamed it.

New: `canonical(identifier)` re-serialises with qualifiers sorted by key in UTF-16 code unit order, every
other part verbatim, and `sameIdentifier(a, b)` compares two through it. Eleven conformance vectors under
`vectors.canonical`. Preserving written order is demoted from MUST to SHOULD — `serialise(parse(s)) === s`
still holds, and identity is no longer judged on it.

**Refinements are not affected.** They sit on the fragment side and are positional, `lines=1,20` being a
range, so `canonical` leaves them as written. Neither is a set named by a digest: that stays an ordered
sequence, where order is declared content.

Nothing a producer writes changes. `build()` emits what it was handed and `serialise()` emits what it
parsed; neither sorts. No identifier already minted becomes a different one, and the identifier version
does not move — what moves is which pairs of them were always the same. A consumer that only parses needs
nothing; one that compares, dedupes or indexes identifiers is the one that upgrades.

Rust and Swift do not carry `canonical` yet.
