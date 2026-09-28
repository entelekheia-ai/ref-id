// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import gate from "./index.mjs"

// A command that writes the given JUnit document to the path the gate appends as `--junitxml=<path>`.
const writing = (xml, exit = 0) => ["sh", "-c", `printf '%s' '${xml}' > "\${1#--junitxml=}"; exit ${exit}`, "sh"]
const PASS = '<testsuite><testcase classname="tests.test_parse" name="test_a" file="tests/test_parse.py"/></testsuite>'
const FAIL = '<testsuite><testcase classname="tests.test_parse" name="test_b" file="tests/test_parse.py"><failure message="assert 1 == 2">x</failure></testcase><testcase classname="tests.test_parse" name="test_c"/></testsuite>'

async function withRoot(body) {
  const root = await mkdtemp(path.join(tmpdir(), "gate-python-conformance-"))
  try {
    return await body(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test("a suite whose report holds only passing cases produces zero findings", () =>
  withRoot(async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { command: writing(PASS) } })
    assert.deepEqual(outcome, { findings: [], examined: 1 })
  }))

test("fires python-conformance-failed for each failed case, naming its file and test", () =>
  withRoot(async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { command: writing(FAIL, 1) } })
    assert.equal(outcome.examined, 2)
    assert.equal(outcome.findings.length, 1)
    assert.equal(outcome.findings[0].rule, "python-conformance-failed")
    assert.equal(outcome.findings[0].file, "python/tests/test_parse.py")
    assert.match(outcome.findings[0].evidence, /test_b — assert 1 == 2/)
  }))

test("a non-zero exit with no failed case in the report is still a finding", () =>
  withRoot(async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { command: ["sh", "-c", "echo ImportError: no module; exit 2", "sh"] } })
    assert.equal(outcome.findings.length, 1)
    assert.match(outcome.findings[0].evidence, /exited 2 with no failed case reported: .*ImportError/)
  }))

test("near-miss: an absent program is a skip naming it, never a pass or a finding", () =>
  withRoot(async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { command: ["no-such-program-ref-id"] } })
    assert.deepEqual(outcome.findings, [])
    assert.match(outcome.skipped, /no-such-program-ref-id is not on PATH/)
  }))

test("near-miss: a run past the timeout is a skip, never a pass", () =>
  withRoot(async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: { command: ["sh", "-c", "sleep 5", "sh"], timeoutSeconds: 0.2 } })
    assert.deepEqual(outcome.findings, [])
    assert.match(outcome.skipped, /ran past/)
  }))

test("a tree without python/pyproject.toml skips under the default command", () =>
  withRoot(async (repoRoot) => {
    const outcome = await gate.run({ repoRoot, files: [], options: {} })
    assert.match(outcome.skipped, /python\/pyproject\.toml is not present/)
  }))
