// SPDX-License-Identifier: Apache-2.0
//
// The browser hash: @noble/hashes, a pure-JavaScript sha256 with no dependencies and no native
// runtime. Installed by index.browser.ts; index.ts installs hash.node.ts instead and never imports
// this file, so neither implementation reaches the other's build.

import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"
import type { HashHex } from "./hash.ts"
import { SpecVersionError } from "./spec.ts"

/** The encodings this implementation can read a member string as. Both spellings of UTF-8 are accepted. */
const ENCODINGS = new Set(["utf-8", "utf8"])

/**
 * sha256 only, and it refuses the rest by name.
 *
 * Refusing rather than substituting is the same contract `status()` and `part()` hold: the code names
 * what it can do, the spec owns the list, and a spec naming something this build cannot honour is a
 * version mismatch reported as one — never a different answer computed quietly.
 */
export const hashHexBrowser: HashHex = (algorithm, encoding, text) => {
  if (algorithm !== "sha256") {
    throw new SpecVersionError(
      `the browser build implements sha256 only; spec.digest.algorithm declares "${algorithm}"`,
    )
  }
  if (!ENCODINGS.has(encoding)) {
    throw new SpecVersionError(
      `the browser build reads members as UTF-8 only; spec.digest.encoding declares "${encoding}"`,
    )
  }
  return bytesToHex(sha256(utf8ToBytes(text)))
}
