// SPDX-License-Identifier: Apache-2.0
//
// The conformance runner: one check per vector in the embedded specification, plus the integrity
// checks and the proof that the embedded copy is the repository's spec. It is an executable rather
// than a test target so that it runs on a toolchain without XCTest or the Swift Testing macros.
// Exit status is non-zero on any failure. The specification is the oracle; nothing here is hardcoded.

import Foundation
import RefId


/// `--parse` and `--pairs` both escape `\n`/`\r` on the way in, the same way `--parse` always has.
func unescapeLine(_ line: String) -> String {
    line.replacingOccurrences(of: "\\n", with: "\n").replacingOccurrences(of: "\\r", with: "\r")
}

/// A `QualifierRelation` as the JSON shape a `relate` vector describes: `relation`, plus `nested` only
/// when there is one — the key is omitted, never `null`, when the qualifier has no nested result.
func qualifierRelationToJSON(_ relation: QualifierRelation) -> [String: Any] {
    var out: [String: Any] = ["relation": relation.relation.rawValue]
    if let nested = relation.nested { out["nested"] = relateResultToJSONObject(nested) }
    return out
}

/// A `RelateResult` as the JSON object `spec.vectors.relate`'s `expect.relate` describes.
func relateResultToJSONObject(_ result: RelateResult) -> [String: Any] {
    [
        "type": result.type.rawValue,
        "version": result.version.rawValue,
        "locatorStem": result.locatorStem.rawValue,
        "locatorVersion": result.locatorVersion.rawValue,
        "fragmentPath": result.fragmentPath.rawValue,
        "fragmentRefinements": result.fragmentRefinements.mapValues { $0.rawValue },
        "qualifiers": result.qualifiers.mapValues(qualifierRelationToJSON),
    ]
}

/// `relate`'s return as `--pairs`' protocol wants it on the wire: the object above, or JSON `null` for a
/// pair `relate` refuses.
func relateResultToJSON(_ result: RelateResult?) -> Any {
    result.map(relateResultToJSONObject) ?? NSNull()
}

// `--parse`: read one identifier per line on stdin, print one canonical JSON result per line — the
// surface the differential test against the TypeScript reference reads.
if CommandLine.arguments.contains("--parse") {
    // `--canonical` keeps the field the default protocol drops. The drop is deliberate: a locator's
    // validity belongs to the format, and the three purl validators disagree at the edge, so the shared
    // protocol compares every field except that verdict. Canonicalisation is a different question —
    // two systems that compare identifiers by canonical form must agree on it — so it is measurable
    // here rather than silently excluded with the verdict.
    let withCanonical = CommandLine.arguments.contains("--canonical")
    var failures = 0
    while let line = readLine(strippingNewline: true) {
        let input = unescapeLine(line)
        do {
            let result = try parse(input)
            var json = result.asJSON()
            if !withCanonical { json["canonical"] = nil }
            if let serialised = try? serialise(result) { json["serialised"] = serialised }
            print(try canonicalise(json))
        } catch {
            failures += 1
            print("{\"threw\":\(try canonicalise(String(describing: error)))}")
        }
    }
    exit(failures == 0 ? 0 : 1)
}

// `--pairs` (Plan-005, Track 5): stdin carries two lines per pair — `a`, then `b`, escaped the same way
// `--parse` escapes a line — and stdout carries one canonical-JSON line per pair: `covers`,
// `coversReversed` (`covers(b, a)`), `samePackage`, `sameIdentifier` and `relate` (the full result, or
// `null`). Two lines per pair rather than one line with a separator, because the grammar admits a tab
// inside a locator.
if CommandLine.arguments.contains("--pairs") {
    var lines: [String] = []
    while let line = readLine(strippingNewline: true) { lines.append(line) }
    guard lines.count % 2 == 0 else {
        FileHandle.standardError.write(Data("ref-id-conformance --pairs: \(lines.count) lines is not an even number of lines (two per pair)\n".utf8))
        exit(1)
    }
    var index = 0
    while index < lines.count {
        let a = unescapeLine(lines[index])
        let b = unescapeLine(lines[index + 1])
        let row: [String: Any] = [
            "covers": covers(a, b),
            "coversReversed": covers(b, a),
            "samePackage": samePackage(a, b),
            "sameIdentifier": sameIdentifier(a, b),
            "relate": relateResultToJSON(relate(a, b)),
        ]
        print(try canonicalise(row))
        index += 2
    }
    exit(0)
}

var passed = 0
var failed = 0

func check(_ condition: Bool, _ message: @autoclosure () -> String) {
    if condition { passed += 1 } else { failed += 1; print("✘ \(message())") }
}

func canonical(_ value: Any) throws -> String { try RefId.canonicalise(value) }

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

/// Every group `spec.vectors` declares must be one this runner actually executes by name below — a
/// group nobody names never runs, in every implementation at once (measured: `comparison` shipped and
/// both runners stayed green without running it). Failing loudly here is the point: a group this
/// runner cannot yet run must say so, not stay silent.
func checkEveryVectorGroupRuns() throws {
    let spec = try loadSpec()
    let executed: Set<String> = ["parse", "canonical", "roundtrip", "build", "digest", "envelope", "comparison", "relate"]
    let missing = spec.vectorClasses().filter { !executed.contains($0) }.sorted()
    check(missing.isEmpty, "every-vector-group-runs: spec/ref-id.json declares vector groups this runner does not execute: \(missing)")
}

/// One relation from a `relate` vector's JSON — the four names `Relation` declares, verbatim.
func relationFromJSON(_ raw: Any?) -> Relation? {
    guard let name = raw as? String else { return nil }
    return Relation(rawValue: name)
}

/// A `RelateResult` (or `nil`, for a vector's `expect.relate: null`) rebuilt from the vector's own JSON
/// shape, so it can be compared against `relate(a, b)` with `==` rather than field by field.
func relateResultFromJSON(_ json: Any?) -> RelateResult? {
    guard let dict = json as? [String: Any],
          let type = relationFromJSON(dict["type"]),
          let version = relationFromJSON(dict["version"]),
          let locatorStem = relationFromJSON(dict["locatorStem"]),
          let locatorVersion = relationFromJSON(dict["locatorVersion"]),
          let fragmentPath = relationFromJSON(dict["fragmentPath"])
    else { return nil }
    var fragmentRefinements: [String: Relation] = [:]
    for (key, value) in dict["fragmentRefinements"] as? [String: Any] ?? [:] {
        if let relation = relationFromJSON(value) { fragmentRefinements[key] = relation }
    }
    var qualifiers: [String: QualifierRelation] = [:]
    for (key, value) in dict["qualifiers"] as? [String: Any] ?? [:] {
        guard let qualifier = value as? [String: Any], let relation = relationFromJSON(qualifier["relation"]) else { continue }
        qualifiers[key] = QualifierRelation(relation: relation, nested: relateResultFromJSON(qualifier["nested"]))
    }
    return RelateResult(
        type: type, version: version, locatorStem: locatorStem, locatorVersion: locatorVersion,
        fragmentPath: fragmentPath, fragmentRefinements: fragmentRefinements, qualifiers: qualifiers
    )
}

func run() throws {
    try checkEveryVectorGroupRuns()
    // surface: Surface.generated.swift's typed references already fail this executable's build
    // when a declared method is missing or its label/type moved (see the file for the known
    // divergences). This call only exercises the runtime half — a spec change that adds or
    // removes a method without the file being regenerated.
    for problem in try checkDeclaredMethodsMatchSpec() {
        check(false, "surface: \(problem)")
    }
    checkSurfaceReferences() // never fails at runtime — its job is done by the time this executable built at all
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
    // canonical — an `expect` that is not a string carries `{ error: <part> }`: the identifier has no
    // canonical form and canonicalising it must refuse, naming that part.
    for vector in try vectors("canonical") {
        let name = vector["name"] as? String ?? "?"
        let input = vector["input"] as! String
        if let wanted = vector["expect"] as? String {
            check((try? canonicalIdentifier(input)) == wanted, "canonical: \(name)")
        } else {
            let part = (vector["expect"] as? [String: Any])?["error"] as? String ?? "?"
            var refused = false
            do { _ = try canonicalIdentifier(input) } catch { refused = "\(error)".contains(part) }
            check(refused, "canonical: \(name) — expected a refusal naming \(part)")
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
                if case .build(_, let message) = error {
                    check(message.contains(wanted), "build: \(name) — the message names the part: \(message)")
                }
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
    // comparison
    for vector in try vectors("comparison") {
        let name = vector["name"] as? String ?? "?"
        let a = vector["a"] as! String
        let b = vector["b"] as! String
        let expect = vector["expect"] as! [String: Any]
        check(samePackage(a, b) == (expect["samePackage"] as! Bool), "comparison: \(name) — samePackage")
        check(covers(a, b) == (expect["covers"] as! Bool), "comparison: \(name) — covers")
        check(covers(b, a) == (expect["coversReversed"] as! Bool), "comparison: \(name) — coversReversed")
        check(sameIdentifier(a, b) == (expect["sameIdentifier"] as! Bool), "comparison: \(name) — sameIdentifier")
    }

    // relate — the full result, plus the three booleans `spec.comparison.relate.reductions` declares
    for vector in try vectors("relate") {
        let name = vector["name"] as? String ?? "?"
        let a = vector["a"] as! String
        let b = vector["b"] as! String
        let expect = vector["expect"] as! [String: Any]
        let wanted = relateResultFromJSON(expect["relate"])
        check(relate(a, b) == wanted, "relate: \(name) — relation")
        check(samePackage(a, b) == (expect["samePackage"] as! Bool), "relate: \(name) — samePackage")
        check(covers(a, b) == (expect["covers"] as! Bool), "relate: \(name) — covers")
        check(covers(b, a) == (expect["coversReversed"] as! Bool), "relate: \(name) — coversReversed")
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
    do { _ = try loadSpecFrom(tmp); check(false, "integrity: an altered copy loaded") } catch RefIdError.specIntegrity { check(true, "") } catch { check(false, "integrity: altered copy threw \(error)") }
    object = try JSONSerialization.jsonObject(with: try Data(contentsOf: urls.json)) as! [String: Any]
    object["specVersion"] = "2.0.0"
    let data = try JSONSerialization.data(withJSONObject: object)
    try data.write(to: tmp.appendingPathComponent("ref-id.json"))
    try (RefId.sha256Hex(try RefId.canonicalise(try JSONSerialization.jsonObject(with: data))) + "\n").write(to: tmp.appendingPathComponent("ref-id.json.sha256"), atomically: true, encoding: .utf8)
    do { _ = try loadSpecFrom(tmp); check(false, "integrity: specVersion 2.0.0 loaded") } catch RefIdError.specVersion { check(true, "") } catch { check(false, "integrity: version 2 threw \(error)") }
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
