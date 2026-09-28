// SPDX-License-Identifier: Apache-2.0
//
// `relate` is quadratic in the qualifier count when the key lookups behind it walk a `Vec` — `declared_keys`
// checking membership with `.contains`, and the value lookups right after it in `relate_result` repeating
// `.find()` per key over the same slice. 40k qualifiers on each side, measured in the profile `cargo test`
// itself runs (debug): the unfixed code takes tens of seconds here; the fix must clear this in well under
// a second.

use ref_id::{parse, relate, Pair};

#[test]
fn relate_is_not_quadratic_in_qualifier_count() {
    let base = parse("ref:pkg:npm/x@1.0.0").unwrap();

    let count = 40_000;
    let mut a = base.clone();
    let mut b = base.clone();
    for i in 0..count {
        a.qualifiers.push(Pair::new(format!("k{i}"), format!("va{i}")));
        b.qualifiers.push(Pair::new(format!("k{i}"), format!("vb{i}")));
    }

    let start = std::time::Instant::now();
    let result = relate(&a, &b).expect("relate should accept two ok identifiers");
    let elapsed = start.elapsed();

    assert_eq!(result.qualifiers.len(), count);
    assert!(
        elapsed.as_secs_f64() < 1.0,
        "relate over {count} qualifiers per side took {elapsed:?}, expected well under 1s"
    );
}
