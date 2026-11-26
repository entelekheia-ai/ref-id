# Write a resolver

A resolver takes an identifier and returns the thing it names. The scheme defines what each part of an
identifier means and which states a resolution can end in. Where your copies live is yours to know, so
the resolver is your code. This page writes one for `folder` identifiers whose fragment is a Markdown
heading. It assumes a Node.js 22+ project that uses ES modules, with the package installed:
`npm init -y && npm pkg set type=module && npm install @entelekheia/ref-id`.

## Read an identifier as a search

```text
search(in: <type>:<locator>, for: #<declared name>, with: ;<qualifiers>)
```

The locator says where to look and the fragment says which declared name. The location qualifiers only
narrow the search. A reader tries them in this order: `path=`, a directory on this machine; then
`origin=`, the repository's address; then `corpus=`, the manifest that declares the name.

A resolution ends in one of four states:

| State | Meaning |
|---|---|
| `resolved` | the target was found |
| `unresolved` | the target is gone |
| `uncovered` | nothing here can read the target's type or format |
| `archival` | the target is a frozen state, such as a SWHID in a public archive, and resolves by construction |

The state belongs to the edge that holds the identifier, not to the thing named. Store it beside the
reference, and never delete an identifier because it stopped resolving.

## Steps

1. **Create `resolve.mjs`** with the function below.

   ```js
   import { readFile } from "node:fs/promises"
   import { createHash } from "node:crypto"
   import { homedir, tmpdir } from "node:os"
   import { join } from "node:path"
   import { parse } from "@entelekheia/ref-id"

   // Where you keep a clone of each repository you resolve against.
   const clones = new Map([
     ["https://github.com/acme/handbook", process.env.HANDBOOK],
   ])

   const tokens = { "~": homedir(), "{tmp}": tmpdir() }

   function rootFrom(hints) {
     if (hints.path) {
       const [first, ...rest] = hints.path.split("/")
       return first in tokens ? join(tokens[first], ...rest) : hints.path
     }
     if (hints.origin) return clones.get(hints.origin)
   }

   // A SWHID for content is the git blob hash of the file's bytes.
   function contentState(bytes, state) {
     if (state === undefined || !state.startsWith("swh:1:cnt:")) return "unverifiable"
     const header = Buffer.from(`blob ${bytes.length}\0`)
     const swhid = "swh:1:cnt:" + createHash("sha1").update(header).update(bytes).digest("hex")
     return swhid === state ? "match" : "drift"
   }

   function headings(text) {
     return text.split("\n").filter((line) => /^#{1,6} /.test(line)).map((line) => line.replace(/^#+ /, "").trim())
   }

   export async function resolve(id) {
     const parsed = parse(id)
     if (parsed.status === "malformed" || parsed.status === "unsupported") {
       throw new Error(`${id} is ${parsed.status}`)
     }
     if (parsed.status === "uncovered" || parsed.type !== "folder") {
       return { state: "uncovered", reason: "type" }
     }

     const hints = Object.fromEntries(parsed.qualifiers)
     const root = rootFrom(hints)
     if (!root) return { state: "unresolved" }

     const [, ...inside] = parsed.locator.split("/")
     const file = join(root, ...inside)
     let bytes
     try {
       bytes = await readFile(file)
     } catch {
       return { state: "unresolved" }
     }
     if (parsed.fragment && !headings(bytes.toString("utf8")).includes(parsed.fragment.path)) {
       return { state: "unresolved" }
     }
     return { state: "resolved", file, content: contentState(bytes, hints.state) }
   }
   ```

   Each part follows one rule of the scheme:

   - A `malformed` or `unsupported` identifier is refused before any search, because nothing in it can
     be trusted to point anywhere.
   - A type this resolver cannot read is `uncovered`, never an error. A later resolver may read it.
   - The first segment of a `folder` locator is the repository's name. The rest is the path from its top
     level, so the root comes from the location hints and the path from the locator.
   - `path=` writes the home and temporary directories through the tokens `~` and `{tmp}`. The
     specification maps three more, `{config}`, `{data}` and `{cache}`, in `forms.local-path.tokens`; add
     them when your identifiers carry them.
   - `parse` returns the fragment as `{ path, refinements }`, with `path` decoded. The fragment of
     `…#Getting started` is therefore the text `Getting started`, and compares with the heading as written.
   - `state=` is checked, not obeyed. A file that changed still resolves, with `content: "drift"`. Only
     `swh:1:cnt:` is computed here; `sha256:`, `blake3:`, `git:` and `none` come back `unverifiable`
     until you add them.

2. **Try it.** Create `try.mjs`:

   ```js
   import { resolve } from "./resolve.mjs"

   const origin = "origin=https://github.com/acme/handbook"
   for (const id of [
     `ref:folder:handbook/docs/guide.md;${origin}#Setup`,
     `ref:folder:handbook/docs/guide.md;${origin}#Teardown`,
     `ref:folder:handbook/docs/guide.md;${origin};state=swh:1:cnt:0000000000000000000000000000000000000000#Setup`,
     "ref:folder:handbook/docs/guide.md;origin=https://github.com/acme/elsewhere#Setup",
     "ref:pkg:npm/left-pad@1.3.0#leftPad",
   ]) console.log(JSON.stringify(await resolve(id)))
   ```

   Put a copy of the repository in `./handbook`, a clone or any directory with the same files, whose
   `docs/guide.md` has a `## Setup` heading and no `## Teardown`, then
   run `HANDBOOK=./handbook node try.mjs`:

   ```text
   {"state":"resolved","file":"handbook/docs/guide.md","content":"unverifiable"}
   {"state":"unresolved"}
   {"state":"resolved","file":"handbook/docs/guide.md","content":"drift"}
   {"state":"unresolved"}
   {"state":"uncovered","reason":"type"}
   ```

   The third line is a file that changed since the identifier froze it. The fourth names a repository you
   hold no clone of. The fifth is a type this resolver does not read.

## Going further

- **More types.** A `pkg` identifier resolves through the package manager: install the release the
  locator names and read the file under it. Dispatch on `parsed.type` and keep `uncovered` for the rest.
- **More than one candidate.** Two `path=` values may be two clones of one repository, so a different
  path alone decides nothing. Two different `origin=` values are two repositories, so drop a candidate
  whose origin differs from the identifier's.
- **Comparing what you found.** `verdict(a, b)` says whether two identifiers name the same thing once the
  location hints are set aside, and whether their `state=` says the content is the same.

The rules this page applies are in the reference:
[Location qualifiers](../reference/the-ref-scheme.md#location-qualifiers),
[What an identifier carries](../reference/the-ref-scheme.md#what-an-identifier-carries) and
[Resolution state belongs to the edge](../reference/the-ref-scheme.md#resolution-state-belongs-to-the-edge).
To produce identifiers for your files in the first place, follow
[Find the identifier of a file](identify-a-file.md).
