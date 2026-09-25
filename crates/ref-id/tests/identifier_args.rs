// SPDX-License-Identifier: Apache-2.0
//
// Every identifier-taking function accepts what a caller most often holds. The functions are generic over
// `IdentifierArg`, and a generic parameter does not deref-coerce: `&String` reaches `&str` only where the
// target type is written literally, so `covers(&a, &b)` with `a: String` stopped compiling the day the
// signatures became generic, and nothing in the vectors noticed. This test is the guard — it fails to
// compile if `IdentifierArg` stops being implemented for `String` or `Box<str>`.

use ref_id::{canonical_identifier, covers, parse, relate, same_identifier, same_package};

#[test]
fn owned_and_borrowed_strings_and_parse_results_are_all_accepted() {
    let general: String = "ref:pkg:npm/x".to_string();
    let specific: String = "ref:pkg:npm/x@1.0.0".to_string();
    let boxed: Box<str> = specific.clone().into_boxed_str();
    let parsed = parse(&specific).unwrap();

    assert!(covers(&general, &specific));
    assert!(covers(general.as_str(), &*boxed));
    assert!(covers(&general, &parsed));
    assert!(same_package(&general, &boxed));
    assert!(same_identifier(&specific, &parsed));
    assert!(relate(&general, &specific).is_some());
    assert_eq!(canonical_identifier(&specific).unwrap(), canonical_identifier(&parsed).unwrap());
}
