# What earns a type, and what was rejected

The registry is [`the-ref-scheme.md`](../reference/the-ref-scheme.md)'s dispatch table, and the authority
for it is `spec/ref-id.json` at the root of this repository. This page is the reasoning: the test a type
name has to pass, why the nine that passed it read as one shape rather than nine, and what to do when the
thing in hand has none of them.

## The question a type name answers

A type does not name a category of thing. It names **who gets to say a locator means what it means** — the
naming system that owns the grammar. Read that way, the registry is small on purpose: there is exactly one
package registry per ecosystem, exactly one owner per host, exactly one standards body per format, so the
type roster stops growing the moment it has named every kind of authority worth naming, rather than every
kind of thing worth identifying.

## The admissibility test

A type name is admissible when **an unrelated party solving the same problem would have chosen the same
name**. `pkg`, `url`, `email` and `ai-model` pass this without friction — nobody claims those words, and a
second implementation of this scheme, built by someone who never saw this repository, would reach for the
same four.

Two shapes of name fail, for opposite reasons:

- **A product name fails because the claim is the whole point of it.** A vendor's own vocabulary for its
  own format is exactly what a second, unrelated implementer would *not* independently choose — they would
  choose it only by copying this registry, which means the name is not describing an authority, it is
  asserting one. A registry that admits a name like that is settled by whoever is larger rather than by
  whoever is right, and that is the fight the test exists to refuse before it starts.
- **A short, desirable word naming a general activity fails for the opposite reason.** Several unrelated
  parties would each want it, and none of them owns the grammar it would have to mean. Where a product name
  fails because one party's claim is too narrow to generalize, a bare activity word fails because it
  generalizes to everyone and therefore settles nothing — admitting it would just relocate the same fight to
  a different word.

(Plan-002, Design, "The admissibility test".)

## Nine types, read as nine ways an authority can exist

The table in `the-ref-scheme.md`'s delegation section lists `pkg`, `folder`, `url`, `email`, `unknown`,
`tel`, `isbn`, `gtin` and `ai-model` — nine entries, counted directly from `dispatch` in `spec/ref-id.json`.
Reading them as nine categories of *thing* makes the set look arbitrary: a package next to a phone number
next to a folder. Reading them as nine ways an authority can exist makes the set look closed:

| Authority | Type | What it says is true |
|---|---|---|
| A package registry | `pkg` | this name inside this ecosystem resolves to this package |
| The owner of a host | `url` | this owner controls what lives under each path segment |
| Whoever runs a mailbox | `email` | this mailbox belongs to the person or role it addresses |
| A provider serving a model | `ai-model` | this provider serves this model under this exact id, today |
| A standards body | `tel`, `isbn`, `gtin` | ITU-T (E.164), ISO (2108) and GS1 each say a number of the right shape and check digit is theirs to validate |
| Nobody — the subtree is local | `folder` | no manifest reaches this subtree, so the declared name is the only claim there is |
| None at all, named honestly | `unknown` | this registry does not cover the authority, and the locator says which one instead of hiding that |

Three types share one authority — a standards body — because three different bodies (ITU-T, ISO, GS1) each
own one number format outright, and none of the three grammars would survive being merged into the others:
`isbn` and `gtin` overlap exactly at the 13-digit form and diverge at the 10-digit one, which is the
argument the plan leaves open rather than settled (Plan-002, "Open questions").

## What to reach for when a type is not in the registry

`unknown` is not a fallback bucket; it is where an authority the registry does not cover gets a precise
name instead of an opaque one. Its locator carries a declared **species** before the first colon —
`unknown:doi:10.1000/182`, `unknown:orcid:0000-0002-1825-0097` — so the identifier says exactly which naming
system it belongs to, even though this registry has not adopted that system's grammar.

Promoting a species into a type of its own later **does not change the written identifier**. Only its
status moves, from `uncovered` (nothing here validates it) to `ok` (a validator now does). The string a
producer wrote on day one is the string a consumer reads after the promotion — nothing is rewritten, and
nothing that depended on the old spelling breaks.

(Plan-002, Design, "The type that defers its species"; the `unknown`
dispatch entry itself, `spec/ref-id.json`, confirms the colon-delimited species and the "registering that
species... moves only its status" language verbatim.)

A colon is safe inside an `unknown` locator for a reason that does not hold at the top level of the scheme:
the outer type is fixed once dispatch has already chosen `unknown`, so the locator's own grammar owns every
colon that follows. At the top level, a second colon would compete with a Package URL's own colons and with
a served model id that already carries one as data — which is why the admissibility test, not a syntax
rule, is what keeps the top level from needing one.

## Rejected, and what would reopen it

### A `uuid` type for an opaque, machine-minted value

Proposed as the type for an identifier with no naming authority behind it at all — just a value some system
minted. Rejected because two unrelated products can mint the same opaque value, and a type whose only
promise is *this has no authority* cannot tell those two collisions apart: everything under it would share
one namespace with nothing to disambiguate members of it.

What was kept instead: the minting authority is named directly, as the type or as part of a declared name,
and the opaque value becomes the fragment underneath it — a spelling the scheme already supports, so the
rejection cost nothing new.

**Reopens if** an opaque, machine-minted value needs to be nameable with no minting authority available to
prefix it at all — a case the plan does not have today.

(Plan-002, Decision Log, the `uuid` decision.)

### An identifier nested as the type, `ref:<identifier>:<rest>`

Proposed so that the authority is itself named under the scheme, which would make the registry unnecessary
and the competition for a short name impossible. Rejected because it solves the right problem the wrong
way, and because the form is already taken.

Measured against the reference implementation: the nested spelling parses today, and parses wrongly. The
type group admits no colon and a locator admits every colon, so the second colon is absorbed into the
locator and the result is `ok` with the authority and the thing fused into one opaque string. A spelling
that is already valid syntax with a different meaning cannot be given a new one without breaking whatever
reads it that way — and two registered types carry a colon as data today: a Package URL, and a served
model identifier whose tag is written with one. Escaping the colon to delimit it produces a
percent-encoded authority, which is less legible than the plain host `url` already offers.

What was kept instead: the admissibility test above, which removes the competition for the cost of a
clause rather than a grammar change, and `unknown` with a declared species for an authority the registry
does not cover.

**Reopens if** a type appears whose authority is expressible as none of a host, a registry, a mailbox or a
declared species. None was found while surveying the corpora this scheme was built to name.

(Plan-002, Decision Log, the nested-type decision.)

## Related

- [`why-a-declared-name.md`](why-a-declared-name.md) — the sibling explanation page, for why identity is a
  declared name inside a declared scope, and its own rejected alternatives.
- [`the-ref-scheme.md`](../reference/the-ref-scheme.md) — the dispatch table itself, and everything each
  type's validator receives.
- `project/plans/002-the-types-that-cannot-be-contested.md` — the plan this page serves.
