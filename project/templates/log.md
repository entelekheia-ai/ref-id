---
vibe-ops-template: log@2
name: <slug — identical to the filename, without .md>
description: <one line, standing alone: what was attempted and what happened. This is the row in the
             index and the text a hook injects, so it is read far more often than the body.>
kind: trap
path:
  - "<glob of the file or folder where someone meets this again>"
attempted: YYYY-MM-DD
source: <the commit, task or plan this came from>
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

<!--
 LOG TEMPLATE — copy to project/log/<slug>.md.

 A log entry records ONE thing that was attempted and what happened, so the next session does not spend
 the same hours reaching the same dead end. It is NOT the narrative of a piece of work — that is the ADR
 companion at project/adr/<id>-log.md, a different artifact with a different shape and no frontmatter.

 THE FRONTMATTER IS FIRST, which is why the licence and these instructions sit below it: YAML frontmatter
 is only frontmatter when it opens the file.

 NOT NUMBERED. A trap is addressed by the path where it recurs, never by a sequence. The filename is a
 slug describing what was attempted, and `name:` repeats it so a rename is visible.

 THE ADMISSION TEST IS A FIELD. If you cannot fill `path:` — or `relatedTo:` for a package or tool with
 no path of its own — then there is nowhere anyone meets this again, and it is not a log entry. It is a
 decision (an ADR), a fact that holds beyond this repository (project/learnings/), or nothing.

 `kind:` IS `trap` OR `debt`. A trap says do not do this again. Debt says we know, and we chose to live
 with it. They fire on the same path and say opposite things, so the field is not decoration.

 THERE IS NO `status:` FIELD, DELIBERATELY. An entry that retires is DELETED; what it was and why it
 left becomes a row in project/log/RETIRED.md carrying a git breadcrumb. A file that exists is current
 by definition, so there is no stale status to drift.

 GAPPY BY DESIGN. Most surprises are not traps. A small directory is this tier working, not neglected —
 an entry that fails the admission test is dropped, never filed here for lack of anywhere better.

 Delete these comments before committing. The `vibe-ops-template` key in the frontmatter at the top of
 this file STAYS: /vibe-ops:migrate reads it to find artifacts written against an older template, and
 removing it makes this file invisible to migration.
-->

# <the trap, as one sentence someone would recognise before hitting it>

<!-- Not the `description:` restated. That line is the index row; this is what a reader sees on opening,
     and it should name the thing they are about to do. -->

> **Not current truth.** This records what was attempted on <date> and what happened then. Check it
> against the present state before acting on it.

## What was attempted

<!-- The thing someone would plausibly try again, stated as an action rather than a topic. -->

## What happened

<!-- The outcome, with the evidence that proves it: the error, the failing command, the measurement.

     If the attempt WORKED and was reverted for another reason, say so. Reverted is not failed, and the
     difference is the whole warning — otherwise the next reader avoids something that works. -->

## The mechanism

<!-- Why it happened, IF that is established. **"Not established" is a legitimate and preferred answer.**
     A mechanism inferred from the fix working is evidence about the fix, not about the cause, and a
     confident wrong mechanism sends the next reader hunting something that was never there. -->

## What to do instead

<!-- The working path, or "none known". A dead end with no replacement is still worth recording, and
     saying so is better than implying a replacement exists. -->

<!--
 ON `source:` — the link is ONE-WAY BY CONSTRUCTION, not by oversight. This entry usually comes from a
 task dossier, and that dossier is deleted at closure, so nothing can point back at this file. Do not
 "fix" it by adding a backlink to something that will not exist.

 ON RETIREMENT — when `path:` no longer resolves, nobody can meet this trap again and the entry is a
 retirement candidate: delete the file, append its row to project/log/RETIRED.md. When every path under
 one prefix is gone, the whole group collapses to a single breadcrumb row.
-->
