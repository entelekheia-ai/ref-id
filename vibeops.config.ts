// This repository's vibe-ops configuration.
//
// The cascade continues upward from here to the home directory, so anything machine-specific (an
// operator's plugin path, a personal artifact location) belongs in `vibeops.config.local.ts`, never here.

import type { VibeOpsConfig } from "@entelekheia/vibe-ops-core";

export default {
  // The specification's own rules, plus the fact that it is embedded three times.
  //
  // Three rules hold `spec/ref-id.json` to itself: it must match its own sidecar digest
  // (`gate-spec-sealed`), its `relate` vectors must reduce to what the `comparison` vectors say
  // (`gate-relate-consistent`), and its `openRPC` document must validate and stay tied to the rules and
  // vectors it names (`gate-openrpc-valid`) — Plan-007. Each is a plain `.mjs` gate under `.vibe-ops/`, so the
  // commit gate refuses a broken specification at the moment it is made rather than on the pull request.
  //
  // The specification is also embedded three times: the root copy under `spec/`, the Swift resource,
  // the crate's `include_str!`. Each port already refuses a copy whose bytes do not match its own
  // sidecar — but only when its own toolchain runs, so an edit that reseals the root and forgets a port
  // reaches a commit unopposed. This holds the three against each other at commit time, with neither
  // cargo nor swift installed.
  //
  // TWO MIRROR ENTRIES FOR THE COPIES, BECAUSE THEY CATCH DIFFERENT MISTAKES AND EITHER ALONE READS AS
  // CLEAN. `spec-bytes` compares the specifications, `spec-seal` compares the sidecars. Copying the
  // JSON to a port and forgetting its sidecar leaves both files present and byte-equal to the root, so
  // only the seal entry sees it; resealing the root alone leaves the JSONs equal too. Measured before
  // the second was added: with the crate's JSON altered and its sidecar untouched, the seal entry alone
  // passed the whole run.
  //
  // Named `spec` rather than `mirror`: `mirror` is the shipped ops of the same name, and this
  // repository composes none of its entries — every one of them reads paths inside the tooling's own
  // checkout. Reusing the key would collide the day either is wanted beside the other, and would point
  // `settings.mirror` from an enclosing config at the wrong composition.
  //
  // NEITHER THE COPY ENTRIES NOR THE THREE GATES EMIT. Both a copy that has drifted and a specification
  // that fails its own rule are structural facts — corrected once, then fixed — and the guide is
  // explicit that a series of zeros about one is a reading nobody opens.
  //
  // It lives in a file of its own because `ops` maps a name to a specifier, never to a definition. The
  // specifier is a `.json` on purpose: pointed at a `.mjs` instead, the definition would have to call
  // `defineOps`, which resolves `@entelekheia/vibe-ops-core` from THIS repository rather than from the
  // tooling — measured, and it costs two devDependencies and a native build for two file comparisons.
  ops: { spec: "./.vibe-ops/ops.json" },

  settings: {
    // RE-ARMING `file-path`, WHICH THIS REPOSITORY INHERITED SWITCHED OFF.
    //
    // An enclosing directory disables it, with a reason that is true of the repository that declared it
    // — that one IS the private layer of a two-layer research split, where a plan naming a real machine
    // path is the point. This repository is the opposite: it is public, it publishes to npm and
    // crates.io, and anyone who clones it alone runs with the check armed. Inheriting the disable meant
    // the gate was more permissive here than for every reader of this repository, and neither run said
    // so.
    //
    // An empty slice is the whole mechanism: `settings` merges shallow per module id, so declaring
    // `exposure` at all replaces the enclosing one rather than adding to it. There is nothing else in
    // that slice to carry forward — checked, not assumed.
    exposure: {},

    // A SHIPPED PLAN IS A FROZEN RECORD, SO ITS LINKS ARE NOT JUDGED. The links and `git show`
    // breadcrumbs it carries point at what existed when it shipped, and they will break sooner or later
    // — a file renamed, a history rewritten, a checkout without the history (the first run of this
    // repository's commit gate on a CI runner failed on exactly that: six breadcrumbs a depth-1 clone
    // cannot resolve). The record does not change for it, so these two gates leave `shipped/` out of
    // their population; every other governance gate still reads it, and the ignored files are counted in
    // the run's population line rather than dropped silently.
    //
    // Declaring `governance` here replaces the slice an enclosing config may carry (settings merge
    // shallow per module id). The one above this repository names only its own paths, so nothing here
    // depended on it — the CI run, which inherits nothing, was green on this gate before this entry.
    governance: {
      ignore: {
        "markdown-link": ["project/plans/shipped/**"],
        breadcrumb: ["project/plans/shipped/**"],
      },
    },
  },
} satisfies VibeOpsConfig;
