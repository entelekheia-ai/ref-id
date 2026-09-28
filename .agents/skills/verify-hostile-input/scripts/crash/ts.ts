// SPDX-License-Identifier: Apache-2.0
// Hostile-input battery for the TypeScript reference (Node entry, or the browser entry with --browser).
// Each line is OK, decl (a declared RefIdError), typed (any error from a call the type checker refuses)
// or ESCAPE (any other error type) — an ESCAPE is a finding.
//   node --experimental-strip-types crash/ts.ts [--browser]
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url))
const SCRATCH = mkdtempSync(join(tmpdir(), "ref-id-attack-ts-"))
const browser = process.argv.includes("--browser")
const m: any = browser ? await import(ROOT + "packages/ref-id/src/index.browser.ts") : await import(ROOT + "packages/ref-id/src/index.ts")
const { RefIdError } = m
function run(label: string, f: () => unknown) {
  try {
    const r: any = f()
    console.log(`OK     ${label}: ${JSON.stringify(r?.status ?? r)?.slice(0, 100)}`)
  } catch (e: any) {
    const declared = e instanceof RefIdError || e?.name === "SpecIntegrityError" || e?.name === "SpecVersionError"
    // A call the type checker refuses ("ill-typed …") may fail any way it likes; it is reported, never a finding.
    const tag = declared ? "decl  " : label.startsWith("ill-typed") ? "typed " : "ESCAPE"
    console.log(`${tag} ${label}: ${e?.constructor?.name}: ${String(e?.message).slice(0, 100)}`)
  }
}
let deep: any = []
for (let i = 0; i < 100000; i++) deep = [deep]
run("canonicalise 100k-deep", () => m.canonicalise(deep).length)
const cyc: any = []; cyc.push(cyc)
run("canonicalise cyclic", () => m.canonicalise(cyc))
run("canonicalise Date", () => m.canonicalise(new Date(0)))
run("canonicalise Map", () => m.canonicalise(new Map([["a", 1]])))
run("canonicalise undefined in array", () => m.canonicalise([undefined]))
run("canonicalise undefined member", () => m.canonicalise({ a: undefined }))
run("canonicalise bigint", () => m.canonicalise(1n))
run("canonicalise __proto__ own key", () => m.canonicalise(JSON.parse('{"__proto__":{"x":1},"b":2}')))
run("canonicalise lone surrogate", () => m.canonicalise("\ud800"))
run("canonicalise -0", () => m.canonicalise(-0))
run("canonicalise maximum override", () => m.canonicalise(2 ** 60, Infinity))
run("digest lone surrogate", () => m.digest(["\ud800"]))
run("digest array-like", () => m.digest({ length: 1, 0: "a" }))
run("digest sparse", () => m.digest(new Array(2)))
run("digest proxied array getter", () => { let n = 0; const p = new Proxy(["ref:a:b"], { get(t: any, k) { if (k === "0") return n++ === 0 ? "ref:a:b" : "x\n"; return t[k] } }); return m.digest(p) })
for (const s of ["ref:folder:\ud800", "ref:folder:a;x=\ud800", "ref:" + "1".repeat(5000) + ":folder:a", "ref:folder:a#x;lines=" + "9".repeat(5000) + ",1", "ref:__proto__:a", "ref:constructor:a", "ref:folder:a;__proto__=1", "ref:folder:a;constructor=1", "ref:folder:a#p;constructor=1", "ref:folder:a#p;__proto__=1", "ref:folder:a;to-string=1", "ref:has-own-property:a", "ref:folder:a;valueOf=1"]) {
  run(`parse ${JSON.stringify(s.slice(0, 40))}`, () => m.parse(s))
  run(`canonicalIdentifier ${JSON.stringify(s.slice(0, 30))}`, () => m.canonicalIdentifier(s))
  run(`relate self ${JSON.stringify(s.slice(0, 30))}`, () => m.relate(s, s) === null ? "null" : "obj")
}
run("ill-typed parse null", () => m.parse(null))
run("ill-typed parse number", () => m.parse(5))
run("ill-typed covers undefined", () => m.covers(undefined, "ref:a:b"))
run("ill-typed serialise string", () => m.serialise("ref:a:b"))
run("ill-typed serialise {}", () => m.serialise({}))
const h = m.digest(["ref:folder:a"])
const rid = `ref:folder:x;by=${h}`
run("envelope ok", () => m.validateEnvelope(rid, { id: rid, sets: { by: ["ref:folder:a"] } }))
run("envelope inherited id", () => m.validateEnvelope(rid, Object.create({ id: rid, sets: { by: ["ref:folder:a"] } })))
run("envelope inherited sets", () => m.validateEnvelope(rid, { id: rid, sets: Object.create({ by: ["ref:folder:a"] }) }))
run("envelope __proto__ JSON sets", () => m.validateEnvelope(rid, JSON.parse(`{"id":${JSON.stringify(rid)},"sets":{"__proto__":{"by":["ref:folder:a"]}}}`)))
run("envelope sets array", () => m.validateEnvelope(rid, { id: rid, sets: [["ref:folder:a"]] }))
run("envelope members array-like", () => m.validateEnvelope(rid, { id: rid, sets: { by: { length: 1, 0: "ref:folder:a" } } }))
run("ill-typed envelope requested non-string", () => m.validateEnvelope(5 as any, { id: 5 }))
run("envelope getter id toggles", () => { let n = 0; return m.validateEnvelope(rid, { get id() { return n++ === 0 ? rid : "x" }, sets: { by: ["ref:folder:a"] } }) })
run("envelope getter members toggles", () => { let n = 0; const arr = ["ref:folder:a"]; return m.validateEnvelope(rid, { id: rid, sets: { get by() { return n++ === 0 ? arr : ["zzz"] } } }) })
run("envelope nested digest in by", () => m.validateEnvelope(`ref:folder:x;by=ref:folder:y%3Bover=${h}`, { id: `ref:folder:x;by=ref:folder:y%3Bover=${h}` }))
run("envelope digest in unknown qualifier", () => m.validateEnvelope(`ref:folder:x;zz=${h}`, { id: `ref:folder:x;zz=${h}` }))
run("envelope digest on uncovered type", () => m.validateEnvelope(`ref:zz:x;by=${h}`, { id: `ref:zz:x;by=${h}` }))
run("build lone surrogate value", () => m.build({ type: "folder", locator: "a", qualifiers: [["x", "\ud800"]] }))
run("build qualifiers object", () => m.build({ type: "folder", locator: "a", qualifiers: { x: "1" } }))
run("build qualifiers null", () => m.build({ type: "folder", locator: "a", qualifiers: null }))
run("ill-typed build null parts", () => m.build(null))
run("build __proto__ type", () => m.build({ type: "__proto__", locator: "a" }))
run("build constructor key", () => m.build({ type: "folder", locator: "a", qualifiers: [["constructor", "1"]] }))
run("build nested with ;+mark", () => m.build({ type: "folder", locator: "a", qualifiers: [["by", { nested: "ref:folder:b;́x=1" }]] }))
if (!browser) {
  const good = ROOT + "spec"
  const text = readFileSync(join(good, "ref-id.json"))
  const side = readFileSync(join(good, "ref-id.json.sha256"))
  const w = (j: Buffer | string, s: Buffer | string) => { const d = mkdtempSync(join(SCRATCH, "spec-")); writeFileSync(join(d, "ref-id.json"), j); writeFileSync(join(d, "ref-id.json.sha256"), s); return () => m.loadSpecFrom(d).specVersion }
  run("spec good", w(text, side))
  run("spec BOM", w(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text]), side))
  run("spec invalid utf8", w(Buffer.concat([text.subarray(0, 100), Buffer.from([0xff]), text.subarray(100)]), side))
  run("spec truncated", w(text.subarray(0, 1000), side))
  run("spec deep", w("[".repeat(100000) + "]".repeat(100000), side))
  run("spec huge number", w('{"a":' + "9".repeat(5000) + "}", side))
  run("spec sidecar uppercase", w(text, side.toString().toUpperCase()))
  run("spec sidecar ws", w(text, "  \n" + side.toString() + "\n "))
  run("spec dup specVersion", w(text.toString().replace('"specVersion":', '"specVersion": "9.0.0", "specVersion":'), side))
  run("spec missing", () => m.loadSpecFrom("/nonexistent"))
  run("spec __proto__ key", w('{"__proto__":{"specVersion":"1.0.0"}}', "x"))
}
