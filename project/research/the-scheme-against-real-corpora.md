# Research — Does the `ref:` scheme identify what real producers declare, and what they have already stored?

Feeds [Plan-001](../plans/001-the-identity-package.md), Tracks 3 and 4, and the `state`/`when`, manifest-corpus and typed-fragment rules now in `spec/ref-id.json`.
Expires when: the specification leaves scheme version 1, or a producer surveyed here changes its record format.

**The answer.** The scheme covers what a manifest proves: over nine in ten declared things — packages, traits, observation specs, detectors, compositions, governed records — map with every part taken from a declaration, and the remainder fail for a name nobody declared, with one gap outside the scheme (Package URL has no type for marketplace extensions). Admitting a moment (`when`) into the identifier turns stored readings into units: over nine in ten readings of one producer and virtually all of another become distinct identifiers, where a handful had been before. What stays unidentifiable is, without exception, a name absent from every manifest. Confidence **high** — every count comes from a deterministic generator run over a frozen snapshot.

> **Attribution.** External findings are **linked inline at first mention**. What is **not** linked is our own analysis: the counting rule, the "invented part" criterion, the reading of collisions and the classification of the remainder by who has to act.

## Terms

- **Declaration** — a string a manifest, a constant or a composition file publishes as the name or version of something.
- **Invented part** — a slot of the identifier (`type`, `locator`, `fragment`) that can only be filled by minting a string no declaration carries; the generator leaves the slot empty and marks it.
- **Reading** — a record a producer stored: an observation taken by an instrument, or an artefact emitted by a commit gate.
- **Unit** — one distinct identifier; readings that resolve to the same identifier collide.
- **Package URL** — [purl](https://github.com/package-url/purl-spec), the `pkg:<type>/<name>@<version>` format the scheme's `pkg` type delegates to.

## Declared things map when a manifest exists

Three producers were surveyed — an observation framework, a governance toolkit and a language toolchain, together a little over two hundred declared things. Every identifier was produced by the reference implementation's `build()` from declared parts only; a part the scheme cannot represent is refused, and none was.

The remainder falls into six shapes, and five of them are the producer's to fix: governed records that carry no template stamp, so their type cannot be read; a folder of profiles that no manifest covers; entries whose names are computed per run instead of declared; sub-packages whose manifest declares no name; a record without the numbered heading its template requires. The sixth is a marketplace-distributed editor extension: Package URL has no type for that ecosystem, so the locator cannot be formed without a convention such as `pkg:generic/`. That is the only case in which the scheme, through its delegate, is short.

Two rules of the scheme were exercised at opposite extremes. The percent-encoding of a subpath `#` inside a purl fired for none of the mapped identifiers, because no surveyed producer declares a name with a subpath. The encoding of a nested identifier inside a qualifier value fired for nearly every gate record under the first composition tried, and for none once the gate reading was composed as the declared entry plus its moment — the entry already names the gate, so repeating it in `by=` only bought the encoding cost.

## Stored readings become units once a moment may enter the identifier

Two stored corpora were reconstructed: several hundred instrument readings and several thousand gate artefacts.

Without a moment, readings collided massively: the instrument corpus resolved to a few dozen units, the gate corpus to about fifteen. The instrument's own producer had already invented a private reference format carrying a timestamp and a budget, because a reading was otherwise unaddressable. With `when` (RFC 3339, UTC) admitted as a qualifier that names a moment and never a state, over nine in ten instrument readings and all but one gate record became distinct units. The collisions left are batches sharing one timestamp to the millisecond; two readings of the same instrument at the same instant over the same state are one unit by definition, and a producer that wants to tell them apart carries a sample index in the fragment.

Everything left unidentifiable is a name without a declaration: a trait no package declares, compositions no composition file declares, a tool no gate declares, and per-item findings, which were decided to be attributes of a reading's data rather than identifiers of their own.

Three qualifiers were fillable by nothing stored: `state` (no record carries a commit, hash or frozen path), `by` (the instrument is three strings nobody composes into a declared identifier), `over` (a population is stored as a count, never as its members). They are correct to exist and are, today, forward-looking.

## A knowledge graph built on inferred labels

A merged knowledge graph of the same repositories, around fourteen thousand nodes, was checked as a fourth consumer. About one node in five carries a label a language model inferred, and those receive no identifier under the scheme, by construction. Only about one node in seven derives its id from a name a format declares. Among governance-document nodes, well over a third share a heading label with another (`Summary`, `Related`, `Scope`), which is why the governed-record fragment is typed — `<provider>/<type>@<templateVersion>/<name>` — rather than derived from heading text with an ordinal tie-break.

## How this was established

Manifests, constants and composition files of the three producers were inventoried into fact sheets, each claim with a file and line, and the sheets were contested in a second pass that corrected the first synthesis. The reading corpora were copied once into a snapshot with a recorded hash and measured only there. Two generators, run on 2026-09-07, produced the mapping and reconstruction reports from the snapshot and the working trees, using the reference implementation's `build()` and `parse()`. The first mapping pass counted far fewer mapped declarations because it required a version in the corpus locator and a heading-derived fragment; the rules adopted afterwards — corpus is the nearest manifest declaring a name, unversioned; fragment typed by the template stamp — raised the count without changing the generator, which is the measure of what those rules were worth.

## What was rejected, and what would reopen it

- **Refusing colliding readings.** It would discard hundreds of individually well-formed readings. Reopens if a consumer requires strong per-reading uniqueness without accepting `when`.
- **`at` as the temporal qualifier.** In SWHID and neighbouring specifications `at` means a state, so the scheme keeps `state` for a freeze and `when` for a moment. Reopens if a consumer needs a local-time instant; none stores one today.
- **`folder` as the default corpus of governed records.** The nearest manifest declaring a name wins. Reopens if a governed corpus appears with neither a manifest nor a remote.
- **Per-item findings as identifiers with an ordinal refinement.** Unique but unstable across regeneration. Reopens if a consumer must cite one finding across runs.
- **Repeating the gate in `by=` on a gate reading.** The composed entry already declares it. Reopens if one composition runs the same gate under two labels.

## What stays open

- One producer's emission format was inventoried and none of its readings reconstructed.
- Gate rule names live as literals inside each gate's code and were not extracted; their count is a floor.
- One port's embedded purl validator diverges from the reference on two edge inputs (an `@` inside a namespace), with no effect on the conformance vectors.
- The size cost of `when` on identifiers in bulk was not measured.
- A stress test over agent packages, career documents, a portfolio and language-model identifiers runs as a sibling investigation.
