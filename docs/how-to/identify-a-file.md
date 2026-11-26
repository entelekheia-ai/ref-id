# Find the identifier of a file

This page gives a file — or a heading inside it — its `ref:` identifier, the same one every clone of the
repository will produce. The `identify` script settles the two questions that are easy to get wrong: which
type the file gets, and which name opens the locator.

## Steps

1. **Clone this repository and install it.** The script ships in the repository, not in the npm package.
   It is a `.ts` file that Node.js runs directly from 22.18 on; an older Node refuses to load it.

   ```sh
   git clone https://github.com/entelekheia-ai/ref-id
   cd ref-id
   npm ci
   ```

2. **Run `mint` on the file, with the heading you mean.** Run it from the root of the ref-id clone, and
   pass the path of the file you are naming, which lives in your own repository:

   ```sh
   node .agents/skills/identify/scripts/identify.ts mint --path ~/src/handbook/docs/guide.md --fragment Setup
   ```

   For a public repository whose remote is `https://github.com/acme/handbook`, it prints the output below.
   A private or unreachable remote adds the variants described in step 4.

   ```json
   {
     "ref": "ref:folder:handbook/docs/guide.md;origin=https://github.com/acme/handbook#Setup",
     "status": "ok",
     "type": "folder",
     "locator": "handbook/docs/guide.md",
     "fragment": "Setup",
     "nameSource": "claimed",
     "nameFrom": "origin",
     "visibility": "public",
     "visibilityBy": "anonymous git ls-remote exit 0"
   }
   ```

   The `ref` field is the identifier. Without `--fragment`, the script refuses with `target-undeclared`
   and lists the headings it found under `evidence.declaredNames`, so you can pick one. To name the file
   itself, cut at its directory and pass the parts:

   ```sh
   node .agents/skills/identify/scripts/identify.ts mint --type folder --locator handbook/docs \
     --fragment guide.md --qualifier origin=https://github.com/acme/handbook
   ```

   That prints `ref:folder:handbook/docs;origin=https://github.com/acme/handbook#guide.md`.

3. **Read which type it chose.** A file that a clean install of the package contains is named through
   the package, at its version. The script asks `npm pack` which files those are:

   ```text
   ref:pkg:npm/@entelekheia/ref-id@0.7.1/README.md#Install
   ```

   Any other file is named through the repository: its name opens the locator, the path runs from the
   repository's top level, and `origin=` records where it is hosted. Every clone and every worktree
   therefore mints the same identifier.

4. **Choose a variant when the repository is private.** The script checks visibility with one anonymous
   `git ls-remote`. When the repository is not public, or when `--offline` skipped the check, the output
   also carries `variants.private`, with `origin=`, and `variants.public`, without it, plus a `warning`.
   `ref` is the private variant. Share `variants.public` when the host or the organisation should not
   travel with the identifier. Add `--locator` to replace the repository's name as well.

A repository with no remote is named after its top-level directory and carries `path=` instead of
`origin=`. Under your home or temporary directory, that path is written through a token such as `~`, so no
user name reaches the identifier. `--root` names the root by hand.

In Claude Code, the same thing is `/identify` with the file's path. The skill also checks the identifiers
a corpus already holds (`identify.ts sweep`); its [`SKILL.md`](../../.agents/skills/identify/SKILL.md)
describes every mode.

To name something that is not a file, follow [Mint an identifier](mint-an-identifier.md). To find the file
again from its identifier, follow [Write a resolver](write-a-resolver.md).
