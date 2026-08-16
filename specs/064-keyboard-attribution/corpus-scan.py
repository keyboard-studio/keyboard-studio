#!/usr/bin/env python3
"""Harvest real-world copyright/license shapes from the keyboards repo.

Evidence base for specs/064-keyboard-attribution/spec.md. Re-run to refresh the
findings quoted there, and to harvest the parser fixture table required by FR-014
(fixtures must come from the real corpus, not be hand-invented).

Usage:  python3 corpus-scan.py            # expects a keymanapp/keyboards clone
Set ROOT below if the clone is not at /home/user/keyboards.
Committed output: corpus-scan.out.txt

Produces the fixture distribution the parser must handle, plus evidence for the
"license body is a constant" premise.
"""
import re
import sys
import json
import hashlib
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path("/home/user/keyboards")

# Deliberately permissive: we want to SEE the variation, not enforce a shape.
COPYRIGHT_LINE = re.compile(
    r"^\s*(?:#+\s*)?copyright\b(.*)$", re.IGNORECASE
)
# Symbol / word forms of the copyright marker
SYM = re.compile(r"\(c\)|\(C\)|©|&copy;|\bCopr\.|\(©\)")
YEARS = re.compile(r"(1[89]\d{2}|20\d{2})")
RANGE = re.compile(r"(1[89]\d{2}|20\d{2})\s*[-–—]\s*(1[89]\d{2}|20\d{2})")
COMMA_YEARS = re.compile(r"(1[89]\d{2}|20\d{2})\s*,\s*(1[89]\d{2}|20\d{2})")

MIT_PROBE = "Permission is hereby granted, free of charge"


def marker_style(line: str) -> str:
    if "©" in line or "&copy;" in line:
        return "©"
    if "(c)" in line:
        return "(c)"
    if "(C)" in line:
        return "(C)"
    return "bare 'Copyright'"


def year_style(line: str) -> str:
    if RANGE.search(line):
        return "range (2016-2021)"
    if COMMA_YEARS.search(line):
        return "comma list (2016, 2019)"
    n = len(YEARS.findall(line))
    if n == 1:
        return "single year"
    if n == 0:
        return "NO YEAR"
    return f"multiple years ({n})"


def holder_of(line: str) -> str:
    """Strip 'Copyright', marker, and years to leave the holder."""
    s = re.sub(r"^\s*(?:#+\s*)?copyright\b", "", line, flags=re.IGNORECASE)
    s = SYM.sub("", s)
    s = RANGE.sub("", s)
    s = YEARS.sub("", s)
    s = s.replace("&copy;", "")
    s = re.sub(r"^[\s,.:;–—-]+", "", s)
    s = re.sub(r"[\s,.]+$", "", s)
    return s.strip()


def scan_licenses(tier: str):
    rows = []
    for p in sorted((ROOT / tier).rglob("LICENSE.md")):
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:  # noqa
            rows.append({"path": str(p), "error": str(e)})
            continue
        lines = [ln for ln in text.splitlines() if COPYRIGHT_LINE.match(ln)]
        body = text
        # normalise the license body by removing copyright lines + whitespace
        body_wo = "\n".join(
            ln for ln in text.splitlines() if not COPYRIGHT_LINE.match(ln)
        )
        body_norm = re.sub(r"\s+", " ", body_wo).strip()
        rows.append(
            {
                "path": str(p.relative_to(ROOT)),
                "n_copyright_lines": len(lines),
                "lines": lines,
                "is_mit": MIT_PROBE.lower() in text.lower(),
                "body_hash": hashlib.sha1(body_norm.encode()).hexdigest()[:12],
                "body_len": len(body_norm),
            }
        )
    return rows


def scan_kmn():
    out = []
    pat = re.compile(
        r"store\s*\(\s*&?\s*copyright\s*\)\s*(['\"])(.*?)\1",
        re.IGNORECASE | re.DOTALL,
    )
    for p in sorted((ROOT / "release").rglob("*.kmn")):
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        m = pat.search(text)
        out.append(
            {
                "path": str(p.relative_to(ROOT)),
                "value": m.group(2).strip() if m else None,
            }
        )
    return out


def main():
    rel = scan_licenses("release")
    leg = scan_licenses("legacy")
    exp = scan_licenses("experimental")
    kmn = scan_kmn()

    print("=" * 72)
    print("LICENSE.md — release tier")
    print("=" * 72)
    print(f"total files:                 {len(rel)}")
    zero = [r for r in rel if r.get("n_copyright_lines") == 0]
    one = [r for r in rel if r.get("n_copyright_lines") == 1]
    multi = [r for r in rel if (r.get("n_copyright_lines") or 0) > 1]
    print(f"  0 copyright lines:         {len(zero)}   <-- parser must handle")
    print(f"  1 copyright line:          {len(one)}")
    print(f"  2+ copyright lines:        {len(multi)}   <-- already multi-holder")
    print(f"non-MIT body:                {len([r for r in rel if not r.get('is_mit')])}")

    print()
    print("--- 'license body is a constant'? distinct bodies (copyright stripped) ---")
    bodies = Counter(r["body_hash"] for r in rel if "body_hash" in r)
    print(f"distinct normalised bodies:  {len(bodies)}")
    for h, c in bodies.most_common(8):
        sample = next(r for r in rel if r.get("body_hash") == h)
        print(f"  {c:4d} files  hash {h}  len {sample['body_len']}  e.g. {sample['path']}")

    print()
    print("--- marker style ---")
    ms = Counter()
    ys = Counter()
    holders = Counter()
    for r in rel:
        for ln in r.get("lines", []):
            ms[marker_style(ln)] += 1
            ys[year_style(ln)] += 1
            holders[holder_of(ln)] += 1
    for k, v in ms.most_common():
        print(f"  {v:5d}  {k}")
    print()
    print("--- year style ---")
    for k, v in ys.most_common():
        print(f"  {v:5d}  {k}")

    print()
    print("--- top 15 holders (as written) ---")
    for k, v in holders.most_common(15):
        print(f"  {v:5d}  {k!r}")

    print()
    print("--- SIL naming split ---")
    sil = {k: v for k, v in holders.items() if "sil" in k.lower()}
    for k, v in sorted(sil.items(), key=lambda x: -x[1])[:12]:
        print(f"  {v:5d}  {k!r}")

    print()
    print("--- multi-holder examples (the fork chain the proposal targets) ---")
    for r in multi[:8]:
        print(f"  {r['path']}  ({r['n_copyright_lines']} lines)")
        for ln in r["lines"]:
            print(f"      {ln.strip()}")

    print()
    print("--- files with NO copyright line ---")
    for r in zero[:10]:
        print(f"  {r['path']}")
    if len(zero) > 10:
        print(f"  ... and {len(zero)-10} more")

    print()
    print("=" * 72)
    print(".kmn store(&COPYRIGHT) — release tier")
    print("=" * 72)
    have = [k for k in kmn if k["value"]]
    print(f"total .kmn:                  {len(kmn)}")
    print(f"  with COPYRIGHT store:      {len(have)}")
    print(f"  without:                   {len(kmn)-len(have)}")
    kms = Counter(marker_style(k["value"]) for k in have)
    kys = Counter(year_style(k["value"]) for k in have)
    print("  marker style:")
    for k, v in kms.most_common():
        print(f"    {v:5d}  {k}")
    print("  year style:")
    for k, v in kys.most_common():
        print(f"    {v:5d}  {k}")
    print("  samples:")
    for k in have[:6]:
        print(f"    {k['value']!r}")

    print()
    print("--- LICENSE.md holder vs .kmn COPYRIGHT: do they agree? ---")
    # map keyboard dir -> license holders and kmn value
    lic_by_dir = {}
    for r in rel:
        d = str(Path(r["path"]).parent)
        hs = [holder_of(ln) for ln in r.get("lines", [])]
        if hs:
            lic_by_dir[d] = hs
    agree = disagree = only_one = 0
    examples = []
    for k in have:
        d = str(Path(k["path"]).parent.parent)  # source/x.kmn -> keyboard dir
        hs = lic_by_dir.get(d)
        if not hs:
            only_one += 1
            continue
        kh = holder_of(k["value"])
        if any(kh and kh.lower() in h.lower() or h.lower() in kh.lower() for h in hs if h):
            agree += 1
        else:
            disagree += 1
            if len(examples) < 6:
                examples.append((d, hs, k["value"]))
    print(f"  agree:      {agree}")
    print(f"  DISAGREE:   {disagree}")
    print(f"  no license pair: {only_one}")
    for d, hs, kv in examples:
        print(f"    {d}")
        print(f"      LICENSE: {hs}")
        print(f"      .kmn:    {kv!r}")

    print()
    print("=" * 72)
    print("other tiers (context)")
    print("=" * 72)
    print(f"legacy LICENSE.md:       {len(leg)}  (non-MIT: {len([r for r in leg if not r.get('is_mit')])})")
    print(f"experimental LICENSE.md: {len(exp)}  (non-MIT: {len([r for r in exp if not r.get('is_mit')])})")


if __name__ == "__main__":
    main()
