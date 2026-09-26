// SPDX-License-Identifier: Apache-2.0
//
// The Node entry point. It differs from index.browser.ts in exactly two lines: which spec source and
// which hash it installs. Everything below is the same public surface, served by the same modules.

import { installHash } from "./hash.ts"
import { hashHexNode } from "./hash.node.ts"
import { installSpecSource } from "./spec.ts"
import { loadSpecFrom, loadSpecFromDisk } from "./spec.node.ts"

installSpecSource(loadSpecFromDisk)
installHash(hashHexNode)

export { build } from "./build.ts"
export { canonical, canonicalIdentifier, sameIdentifier } from "./canonical.ts"
export { digest } from "./digest.ts"
export { validateEnvelope } from "./envelope.ts"
export { BuildError, DigestError, RefIdError, SerialiseError } from "./errors.ts"
export { parse } from "./parse.ts"
export { covers, relate, samePackage, verdict } from "./relations.ts"
export { serialise } from "./serialise.ts"
export { canonicalise, loadSpec, SpecIntegrityError, SpecVersionError, type RefIdSpec, type Spec } from "./spec.ts"
// Disk-only, and therefore the one export the browser build does not carry: it takes a directory to
// read a spec + sidecar pair from, which is a thing a browser does not have.
export { loadSpecFrom } from "./spec.node.ts"
export type {
  BuildParts,
  EnvelopeResult,
  Fragment,
  IdentifierOrParsed,
  NestedQualifierValue,
  Pair,
  ParsedFragment,
  ParseResult,
  ParseStatus,
  QualifierRelation,
  RelateResult,
  Relation,
  VerdictContent,
  VerdictIdentity,
  VerdictResult,
} from "./types.ts"
