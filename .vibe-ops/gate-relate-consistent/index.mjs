// SPDX-License-Identifier: Apache-2.0
/**
 * Hold the `relate` vectors to the `comparison` vectors.
 *
 * `covers`, `coveredBy` and `samePackage` are declared as reductions of a `relate` result
 * (`comparison.relate.reductions`). A `relate` vector states a full result and the three booleans; a
 * `comparison` vector states the booleans alone, written by hand long before `relate` existed. If the
 * two disagree for one pair, one of them is wrong. This runs no implementation: for every `relate`
 * vector it reduces the expected result by the declared rule and checks it against the vector's own
 * booleans, against the `comparison` group's booleans for the same pair in either order, and against the
 * mirror law — a vector for (b, a) must state the mirror of the vector for (a, b).
 *
 * Reads `spec/ref-id.json` with `readFileSync` + `JSON.parse`, never through the `ref-id` package.
 *
 * A SKIP MEANS THE INSTRUMENT IS ABSENT, NEVER THAT THE SPECIFICATION IS DEFECTIVE. The only legitimate
 * skip here is the spec file itself being missing (a population question). `vectors.relate` or
 * `vectors.comparison` absent or not an array, and a vector missing `a`/`b`/`expect` or whose `expect`
 * is not an object, are FINDINGS with a pointer — never a throw that takes the whole run down. The
 * deleted `scripts/check-relate.mjs` crashed on a malformed vector (reproduced: deleting
 * `vectors.relate[0].expect` used to make `vibe-ops check` exit with only
 * `Cannot read properties of undefined (reading 'relate')`, losing every other finding); a gate must
 * refuse the one malformed vector and keep examining the rest.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { pointerToLine } from "../_json-pointer-line.mjs"

const RULE = "relate-disagrees"
const SPEC_PATH = "spec/ref-id.json"

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const describeType = (value) => {
  if (value === undefined) return "absent"
  if (value === null) return "null"
  if (Array.isArray(value)) return "an array"
  return typeof value
}

const FIXED = ["type", "version", "locatorStem", "locatorVersion", "fragmentPath"]

const relations = (r) => [
  ...FIXED.map((d) => r[d]),
  ...Object.values(r.fragmentRefinements),
  ...Object.values(r.qualifiers).map((q) => q.relation),
]
const reduce = (r) => {
  const all = relations(r)
  if (all.every((x) => x === "equal")) return "equal"
  if (all.every((x) => x === "equal" || x === "covers")) return "covers"
  if (all.every((x) => x === "equal" || x === "coveredBy")) return "coveredBy"
  return "differ"
}
const covers = (r) => r !== null && r.type === "equal" && r.version === "equal" && ["equal", "covers"].includes(reduce(r))
const coveredBy = (r) => r !== null && r.type === "equal" && r.version === "equal" && ["equal", "coveredBy"].includes(reduce(r))
const samePackage = (r) =>
  r !== null &&
  ["type", "version", "locatorStem", "fragmentPath"].every((d) => r[d] === "equal") &&
  Object.values(r.fragmentRefinements).every((x) => x === "equal") &&
  Object.values(r.qualifiers).every((q) => (q.nested ? samePackage(q.nested) : q.relation === "equal"))

const swap = { covers: "coveredBy", coveredBy: "covers", equal: "equal", differ: "differ" }
const mirror = (r) =>
  r === null
    ? null
    : {
        ...Object.fromEntries(FIXED.map((d) => [d, swap[r[d]]])),
        fragmentRefinements: Object.fromEntries(Object.entries(r.fragmentRefinements).map(([k, x]) => [k, swap[x]])),
        qualifiers: Object.fromEntries(
          Object.entries(r.qualifiers).map(([k, q]) => [
            k,
            q.nested ? { relation: swap[q.relation], nested: mirror(q.nested) } : { relation: swap[q.relation] },
          ]),
        ),
      }

// A nested result must itself reduce to the relation its qualifier states — the rule, one level down.
const nestedAgree = (r) =>
  r === null || Object.values(r.qualifiers).every((q) => !q.nested || (reduce(q.nested) === q.relation && nestedAgree(q.nested)))

export default {
  definition: {
    id: "relate-consistent",
    version: 1,
    summary: "Every `relate` vector reduces to what the `comparison` vectors say, and mirrors its reversed pair",
    defaultPaths: [SPEC_PATH],
  },

  async run(ctx) {
    let raw
    try {
      raw = readFileSync(path.join(ctx.repoRoot, SPEC_PATH), "utf8")
    } catch {
      return { findings: [], skipped: `${SPEC_PATH} is not present in this tree` }
    }

    let spec
    try {
      spec = JSON.parse(raw)
    } catch (error) {
      return {
        findings: [{ rule: RULE, file: SPEC_PATH, evidence: `spec/ref-id.json could not be parsed as JSON: ${error.message}` }],
        examined: 0,
      }
    }

    const relateVectors = spec?.vectors?.relate
    const comparisonVectors = spec?.vectors?.comparison
    const findings = []

    if (!Array.isArray(relateVectors)) {
      findings.push({
        rule: RULE,
        file: SPEC_PATH,
        line: pointerToLine(raw, "/vectors/relate"),
        evidence: `spec.vectors.relate is ${describeType(relateVectors)} — expected an array`,
      })
    }
    if (!Array.isArray(comparisonVectors)) {
      findings.push({
        rule: RULE,
        file: SPEC_PATH,
        line: pointerToLine(raw, "/vectors/comparison"),
        evidence: `spec.vectors.comparison is ${describeType(comparisonVectors)} — expected an array`,
      })
    }
    if (!Array.isArray(relateVectors)) return { findings, examined: 0 }

    const validComparison = Array.isArray(comparisonVectors) ? comparisonVectors : []
    const byPair = new Map(validComparison.map((v) => [`${v.a}\n${v.b}`, v.expect]))
    const relateByPair = new Map(
      relateVectors
        .filter((v) => isPlainObject(v) && isPlainObject(v.expect) && (v.expect.relate === null || isPlainObject(v.expect.relate)))
        .map((v) => [`${v.a}\n${v.b}`, v.expect.relate]),
    )

    relateVectors.forEach((v, index) => {
      const pointer = `/vectors/relate/${index}`
      const line = pointerToLine(raw, pointer)
      const name = isPlainObject(v) ? (v.name ?? `vector ${index}`) : `vector ${index}`
      const push = (message) => findings.push({ rule: RULE, file: SPEC_PATH, line, evidence: `${name}: ${message}` })

      if (!isPlainObject(v)) {
        push(`is ${describeType(v)} — expected an object`)
        return
      }
      if (typeof v.a !== "string" || typeof v.b !== "string") {
        push(`"a"/"b" must both be strings — got ${describeType(v.a)}/${describeType(v.b)}`)
        return
      }
      if (!isPlainObject(v.expect)) {
        push(`"expect" is ${describeType(v.expect)} — expected an object`)
        return
      }
      if (!isPlainObject(v.expect.relate) && v.expect.relate !== null) {
        push(`"expect.relate" is ${describeType(v.expect.relate)} — expected an object or null`)
        return
      }

      const r = v.expect.relate
      const got = { samePackage: samePackage(r), covers: covers(r), coversReversed: coveredBy(r) }
      for (const key of Object.keys(got)) if (got[key] !== v.expect[key]) push(`${key} reduces to ${got[key]}, the vector says ${v.expect[key]}`)
      if (!nestedAgree(r)) push("a nested result does not reduce to the relation its qualifier states")

      const same = byPair.get(`${v.a}\n${v.b}`)
      const reversed = byPair.get(`${v.b}\n${v.a}`)
      const expected = same ?? (reversed && { samePackage: reversed.samePackage, covers: reversed.coversReversed, coversReversed: reversed.covers })
      if (expected) for (const key of Object.keys(got)) if (got[key] !== expected[key]) push(`${key} is ${got[key]} here and ${expected[key]} in the comparison group`)

      const other = relateByPair.get(`${v.b}\n${v.a}`)
      if (other !== undefined && JSON.stringify(other) !== JSON.stringify(mirror(r))) push("the vector for the reversed pair is not its mirror")
    })

    return { findings, examined: relateVectors.length }
  },
}
