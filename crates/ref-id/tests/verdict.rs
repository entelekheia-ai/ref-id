// SPDX-License-Identifier: Apache-2.0
//
// One assertion per `verdict` conformance vector, plus the mirror check `comparison.verdict.symmetry`
// declares: `verdict(b, a)` is `verdict(a, b)` with `covers` and `coveredBy` exchanged on the identity
// axis, the content axis and `decidedBy` unchanged. Checking the mirror here — rather than trusting the
// vectors alone — catches a symmetry defect no single-direction vector would name.

use ref_id::{canonicalise, load_spec, verdict, VerdictIdentity};

fn mirror_identity(identity: VerdictIdentity) -> VerdictIdentity {
    match identity {
        VerdictIdentity::Covers => VerdictIdentity::CoveredBy,
        VerdictIdentity::CoveredBy => VerdictIdentity::Covers,
        other => other,
    }
}

#[test]
fn verdict_vectors() {
    let spec = load_spec().unwrap();
    for vector in spec.vectors("verdict") {
        let name = vector["name"].as_str().unwrap_or("?");
        let a = vector["a"].as_str().unwrap();
        let b = vector["b"].as_str().unwrap();
        let expect = &vector["expect"]["verdict"];

        let got = verdict(a, b);
        match expect.as_object() {
            None => assert!(got.is_none(), "verdict: {name} — expected null, got {got:?}"),
            Some(_wanted) => {
                let got = got.unwrap_or_else(|| panic!("verdict: {name} — expected a result, got null"));
                assert_eq!(canonicalise(&got.to_json()).unwrap(), canonicalise(expect).unwrap(), "verdict: {name} — result");
            }
        }
    }
}

#[test]
fn verdict_mirror() {
    let spec = load_spec().unwrap();
    for vector in spec.vectors("verdict") {
        let name = vector["name"].as_str().unwrap_or("?");
        let a = vector["a"].as_str().unwrap();
        let b = vector["b"].as_str().unwrap();

        let forward = verdict(a, b);
        let backward = verdict(b, a);
        match (forward, backward) {
            (None, None) => {}
            (Some(forward), Some(backward)) => {
                assert_eq!(mirror_identity(forward.identity), backward.identity, "verdict mirror: {name} — identity");
                assert_eq!(forward.content, backward.content, "verdict mirror: {name} — content");
                assert_eq!(forward.decided_by, backward.decided_by, "verdict mirror: {name} — decidedBy");
            }
            (forward, backward) => panic!("verdict mirror: {name} — one direction is null and the other is not: {forward:?} / {backward:?}"),
        }
    }
}
