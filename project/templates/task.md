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

<!--
 TASK DOSSIER TEMPLATE — copy to tasks/<NNN>-<slug>.md (NNN = the GitHub issue number).
 A dossier is the detailed WORKING LOG for one issue, for work already decided (see the project/**
 governance rule). If the design is still open, write an RFC first. The dossier is EPHEMERAL: committed
 live, then closed via /vibe-ops:close-task (write-back to the source doc, then distill + delete).

 THIS FILE IS WHERE THE DOING IS RECORDED — every attempt, dead end, wrong assumption and surprise. Not
 the plan. The dossier is deleted at closure, so what is written here is routed out by construction; the
 plan is permanent, so anything written there stays pending forever.

 Delete these comments before committing. The `vibe-ops-template` line in the frontmatter at the top of
 this file STAYS: /vibe-ops:migrate reads it to find artifacts written against an older template, and
 removing it makes this file invisible to migration.
-->

# Task: Title

| Field | Value |
|---|---|
| Status | Planned |
| Created | YYYY-MM-DD |
| Author | Your Name |
| Issue | <!-- <repo-url>/issues/NNN, or "pending" until opened --> |
| Plan | <!-- plans/NNN-slug.md and the track this dossier serves, or remove this row --> |

<!-- Status lifecycle: Planned → In Progress → Done → (dossier removed; git history is the archive) -->

---

## Context

<!-- Why this work exists and how the items below were identified. The issue holds the one-line
     intent + a link here; THIS file holds the detail the issue does not carry. -->

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | … | S |

### 1. Item title — P0

**What:** <!-- the concrete change -->
**Why:** <!-- the consequence of not doing it -->
**Change:** <!-- the specific edit / approach -->

## Implementation order

<!-- The step-level checklist — this is the only place in the governance set where per-step progress
     belongs. Record EVERY stopping point, splitting a partially finished item into what is done and what
     remains rather than leaving it ambiguous. This must always reflect the actual current state.

     A plan's track list has one box for this whole dossier; the detail lives here and dies here.

     MARK A STEP DELEGABLE ONLY WITH ITS CONTRACT BESIDE IT — what the subagent may touch, what it must
     not, and what it returns. A step whose contract does not fit in a paragraph is not delegable, and
     saying so here is worth as much as saying which are: an unmarked step reads as "nobody decided",
     which is how a judgement gets handed out under time pressure. The split itself is agreed once, with
     the plan, and recorded in its Decision Log — not renegotiated per track and not left in a chat
     message, which is summarised away while the plan file is not. -->

- [ ] P0 — …
- [ ] P0 — … (done: X; remaining: Y)
- [ ] P1 — …

## Surprises & Discoveries

<!-- Fill it WHILE the work happens — reconstructed from memory at the end it is worthless. One entry per
     non-obvious fact the work turned up. THIS is the home for them: a surprise found while doing the work
     belongs here even when the task came from a plan, because closure routes each entry somewhere durable
     and this file is then deleted. Only a decision that changes the DESIGN goes up to the plan.

     At closure each entry is routed by three questions, in order:
       1. Does it hold beyond this repository?  → project/learnings/
       2. Can you name the file, folder or package where someone meets it again?
          → project/log/, and that answer IS the entry's `path:` / `relatedTo:` field
       3. Neither?  → dropped. Too large to have a path at all usually means it was a decision (an ADR)
          rather than a trap.

     Observation: <the non-obvious fact>
     Evidence: <what proves it — the error, the measurement, the doc that says so> -->

- Observation: …
  Evidence: …

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      runs; a dossier that looks otherwise finished but has this box open is not done.

<!-- close's task branch writes back to the doc that started this work, propagates to living docs, spawns an ADR
     if a decision emerged, routes each Surprises & Discoveries entry through the promotion test (and
     checks whether a new guard makes an existing instruction line redundant), then distills the summary
     + breadcrumb (git show <sha>:project/tasks/NNN-slug.md) into the issue before removing this dossier. -->
