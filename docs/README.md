# docs/

Implementation documentation, organized by the [Diátaxis](https://diataxis.fr/) framework. Written in
**English**. Each quadrant answers a different reader need — put a doc where its *purpose* fits, not where
its topic fits.

| Folder | Purpose | Reader is… |
|---|---|---|
| [`reference/`](reference/) | Information — precise technical description (APIs, schemas, config) | looking something up |
| [`explanation/`](explanation/) | Understanding — background, design rationale, "why" | trying to understand |
| [`how-to/`](how-to/) | Tasks — goal-oriented recipes | trying to get something done |
| [`tutorials/`](tutorials/) | Learning — step-by-step lessons for newcomers | learning by doing |

New here? Start with the tutorial
[`tutorials/your-first-identifiers.md`](tutorials/your-first-identifiers.md). Then read
[`reference/the-ref-scheme.md`](reference/the-ref-scheme.md) for the scheme itself, and
[`explanation/why-a-declared-name.md`](explanation/why-a-declared-name.md) for why it is shaped that way.
To name your own things, follow [`how-to/identify-a-file.md`](how-to/identify-a-file.md) or
[`how-to/mint-an-identifier.md`](how-to/mint-an-identifier.md). To find them again from an identifier,
[`how-to/write-a-resolver.md`](how-to/write-a-resolver.md). To refuse a forged digest at ingestion,
[`how-to/check-a-digest-before-storing.md`](how-to/check-a-digest-before-storing.md).

The **source of truth is the code**; these docs describe intent. When they diverge, the code wins.
