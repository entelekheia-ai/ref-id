---
vibe-ops-template: adr@2
---

# ADR-0004: The public npm registry, from the first release

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-07 |
| Deciders | Danilo Borges |
| Supersedes | ADR-0003 |

## Context

ADR-0003 chose GitHub Packages as the registry until the public release. The first publish attempt showed
what the option costs: GitHub Packages requires the npm scope to equal the repository owner's login, so
`@entelekheia/ref-id` cannot be published there at all — only `@entelekheia-ai/ref-id` can, which is a
different name that every consumer would later have to change. A package renamed at its public release is
a package with two identities, which is the one thing this repository exists to avoid.

## Decision

We will publish `@entelekheia/ref-id` to the **public npm registry** from the first release, under its
definitive name, with `access: public`. Releases run from the repository's own workflow through npm
trusted publishing, so no publishing token is stored anywhere; the first version is published from a
maintainer's terminal, because a trusted publisher can only be declared on a package that already exists.

## Options considered

- **Option A — GitHub Packages as `@entelekheia-ai/ref-id`** — publishes today; forces a rename at the
  public release. Rejected: the rename is the cost this scheme is built to avoid.
- **Option B — one name in both registries, `@entelekheia-ai/ref-id`** — no rename ever; ties the package
  name to a GitHub login rather than to the organisation's scope. Rejected.
- **Option C (chosen) — npm from the first release, trusted publishing** — the definitive name from
  version 0.1.0; the repository may stay private, the package is public.

## Consequences

Easier: consumers install with plain `npm install`, no registry line and no token. Harder: a published
version cannot be recalled, so every release passes the workflow's gates first; provenance attestations
stay off while the repository is private. Follow-up: declare the trusted publisher on npmjs.com after the
first publish; then every release is a merged "Version Packages" pull request.

## Sunset & reversal

Reversal means a scoped registry and a token per consumer again, which ADR-0003 already describes; nothing
here needs to expire.
