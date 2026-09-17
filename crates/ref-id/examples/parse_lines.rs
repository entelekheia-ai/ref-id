// SPDX-License-Identifier: Apache-2.0
//
// Reads one identifier per line on stdin (with `\n` and `\r` escaped as `\\n` / `\\r`) and prints one
// canonical JSON result per line — the surface the differential test against the TypeScript reference reads.

use ref_id::{canonicalise, parse, serialise};
use serde_json::Value;
use std::io::BufRead;

fn main() {
    // `--canonical` keeps the field the default protocol drops. The drop is deliberate: a locator's
    // validity belongs to the format, and the three purl libraries disagree at the edge, so the shared
    // protocol compares every field except that verdict. Canonicalisation is a different question —
    // two systems that compare identifiers by canonical form must agree on it — so it is measurable
    // here rather than silently excluded with the verdict.
    let with_canonical = std::env::args().any(|arg| arg == "--canonical");
    let mut failures = 0;
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let input = line.replace("\\n", "\n").replace("\\r", "\r");
        match parse(&input) {
            Ok(result) => {
                let mut json = result.to_json();
                if let Some(map) = json.as_object_mut() {
                    if !with_canonical {
                        map.remove("canonical");
                    }
                    if let Ok(serialised) = serialise(&result) {
                        map.insert("serialised".into(), Value::String(serialised));
                    }
                }
                println!("{}", canonicalise(&json).unwrap());
            }
            Err(error) => {
                failures += 1;
                println!("{}", canonicalise(&serde_json::json!({ "threw": error.to_string() })).unwrap());
            }
        }
    }
    std::process::exit(if failures == 0 { 0 } else { 1 });
}
