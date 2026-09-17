// SPDX-License-Identifier: Apache-2.0
//
// The Node hash: `node:crypto`, exactly as digest.ts called it before the seam existed. Installed by
// index.ts; index.browser.ts installs hash.browser.ts instead and never imports this file.

import { createHash } from "node:crypto"
import type { HashHex } from "./hash.ts"

/**
 * Whatever `node:crypto` honours, honoured. No allow-list of algorithms is imposed here: this is the
 * behaviour the package already had, and narrowing it would refuse specs Node can serve in order to
 * match a limit that belongs to the other build.
 */
export const hashHexNode: HashHex = (algorithm, encoding, text) =>
  createHash(algorithm).update(text, encoding as BufferEncoding).digest("hex")
