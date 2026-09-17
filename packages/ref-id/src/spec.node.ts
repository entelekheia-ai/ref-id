// SPDX-License-Identifier: Apache-2.0
//
// The Node source of the specification: reads spec/ref-id.json from disk, verifies its bytes against
// the sidecar digest, and checks the specVersion major. This is the half of the old spec.ts that
// needs a filesystem, and it is now the only module in the package that has one.
//
// `index.ts` installs `loadSpecFromDisk` as the spec source; `index.browser.ts` installs the
// generated constant instead and never imports this file, which is what keeps `node:fs` and
// `node:crypto` out of the browser build's module graph (Plan-004, Track 2).

import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import {
  canonicalise,
  SpecIntegrityError,
  SpecVersionError,
  SUPPORTED_SPEC_MAJOR,
  type RefIdSpec,
} from "./spec.ts"

function readText(location: URL | string): string {
  return readFileSync(location, "utf8")
}

function validate(rawJson: string, rawSidecar: string): RefIdSpec {
  const parsed = JSON.parse(rawJson) as unknown
  const canonical = canonicalise(parsed)
  const computed = createHash("sha256").update(canonical, "utf8").digest("hex")
  const expected = rawSidecar.trim()
  if (computed !== expected) {
    throw new SpecIntegrityError(
      `spec/ref-id.json does not match its sidecar digest (expected ${expected}, computed ${computed})`,
    )
  }
  const spec = parsed as RefIdSpec
  const major = String(spec.specVersion).split(".")[0]
  if (major !== SUPPORTED_SPEC_MAJOR) {
    throw new SpecVersionError(
      `spec/ref-id.json declares specVersion ${spec.specVersion}; this package supports major ${SUPPORTED_SPEC_MAJOR}`,
    )
  }
  return spec
}

/**
 * Loads and validates a spec + sidecar pair from an arbitrary directory. Exposed for the
 * spec-integrity tests; `loadSpec()` is the entry point every other module uses.
 */
export function loadSpecFrom(dir: string): RefIdSpec {
  const raw = readText(`${dir}/ref-id.json`)
  const sidecar = readText(`${dir}/ref-id.json.sha256`)
  return validate(raw, sidecar)
}

/**
 * Reads the spec that ships beside this build and verifies it. Installed as the spec source by
 * `index.ts`; the `../spec/` copy is the one `package.json`'s prebuild step puts there.
 */
export function loadSpecFromDisk(): RefIdSpec {
  const jsonUrl = new URL("../spec/ref-id.json", import.meta.url)
  const sidecarUrl = new URL("../spec/ref-id.json.sha256", import.meta.url)
  return validate(readText(jsonUrl), readText(sidecarUrl))
}
