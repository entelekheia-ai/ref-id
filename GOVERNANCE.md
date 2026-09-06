# Governance

How decisions and work are recorded in this repository. Five artifact types, five questions:

| Artifact | Question | Lives in | Ratified? |
|---|---|---|---|
| **RFC** | "Should we do X, and how?" | [`project/rfc/`](project/rfc/) | Yes — leaves `Draft` only after review |
| **ADR** | "We decided X, because Y" | [`project/adr/`](project/adr/) | The decision itself is the record |
| **Plan** | "How do we build X?" | [`project/plans/`](project/plans/) | No — but **permanent**: the design record outlives the work |
| **Task** | "We decided — here's what to change" | [`project/tasks/`](project/tasks/) (dossier) + a GitHub issue | No — ephemeral, deleted at closure |
| **Research / log** | "What we looked at" / "how we got here" | [`project/research/`](project/research/) · [`project/log/`](project/log/) | No — supporting material, not a decision |

## Flow

1. Open design → **RFC**. Illustrative code in an RFC communicates intent; it is not the implementation.
2. A settled, hard-to-reverse choice → **ADR** (often distilled from an RFC's *Decisions Closed*). Immutable
   once Accepted; to change it, write a new ADR that supersedes it.
3. Decided work too large for a single task → a **plan**: tracks with acceptance criteria, plus two
   sections kept current *while* the work happens — `Decision Log` and `Outcomes & Retrospective`. A plan
   is permanent and is never deleted; that is what separates it from a task dossier, and it is why the
   working record of *doing* lives in the dossier a track spawns rather than here.
4. Decided work → a **task**: a GitHub issue plus an ephemeral `project/tasks/NNN-slug.md` dossier. Closure
   goes through `/vibe-ops:close-task` — write back to the source doc, propagate to living docs, spawn an ADR
   if a decision emerged, route what the work taught, then distill + delete the dossier.
5. Supporting material along the way: `project/research/` for investigation that fed a decision, and
   `project/log/` for context no other artifact holds — see below.

## Where a learning goes

An entry a dossier records as a surprise does not stay there. At closure each one is tested for
recurrence, discoverability, and whether a guard already covers it, then routed to whichever surface matches
what the fact *is* — a line in `AGENTS.md`, a scoped rule, a skill, a mechanical guard, an ADR, or nowhere
at all. The reverse applies too: an instruction line that a new guard has made redundant gets deleted.

**Every artifact has a closure that performs this routing**, so no unit of work can reach its end without
passing through one: `/vibe-ops:close-task` for a task, `/vibe-ops:close-plan` for a plan. They differ in
what survives — a task dossier is deleted and a plan file is kept — and not in whether the routing happens.

`project/log/` therefore has **two** reasons to exist, not one: the narrative an ADR is too terse to carry,
*and* the rich context of a single unit of work — dead ends, surprises with their evidence, lessons —
whether or not any decision came out of it. A learning that is real but too local to promote still needs a
home, and this is it.

## Issue pairing

Two artifacts pair with a GitHub issue, and the split is the same in both: **the issue owns status and the
executive summary; the file owns the design and the working record.** What differs is the ending.

| | Issue owns | File owns | At the end |
|---|---|---|---|
| **Task** | status, assignment, the summary distilled at closure | the detailed working log | issue closes, **dossier is deleted** — git history is the archive |
| **Plan** | status, the track checklist as a progress signal, the executive summary | tracks, design, the `Decision Log` and the retrospective | issue closes, **the plan file stays** as the permanent record |

A plan's issue closing does not mean the plan is done being read. Nothing else here is both permanent and
issue-tracked, which is why it is stated rather than left to be inferred from the task rule.

The **lifecycle mechanics** — stage gates, immutability rules, numbering, the closure sequence — live in the
`project/**`-scoped rule this repo carries (`.agents/rules/governance.md`, loaded automatically when working
inside `project/`), not duplicated here. This file is the map; the rule is the operational detail.

## Decision record

Every decision leaves a trail: an RFC's *Decisions Closed* section, an ADR, a plan's `Decision Log`, or a
task's write-back into its source doc. When a decision is hard to reverse or will be questioned later,
prefer an ADR — a decision that lives only in a chat log or a closed PR gets relitigated.
