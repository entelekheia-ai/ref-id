// SPDX-License-Identifier: Apache-2.0
// Hostile-input battery for the Swift port. Each case runs in a child process so a trap is observed
// as a signal exit instead of ending the battery. A case named `in-memory-…` builds a value no JSON
// parser produces (`JSONSerialization` stops at depth 512), so a signal there is recorded and is not a
// finding; a signal on any other case is.
import Foundation
import RefId

let ROOT = ProcessInfo.processInfo.environment["REFID_ROOT"]!
let SCRATCH = ProcessInfo.processInfo.environment["REFID_SCRATCH"]!

func withSpec(_ json: Data, _ sidecar: Data, _ tag: String) -> String {
    let dir = URL(fileURLWithPath: "\(SCRATCH)/sw-\(tag)")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try! json.write(to: dir.appendingPathComponent("ref-id.json"))
    try! sidecar.write(to: dir.appendingPathComponent("ref-id.json.sha256"))
    do { return "ok \(try loadSpecFrom(dir).specVersion)" } catch { return "threw \(error)" }
}

func runCase(_ name: String) -> String {
    let good = URL(fileURLWithPath: "\(ROOT)/Sources/RefId/Resources")
    let text = try! Data(contentsOf: good.appendingPathComponent("ref-id.json"))
    let side = try! Data(contentsOf: good.appendingPathComponent("ref-id.json.sha256"))
    func t(_ f: () throws -> Any) -> String { do { return "ok \(try f())" } catch { return "threw \(error)" } }
    switch name {
    case "canon-uint64max": return t { try canonicalise(NSNumber(value: UInt64.max)) }
    case "canon-minus1": return t { try canonicalise(NSNumber(value: -1)) }
    case "canon-json-uint64max": return t { try canonicalise(try JSONSerialization.jsonObject(with: Data("[18446744073709551615]".utf8))) }
    case "canon-json-2p63": return t { try canonicalise(try JSONSerialization.jsonObject(with: Data("[9223372036854775808]".utf8))) }
    case "canon-json-big": return t { try canonicalise(try JSONSerialization.jsonObject(with: Data("[\(String(repeating: "9", count: 400))]".utf8))) }
    case "canon-2p63-double": return t { try canonicalise(NSNumber(value: 9223372036854775808.0)) }
    case "in-memory-canon-deep": do {
        var v: Any = [Any]()
        for _ in 0..<100_000 { v = [v] }
        return t { try canonicalise(v).count }
    }
    case "canon-nsdate": return t { try canonicalise(Date()) }
    case "parse-ver-5000": return t { try parse("ref:\(String(repeating: "1", count: 5000)):folder:a").status }
    case "parse-lines-huge": return t { try parse("ref:folder:a#x;lines=\(String(repeating: "9", count: 5000)),1").status }
    case "parse-multibyte": return t { try ["ref:pkg:npm/a@1#\u{301}/x", "ref:folder:a;\u{301}", "ref:pkg:npm/\u{1F600}@\u{1F600}/\u{1F600}", "ref:url:\u{301}.com/a"].map { try parse($0).status }.joined(separator: ",") }
    case "env-nsnumber-members": do {
        let h = try! digest(["ref:folder:a"]); let rid = "ref:folder:x;by=\(h)"
        return t { try validateEnvelope(requestedId: rid, envelope: ["id": rid, "sets": ["by": [NSNumber(value: 1)]]]).admissible }
    }
    case "env-nfd-id": do {
        let h = try! digest(["ref:folder:\u{e9}"]); let rid = "ref:folder:x;by=\(h)"
        let nfd = "ref:folder:x;by=\(h)"
        return t { (try validateEnvelope(requestedId: rid, envelope: ["id": nfd, "sets": ["by": ["ref:folder:e\u{301}"]]])).admissible }
    }
    case "build-sep-mark": return t { try build(BuildParts(type: "folder", locator: "a;\u{301}x=1")) }
    case "build-frag-mark": return t { try build(BuildParts(type: "pkg", locator: "npm/a@1#\u{301}/x")) }
    case "build-qual-mark": return t { try build(BuildParts(type: "folder", locator: "a", qualifiers: [("x", .plain("1;\u{301}y=2"))])) }
    case "build-qual-hash-mark": return t { try build(BuildParts(type: "folder", locator: "a", qualifiers: [("x", .plain("1#\u{301}frag"))])) }
    case "spec-good": return withSpec(text, side, "good")
    case "spec-bom": return withSpec(Data([0xef, 0xbb, 0xbf]) + text, side, "bom")
    case "spec-invalid-utf8": return withSpec(text.prefix(100) + Data([0xff]) + text.dropFirst(100), side, "utf8")
    case "spec-deep": return withSpec(Data(String(repeating: "[", count: 100_000).utf8) + Data(String(repeating: "]", count: 100_000).utf8), side, "deep")
    case "spec-huge-int": return withSpec(Data("{\"a\":\(String(repeating: "9", count: 5000))}".utf8), side, "huge")
    case "spec-2p63-double": return withSpec(Data("{\"a\":9223372036854775808.0}".utf8), side, "p63")
    case "spec-2p63-int": return withSpec(Data("{\"a\":9223372036854775808}".utf8), side, "p63i")
    case "spec-max-2p63": return withSpec(Data("{\"version\":{\"maximum\":9223372036854775807},\"a\":9223372036854775808.0}".utf8), side, "maxp63")
    case "spec-uint64max": return withSpec(Data("{\"version\":{\"maximum\":9007199254740991},\"a\":18446744073709551615}".utf8), side, "u64")
    case "spec-sidecar-upper": return withSpec(text, Data(String(decoding: side, as: UTF8.self).uppercased().utf8), "upper")
    case "spec-dup": return withSpec(Data(String(decoding: text, as: UTF8.self).replacingOccurrences(of: "\"specVersion\":", with: "\"specVersion\": \"9.0.0\", \"specVersion\":").utf8), side, "dup")
    default: return "unknown"
    }
}

let args = CommandLine.arguments
if args.count == 3 && args[1] == "--case" {
    print(runCase(args[2]))
    exit(0)
}
let cases = ["canon-uint64max", "canon-minus1", "canon-json-uint64max", "canon-json-2p63", "canon-json-big", "canon-2p63-double", "in-memory-canon-deep", "canon-nsdate", "parse-ver-5000", "parse-lines-huge", "parse-multibyte", "env-nsnumber-members", "env-nfd-id", "build-sep-mark", "build-frag-mark", "build-qual-mark", "build-qual-hash-mark", "spec-good", "spec-bom", "spec-invalid-utf8", "spec-deep", "spec-huge-int", "spec-2p63-double", "spec-2p63-int", "spec-max-2p63", "spec-uint64max", "spec-sidecar-upper", "spec-dup"]
for c in cases {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: args[0])
    p.arguments = ["--case", c]
    let out = Pipe(), err = Pipe()
    p.standardOutput = out; p.standardError = err
    try! p.run(); p.waitUntilExit()
    let o = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    let e = String(decoding: err.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).split(separator: "\n").first(where: { $0.contains("Fatal") || $0.contains("error") }) ?? ""
    let status = p.terminationReason == .uncaughtSignal ? "SIGNAL \(p.terminationStatus)" : "exit \(p.terminationStatus)"
    print("\(c.padding(toLength: 22, withPad: " ", startingAt: 0)) \(status) \(o.prefix(150)) \(e.prefix(160))")
}
