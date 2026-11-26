# Your first `ref:` identifiers

In this tutorial you write a small Node script that reads an identifier, builds one from parts, compares
two releases of one package, and seals a list of identifiers under a digest that someone else can check.
It takes about ten minutes. You need Node.js 22 or later.

## 1. Set up a project

```sh
mkdir ref-id-tour && cd ref-id-tour
npm init -y
npm install @entelekheia/ref-id
```

Every script below is an ES module, so name each file with a `.mjs` extension and run it with `node`.

## 2. Read an identifier

Create `read.mjs`:

```js
import { parse } from "@entelekheia/ref-id"

const result = parse("ref:pkg:npm/left-pad@1.3.0#leftPad")
console.log(result.status, result.type, result.locator, result.fragment)
console.log(parse("ref:recipe:grandma/cookbook").status)
console.log(parse("ref:pkg:npm/").status)
```

Run `node read.mjs`:

```text
ok pkg npm/left-pad@1.3.0 { path: 'leftPad', refinements: [] }
uncovered
malformed
```

The first identifier names the function `leftPad` declared inside the npm package `left-pad` at
version 1.3.0. `pkg` is its type, `npm/left-pad@1.3.0` its locator, and everything after `#` the name
the package declared.

The second line shows that a type the specification does not register, here `recipe`, still parses.
Its status is `uncovered`, not an error. The third identifier has an empty package name, so it is
`malformed`. `parse` reports a status in all three cases and never throws.

## 3. Build an identifier from parts

Create `build.mjs`:

```js
import { build } from "@entelekheia/ref-id"

const id = build({
  type: "pkg",
  locator: "npm/left-pad@1.3.0",
  fragment: "leftPad",
  qualifiers: [["state", "swh:1:cnt:3404a00f00000000000000000000000000000000"]],
})
console.log(id)
```

Run `node build.mjs`:

```text
ref:pkg:npm/left-pad@1.3.0;state=swh:1:cnt:3404a00f00000000000000000000000000000000#leftPad
```

The `state` qualifier records which captured content you meant, as a Software Heritage identifier. The
name stays `leftPad`. The state is a qualifier beside it, so the same function keeps the same name after
its file changes.

## 4. Compare two releases

Create `compare.mjs`:

```js
import { covers, sameIdentifier, samePackage } from "@entelekheia/ref-id"

const v1 = "ref:pkg:npm/left-pad@1.3.0#leftPad"
const v2 = "ref:pkg:npm/left-pad@1.3.1#leftPad"
console.log(sameIdentifier(v1, v2))
console.log(samePackage(v1, v2))
console.log(covers("ref:pkg:npm/left-pad#leftPad", v1))
console.log(covers(v1, "ref:pkg:npm/left-pad#leftPad"))
```

Run `node compare.mjs`:

```text
false
true
true
false
```

Each line answers a different question:

- `sameIdentifier` is `false` because 1.3.0 and 1.3.1 are two releases.
- `samePackage` is `true` because both name the one package `left-pad`.
- `covers` is `true` when the identifier without a version is the first argument, because the general
  identifier covers every release.
- `covers` is `false` in the reverse order. A specific release never covers the general identifier.

## 5. Seal a list under a digest

Create `seal.mjs`:

```js
import { digest, validateEnvelope } from "@entelekheia/ref-id"

const members = [
  "ref:pkg:npm/left-pad@1.3.0#leftPad",
  "ref:pkg:npm/right-pad@1.0.1#rightPad",
]
const over = digest(members)
const id = `ref:folder:my-tools;over=${over}`
console.log(id)
console.log(validateEnvelope(id, { id, sets: { over: members } }))

const tampered = [members[0], "ref:pkg:npm/right-pad@9.9.9#rightPad"]
console.log(validateEnvelope(id, { id, sets: { over: tampered } }))
```

Run `node seal.mjs`:

```text
ref:folder:my-tools;over=sha256:c17b795c8273630d47ecd7264610f9cc1062d9c6622ae8828b4e047b2567c3e6
{ admissible: true }
{
  admissible: false,
  reason: 'sets.over does not recompute to the declared digest'
}
```

The identifier now claims a population, the two members, through its `over` digest. You ship it with an
**envelope** that lists those members. `validateEnvelope` recomputes the digest from the envelope, so the
honest envelope is admissible. The envelope with one changed member is refused, together with the reason.

## What you have now

Four scripts that read, build, compare and seal `ref:` identifiers. The same calls exist in the Rust,
Swift and Python packages with the same answers.

Next:

- [Check a digest before you store an identifier](../how-to/check-a-digest-before-storing.md) applies
  step 5 to data you receive.
- [The `ref:` scheme](../reference/the-ref-scheme.md) describes every part, qualifier and status.
- [Why a declared name](../explanation/why-a-declared-name.md) explains why identity is the name a format
  declared rather than a path or a hash.
