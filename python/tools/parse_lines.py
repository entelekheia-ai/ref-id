# SPDX-License-Identifier: Apache-2.0
"""The line protocol every implementation speaks, for the Python port.

Reads one identifier per line on stdin, with `\\n` and `\\r` escaped as the two characters `\\n` and
`\\r`, and prints one canonical JSON result per line: the `ParseResult` without `nested` and `delegated`,
without `canonical` unless `--canonical` is passed, and with `serialised` when serialisation succeeds. A
parse that raises prints `{"threw": …}` and makes the exit status 1.

`--pairs` reads two lines per pair, `a` then `b`, and prints one line per pair: `covers`,
`coversReversed` (`covers(b, a)`), `samePackage`, `sameIdentifier`, `relate` and `verdict` (each the full
result or `null`). An odd number of lines is refused with exit status 1.

It lives beside the package, never inside it, so it never reaches `ref_id.__all__`. Run it from the
repository root as `uv run --directory python python tools/parse_lines.py [--canonical | --pairs]`.
"""

from __future__ import annotations

import sys

import ref_id


def _unescape(line: str) -> str:
    return line.replace("\\n", "\n").replace("\\r", "\r")


def _json(value: object) -> object:
    to_json = getattr(value, "to_json", None)
    return to_json() if callable(to_json) else value


def _pairs(lines: list[str]) -> int:
    if len(lines) % 2 != 0:
        print(f"parse_lines --pairs: {len(lines)} lines is not an even number of lines (two per pair)", file=sys.stderr)
        return 1
    for index in range(0, len(lines), 2):
        a, b = _unescape(lines[index]), _unescape(lines[index + 1])
        row = {
            "covers": ref_id.covers(a, b),
            "coversReversed": ref_id.covers(b, a),
            "samePackage": ref_id.same_package(a, b),
            "sameIdentifier": ref_id.same_identifier(a, b),
            "relate": _json(ref_id.relate(a, b)),
            "verdict": _json(ref_id.verdict(a, b)),
        }
        sys.stdout.write(ref_id.canonicalise(row) + "\n")
    return 0


def _parse(lines: list[str], with_canonical: bool) -> int:
    failures = 0
    for line in lines:
        try:
            result = ref_id.parse(_unescape(line))
        except Exception as error:  # the protocol reports any escape as a row, never a crash
            failures += 1
            sys.stdout.write(ref_id.canonicalise({"threw": f"{type(error).__name__}: {error}"}) + "\n")
            continue
        row = result.to_json()
        row.pop("nested", None)
        row.pop("delegated", None)
        if not with_canonical:
            row.pop("canonical", None)
        try:
            row["serialised"] = ref_id.serialise(result)
        except ref_id.RefIdError:
            pass  # a result the serialiser refuses carries no `serialised` field, as in the other ports
        sys.stdout.write(ref_id.canonicalise(row) + "\n")
    return 0 if failures == 0 else 1


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="surrogatepass")  # type: ignore[union-attr]
    text = sys.stdin.buffer.read().decode("utf-8", errors="surrogatepass")
    lines = [line for line in text.split("\n") if line]
    if "--pairs" in sys.argv:
        return _pairs(lines)
    return _parse(lines, "--canonical" in sys.argv)


if __name__ == "__main__":
    sys.exit(main())
