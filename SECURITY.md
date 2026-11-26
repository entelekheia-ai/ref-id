# Security policy

## Reporting a vulnerability

Report a vulnerability privately, through GitHub's private vulnerability reporting:
**[Report a vulnerability](https://github.com/entelekheia-ai/ref-id/security/advisories/new)**
([how it works](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).

Do not open a public issue, pull request or discussion for a vulnerability. A public report gives an
attacker the flaw before users have a fix.

A useful report contains:

- the package and version affected, and which implementation (TypeScript, Rust, Swift, Python);
- the input that triggers the flaw — a `ref:` identifier, an envelope — and the call that reads it
  (`parse`, `validateEnvelope`, `relate`, …);
- what happens, against what should happen;
- whether you believe it is already being exploited.

## Supported versions

The project is pre-1.0. Security fixes land in the **latest published version** of each package and
are released as a new patch or minor version. Earlier versions receive no fixes. The four packages are
released together, under one version number.

| Package | Registry | Supported |
|---|---|---|
| `@entelekheia/ref-id` | npm | latest release |
| `ref-id` | crates.io | latest release |
| `ref-id` | PyPI | latest release |
| `RefId` | Swift Package Manager (git tag `v<version>`) | latest release |

## In scope

Any way that an identifier or an envelope written by someone other than the user makes an
implementation:

- crash, panic or throw where the API promises a result — `parse` reports a status, it never throws;
- hang or consume unbounded time or memory, including catastrophic backtracking in the grammar;
- accept an envelope as admissible whose members do not recompute to the digest the identifier claims;
- give a different answer from another implementation for the same input, in a way that lets one
  identifier pass for another;
- serialise an identifier into something other than what was parsed, beyond the normalisation the
  specification declares.

Out of scope:

- vulnerabilities in a third-party dependency (`packageurl-js`, `@noble/hashes`, the `packageurl`
  crate, `packageurl-python`) — report those to the dependency, and tell us if a fix here is needed;
- behaviour that requires the user to load a malicious specification file of their own
  (`loadSpecFrom`);
- the differences in the `canonical` field of a Package URL already measured in
  [`docs/reference/implementation-differences.md`](docs/reference/implementation-differences.md),
  which do not affect identity.

## What happens after you report

| Step | Target |
|---|---|
| Acknowledgement | within 7 days |
| First assessment: confirmed or not, and severity | within 14 days |
| Fix released | as soon as possible, and within 90 days of the report |

The maintainer works on the fix in the advisory's temporary private fork, which stays invisible until
publication. The order of events is:

1. The fix is merged, and a release goes to npm, crates.io, PyPI and the Swift tag.
2. The security advisory is published, with a CVE requested through GitHub and credit to the reporter.
3. Regression tests, conformance vectors and reproducers for the flaw land in the public repository.

**Disclosure deadline.** The advisory is published when the fix is released, or 90 days after the
report, whichever comes first. If a fix is scheduled for release within 14 days after the deadline,
publication waits for it. With no fix by the deadline, the advisory is published with the known
mitigations. Active exploitation can bring any date forward.

## Findings from the project's own reviews

Vulnerabilities found by the project's own security reviews, hostile-input runs and fuzzing follow the
same process. They are filed as draft advisories rather than public issues. Material that points at an
unfixed flaw stays private until its advisory is published:

- the exact reproducer;
- the regression case or conformance vector;
- review tooling written for that flaw.

## Safe harbour

We will not pursue legal action against good-faith research that follows this policy. That research:

- tests only against your own installation or data;
- avoids harm to others' data and services;
- gives us the chance to fix the flaw before any disclosure.

If you are unsure whether something is in scope, report it and ask.

## Credit

Reporters are credited in the published advisory, under the name they choose, unless they ask to stay
anonymous.
