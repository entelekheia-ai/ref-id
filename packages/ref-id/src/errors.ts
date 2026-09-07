// SPDX-License-Identifier: Apache-2.0
//
// The typed errors the producer-side API raises. `parse` never throws for an identifier problem;
// `build`, `digest` and `serialise` do, because a producer asked for something the scheme cannot
// represent, and returning a string that means something else would be the silent failure the
// specification names.

/** Base of every error that names the part of an identifier it concerns. */
export class RefIdError extends Error {
  readonly part: string
  constructor(name: string, part: string, message: string) {
    super(message)
    this.name = name
    this.part = part
  }
}

/** `build` was given a part the grammar cannot carry. */
export class BuildError extends RefIdError {
  constructor(part: string, message: string) {
    super("BuildError", part, message)
  }
}

/** `digest` was given a member that is not one identifier string. */
export class DigestError extends RefIdError {
  constructor(part: string, message: string) {
    super("DigestError", part, message)
  }
}

/** `serialise` was given a result that has no faithful string form. */
export class SerialiseError extends RefIdError {
  constructor(part: string, message: string) {
    super("SerialiseError", part, message)
  }
}
