// SPDX-License-Identifier: Apache-2.0
// Writes a corpus of identifiers to stdout, one per line, escaped for the line protocol.
//
//   node corpus.mjs vectors                  every `ref:` string any vector group carries
//   node corpus.mjs fuzz <count> <seed>      mutations of those strings (add --pairs for two lines each)
//   node corpus.mjs marks                    a combining mark, a ZWJ or a keycap glued to every separator
//
// The seed makes a fuzz corpus reproducible: quote it beside any finding it produced.

import { readFileSync } from "node:fs"
import { ROOT, escape } from "./ports.mjs"

const spec = JSON.parse(readFileSync(ROOT + "spec/ref-id.json", "utf8"))

function vectors() {
  const found = new Set()
  const walk = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("ref:")) found.add(value)
    } else if (value && typeof value === "object") {
      for (const child of Object.values(value)) walk(child)
    }
  }
  walk(spec.vectors)
  return [...found]
}

function fuzz(count, seed0, pairs) {
  const base = vectors()
  let seed = seed0
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n)
  const pick = (list) => list[rnd(list.length)]
  const atoms = [";", "#", "%", "%3B", "%23", "%25", "%3b", "%2B", "+", "=", ":", "/", "@", ".", "..", "~", "{tmp}", "́", "‍",
    "﻿", " ", "１", "١", "A", "Z", "0", "00", "9007199254740993", "\r", "\n", "\t", " ", "é", "é", "K",
    "ﬁ", "\u{1F600}", "\u0000", " ", "ref:folder:a", "ref%3Afolder%3Aa", "sha256:" + "0".repeat(64), "none", "?", "&", "\\",
    "$", "*", "(?", "'", '"', "-", "_", "x-y=1"]
  const keys = ["state", "by", "over", "when", "path", "origin", "corpus", "x", "lines", "item", "para", "zz", "constructor"]
  const mutate = (text) => {
    const at = rnd(text.length + 1)
    switch (rnd(8)) {
      case 0: return text.slice(0, at) + pick(atoms) + text.slice(at)
      case 1: return text.slice(0, at) + text.slice(at + 1 + rnd(3))
      case 2: return text + ";" + pick(keys) + "=" + pick([pick(base).slice(0, 40), pick(atoms), "ref:folder:b"])
      case 3: return text + "#" + pick(["x", "a/b", ""]) + ";" + pick(keys) + "=" + pick(["1", "2,1", "1,2", pick(atoms)])
      case 4: return text.toUpperCase()
      case 5: {
        const [a, b] = [at, rnd(text.length + 1)].sort((x, y) => x - y)
        return text.slice(0, a) + text.slice(a, b).repeat(2) + text.slice(b)
      }
      case 6: return text.replace(/;([^;#]*);([^;#]*)/, ";$2;$1")
      default: return text.slice(0, at) + (text[at] ?? "").normalize("NFD") + text.slice(at + 1)
    }
  }
  const out = []
  for (let n = 0; n < count; n++) {
    let text = pick(base)
    for (let m = 1 + rnd(3); m > 0; m--) text = mutate(text)
    if (!text) continue
    out.push(text)
    if (pairs) out.push(rnd(3) === 0 ? pick(base) : mutate(text) || "ref:a:b")
  }
  return out
}

function marks() {
  const glue = ["́", "‍", "⃣"]
  const bases = ["ref:folder:a;M", "ref:folder:a;by=ref:folder:bM", "ref:folder:a#Mx", "ref:folder:a#x;Mlines=1", "ref:zz:aM;x=1",
    "ref:zz:a;x=1M", "ref:folder:a/M..", "ref:folder:a;path=/a/M..", "ref:folder:a;corpus=a/..M",
    "ref:folder:a;origin=https://example.com/a/b.gitM", "ref:url:example.com/..M", "ref:email:aM@example.com",
    "ref:folder:a#x;lines=1,M2", "ref:MX:a", "ref:1M:folder:a", "ref:folder:M:a", "ref:folder:aM#x", "ref:folder:a;x=M#y",
    "ref:folder:a;x=1;My=2", "ref:pkg:npm/aM@1", "ref:pkg:npm/a@1#M/x", "ref:folder:a;by=ref:folder:b%3BMx=1"]
  const out = bases.flatMap((base) => glue.map((mark) => base.replaceAll("M", mark)))
  out.push("ref:folder:a\r\n", "ref:zz:a\r\nb", "ref:folder:a;x=1\r\n", "ref:folder:a#x\r\n", "ref:folder:a\r")
  return out
}

const [mode, ...rest] = process.argv.slice(2)
const lines =
  mode === "vectors" ? vectors()
  : mode === "fuzz" ? fuzz(Number(rest[0]), Number(rest[1]), rest.includes("--pairs"))
  : mode === "marks" ? marks()
  : (console.error("usage: corpus.mjs vectors | fuzz <count> <seed> [--pairs] | marks"), process.exit(2))
process.stdout.write(lines.map(escape).join("\n") + "\n")
