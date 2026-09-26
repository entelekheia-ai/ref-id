// SPDX-License-Identifier: Apache-2.0
//
// Reads one identifier per line on stdin (with `\n` and `\r` escaped as `\\n` / `\\r`) and prints one
// canonical JSON result per line — the surface the differential test against the TypeScript reference reads.
//
// `--pairs` (Plan-005 Track 5) switches to a second protocol on the same escaping: stdin carries two
// lines per pair, `a` then `b`; stdout carries one line per pair, the canonical JSON of
// `{covers, coversReversed, samePackage, sameIdentifier, relate, verdict}`, where `coversReversed` is
// `covers(b, a)` and `relate`/`verdict` are the full result or `null`. Two lines per pair rather than a
// separator, because the grammar admits a tab in a locator.

use ref_id::{canonicalise, covers, parse, relate, same_identifier, same_package, serialise, verdict};
use serde_json::Value;
use std::io::BufRead;

/// `\n` and `\r` escaped as `\\n` / `\\r` — the one escaping both protocols share.
fn unescape(line: &str) -> String {
    line.replace("\\n", "\n").replace("\\r", "\r")
}

fn run_default(with_canonical: bool) -> i32 {
    let mut failures = 0;
    for line in std::io::stdin().lock().lines() {
        let input = unescape(&line.unwrap());
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
    if failures == 0 {
        0
    } else {
        1
    }
}

/// Two lines in, one canonical JSON line out — `{covers, coversReversed, samePackage, sameIdentifier,
/// relate, verdict}` — for every complete pair. None of the six ever raises: `covers`/`samePackage`/
/// `sameIdentifier` answer `false` and `relate`/`verdict` answer `null` for whatever they refuse, so
/// there is nothing here to report as a per-pair failure. A trailing unpaired line — stdin ending after
/// an odd number of lines — has nothing to compare it against and is dropped rather than guessed at.
fn run_pairs() -> i32 {
    let mut lines = std::io::stdin().lock().lines();
    loop {
        let Some(a) = lines.next() else { break };
        let a = unescape(&a.unwrap());
        let Some(b) = lines.next() else { break };
        let b = unescape(&b.unwrap());

        let result = serde_json::json!({
            "covers": covers(&a, &b),
            "coversReversed": covers(&b, &a),
            "samePackage": same_package(&a, &b),
            "sameIdentifier": same_identifier(&a, &b),
            "relate": relate(&a, &b).map(|r| r.to_json()).unwrap_or(Value::Null),
            "verdict": verdict(&a, &b).map(|v| v.to_json()).unwrap_or(Value::Null),
        });
        println!("{}", canonicalise(&result).unwrap());
    }
    0
}

fn main() {
    // `--canonical` keeps the field the default protocol drops. The drop is deliberate: a locator's
    // validity belongs to the format, and the three purl libraries disagree at the edge, so the shared
    // protocol compares every field except that verdict. Canonicalisation is a different question —
    // two systems that compare identifiers by canonical form must agree on it — so it is measurable
    // here rather than silently excluded with the verdict.
    let args: Vec<String> = std::env::args().collect();
    let exit_code = if args.iter().any(|a| a == "--pairs") {
        run_pairs()
    } else {
        run_default(args.iter().any(|a| a == "--canonical"))
    };
    std::process::exit(exit_code);
}
