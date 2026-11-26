# Contributing

The most useful contribution right now is feedback on the scheme itself: an identifier you could not
write, a comparison that answered wrong for your case, a type you needed and the registry lacks. Open an
issue for any of these. A vulnerability goes through [`SECURITY.md`](SECURITY.md) instead, never an issue.

## How a change is shaped

The specification is data, and the code follows it. A change to the scheme is an edit to
[`spec/ref-id.json`](spec/) plus the conformance vectors that bind it; the four implementations then
follow the vectors. Code that restates a table, a qualifier key or the grammar expression is a defect,
even when every test passes. [`AGENTS.md`](AGENTS.md) states the rest of the rules that decide whether a
change is accepted: what mints a new `specVersion` major, why an unknown type never throws, how the
public surface is declared, and what the differential test proves.

## Working with an AI agent

The repository ships the skills and subagents its own work is done with. Claude Code picks them up from
`.claude/` when you open the repository. Use them rather than re-deriving their rules in a prompt:

| Use | When |
|---|---|
| the [`identify`](.agents/skills/identify/SKILL.md) skill (`/identify`) | you need an identifier for something, need to check identifiers already written down, or want a type moved from `uncovered` to registered |
| the [`verify-hostile-input`](.agents/skills/verify-hostile-input/SKILL.md) skill | before merging a change to how any implementation reads input |
| the `ref-id-port-implementer` subagent | one change in one of the four implementations, behind that language's gate; one call per language |
| the `ref-id-reviewer` subagent | a read-only adversarial review of a branch before it merges |

How a delegated change is briefed and how its report is checked is in the agent section of
[`AGENTS.md`](AGENTS.md). Any other agent can read the same files: a skill is a `SKILL.md`, and a
subagent is a Markdown file under `.claude/agents/`.

## Toolchain

| For | Install |
|---|---|
| the TypeScript reference, the gates, the differential | Node.js 22 or later, then `npm ci` at the root |
| the Rust port | Rust stable (`cargo`) |
| the Swift port | Swift 5.9 or later on macOS 13 or later; Command Line Tools are enough |
| the Python port | [`uv`](https://docs.astral.sh/uv/); Python 3.11 or later |
| the grammar runner | Perl 5 with its core modules, which macOS and most Linux distributions ship |

The commit gate needs the `vibe-ops` CLI on your `PATH`, and the hook needs wiring once per clone:

```sh
npm install -g @entelekheia/vibe-ops-cli@0.2.0
git config core.hooksPath .githooks
```

Without the CLI, the hook refuses the commit and names this install command. `vibe-ops check` runs the
same gate by hand.

## Tests

```sh
npm run build && npm run typecheck && npm test   # TypeScript, both builds
npm run test:grammar                              # the pcre2 grammar runner
cargo test --workspace                            # Rust
swift run ref-id-conformance                      # Swift
(cd python && uv run pytest)                      # Python
npm run test:differential                         # all five implementations against each other
```

The differential runs every implementation over every input the specification names and over every pair
of them, so it needs the four toolchains above. CI runs it on macOS, the one runner where all of them are
present.

## Pull requests

- A change to a published package's contract carries a changeset: run `npx changeset` and describe the
  change for the person upgrading. A change to docs, tests or CI alone needs none.
- Releases are cut by CI. Merging the "Version Packages" pull request publishes to npm, crates.io and
  PyPI and tags the version Swift Package Manager resolves. No publishing token exists.
- Source files carry a one-line `// SPDX-License-Identifier: Apache-2.0` header; Markdown needs none.

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE).
