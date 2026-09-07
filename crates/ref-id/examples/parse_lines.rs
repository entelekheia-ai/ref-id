// SPDX-License-Identifier: Apache-2.0
//
// Reads one identifier per line on stdin (with `\n` and `\r` escaped as `\\n` / `\\r`) and prints one
// canonical JSON result per line — the surface the differential test against the TypeScript reference reads.

use ref_id::{canonicalise, parse, serialise};
use serde_json::Value;
use std::io::BufRead;

fn main() {
    let mut failures = 0;
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let input = line.replace("\\n", "\n").replace("\\r", "\r");
        match parse(&input) {
            Ok(result) => {
                let mut json = result.to_json();
                if let Some(map) = json.as_object_mut() {
                    map.remove("canonical");
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
