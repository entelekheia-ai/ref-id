---
vibe-ops-template: adr@2
---

# ADR-0003: GitHub Packages is the registry until npm is released

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-06 |
| Deciders | Danilo Borges |

---

## Context

The package has consumers before it has a public release, and those consumers install through npm
tooling. The repository is private during that period. Two ways exist to serve a package from a private
repository to npm tooling: a `github:` dependency specifier, which installs the repository root, and a
scoped registry. This repository is an npm-workspaces monorepo whose root is `private: true`, so a
`github:` specifier would install nothing usable.

## Decision

We will publish `@entelekheia/ref-id` to **GitHub Packages** (`https://npm.pkg.github.com`) through
`publishConfig.registry`, on the package's own version line, until the maintainer releases it on the
public npm registry. Consumers point the `@entelekheia` scope at that registry in their `.npmrc` with a
token carrying `read:packages`. The move to npm changes `publishConfig.registry` and continues the same
version line; no version is republished.

## Options considered

- **Option A — `github:` dependency specifier** — no registry, no token; installs the repository root,
  which in a workspaces monorepo is the private root and not the package. Rejected.
- **Option B — publish to npm from day one** — simplest for consumers; the maintainer has not released the
  scheme publicly and a published version cannot be recalled. Rejected for now.
- **Option C — `file:` links from consumers** — zero infrastructure; only works for consumers that live
  beside a checkout, and a link is not a version. Rejected.
- **Option D (chosen) — GitHub Packages, scoped registry** — keeps the monorepo, keeps a real version line,
  keeps the package private until released; costs one `.npmrc` line and a token per consumer.

## Consequences

Easier: consumers use ordinary `npm install` against a versioned artefact while the repository is private.
Harder: every consumer needs a token with `read:packages`; publishing needs `write:packages`; CI that
installs the package needs the same. Follow-up: `publishConfig.registry` is removed at the npm release.

## Sunset & reversal

Expires at the first public npm release. Unwind by deleting `publishConfig.registry` and the consumers'
scope line; the version line continues.
