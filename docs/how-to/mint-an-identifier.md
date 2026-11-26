# Mint an identifier for something you declared

This page turns one thing you need to name — an exported function, a record, a heading, a book, a DOI —
into its `ref:` identifier. It assumes a Node.js 22+ project that uses ES modules, with the package
installed: `npm init -y && npm pkg set type=module && npm install @entelekheia/ref-id`. For a file in a
repository, [Find the identifier of a file](identify-a-file.md) is
quicker.

## Steps

1. **Check that the thing was declared.** Only a name somebody declared receives an identifier: a symbol
   a package exports, a record a store keys by name, a heading a document writes. A relation between two
   things, such as *derived from*, is an edge, and a score or a count is an attribute. Neither gets an
   identifier. Store those beside the identifiers they connect.

2. **Pick the type from who vouches for the name.**

   | The name is vouched for by | Type | Locator |
   |---|---|---|
   | a package registry | `pkg` | a Package URL without its `pkg:` prefix: `npm/left-pad@1.3.0` |
   | nobody: the files are yours | `folder` | the repository's name, then the path: `handbook/docs/guide.md` |
   | the owner of a host | `url` | the host, then the names declared under it, with no scheme: `acme.example/doctor@v1.0` |
   | whoever runs a mailbox | `email` | `support@example.com` |
   | ITU-T, ISO or GS1 | `tel`, `isbn`, `gtin` | the number in its standard's form: `+` and digits for `tel`; `isbn` and `gtin` have their check digit validated |
   | a provider serving a model | `ai-model` | the provider, then the served id |
   | an authority this registry does not list | `unknown` | its species, a colon, then its name: `doi:10.1000/182` |

   Why the registry has exactly these nine types is in
   [What earns a type](../explanation/what-earns-a-type.md).

3. **Cut one level below the locator.** Everything after `#` is the name declared inside what the
   locator names, one level down: a function inside a package, a heading inside a file, a file inside a
   directory. Choosing where to cut is choosing what you name. Never put a path in the fragment:
   `ref:folder:handbook#docs/guide.md` parses, but it is a second spelling of
   `ref:folder:handbook/docs#guide.md`, and the two compare as different identifiers.

4. **Keep a released version in the locator.** `npm/left-pad@1.3.0` names one release, and
   `npm/left-pad` names the package across every release. Pick the second when the name must survive
   upgrades.

5. **Add a qualifier only where it tells two records apart.** The default is none. The ones you will
   reach for first:

   - `state=` freezes the content you read: a SWHID, a `git:` commit, a `sha256:` or `blake3:` hash, or
     `none`;
   - `origin=` and `path=` say where to look, and never change what is named;
   - `by=` names the instrument that took a reading, `over=` the population it read, and `when=` the
     moment, in UTC.

   Every qualifier and its forms are in [the reference](../reference/the-ref-scheme.md#qualifiers).

6. **Build it.** Put the parts in `mint.mjs` and run `node mint.mjs`:

   ```js
   import { build } from "@entelekheia/ref-id"

   console.log(build({ type: "pkg", locator: "npm/left-pad@1.3.0", fragment: "leftPad" }))
   console.log(build({ type: "unknown", locator: "doi:10.1000/182" }))
   console.log(build({
     type: "folder",
     locator: "handbook/docs/guide.md",
     fragment: "Setup",
     qualifiers: [["origin", "https://github.com/acme/handbook"]],
   }))
   ```

   ```text
   ref:pkg:npm/left-pad@1.3.0#leftPad
   ref:unknown:doi:10.1000/182
   ref:folder:handbook/docs/guide.md;origin=https://github.com/acme/handbook#Setup
   ```

   `build` throws a `BuildError` naming the part it refused, for example
   `cannot build: the assembled string is malformed — refused at the locator` for an ISBN whose check
   digit is wrong.

## With an AI agent

In a clone of this repository, the `identify` skill applies steps 1 to 5 for you and refuses with a
reason when one of them fails. In Claude Code, ask for it with `/identify`. Without an agent, its script
takes the parts directly:

```sh
node .agents/skills/identify/scripts/identify.ts mint --type pkg --locator npm/left-pad@1.3.0 --fragment leftPad
```

It prints one JSON object whose `ref` field is the identifier, and exits `2` with a named refusal when it
cannot settle a step. It needs Node.js 22.18 or later and `npm ci` at the repository root.
