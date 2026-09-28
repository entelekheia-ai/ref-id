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

// A hostile or damaged spec file must reach the caller as `SpecIntegrityError` — the one error this
// module's public functions promise — never as the native error the failing step happens to raise:
// `readFileSync` for a missing file or a denied permission, `JSON.parse` for bytes that are not JSON,
// and a `RangeError` for JSON nested deep enough to overflow the parser's own recursion (canonicalise
// wraps the same error for its own recursion, but `JSON.parse` can already overflow before canonicalise
// ever runs, so this file needs its own guard too).
function readText(location: URL | string): string {
  try {
    return readFileSync(location, "utf8")
  } catch (error) {
    throw new SpecIntegrityError(`cannot read ${String(location)}: ${(error as Error).message}`)
  }
}

function parseJson(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson) as unknown
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) {
      throw new SpecIntegrityError(`ref-id.json is not valid JSON: ${error.message}`)
    }
    throw error
  }
}

function validate(rawJson: string, rawSidecar: string): RefIdSpec {
  const parsed = parseJson(rawJson)
  // canonicalise's own default reads `loadSpec().version.maximum` — unusable here, this call is what
  // loadSpec() is waiting on. The bound is read straight off the document being verified instead; any
  // tampering with it is still caught, because it changes the very bytes the sidecar digest is over.
  const declaredMaximum = (parsed as { version?: { maximum?: unknown } })?.version?.maximum
  const maximum = typeof declaredMaximum === "number" ? declaredMaximum : Number.MAX_SAFE_INTEGER
  const canonical = canonicalise(parsed, maximum)
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
