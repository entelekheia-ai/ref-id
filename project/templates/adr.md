---
vibe-ops-template: adr@2
---

<!--
 ADR TEMPLATE (Architecture Decision Record) — based on Michael Nygard's format + MADR.
 An ADR captures ONE decision that is hard to reverse: "we chose X because Y, and accept Z".
 Smaller grain than an RFC. An RFC proposes; an ADR records what was settled.
 Copy to adr/NNNN-kebab-title.md. ADRs are immutable once Accepted — to change a decision,
 write a new ADR that supersedes this one. Delete these comments before committing. The
 `vibe-ops-template` line in the frontmatter at the top of this file STAYS: /vibe-ops:migrate reads it to
 find artifacts written against an older template, and removing it makes this file invisible to migration.
-->

# ADR-NNNN: Title (the decision, stated as a short noun phrase)

| Field | Value |
|---|---|
| Status | Proposed |
| Date | YYYY-MM-DD |
| Deciders | Your Name |
| Supersedes | <!-- ADR-XXXX, or remove --> |
| Superseded by | <!-- filled in later if replaced, or remove --> |

<!-- Status lifecycle: Proposed → Accepted → (Deprecated | Superseded by ADR-XXXX) -->

---

## Context

<!-- The forces at play: the problem, the constraints, the assumptions. What makes this
     decision necessary now. Written so a newcomer understands without prior context.
     State facts, not the conclusion. -->

## Decision

<!-- The choice, in active voice: "We will …". One decision per ADR. Be specific. -->

## Options considered

<!-- The alternatives you weighed, each with a one-line trade-off. Including rejected
     options is the point — it shows the decision was deliberate, not accidental. -->

- **Option A — …** — pro / con.
- **Option B — …** — pro / con.
- **Option C (chosen) — …** — pro / con.

## Consequences

<!-- What becomes easier AND what becomes harder as a result. Be honest about the costs
     you are accepting. Note any follow-up work, new constraints, or risks introduced. -->

## Related

<!-- RFCs that produced this decision, tasks it unblocks, or other ADRs. -->
