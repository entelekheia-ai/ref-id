// SPDX-License-Identifier: Apache-2.0
//
// One assertion per `relate` conformance vector: the result `relate` reports, and the three booleans the
// same vector also carries (`samePackage`, `covers`, `coversReversed`) — so a disagreement between
// `relate` and its own stated reductions is caught here rather than only by `scripts/check-relate.mjs`.

use ref_id::{canonicalise, covers, load_spec, relate, same_package};

#[test]
fn relate_vectors() {
    let spec = load_spec().unwrap();
    for vector in spec.vectors("relate") {
        let name = vector["name"].as_str().unwrap_or("?");
        let a = vector["a"].as_str().unwrap();
        let b = vector["b"].as_str().unwrap();
        let expect = &vector["expect"];

        let got = relate(a, b);
        match expect["relate"].as_object() {
            None => assert!(got.is_none(), "relate: {name} — expected null, got {got:?}"),
            Some(_wanted) => {
                let got = got.unwrap_or_else(|| panic!("relate: {name} — expected a result, got null"));
                assert_eq!(
                    canonicalise(&got.to_json()).unwrap(),
                    canonicalise(&expect["relate"]).unwrap(),
                    "relate: {name} — result"
                );
            }
        }

        assert_eq!(same_package(a, b), expect["samePackage"].as_bool().unwrap(), "relate: {name} — samePackage");
        assert_eq!(covers(a, b), expect["covers"].as_bool().unwrap(), "relate: {name} — covers");
        assert_eq!(covers(b, a), expect["coversReversed"].as_bool().unwrap(), "relate: {name} — coversReversed");
    }
}
