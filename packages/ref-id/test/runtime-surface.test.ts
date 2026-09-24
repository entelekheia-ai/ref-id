// SPDX-License-Identifier: Apache-2.0
//
// `spec.openRPC` declares the public surface every implementation exposes. This binds the TypeScript
// side of that promise at the one level a type checker cannot: the *runtime* export names each entry
// point actually carries, in both directions — a declared method this entry does not export is a
// failure, and a runtime export this entry carries that openRPC does not declare (and that is not
// listed under `x-extensions` for this entry) is a failure too.
//
// Signatures are the compiler's job (scripts/gen-surface-ts.mjs + the typecheck script); this test
// only checks that the *names* line up, per entry, because `index.ts` and `index.browser.ts` differ in
// what they carry (`loadSpecFrom` is Node-only; `SPEC_DIGEST` is browser-only).
//
// Each entry is imported in its own child process. `index.ts` and `index.browser.ts` share one
// `spec.ts` module instance, so importing both here would make the second `installSpecSource` win —
// list-exports-runner.ts exists so each entry is asked in isolation, the same reason
// browser-parity.test.ts spawns one process per entry.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { loadSpec } from "../src/index.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNNER = `${HERE}/list-exports-runner.ts`

interface OpenRPCMethod {
  name: string
  "x-absent-from"?: string[]
}

interface OpenRPCDoc {
  "x-extensions": Record<string, string[]>
  "x-error-type": string
  components: { errors: Record<string, unknown> }
  methods: OpenRPCMethod[]
}

const spec = loadSpec() as unknown as { openRPC: OpenRPCDoc }
const doc = spec.openRPC

function exportsOf(args: string[]): string[] {
  const out = execFileSync(process.execPath, ["--experimental-strip-types", RUNNER, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  return JSON.parse(out)
}

/** `x-casing.typescript` is `camelCase`, and openRPC's method names are already camelCase — so a
 * TypeScript entry's declared surface is the canonical method name, verbatim. Every entry also carries
 * the error hierarchy: `x-error-type` names the base class (`RefIdError`) and each `components.errors`
 * key names a kind whose TypeScript class is `<Kind>Error` (e.g. `Build` → `BuildError`) — both derived
 * from the spec, never a literal list, so a sixth error kind is picked up with no edit here. */
function declaredFor(absentKey: string, extensionsKey: string): string[] {
  const methods = doc.methods.filter((method) => !(method["x-absent-from"] ?? []).includes(absentKey)).map((method) => method.name)
  const extensions = doc["x-extensions"][extensionsKey] ?? []
  const errorClasses = Object.keys(doc.components.errors).map((kind) => `${kind}Error`)
  return [...methods, ...extensions, doc["x-error-type"], ...errorClasses].sort()
}

const entries: { label: string; runnerArgs: string[]; absentKey: string; extensionsKey: string }[] = [
  { label: "index.ts (node)", runnerArgs: [], absentKey: "typescript-node", extensionsKey: "typescript-node" },
  { label: "index.browser.ts", runnerArgs: ["--browser"], absentKey: "typescript-browser", extensionsKey: "typescript-browser" },
]

for (const entry of entries) {
  test(`runtime surface: ${entry.label} exports exactly openRPC's declared methods plus its own x-extensions`, () => {
    const declared = declaredFor(entry.absentKey, entry.extensionsKey)
    const actual = exportsOf(entry.runnerArgs)

    const missing = declared.filter((name) => !actual.includes(name))
    const undeclared = actual.filter((name) => !declared.includes(name))

    assert.deepEqual(
      { missing, undeclared },
      { missing: [], undeclared: [] },
      `${entry.label}: declared methods missing from the runtime export list: [${missing.join(", ")}]; ` +
        `runtime exports openRPC does not declare (and x-extensions does not list): [${undeclared.join(", ")}]`,
    )
  })
}
