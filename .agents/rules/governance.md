---
description: Lifecycles for project/ governance artifacts (ADR / RFC / plan / task / log / research) — when each is immutable, frozen, permanent, or ephemeral, and how they link.
paths: ["project/**"]
---

## project/ governance — lifecycles

The **what and why** of each artifact type lives in [`../../GOVERNANCE.md`](../../GOVERNANCE.md) (the
human-facing doc). This rule is the **operational detail** for working inside `project/` — load it only
when a file under here is in context.

**Numbering is per repository.** Monotonic and never renumbered *within this repo* — not across a
workspace, an organization, or a family of related repos. Two repositories both holding an `ADR-0001` is
normal and costs nothing, because a cross-repo reference is a full URL and a local one names a file. A
number freed by moving a document to another repository is free again here. **Never skip a number to
avoid the appearance of a collision**: it leaves a permanent gap explained by nothing.

**The version lives in the frontmatter; the header table is presentation.** Every record opens with
`vibe-ops-template: <type>@<integer>` at offset 0, and that is what `/vibe-ops:migrate` and every
version-aware verb read. The integer moves only when an artifact written against it would now be shaped
differently — a different number from any package's semver, which answers a different question. The
`| Field | Value |` table below it renders for a human and for a markdown preview; **never move the
version into it, and never keep a second copy anywhere.** A record declaring no version is reported as
*unknown*, never resolved to the oldest known shape.

**When a record migrates is a policy, not a campaign** (maintainer decision, 2026-08-22). A record with a
terminal status — a shipped plan, an implemented or rejected RFC, anything in an archival directory —
**MUST** keep the shape it was written in: the delivered corpus only grows, so migrating it is an eternal
treadmill, and the sections an old shape carried are part of what that record was. A **living** record
**SHOULD** be migrated opportunistically, at the moment it is already being edited — the
`template-version-behind` warning on an open record is that trigger, and it goes silent when the record
reaches its archival directory. The exception: a record about to be closed **MAY** ship at its old shape
when migrating it would entangle two ceremonies. A corpus-wide migration pass **MUST NOT** be run.

**A migration note that changes a template's sections MUST also state what a document *describing* that
shape now says.** The records are not the only population, and `template-heading-drift` reads the note to
fail any document asserting a record carries a section its template no longer has, or stating the wrong
count of living ones.

**A rule, a reference or a skill MUST describe the present**, leaving what a template no longer has to the
migration note — the one document whose subject is a change. An absence **MUST** be written as what the
record does carry rather than as the name of the section that left.

### ADR (`project/adr/`)

```
Proposed → Accepted → (Deprecated | Superseded by ADR-MMMM)
```

**Immutable once Accepted.** Never edit the substance of an accepted ADR and never delete one — to change a
decision, write a *new* ADR that supersedes it and set the old one's `Superseded by`. Numbering is
zero-padded `NNNN`, monotonic, **never renumbered**.

### RFC (`project/rfc/`)

```
Draft → Review → Accepted → Implemented
              ↘ Rejected
              ↘ Superseded
```

| Stage | Meaning | Gate to advance |
|---|---|---|
| Draft | Under discussion, may change without notice | A complete first draft from the template |
| Review | Open for explicit review | Open questions resolved |
| Accepted | Ratified, may spawn tasks | Maintainer sign-off, recorded in the header |
| Implemented | Shipped | Code merged; canonical docs now live in the code/`docs/` |

After `Implemented`: **frozen**, move to `implemented/`, do not edit further. After `Rejected`: move to
`rejected/` as a record of what was considered and why.

### Plan (`project/plans/`)

```
Backlog → In Progress → Shipped   (the file is never deleted)
```

**Permanent.** A plan answers "how do we build X?" and stays as the design record after the work ships —
the opposite of a task dossier. Numbering is `NNN`, monotonic, never renumbered.

Two sections are **living** and are maintained while the work happens, not written at the end:
`Decision Log` (`Decision:` / `Rationale:` / `Date / Author:`) and `Outcomes & Retrospective`.
Reconstructed from memory afterwards they are worthless — the value is in writing the entry when it
happens. Per-step progress and the discoveries a run produces are recorded in the task dossier a track
spawns, which is deleted at closure; a permanent file cannot discharge what is written into it.

If a plan carries a GitHub issue, the **issue owns status and the executive summary; this file owns the
design and the working record**. The issue closes when the last track lands; the plan file does not close,
because it is what someone reads a year later to find out why the thing is shaped this way.

At closure, use `/vibe-ops:close-plan` — retrospective written against the plan's own goals, the demotion
check run, living docs propagated, the issue closed and **the file kept**. What the work taught was routed
by the dossiers as they closed, not here. A plan that never spawned a task dossier has no other exit: skip this and it ships
having taught nobody anything.

### Task (`project/tasks/`)

Lives in **two artifacts that own different content**: the GitHub issue owns status, assignment, and the
executive summary; the dossier (`project/tasks/NNN-slug.md`) owns the detailed working log. Ephemeral:

```
Planned → In Progress → Done → (dossier deleted; git history is the archive)
```

At closure, use `/vibe-ops:close-task` — it writes back to the source doc, propagates docs, spawns an ADR if
a hard-to-reverse decision emerged, **routes each `Surprises & Discoveries` entry** to a durable surface
(and deletes any instruction line a new guard has made redundant), then distills the summary into the issue
with the breadcrumb `git show <sha>:project/tasks/NNN-slug.md` before deleting the dossier. Never skip the
write-back or the routing step — those are the two that keep docs from drifting and keep a learning from
being deleted along with the dossier.

### Log (`project/log/`)

Optional, write-once narrative context, for **either** of two reasons:

1. What an ADR is too terse to carry — the AI collaboration, dead ends, the reasoning behind a decision.
   Pairs 1:1 with that ADR and links to it bidirectionally.
2. The rich context of **one unit of work**, decision or not — surprises with their evidence, what was
   tried and abandoned, what the work taught. A learning that is real but too local to promote into an
   instruction file lands here instead of being lost.

**Gaps are expected**: most work needs no log. Never retro-edit a log to match a later decision — a
superseding decision gets its own ADR (and optionally its own log).

### Research (`project/research/`)

Investigations that feed a decision — spikes, comparisons, gap analyses. Input to an RFC/ADR, not a
commitment to build and not a record of what was decided (that's `log/` or the ADR itself).
