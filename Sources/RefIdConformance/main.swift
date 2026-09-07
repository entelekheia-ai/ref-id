// SPDX-License-Identifier: Apache-2.0
//
// The conformance runner: one check per vector in the embedded specification, plus the integrity
// checks and the proof that the embedded copy is the repository's spec. It is an executable rather
// than a test target so that it runs on a toolchain without XCTest or the Swift Testing macros.
// Exit status is non-zero on any failure. The specification is the oracle; nothing here is hardcoded.

import Foundation
import RefId


// `--parse`: read one identifier per line on stdin, print one canonical JSON result per line — the
// surface the differential test against the TypeScript reference reads.
if CommandLine.arguments.contains("--parse") {
    var failures = 0
    while let line = readLine(strippingNewline: true) {
        let input = line.replacingOccurrences(of: "\\n", with: "\n").replacingOccurrences(of: "\\r", with: "\r")
        do {
            let result = try parse(input)
            var json = result.asJSON()
            json["canonical"] = nil
            if let serialised = try? serialise(result) { json["serialised"] = serialised }
            print(try canonicalJSON(json))
        } catch {
            failures += 1
            print("{\"threw\":\(try canonicalJSON(String(describing: error)))}")
        }
    }
    exit(failures == 0 ? 0 : 1)
}

var passed = 0
var failed = 0

func check(_ condition: Bool, _ message: @autoclosure () -> String) {
    if condition { passed += 1 } else { failed += 1; print("✘ \(message())") }
}

func canonical(_ value: Any) throws -> String { try RefId.canonicalJSON(value) }

func vectors(_ cls: String) throws -> [[String: Any]] {
    try loadSpec().vectorClass(cls)
}

func buildParts(_ json: [String: Any]) -> BuildParts {
    var qualifiers: [(String, QualifierValue)] = []
    for pair in json["qualifiers"] as? [[Any]] ?? [] {
        let key = pair[0] as? String ?? ""
        if let plain = pair[1] as? String {
            qualifiers.append((key, .plain(plain)))
        } else if let nested = (pair[1] as? [String: Any])?["nested"] as? String {
            qualifiers.append((key, .nested(nested)))
        }
    }
    var fragment: FragmentParts?
    if let path = json["fragment"] as? String {
        fragment = .path(path)
    } else if let full = json["fragment"] as? [String: Any] {
        let refinements = (full["refinements"] as? [[String]] ?? []).map { Pair($0[0], $0[1]) }
        fragment = .full(path: full["path"] as? String ?? "", refinements: refinements)
    }
    return BuildParts(type: json["type"] as? String ?? "", locator: json["locator"] as? String ?? "", qualifiers: qualifiers, fragment: fragment, location: json["location"])
}

func run() throws {
    // parse
    for vector in try vectors("parse") {
        let name = vector["name"] as? String ?? "?"
        let result = try parse(vector["input"] as! String).asJSON()
        for (key, wanted) in vector["expect"] as! [String: Any] {
            let got = try canonical(result[key] ?? NSNull())
            let expected = try canonical(wanted)
            check(got == expected, "parse: \(name) — field \(key): got \(got), wanted \(expected)")
        }
    }
    // roundtrip
    for input in try loadSpec().roundtripVectors() {
        check(try serialise(try parse(input)) == input, "roundtrip: \(input)")
    }
    // build
    for vector in try vectors("build") {
        let name = vector["name"] as? String ?? "?"
        let parts = buildParts(vector["parts"] as! [String: Any])
        if let expected = vector["expect"] as? String {
            do { check(try build(parts) == expected, "build: \(name)") } catch { check(false, "build: \(name) threw \(error)") }
        } else if let wanted = (vector["expect"] as? [String: Any])?["error"] as? String {
            do { _ = try build(parts); check(false, "build: \(name) must refuse at \(wanted)") } catch let error as RefIdError {
                check(error.part == wanted, "build: \(name) — part \(String(describing: error.part)) wanted \(wanted)")
            }
        }
    }
    // digest
    for vector in try vectors("digest") {
        let name = vector["name"] as? String ?? "?"
        let members = vector["members"] as! [String]
        if let expected = vector["expect"] as? String {
            do { check(try digest(members) == expected, "digest: \(name)") } catch { check(false, "digest: \(name) threw \(error)") }
        } else if let wanted = (vector["expect"] as? [String: Any])?["error"] as? String {
            do { _ = try digest(members); check(false, "digest: \(name) must refuse") } catch let error as RefIdError {
                check(error.part == wanted, "digest: \(name) — part")
            }
        }
    }
    // envelope
    for vector in try vectors("envelope") {
        let name = vector["name"] as? String ?? "?"
        let result = try validateEnvelope(requestedId: vector["requestedId"] as! String, envelope: vector["envelope"])
        check(result.admissible == ((vector["expect"] as? String) == "admissible"), "envelope: \(name) — \(result.reason ?? "")")
    }

    // integrity: the embedded copy is the repository's spec (when run from the repository)
    let repositorySpec = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("spec")
    let urls = try embeddedSpecURLs()
    if FileManager.default.fileExists(atPath: repositorySpec.appendingPathComponent("ref-id.json").path) {
        check(try Data(contentsOf: urls.json) == Data(contentsOf: repositorySpec.appendingPathComponent("ref-id.json")), "integrity: Sources/RefId/Resources/ref-id.json is not a byte-identical copy of spec/ref-id.json")
        check(try Data(contentsOf: urls.sidecar) == Data(contentsOf: repositorySpec.appendingPathComponent("ref-id.json.sha256")), "integrity: the sidecar copy is not byte-identical")
    }
    // integrity: an altered byte fails; an unsupported major fails; the real one loads
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("ref-id-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
    var object = try JSONSerialization.jsonObject(with: try Data(contentsOf: urls.json)) as! [String: Any]
    object["scheme"] = (object["scheme"] as! String) + "x"
    try JSONSerialization.data(withJSONObject: object).write(to: tmp.appendingPathComponent("ref-id.json"))
    try Data(contentsOf: urls.sidecar).write(to: tmp.appendingPathComponent("ref-id.json.sha256"))
    do { _ = try loadSpec(from: tmp); check(false, "integrity: an altered copy loaded") } catch RefIdError.specIntegrity { check(true, "") } catch { check(false, "integrity: altered copy threw \(error)") }
    object = try JSONSerialization.jsonObject(with: try Data(contentsOf: urls.json)) as! [String: Any]
    object["specVersion"] = "2.0.0"
    let data = try JSONSerialization.data(withJSONObject: object)
    try data.write(to: tmp.appendingPathComponent("ref-id.json"))
    try (RefId.sha256Hex(try RefId.canonicalJSON(try JSONSerialization.jsonObject(with: data))) + "\n").write(to: tmp.appendingPathComponent("ref-id.json.sha256"), atomically: true, encoding: .utf8)
    do { _ = try loadSpec(from: tmp); check(false, "integrity: specVersion 2.0.0 loaded") } catch RefIdError.specVersion { check(true, "") } catch { check(false, "integrity: version 2 threw \(error)") }
    check(try loadSpec().scheme == "ref", "integrity: the embedded spec does not load")
    // the dialect measurement: does the canonical expression compile unchanged here?
    let expression = try loadSpec().grammarExpression()
    check((try? Regex(expression)) != nil, "dialect: the canonical expression does not compile unchanged in swift-regex")
}

do {
    try run()
} catch {
    failed += 1
    print("✘ runner threw: \(error)")
}
print("swift conformance: \(passed) passed, \(failed) failed")
exit(failed == 0 ? 0 : 1)
