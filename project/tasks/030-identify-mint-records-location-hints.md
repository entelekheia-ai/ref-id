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

- [ ] P0 — item 1
- [ ] P0 — item 2
- [ ] P0 — item 3
- [ ] P1 — item 4
- [ ] P1 — item 5
- [ ] P0 — the five measurements above, run and pasted into Surprises if any surprised

## Surprises & Discoveries

*None yet.*

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.
