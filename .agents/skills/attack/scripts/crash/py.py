# SPDX-License-Identifier: Apache-2.0
# Hostile-input battery for the Python port. Each line is OK, decl (RefIdError, or TypeError from a
# statically ill-typed call), typed (any error from a call labelled ill-typed) or ESCAPE (any other
# exception) — an ESCAPE is a finding.
#   uv run --directory python python ../.agents/skills/attack/scripts/crash/py.py
import os, sys, json, shutil, tempfile, hashlib
import ref_id
from ref_id import RefIdError

SCRATCH = tempfile.mkdtemp(prefix="ref-id-attack-py-")
# A result may hold a lone surrogate; printing it must never be what raises, or the harness reports itself.
sys.stdout.reconfigure(errors="backslashreplace")  # type: ignore[union-attr]

DECLARED = (RefIdError, TypeError)

def run(label, f):
    try:
        r = f()
        print(f"OK     {label}: {str(getattr(r, 'status', r))[:90]!s}")
    except DECLARED as e:
        print(f"decl   {label}: {type(e).__name__}: {str(e)[:90]}")
    except BaseException as e:
        # A call the type checker refuses ("ill-typed …") may fail any way it likes; it is never a finding.
        tag = "typed " if label.startswith("ill-typed") else "ESCAPE"
        print(f"{tag} {label}: {type(e).__name__}: {str(e)[:110]}")

deep = []
cur = deep
for _ in range(100_000):
    nxt = []
    cur.append(nxt)
    cur = nxt
run("canonicalise 100k-deep list", lambda: len(ref_id.canonicalise(deep)))
d = {}
cur = d
for _ in range(5000):
    cur["a"] = {}
    cur = cur["a"]
run("canonicalise 5k-deep dict", lambda: len(ref_id.canonicalise(d)))
cyc = []
cyc.append(cyc)
run("canonicalise cyclic list", lambda: ref_id.canonicalise(cyc))
run("canonicalise int key", lambda: ref_id.canonicalise({1: 2}))
run("canonicalise None key", lambda: ref_id.canonicalise({None: 2}))
run("canonicalise nan", lambda: ref_id.canonicalise(float("nan")))
run("canonicalise inf", lambda: ref_id.canonicalise(float("inf")))
run("canonicalise 2**53", lambda: ref_id.canonicalise(2**53))
run("canonicalise 10**5000", lambda: ref_id.canonicalise(10**5000))
run("canonicalise 1e16 float", lambda: ref_id.canonicalise(1e16))
run("canonicalise set", lambda: ref_id.canonicalise({1, 2}))
run("canonicalise bytes", lambda: ref_id.canonicalise(b"x"))
run("canonicalise lone surrogate", lambda: ref_id.canonicalise("\ud800"))
run("canonicalise split pair == astral", lambda: ref_id.canonicalise("😀") == ref_id.canonicalise("\U0001F600"))
run("canonicalise nonchar", lambda: ref_id.canonicalise("￿\U0010FFFF"))
run("canonicalise 1.0 == 1", lambda: ref_id.canonicalise([1.0, 1]))
run("canonicalise -0.0", lambda: ref_id.canonicalise(-0.0))
run("canonicalise bool subclass true key", lambda: ref_id.canonicalise({"a": True}))

run("digest lone surrogate", lambda: ref_id.digest(["\ud800"]))
run("digest split pair", lambda: ref_id.digest(["😀"]))
run("digest str", lambda: ref_id.digest("abc"))
run("digest non-str member", lambda: ref_id.digest([1]))
run("digest nonchar", lambda: ref_id.digest(["￿"]))
run("digest NFC vs NFD differ", lambda: ref_id.digest(["é"]) != ref_id.digest(["é"]))
class S(str): pass
run("digest str subclass", lambda: ref_id.digest([S("a")]))
run("digest list subclass", lambda: ref_id.digest(type("L", (list,), {})(["a"])))

for s in ["ref:folder:\ud800", "ref:folder:a;x=\ud800", "ref:folder:a#\udfff", "ref:folder:a;by=ref:folder:\ud800",
          "ref:folder:a\x00", "ref:" + "1" * 5000 + ":folder:a", "ref:" + "1" * 50000 + ":folder:a",
          "ref:folder:a#x;lines=" + "9" * 5000 + ",1", "ref:folder:a#x;lines=" + "9" * 50000 + ",1"]:
    run(f"parse {s[:40]!r}", lambda s=s: ref_id.parse(s))
    run(f"canonical_identifier {s[:30]!r}", lambda s=s: ref_id.canonical_identifier(s))
    run(f"serialise(parse) {s[:30]!r}", lambda s=s: ref_id.serialise(ref_id.parse(s)))
run("parse bytes", lambda: ref_id.parse(b"ref:a:b"))
run("ill-typed parse None", lambda: ref_id.parse(None))
run("covers None", lambda: ref_id.covers(None, "ref:a:b"))
run("relate int", lambda: ref_id.relate(1, "ref:a:b"))
run("verdict bytes", lambda: ref_id.verdict(b"ref:a:b", "ref:a:b"))
run("same_identifier None", lambda: ref_id.same_identifier(None, None))
run("canonical_identifier None", lambda: ref_id.canonical_identifier(None))
run("ill-typed serialise non-ParseResult", lambda: ref_id.serialise("ref:a:b"))

h = ref_id.digest(["ref:folder:a"])
rid = f"ref:folder:x;by={h}"
run("envelope ok", lambda: ref_id.validate_envelope(rid, {"id": rid, "sets": {"by": ["ref:folder:a"]}}).admissible)
run("envelope sets list", lambda: ref_id.validate_envelope(rid, {"id": rid, "sets": [["ref:folder:a"]]}).admissible)
run("envelope members tuple", lambda: ref_id.validate_envelope(rid, {"id": rid, "sets": {"by": ("ref:folder:a",)}}).admissible)
run("envelope requested int", lambda: ref_id.validate_envelope(5, {"id": 5}).admissible)
run("envelope requested None", lambda: ref_id.validate_envelope(None, {}).admissible)
run("envelope members lone surrogate", lambda: ref_id.validate_envelope(rid, {"id": rid, "sets": {"by": ["\ud800"]}}).to_json())
class EqAll(str):
    def __eq__(self, o): return True
    def __ne__(self, o): return False
    __hash__ = str.__hash__
run("envelope id EqAll", lambda: ref_id.validate_envelope(rid, {"id": EqAll("zzz"), "sets": {"by": ["ref:folder:a"]}}).admissible)
class D(dict):
    def get(self, k, default=None): return rid if k == "id" else {"by": ["ref:folder:a"]}
run("envelope dict subclass get", lambda: ref_id.validate_envelope(rid, D()).admissible)
run("envelope uppercase digest", lambda: ref_id.validate_envelope(rid.upper().replace("REF:FOLDER:X;BY=", "ref:folder:x;by="), {"id": rid.upper().replace("REF:FOLDER:X;BY=", "ref:folder:x;by="), "sets": {}}).to_json())
run("envelope digest in unknown key", lambda: ref_id.validate_envelope(f"ref:folder:x;zz={h}", {"id": f"ref:folder:x;zz={h}"}).to_json())
run("envelope digest in refinement", lambda: ref_id.validate_envelope(f"ref:folder:x#p;zz={h}", {"id": f"ref:folder:x#p;zz={h}"}).to_json())
run("envelope digest in unsupported version", lambda: ref_id.validate_envelope(f"ref:2:folder:x;by={h}", {"id": f"ref:2:folder:x;by={h}"}).to_json())
run("envelope digest on uncovered type", lambda: ref_id.validate_envelope(f"ref:zz:x;by={h}", {"id": f"ref:zz:x;by={h}"}).to_json())
run("envelope digest nested inside by", lambda: ref_id.validate_envelope(f"ref:folder:x;by=ref:folder:y%3Bover={h}", {"id": f"ref:folder:x;by=ref:folder:y%3Bover={h}"}).to_json())

# Build
B = ref_id.BuildParts
for label, parts in [
    ("locator with ;+mark", dict(type="folder", locator="a;́x=1")),
    ("qualifier value with ;", dict(type="folder", locator="a", qualifiers=(("x", "1;y=2"),))),
    ("qualifier value lone surrogate", dict(type="folder", locator="a", qualifiers=(("x", "\ud800"),))),
    ("qualifier key uppercase", dict(type="folder", locator="a", qualifiers=(("X", "1"),))),
    ("qualifier key with =", dict(type="folder", locator="a", qualifiers=(("x=y", "1"),))),
    ("nested deep", dict(type="folder", locator="a", qualifiers=(("by", ref_id.NestedValue("ref:folder:b;by=ref:folder:c")),))),
    ("type non-str", dict(type=5, locator="a")),
    ("qualifiers dict", dict(type="folder", locator="a", qualifiers={"x": "1"})),
    ("qualifiers None value", dict(type="folder", locator="a", qualifiers=(("x", None),))),
    ("fragment int", dict(type="folder", locator="a", fragment=5)),
]:
    def f(parts=parts):
        return ref_id.build(B(**parts))
    run(f"build {label}", f)

# Spec loader
good = os.path.join(os.path.dirname(ref_id.__file__), "spec")
text = open(os.path.join(good, "ref-id.json"), "rb").read()
side = open(os.path.join(good, "ref-id.json.sha256"), "rb").read()
def with_files(j, s):
    d = tempfile.mkdtemp(dir=SCRATCH)
    open(os.path.join(d, "ref-id.json"), "wb").write(j)
    open(os.path.join(d, "ref-id.json.sha256"), "wb").write(s)
    return lambda: ref_id.load_spec_from(d).spec_version()
run("spec good", with_files(text, side))
run("spec BOM", with_files(b"\xef\xbb\xbf" + text, side))
run("spec invalid utf8", with_files(text[:100] + b"\xff" + text[100:], side))
run("spec truncated", with_files(text[:1000], side))
run("spec NUL", with_files(text + b"\x00", side))
run("spec huge int 5000 digits", with_files(b'{"a":' + b"9" * 5000 + b"}", side))
run("spec deep nesting", with_files(b"[" * 100000 + b"]" * 100000, side))
run("spec sidecar uppercase", with_files(text, side.upper()))
run("spec sidecar extra ws", with_files(text, b"  \n" + side + b"\n\n "))
run("spec sidecar invalid utf8", with_files(text, b"\xff"))
run("spec CRLF inside", with_files(text.replace(b"\n", b"\r\n"), side))
run("spec NaN literal", with_files(b'{"a":NaN}', side))
run("spec dir missing", lambda: ref_id.load_spec_from("/nonexistent/x"))
run("spec path is file", lambda: ref_id.load_spec_from(__file__))
run("ill-typed spec path None", lambda: ref_id.load_spec_from(None))
# duplicate key: craft a spec whose sidecar matches last-wins
doc = json.loads(text)
dup = text.replace(b'"specVersion":', b'"specVersion": "9.0.0", "specVersion":', 1)
run("spec duplicate specVersion (first 9.0.0)", with_files(dup, side))
dup2 = text.replace(b'"specVersion":', b'"specVersion":' + json.dumps(doc["specVersion"]).encode() + b', "specVersion":', 1)
run("spec duplicate specVersion (same)", with_files(dup2, side))
