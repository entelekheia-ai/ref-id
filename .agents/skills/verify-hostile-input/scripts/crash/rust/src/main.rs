// SPDX-License-Identifier: Apache-2.0
// Hostile-input battery for the Rust port. Each case runs in a child of this same binary so an abort
// (stack overflow) is observed as an exit status rather than killing the battery. A case named
// `in-memory-…` builds a value no JSON parser produces (`serde_json` stops at depth 128), so an abort there
// is recorded and is not a finding; an abort on any other case is.
use ref_id::*;
use serde_json::{json, Value};
use std::{env, fs, path::PathBuf, process::Command};

fn case(name: &str) -> String {
    let deep = |n: usize| {
        let mut v = json!([]);
        for _ in 0..n { v = Value::Array(vec![v]); }
        v
    };
    let h = digest(&["ref:folder:a".to_string()]).unwrap();
    let rid = format!("ref:folder:x;by={h}");
    let root = env::var("REFID_ROOT").unwrap();
    let s = env::var("REFID_SCRATCH").unwrap();
    let good = PathBuf::from(format!("{root}/crates/ref-id/spec"));
    let text = fs::read(good.join("ref-id.json")).unwrap();
    let side = fs::read(good.join("ref-id.json.sha256")).unwrap();
    let with = |j: Vec<u8>, sc: Vec<u8>, tag: &str| {
        let d = PathBuf::from(format!("{s}/rs-{tag}"));
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("ref-id.json"), j).unwrap();
        fs::write(d.join("ref-id.json.sha256"), sc).unwrap();
        format!("{:?}", load_spec_from(&d).map(|sp| sp.spec_version().to_string()))
    };
    match name {
        "canon-deep-1k" => format!("{:?}", canonicalise(&deep(1_000)).map(|x| x.len())),
        "in-memory-canon-deep-100k" => format!("{:?}", canonicalise(&deep(100_000)).map(|x| x.len())),
        "canon-big-u64" => format!("{:?}", canonicalise(&json!(u64::MAX))),
        "canon-i64-min" => format!("{:?}", canonicalise(&json!(i64::MIN))),
        "canon-float" => format!("{:?}", canonicalise(&json!(1.5))),
        "canon-2p53" => format!("{:?}", canonicalise(&json!(9007199254740992u64))),
        "canon-1e16f" => format!("{:?}", canonicalise(&json!(1e16))),
        "canon-negmax" => format!("{:?}", canonicalise(&json!(-9007199254740991i64))),
        "parse-ver-5000" => format!("{:?}", parse(&format!("ref:{}:folder:a", "1".repeat(5000))).map(|p| (p.status, p.version))),
        "parse-u64max+1" => format!("{:?}", parse("ref:18446744073709551616:folder:a").map(|p| (p.status, p.version))),
        "parse-lines-huge" => format!("{:?}", parse(&format!("ref:folder:a#x;lines={},1", "9".repeat(5000))).map(|p| p.status)),
        "parse-nul" => format!("{:?}", parse("ref:folder:a\u{0}").map(|p| p.status)),
        "parse-multibyte-boundaries" => {
            let mut out = vec![];
            for s in ["ref:pkg:npm/é@1", "ref:pkg:npm/a@é/é", "ref:pkg:é", "ref:url:é.com/é@é", "ref:pkg:npm/@é/é@1/é", "ref:folder:a#é;lines=1", "ref:pkg:npm/a@1#\u{301}/x", "ref:pkg:npm/\u{1F600}@\u{1F600}/\u{1F600}"] {
                out.push(format!("{:?}", parse(s).map(|p| p.status)));
                let _ = relate(s, s); let _ = verdict(s, "ref:pkg:npm/a@1"); let _ = covers(s, s); let _ = canonical_identifier(s);
            }
            out.join(",")
        }
        "digest-join" => format!("{:?}", digest(&["a\nb".to_string()])),
        "env-ok" => format!("{:?}", validate_envelope(&rid, &json!({"id": rid, "sets": {"by": ["ref:folder:a"]}}))),
        "env-sets-array" => format!("{:?}", validate_envelope(&rid, &json!({"id": rid, "sets": [["ref:folder:a"]]}))),
        "env-members-nonstr" => format!("{:?}", validate_envelope(&rid, &json!({"id": rid, "sets": {"by": [1]}}))),
        "env-array" => format!("{:?}", validate_envelope(&rid, &json!([rid]))),
        "env-null" => format!("{:?}", validate_envelope(&rid, &Value::Null)),
        "in-memory-env-deep-members" => { let v = json!({"id": rid, "sets": {"by": deep(100_000)}}); let r = format!("{:?}", validate_envelope(&rid, &v)); std::mem::forget(v); r }, "in-memory-canon-deep-10k-forget" => { let v = deep(10_000); let r = format!("{:?}", canonicalise(&v).map(|x| x.len())); std::mem::forget(v); r }, "in-memory-drop-only" => { let v = deep(100_000); drop(v); "dropped".into() },
        "build-sep-mark" => format!("{:?}", build(&BuildParts { r#type: "folder".into(), locator: "a;\u{301}x=1".into(), qualifiers: vec![], fragment: None })),
        "build-key-eq" => format!("{:?}", build(&BuildParts { r#type: "folder".into(), locator: "a".into(), qualifiers: vec![("x=y".into(), QualifierValue::Plain("1".into()))], fragment: None })),
        "build-empty" => format!("{:?}", build(&BuildParts { r#type: "".into(), locator: "".into(), qualifiers: vec![], fragment: None })),
        "spec-good" => with(text.clone(), side.clone(), "good"),
        "spec-bom" => with([b"\xef\xbb\xbf".to_vec(), text.clone()].concat(), side.clone(), "bom"),
        "spec-invalid-utf8" => with([text[..100].to_vec(), vec![0xff], text[100..].to_vec()].concat(), side.clone(), "utf8"),
        "spec-truncated" => with(text[..1000].to_vec(), side.clone(), "trunc"),
        "spec-deep" => with([vec![b'['; 100_000], vec![b']'; 100_000]].concat(), side.clone(), "deep"),
        "spec-huge-int" => with(format!("{{\"a\":{}}}", "9".repeat(5000)).into_bytes(), side.clone(), "huge"),
        "spec-sidecar-upper" => with(text.clone(), side.to_ascii_uppercase(), "upper"),
        "spec-sidecar-ws" => with(text.clone(), [b"  \n".to_vec(), side.clone(), b"\n ".to_vec()].concat(), "ws"),
        "spec-dup" => with(String::from_utf8(text.clone()).unwrap().replacen("\"specVersion\":", "\"specVersion\": \"9.0.0\", \"specVersion\":", 1).into_bytes(), side.clone(), "dup"),
        _ => "unknown case".into(),
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() == 3 && args[1] == "--case" {
        println!("{}", case(&args[2]));
        return;
    }
    let cases = ["canon-deep-1k", "in-memory-canon-deep-100k", "canon-big-u64", "canon-i64-min", "canon-float", "canon-2p53", "canon-1e16f", "canon-negmax", "parse-ver-5000", "parse-u64max+1", "parse-lines-huge", "parse-nul", "parse-multibyte-boundaries", "digest-join", "env-ok", "env-sets-array", "env-members-nonstr", "env-array", "env-null", "in-memory-env-deep-members", "in-memory-canon-deep-10k-forget", "in-memory-drop-only", "build-sep-mark", "build-key-eq", "build-empty", "spec-good", "spec-bom", "spec-invalid-utf8", "spec-truncated", "spec-deep", "spec-huge-int", "spec-sidecar-upper", "spec-sidecar-ws", "spec-dup"];
    for c in cases {
        let out = Command::new(&args[0]).args(["--case", c]).output().unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        let err = String::from_utf8_lossy(&out.stderr);
        let first_err = err.lines().find(|l| l.contains("panicked") || l.contains("overflow")).unwrap_or("");
        println!("{:<28} exit={:?} {} {}", c, out.status.code(), text.trim().chars().take(140).collect::<String>(), first_err.chars().take(160).collect::<String>());
    }
}
