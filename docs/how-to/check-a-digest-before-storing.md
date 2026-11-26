# Check a digest before you store an identifier

An identifier that carries a digest, such as `ref:folder:my-tools;over=sha256:…`, claims that a set of
members hashes to that value. The claim holds only together with an envelope that lists the members.
This page shows how to refuse the claim at ingestion when it does not recompute. It assumes
`@entelekheia/ref-id` is installed in a Node.js 22+ project that uses ES modules (a `.mjs` file, or
`"type": "module"` in `package.json`).

## Steps

1. **Put the check in front of your store.** Create `ingest.mjs` with one function that every incoming
   identifier passes through:

   ```js
   import { validateEnvelope } from "@entelekheia/ref-id"

   export function ingest(requestedId, envelope, store) {
     const result = validateEnvelope(requestedId, envelope)
     if (!result.admissible) {
       throw new Error(`refused ${requestedId}: ${result.reason}`)
     }
     store.add(requestedId)
   }
   ```

   `requestedId` is the identifier you were asked to store, taken from the request rather than read back
   from the envelope. Then an envelope that names a different identifier is refused.

2. **Pass the identifier with its envelope.** The envelope is an object whose `id` is the identifier
   itself and whose `sets` holds the members, one array per digest qualifier. Add to `ingest.mjs`:

   ```js
   const id = "ref:folder:my-tools;over=sha256:c17b795c8273630d47ecd7264610f9cc1062d9c6622ae8828b4e047b2567c3e6"
   const envelope = {
     id,
     sets: {
       over: [
         "ref:pkg:npm/left-pad@1.3.0#leftPad",
         "ref:pkg:npm/right-pad@1.0.1#rightPad",
       ],
     },
   }

   const store = new Set()
   ingest(id, envelope, store)
   console.log(store.has(id))
   ```

3. **Run it.** `node ingest.mjs` prints `true`: the members recompute to the digest, so the identifier was
   stored. Change any member and run it again: it throws with the reason, and nothing is stored.

An identifier with no digest qualifier is admissible with an envelope that holds only its `id`.

## Why an envelope is refused

`reason` says which check failed. The checks run in the order of this table, and the first one that fails
is the reason you get:

| `reason` | What arrived |
|---|---|
| `envelope is not an object` | the envelope is not a JSON object, or is `null` |
| `envelope.id does not match the requested identifier` | the envelope belongs to another identifier |
| `the requested identifier is malformed` | the identifier itself does not parse |
| `the requested identifier is unsupported` | the identifier names a scheme version this package does not implement, such as `ref:2:` |
| `sets.over is missing or is not an array of strings` | the identifier carries an `over` digest, but the envelope has no member list for it |
| `sets.over does not recompute to the declared digest` | a member was changed, added, removed or reordered after the digest was taken |

Order and repetition count. The digest covers the members in their declared order, and a repeated
identifier is a distinct member, so do not sort or deduplicate the list before validating it.

The conformance vectors that bind these checks are the `envelope` group of
[`spec/ref-id.json`](../../spec/ref-id.json). The digest rules are in
[the `ref:` scheme reference](../reference/the-ref-scheme.md).
