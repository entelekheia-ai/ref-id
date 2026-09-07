// SPDX-License-Identifier: Apache-2.0
//
// One assertion per conformance vector; the specification is the oracle, nothing here is hardcoded.
// A field is compared through the canonical JSON serialisation of both sides.

use ref_id::{build, canonicalise, digest, load_spec, load_spec_from, parse, serialise, validate_envelope, BuildParts, FragmentParts, Pair, QualifierValue, RefIdError};
use serde_json::Value;

fn build_parts(json: &Value) -> BuildParts {
    let mut qualifiers = Vec::new();
    for pair in json.get("qualifiers").and_then(Value::as_array).cloned().unwrap_or_default() {
        let key = pair[0].as_str().unwrap_or("").to_string();
        if let Some(plain) = pair[1].as_str() {
            qualifiers.push((key, QualifierValue::Plain(plain.to_string())));
        } else if let Some(nested) = pair[1].get("nested").and_then(Value::as_str) {
            qualifiers.push((key, QualifierValue::Nested(nested.to_string())));
        }
    }
    let fragment = match json.get("fragment") {
        Some(Value::String(path)) => Some(FragmentParts::Path(path.clone())),
        Some(Value::Object(full)) => Some(FragmentParts::Full {
            path: full.get("path").and_then(Value::as_str).unwrap_or("").to_string(),
            refinements: full
                .get("refinements")
                .and_then(Value::as_array)
                .map(|a| a.iter().map(|p| Pair::new(p[0].as_str().unwrap_or(""), p[1].as_str().unwrap_or(""))).collect())
                .unwrap_or_default(),
        }),
        _ => None,
    };
    BuildParts {
        r#type: json.get("type").and_then(Value::as_str).unwrap_or("").to_string(),
        locator: json.get("locator").and_then(Value::as_str).unwrap_or("").to_string(),
        qualifiers,
        fragment,
    }
}

#[test]
fn parse_vectors() {
    let spec = load_spec().unwrap();
    for vector in spec.vectors("parse") {
        let name = vector["name"].as_str().unwrap_or("?");
        let result = parse(vector["input"].as_str().unwrap()).unwrap().to_json();
        for (key, wanted) in vector["expect"].as_object().unwrap() {
            let got = result.get(key).cloned().unwrap_or(Value::Null);
            assert_eq!(canonicalise(&got).unwrap(), canonicalise(wanted).unwrap(), "parse: {name} — field {key}");
        }
    }
}

#[test]
fn roundtrip_vectors() {
    let spec = load_spec().unwrap();
    for input in spec.vectors("roundtrip") {
        let input = input.as_str().unwrap();
        assert_eq!(serialise(&parse(input).unwrap()).unwrap(), input, "roundtrip: {input}");
    }
}

#[test]
fn build_vectors() {
    let spec = load_spec().unwrap();
    for vector in spec.vectors("build") {
        let name = vector["name"].as_str().unwrap_or("?");
        let parts = build_parts(&vector["parts"]);
        match &vector["expect"] {
            Value::String(expected) => assert_eq!(build(&parts).unwrap(), *expected, "build: {name}"),
            expect => {
                let wanted = expect["error"].as_str().unwrap();
                match build(&parts) {
                    Err(RefIdError::Build { part, .. }) => assert_eq!(part, wanted, "build: {name} — part"),
                    other => panic!("build: {name} must refuse at {wanted}, got {other:?}"),
                }
            }
        }
    }
}

#[test]
fn digest_vectors() {
    let spec = load_spec().unwrap();
    for vector in spec.vectors("digest") {
        let name = vector["name"].as_str().unwrap_or("?");
        let members: Vec<String> = vector["members"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
        match &vector["expect"] {
            Value::String(expected) => assert_eq!(digest(&members).unwrap(), *expected, "digest: {name}"),
            expect => {
                let wanted = expect["error"].as_str().unwrap();
                match digest(&members) {
                    Err(RefIdError::Digest { part, .. }) => assert_eq!(part, wanted, "digest: {name} — part"),
                    other => panic!("digest: {name} must refuse, got {other:?}"),
                }
            }
        }
    }
}

#[test]
fn envelope_vectors() {
    let spec = load_spec().unwrap();
    for vector in spec.vectors("envelope") {
        let name = vector["name"].as_str().unwrap_or("?");
        let result = validate_envelope(vector["requestedId"].as_str().unwrap(), &vector["envelope"]).unwrap();
        assert_eq!(result.admissible, vector["expect"].as_str() == Some("admissible"), "envelope: {name} — {:?}", result.reason);
    }
}

fn temp_dir() -> std::path::PathBuf {
    // A counter, not the clock: two tests starting in the same microsecond shared one directory and
    // overwrote each other's sidecar, which turned a version failure into an integrity failure.
    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("ref-id-{}-{}-{}", std::process::id(), n, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn integrity_embedded_copy_is_the_repository_spec() {
    let (json, sidecar) = ref_id::embedded_spec_text();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../spec");
    assert_eq!(json, std::fs::read_to_string(root.join("ref-id.json")).unwrap(), "the embedded spec must be byte-identical to spec/ref-id.json");
    assert_eq!(sidecar, std::fs::read_to_string(root.join("ref-id.json.sha256")).unwrap(), "the embedded sidecar must be byte-identical");
}

#[test]
fn integrity_altered_byte_fails() {
    let (json, sidecar) = ref_id::embedded_spec_text();
    let mut object: Value = serde_json::from_str(json).unwrap();
    let scheme = object["scheme"].as_str().unwrap().to_string();
    object["scheme"] = Value::String(scheme + "x");
    let dir = temp_dir();
    std::fs::write(dir.join("ref-id.json"), serde_json::to_string(&object).unwrap()).unwrap();
    std::fs::write(dir.join("ref-id.json.sha256"), sidecar).unwrap();
    assert!(matches!(load_spec_from(&dir), Err(RefIdError::SpecIntegrity(_))));
}

#[test]
fn integrity_unsupported_major_fails() {
    use sha2::{Digest as _, Sha256};
    let (json, _) = ref_id::embedded_spec_text();
    let mut object: Value = serde_json::from_str(json).unwrap();
    object["specVersion"] = Value::String("2.0.0".into());
    let dir = temp_dir();
    std::fs::write(dir.join("ref-id.json"), serde_json::to_string(&object).unwrap()).unwrap();
    let digest = format!("{:x}\n", Sha256::digest(canonicalise(&object).unwrap().as_bytes()));
    std::fs::write(dir.join("ref-id.json.sha256"), digest).unwrap();
    assert!(matches!(load_spec_from(&dir), Err(RefIdError::SpecVersion(_))));
}

#[test]
fn dialect_measurement() {
    // What the adaptations table records for rust-regex is measured here: does the canonical expression
    // compile unchanged, and does its `$` already refuse a trailing line break?
    let spec = load_spec().unwrap();
    let unadapted = regex::Regex::new(spec.grammar_expression()).expect("the canonical expression must compile unchanged in the regex crate");
    assert!(!unadapted.is_match("ref:folder:acme-tools\n"), "the regex crate's $ must not match before a trailing newline (no adaptation needed)");
}
