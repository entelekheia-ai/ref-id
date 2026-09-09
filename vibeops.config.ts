// This repository's vibe-ops configuration.
//
// The cascade continues upward from here to the home directory, so anything machine-specific (an
// operator's plugin path, a personal artifact location) belongs in `vibeops.config.local.ts`, never here.

import type { VibeOpsConfig } from "@entelekheia/vibe-ops-core";

export default {
  // The specification is data, and it is embedded three times: the root copy under `spec/`, the Swift
  // resource, the crate's `include_str!`. Each port already refuses a copy whose bytes do not match its
  // own sidecar — but only when its own toolchain runs, so an edit that reseals the root and forgets a
  // port reaches a commit unopposed. This holds the three against each other at commit time, with
  // neither cargo nor swift installed.
  //
  // TWO ENTRIES, BECAUSE THEY CATCH DIFFERENT MISTAKES AND EITHER ALONE READS AS CLEAN. `spec-bytes`
  // compares the specifications, `spec-seal` compares the sidecars. Copying the JSON to a port and
  // forgetting its sidecar leaves both files present and byte-equal to the root, so only the seal entry
  // sees it; resealing the root alone leaves the JSONs equal too. Measured before the second was added:
  // with the crate's JSON altered and its sidecar untouched, the seal entry alone passed the whole run.
  //
  // Named `spec-copies` rather than `mirror`: `mirror` is the shipped ops of the same name, and this
  // repository composes none of its entries — every one of them reads paths inside the tooling's own
  // checkout. Reusing the key would collide the day either is wanted beside the other, and would point
  // `settings.mirror` from an enclosing config at the wrong composition.
  //
  // NEITHER EMITS. A copy that has drifted is a structural fact — corrected once, then fixed — and the
  // guide is explicit that a series of zeros about one is a reading nobody opens.
  //
  // It lives in a file of its own because `ops` maps a name to a specifier, never to a definition. The
  // specifier is a `.json` on purpose: pointed at a `.mjs` instead, the definition would have to call
  // `defineOps`, which resolves `@entelekheia/vibe-ops-core` from THIS repository rather than from the
  // tooling — measured, and it costs two devDependencies and a native build for two file comparisons.
  ops: { "spec-copies": "./.vibe-ops/ops.json" },

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
  },
} satisfies VibeOpsConfig;
