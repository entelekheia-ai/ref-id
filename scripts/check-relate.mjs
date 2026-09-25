#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Hold the `relate` vectors to the `comparison` vectors, reading the specification alone.
 *
 * `covers`, `coveredBy` and `samePackage` are declared as reductions of a `relate` result
 * (`comparison.relate.reductions`). A `relate` vector states a full result and the three booleans; a
 * `comparison` vector states the booleans alone, written by hand long before `relate` existed. If the two
 * disagree for one pair, one of them is wrong — and no implementation can tell which, because each one
 * is held to both groups at once and would simply fail one of them.
 *
 * So this runs no implementation. For every `relate` vector it reduces the expected result by the
 * declared rule and checks the booleans the vector lists, the booleans the `comparison` group lists for
 * the same pair in either order, and the mirror law: a vector for (b, a) must state the mirror of the
 * vector for (a, b). A failure here is a defect in the specification, reported before any port runs.
 *
 *   node scripts/check-relate.mjs
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const spec = JSON.parse(readFileSync(fileURLToPath(new URL("../spec/ref-id.json", import.meta.url)), "utf8"))
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
          Object.entries(r.qualifiers).map(([k, q]) => [k, q.nested ? { relation: swap[q.relation], nested: mirror(q.nested) } : { relation: swap[q.relation] }]),
        ),
      }

// A nested result must itself reduce to the relation its qualifier states — the rule, one level down.
const nestedAgree = (r) =>
  r === null || Object.values(r.qualifiers).every((q) => !q.nested || (reduce(q.nested) === q.relation && nestedAgree(q.nested)))

const byPair = new Map(spec.vectors.comparison.map((v) => [`${v.a}\n${v.b}`, v.expect]))
const relateByPair = new Map(spec.vectors.relate.map((v) => [`${v.a}\n${v.b}`, v.expect.relate]))
const failures = []
let overlapping = 0

for (const v of spec.vectors.relate) {
  const r = v.expect.relate
  const got = { samePackage: samePackage(r), covers: covers(r), coversReversed: coveredBy(r) }
  for (const key of Object.keys(got))
    if (got[key] !== v.expect[key]) failures.push(`${v.name}: ${key} reduces to ${got[key]}, the vector says ${v.expect[key]}`)
  if (!nestedAgree(r)) failures.push(`${v.name}: a nested result does not reduce to the relation its qualifier states`)

  const same = byPair.get(`${v.a}\n${v.b}`)
  const reversed = byPair.get(`${v.b}\n${v.a}`)
  if (same) overlapping++
  if (reversed) overlapping++
  const expected = same ?? (reversed && { samePackage: reversed.samePackage, covers: reversed.coversReversed, coversReversed: reversed.covers })
  if (expected)
    for (const key of Object.keys(got))
      if (got[key] !== expected[key]) failures.push(`${v.name}: ${key} is ${got[key]} here and ${expected[key]} in the comparison group`)

  const other = relateByPair.get(`${v.b}\n${v.a}`)
  if (other !== undefined && JSON.stringify(other) !== JSON.stringify(mirror(r)))
    failures.push(`${v.name}: the vector for the reversed pair is not its mirror`)
}

console.log(`relate: ${spec.vectors.relate.length} vectors reduced; ${overlapping} pair(s) also in the comparison group`)
if (failures.length) {
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
