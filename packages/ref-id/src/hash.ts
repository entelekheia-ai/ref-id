// SPDX-License-Identifier: Apache-2.0
//
// The seam through which the digest's hash function reaches this package, for the same reason
// spec.ts has one: `node:crypto` is not available in a browser, and `digest()` is synchronous.
//
// WHY NOT WebCrypto. `crypto.subtle.digest` is the only hash the web platform publishes and it is
// asynchronous, so using it would make `digest()` and `validateEnvelope()` return promises — a change
// to the public API, which Plan-004 puts out of scope, and one that would leave the two builds with
// different surfaces to compare. Blocking on it is not available either: `Atomics.wait` throws on a
// browser's main thread by specification. So the browser build carries a synchronous implementation
// instead (hash.browser.ts, @noble/hashes), and Node keeps `node:crypto` (hash.node.ts).
//
// WHERE THE TWO CAN DIVERGE, SAID OUT LOUD. The algorithm is spec data (`spec.digest.algorithm`), and
// the two implementations do not honour the same set: Node honours everything `node:crypto` does,
// the browser honours sha256 alone. A specification that moved to another algorithm would therefore
// keep working in Node and throw a SpecVersionError in the browser. That is disagreement discovered
// loudly, at the first call, naming the algorithm — the failure mode Plan-004 rejects is the silent
// one, where both builds answer and answer differently.

import { SpecVersionError } from "./spec.ts"

/**
 * Hashes `text` under a spec-declared algorithm and encoding, returning lowercase hex. The algorithm
 * and encoding are passed through from `spec.digest` rather than fixed here: the spec owns the choice,
 * and an implementation that cannot honour it says so instead of substituting one it can.
 */
export type HashHex = (algorithm: string, encoding: string, text: string) => string

let implementation: HashHex | undefined

/** Installs the hash `digest()` uses. Called exactly once, by an entry point. */
export function installHash(hash: HashHex): void {
  implementation = hash
}

/** Hashes through the installed implementation. */
export function hashHex(algorithm: string, encoding: string, text: string): string {
  if (!implementation) {
    // Same unreachable-by-accident case as loadSpec(): `exports` publishes no deep path into this
    // package, so arriving here means a module was imported directly rather than an entry point.
    throw new SpecVersionError(
      "no hash implementation is installed; import this package through its entry point rather than a module inside it",
    )
  }
  return implementation(algorithm, encoding, text)
}
