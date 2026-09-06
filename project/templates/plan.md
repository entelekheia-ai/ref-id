---
vibe-ops-template: plan@3
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

<!--
 PLAN TEMPLATE — copy to plans/<NNN>-<slug>.md.
 A plan answers "how do we build X?". An RFC asks "should we, and how?"; a task dossier is ephemeral.
 A plan is PERMANENT: it stays as the design record after the work ships.

 A plan is an EPIC, not a work log. It carries the design and the decisions; the doing — steps, attempts,
 dead ends, what surprised you — belongs in the task dossier each track spawns. A task is deleted at
 closure, so a note written there is discharged by construction; a plan is permanent, so a note written
 here stays pending forever. That asymmetry is the whole reason for the split.

 A plan is a LIVING DOCUMENT. The two sections below the divider are not written at the end — they are
 maintained while the work happens.

 Write PROSE. Prefer sentences over bullet lists in the narrative sections; the only checklist is the
 track list. (This is the deliberate inverse of AGENTS.md, which is a map and not a narrative.)

 Write SELF-CONTAINED. Assume a reader who has only the current working tree and this one file: no memory
 of prior plans, no other context. Name files by full path. Define any non-obvious term where you first
 use it. Never write "as decided previously" or "see the architecture doc" — say the thing here.

 Delete these comments before committing. The `vibe-ops-template` line in the frontmatter at the top of
 this file STAYS: /vibe-ops:migrate reads it to find artifacts written against an older template, and
 removing it makes this file invisible to migration.
-->

# Plan-NNN: Title

| Field | Value |
|---|---|
| Status | Backlog |
| Created | YYYY-MM-DD |
| Author | Your Name |
| Depends on | <!-- Plan-MMM / RFC-MMMM, or remove this row --> |
| Tracking issue | <!-- #NNN — owns status and the executive summary; this file owns the design and the working record. Remove this row if the plan has no issue. --> |
| Related | <!-- ADRs, RFCs, issues, or remove this row --> |
| Repository | <!-- absolute path, nothing else in the cell — only when planning from a workspace root that is not this repository; remove this row otherwise. Routing metadata for the filing step, never part of the record: the filing step drops it, and a plan filed by hand must not keep it — a machine path does not belong in a committed document --> |

<!-- Status lifecycle: Backlog → In Progress → Shipped. The file is never deleted; it is the record. -->

---

## Summary

<!-- One paragraph, plain terms: what this plan delivers and why now. No technical detail yet. -->

## Goals

<!-- 3–5 concrete outcomes. What does "done" look like, stated so someone else could check it? -->

## Scope

### In scope

### Out of scope

<!-- Name what a reader would reasonably assume is included but isn't, and where it lives instead. -->

## Design

<!-- How it works, in prose. Name the files and modules by full path. If a decision here is hard to
     reverse, it belongs in an ADR — record it in the Decision Log below and link the ADR.

     DIAGRAM THE FLOWS. A ```mermaid fence earns its place wherever the design is a flow with branches —
     a pipeline, a decision procedure, a boundary something must not cross — which is most of what a plan
     describes. Keep it BESIDE the prose, never instead of it: the reader takes the shape from the
     diagram and the detail from the text. Do not draw a directory layout or a plain list, and never draw
     a flow that also exists as a numbered list two lines below — one of the two will be wrong within a
     month. Full rule, including why: references/authoring-style.md, "Diagrams". -->

## Tracks

<!-- The work, broken into independently verifiable units, and the plan's ONLY checklist.

     ONE CHECKBOX PER TRACK, AND NO FINER. Per-step progress belongs in the task dossier that track
     spawns; a plan tracking individual steps has stopped being an epic and become a work log. If you
     find yourself wanting a sub-checkbox here, that is the signal to open a task.

     Introduce each track with a short paragraph: its scope, what will exist at the end that did not
     exist before, and the acceptance you expect to observe. A track is a story — goal, work, result,
     proof — not a bureaucratic heading. Name the task dossier once it exists. -->

- [ ] **Track 1 — Title.** <!-- scope; what exists at the end; the acceptance. Task: tasks/NNN-slug.md -->
- [ ] **Track 2 — Title.** <!-- … -->
- [ ] Run `/vibe-ops:close-plan` — retrospective against the goals, the demotion check, the tracking
      issue closed. The plan file itself is kept. Stays unchecked until the plan is actually closed; a
      track list that is otherwise complete but has this box open is not finished.

## Success criteria

<!-- How anyone verifies the plan delivered. Commands to run and what their output should show. -->

---

<!-- ===== LIVING SECTIONS — maintained during the work, not written at the end ===== -->

## Decision Log

<!-- Every decision made while working the plan, including the ones that seemed small — and ONLY
     decisions. A decision changes the design; anything that merely records what happened while doing
     the work goes to the task dossier instead. If a decision is hard to reverse, also write an ADR and
     link it here.

     HOW THE WORK WILL BE CARRIED OUT IS A DECISION AND BELONGS HERE. Above all, what will be handed to
     a subagent and what will not: delegating discovery or a mechanical edit under a closed contract is
     cheap, and delegating a judgement that has to agree with this plan's intent produces something
     plausible that drifts. Write the split down when it is agreed — a rule the agent proposed and you
     only assented to lives in the conversation, and a conversation is summarised and dropped while this
     file is not. That asymmetry is why an agreement left in chat is broken a session later by the same
     agent that proposed it. -->

- Decision: …
  Rationale: …
  Date / Author: …

## Outcomes & Retrospective

<!-- Filled at each major track completion and at the end: what shipped, what was cut, what is still
     open, and how the result compares to the original purpose above. -->

<!-- ===== END LIVING SECTIONS ===== -->

---

## Open questions

<!-- Genuinely unresolved. Remove the section if there are none — do not pad it. -->

## Related

<!-- RFCs, ADRs, issues, other plans. -->
