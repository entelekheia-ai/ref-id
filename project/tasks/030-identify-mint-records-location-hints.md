---
vibe-ops-template: task@3
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# Task: identify mint records location hints and variants

| Field | Value |
|---|---|
| Status | Planned |
| Created | 2026-09-26 |
| Author | Danilo Borges |
| Issue | https://github.com/entelekheia-ai/ref-id/issues/30 |
| Plan | plans/006-location-hints-and-the-verdict.md — Track 4 |

---

## Context

`.agents/skills/identify/scripts/identify.ts mint --path` names a file that no package release contains
through `folder`, and today takes the corpus name from `basename(root)` in `folderCorpus`
(`identify.ts:198`), where `root` is the package directory, or `--root`, or the file's own directory.
Measured on this repository on 2026-09-26, three defects follow:

- `README.md` (with `--root .`) and `crates/ref-id/README.md` both mint `ref:folder:ref-id/README.md#x`,
  because the repository, the npm package and the crate all sit in directories named `ref-id`.
- The same file minted from a second worktree carries the worktree's directory name, and — with `--root`
  resolved against the script's own repository — a locator with `../../../` segments.
- Spec 1.5.0 now refuses a `folder` locator with a `..` segment, so that second output no longer builds.

Spec 1.5.0 and ADR-0006 give the tool somewhere to put what it knows about location: `origin=`, `path=`
and `corpus=`, whose forms are `forms.origin-url`, `forms.local-path` and `forms.relative-path` in
`spec/ref-id.json`. Plan-006's Design section, "The minting tool", is the specification of this task; its
Decision Log fixes the name order (repository first, manifest only outside git).

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | The corpus name and root come from the git repository | M |
| 2 | P0 | `origin=` normalised into its one spelling, or omitted | S |
| 3 | P0 | Visibility measured, and public/private variants | M |
| 4 | P1 | `path=` written through a template token | S |
| 5 | P1 | Output reports where the name came from | S |

### 1. Name and root from the repository — P0

**What:** in `folderCorpus`, find the git top level of the target (`git -C <dir of target> rev-parse
--show-toplevel`). Inside a repository the name is the repository name from the `origin` remote's last
path segment (without `.git`), or the top level's base name when there is no remote; the locator path is
measured from the top level. Outside any repository, the name comes from the nearest manifest whose name
fits `dispatch.folder.pattern`, the path is measured from that manifest's directory, and `corpus=` records
the manifest path. A new flag, `--name-from-manifest`, asks for the manifest route inside a repository too.
`--locator` still overrides everything.
**Why:** a directory's base name is the path-derived corpus the reference forbids, and it is what made two
files one identifier and one file two identifiers.
**Change:** replace `basename(root)`; keep refusing with `corpus-name-unusable` when the name does not fit
the pattern. The target may be an absolute path outside this repository.

### 2. `origin=` in its one spelling — P0

**What:** read `git remote get-url origin`; rewrite `git@host:org/repo(.git)` to `https://host/org/repo`;
strip userinfo, a trailing `.git`, a trailing `/`, and the default port; lowercase the path. If the result
does not match `spec.forms["origin-url"].pattern` (read from the spec, never restated), write no `origin=`
and report why.
**Why:** an `origin=` conflict decides `distinct`, so any second spelling would separate a repository from
itself — the reason the form is strict.

### 3. Visibility and variants — P0

**What:** one `git ls-remote --heads <https url>` with credentials disabled (`GIT_TERMINAL_PROMPT=0`,
`GIT_ASKPASS` to a command that fails, `-c credential.helper=`) and a timeout. Exit `0` is `public`;
anything else is `private`. `--offline` skips the network and reports `unknown`. When visibility is not
`public`, the output carries `variants.private` (with `origin=` and any `path=`), `variants.public`
(without either) and a `warning` saying why; `ref` is the private variant. Report `visibilityBy` with the
command's exit code.
**Why:** a private repository's `origin=` exposes its organisation and name to whoever receives the
identifier; the human deciding where it goes needs to see that.

### 4. `path=` through a token — P1

**What:** written only with `--path-hint`, or when there is no remote. The value is the corpus root's
directory. A directory under the home directory is written as `~/…`, under the temporary directory as
`{tmp}/…`, under the per-OS configuration, data or cache directories as `{config}`, `{data}` or
`{cache}` (the mapping is `spec.forms["local-path"].tokens`); anything else verbatim, with `/` separators
and a lowercase drive letter. The value must match `spec.forms["local-path"].pattern`, or it is omitted with
a reason.
**Why:** the pattern cannot tell a user name from a directory name; the builder must.

### 5. Report the name's source — P1

**What:** `"nameSource": "given"` for `--locator`, `"claimed"` for every derived name, plus which source
(`origin`, `toplevel`, `manifest`).

## Implementation order

Delegated whole to one subagent (Plan-006 Decision Log: Track 4 goes to `sonnet` behind the measurements in
its acceptance).

**Contract.** May edit `.agents/skills/identify/scripts/identify.ts` and this dossier's Implementation
order and Surprises sections. Must not edit `SKILL.md` (Track 5 rewrites it), `spec/`, `packages/`,
`crates/`, `Sources/`, `scripts/`, the plan or the ADR. Must not run `git stash`, `git checkout` or
`git restore`, and must not commit.

**Done** means each of these holds, shown by the command that proves it:

- `README.md` and `crates/ref-id/README.md` mint different identifiers, and the package's `verdict` on the
  pair gives identity `distinct`;
- the same file minted from this worktree and from the main checkout of this repository gives identity
  `same`;
- no minted `folder` locator carries a `.` or `..` segment;
- this repository (public) yields no `variants`; a private repository yields both variants and a warning;
  `--offline` yields `unknown` and both variants;
- no minted `path=` value contains the current user's name.

- [x] P0 — item 1
- [x] P0 — item 2
- [x] P0 — item 3
- [x] P1 — item 4
- [x] P1 — item 5
- [x] P0 — the five measurements above, run and pasted into Surprises if any surprised

## Surprises & Discoveries

- `folderCorpus` used to derive both the corpus name and the path root from one directory
  (`basename(root)`), so the fix could not just change what feeds `root` — the name and the root had to
  become two separately-sourced values (`Basis { root, name, nameFrom }`), with `folderCorpus` taking
  `name` as an explicit parameter. A directory-basename repo name and an origin-derived repo name are
  not the same string in a worktree (`folder-location-hints` vs `ref-id`), which is exactly the bug this
  task closes.
  Route: kept — no repo-level fact, this is the shape of the fix.
- `nearestCorpus`'s manifest search already existed for a different purpose (deciding whether a file is
  `pkg`-shipped, and finding the fallback root for the pre-existing `folder` path). Item 1's manifest
  route (`--name-from-manifest`, or outside any git repository) reuses the *same* search but needed the
  bare declared name (`manifest.name` / the Cargo crate name) rather than the `npm/`- or `cargo/`-prefixed
  locator it already returns for `pkg` — so `Corpus` gained a `name` field alongside `locator`, rather
  than a second manifest walk.
  Route: kept — no repo-level fact, this is the shape of the fix.
- `origin=` normalisation does not need to reproduce every rule in `spec.forms["origin-url"].reference` by
  hand and get it right the first time: build the candidate with a few reasonable string rewrites (SSH →
  `https`, strip userinfo/port/`.git`/trailing slash, lowercase), then test the result against
  `spec.forms["origin-url"].pattern` and only keep it if it matches, else omit `origin=` and say why. This
  is also what the Design paragraph asks for ("a remote that still does not fit … is written without
  `origin=` rather than forced into it"), and it means the builder never needs to re-derive the pattern's
  own guarantees — validated live against this repo's own remote (`git@github.com:entelekheia-ai/ref-id.git`
  → `https://github.com/entelekheia-ai/ref-id`, confirmed against the pattern) and three synthetic
  remotes (userinfo, explicit `:443`, uppercase host — all normalised and matched).
  Route: kept — no repo-level fact, this is the shape of the fix.
- Measured live (2026-09-26, network available): `github.com/entelekheia-ai/ref-id` answers `git -c
  credential.helper= ls-remote --heads` with exit `0` (public); a private repository of the same organisation
  answers exit `128` ("terminal prompts disabled") with `GIT_ASKPASS=false` and `GIT_TERMINAL_PROMPT=0` —
  confirming the private-repo measurement in the dossier's "done" list against a real private remote,
  not a synthetic one.
  Route: kept — no repo-level fact, this is the acceptance measurement itself.

- Observation (orchestrator review): `pathHintFor` knew only the macOS directories, so on Linux and
  Windows `{config}`, `{data}` and `{cache}` were never written and an uppercase drive letter made
  `path=` fail its pattern and vanish. Rewritten per platform from the token table, drive lowercased.
  Evidence: the first version hard-coded `~/Library/Application Support` and `~/Library/Caches` only.
- Observation (orchestrator review): a repository reached through a symbolic link minted a locator
  with `..` segments — `git rev-parse --show-toplevel` returns the resolved path while the target kept
  its linked spelling, and spec 1.5.0 then refused the locator. The target and every token base are
  now resolved with `realpathSync` before measuring.
  Evidence: a fresh repository under the macOS temporary directory (`/var` links to `/private/var`)
  refused with `corpus-name-unusable` before the fix and minted `ref:folder:<name>/a.md;path={tmp}/<name>`
  after it.

- Observation (branch code review): five defects in `mint` that no measurement above exercised. A
  credential in the remote reached stdout through `originOmitted`; `corpus=` was measured from the
  script's own checkout, so every manifest-named corpus outside it was refused; a non-default port was
  stripped instead of omitted, naming a different service; the anonymous `ls-remote` honoured the
  caller's `url.*.insteadOf`, so an SSH agent could make a private repository read as public; and a
  scoped manifest name refused instead of being skipped. `--root` also escaped `realpathSync`.
  Evidence: each reproduced by a probe before the fix and re-run clean after it (2026-09-26). The
  script still has no test file of its own, which is why all five slipped past the acceptance list.

### The five measurements

```sh
$ node .agents/skills/identify/scripts/identify.ts mint --path README.md --fragment x
{"ref":"ref:folder:ref-id/README.md;origin=https://github.com/entelekheia-ai/ref-id#x", ...}
$ node .agents/skills/identify/scripts/identify.ts mint --path crates/ref-id/README.md --fragment x
{"ref":"ref:folder:ref-id/crates/ref-id/README.md;origin=https://github.com/entelekheia-ai/ref-id#x", ...}
# verdict(a, b) → {"identity":"distinct","content":"unknown","decidedBy":{"identity":["locatorStem"],"content":[]}}
```

```sh
# minted here (worktree) and minted at the main checkout of this repository (absolute --path)
# both produce ref:folder:ref-id/README.md;origin=https://github.com/entelekheia-ai/ref-id#x
# verdict(a, b) → {"identity":"same","content":"unknown","decidedBy":{"identity":[],"content":[]}}
```

```sh
# no folder locator minted across README.md, crates/ref-id/README.md, docs/reference/the-ref-scheme.md
# and packages/ref-id/src/index.ts carries a `.` or `..` segment in its locator
```

```sh
$ node .agents/skills/identify/scripts/identify.ts mint --path README.md --fragment x
# → no "variants" key (this repo is public)
$ node .agents/skills/identify/scripts/identify.ts mint --path <a file in a private repository> --fragment x
# → "visibility":"private","visibilityBy":"git ls-remote exit 128", variants.private (with origin=), variants.public (without), a warning
$ node .agents/skills/identify/scripts/identify.ts mint --path README.md --fragment x --offline
# → "visibility":"unknown","visibilityBy":"--offline: no request made", both variants present
```

```sh
$ node .agents/skills/identify/scripts/identify.ts mint --path README.md --fragment x --path-hint
# → path=~/Development/entelekheia/ref-id/.claude/worktrees/folder-location-hints — no user name (the
#   current user's) anywhere in the value
```

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
