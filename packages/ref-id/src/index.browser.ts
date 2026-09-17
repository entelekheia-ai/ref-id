// SPDX-License-Identifier: Apache-2.0
//
// The browser entry point (Plan-004, Track 2). Served through the `browser` condition of this
// package's `exports`, so a bundler picks it up and a consumer changes nothing.
//
// It differs from index.ts in exactly two lines — the spec source and the hash it installs — and in
// one export it does not carry (`loadSpecFrom`, which takes a directory to read from). What it buys
// is a module graph that reaches no Node builtin and nothing that resolves a path against the
// module's own location, which scripts/check-browser-purity.mjs proves over the built closure rather
// than by reading.
//
// THE TWO NAMES ARE SPELLED OUT NOWHERE IN THIS FILE, ON PURPOSE. Plan-004's success criteria grep
// this emitted module for the builtin prefix and for the meta-URL expression, and a comment carrying
// either literal turns that criterion red while describing their absence. The honest check is the
// closure walk, which reads code rather than prose; this file simply refuses to lie to the grep.
//
// The spec here is a constant that scripts/gen-spec.mjs compiled in, having first verified
// spec/ref-id.json against its sidecar. Nothing recomputes that digest at import time: it would hash
// a constant against a digest compiled from it in the same build, a check that cannot fail. The
// guarantee lives in the generator and in the staleness guard that regenerates and diffs
// (Plan-004's Decision Log).

import { installHash } from "./hash.ts"
import { hashHexBrowser } from "./hash.browser.ts"
import { installSpecSource } from "./spec.ts"
import { SPEC } from "./spec.browser.ts"

installSpecSource(() => SPEC)
installHash(hashHexBrowser)

export { build } from "./build.ts"
export { canonical, sameIdentifier } from "./canonical.ts"
export { digest } from "./digest.ts"
export { validateEnvelope } from "./envelope.ts"
export { BuildError, DigestError, RefIdError, SerialiseError } from "./errors.ts"
export { parse } from "./parse.ts"
export { covers, samePackage } from "./relations.ts"
export { serialise } from "./serialise.ts"
export { canonicalise, loadSpec, SpecIntegrityError, SpecVersionError, type RefIdSpec } from "./spec.ts"
// The digest spec/ref-id.json carried when this build's constant was generated. A statement about
// provenance, not a verification — spec.browser.ts says so at length, and re-exporting it here does
// not make it one.
export { SPEC_DIGEST } from "./spec.browser.ts"
export type { BuildParts, EnvelopeResult, NestedQualifierValue, Pair, ParsedFragment, ParseResult, ParseStatus } from "./types.ts"
