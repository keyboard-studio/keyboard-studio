#!/usr/bin/env python3
"""Green-band hygiene scanner for the keymanapp/keyboards corpus.

Encodes the *mechanically-checkable* subset of the green (deterministic) checks
in `docs/criteria.md` and flags, per keyboard, which ones fail. The point is to
find "known-rough" keyboards objectively -- a keyboard is **rough** when it
compiles and works but trips one or more green-band criteria (the negative cases
the future Layer-C linter will catch), as opposed to "clean" (passes criteria.md)
or "bad" (does not compile -- Layer A, out of scope here).

Run it over `experimental/` (held to a lower bar than `release/`, so the natural
reservoir of real hygiene issues):

    python content/tools/scan_hygiene.py c:/github/SIL_SummerProject/keyboards/experimental

It reuses the corpus walk, comment stripping, and mobile classifier from
`scan_features.py` (same directory) -- it does not reinvent them. Stdlib only.

Each flag cites its `criteria.md` section id (e.g. `7.3`) so the output maps
straight back to the catalog. Checks that need the compiler, a prior-version
baseline, or font-metadata parsing (2.6 strictly-greater, 7.8 no-warnings, 9.x
font licence) are intentionally OUT OF SCOPE for this static pass.

Outputs (into content/ by default):
    hygiene_report.csv   -- one row per (keyboard_id, criterion_id, severity, detail) failure
    hygiene_summary.md   -- keyboards ranked by failure count, with a per-criterion tally
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from collections import Counter, defaultdict

# Reuse the proven helpers from the sibling scanner (same directory on sys.path[0]
# when run as a script). Keeps the corpus walk / comment strip / mobile classifier
# single-sourced.
import scan_features as sf

# --- regexes for the static checks -----------------------------------------
KEYBOARDVERSION_RE = re.compile(r"store\(\s*&KEYBOARDVERSION\s*\)\s*['\"]([^'\"]*)['\"]", re.IGNORECASE)
BITMAP_RE = re.compile(r"store\(\s*&BITMAP\s*\)\s*['\"]([^'\"]*)['\"]", re.IGNORECASE)
# Explicit touch-platform tokens in a &TARGETS list (NOT counting bare `any`).
EXPLICIT_TOUCH_RE = re.compile(r"\b(mobile|tablet|phone|iphone|ipad|android|touch)\b", re.IGNORECASE)
# A HISTORY.md changelog heading: a line that STARTS (after optional 'v') with a
# dotted version token. Anchoring to line-start avoids grabbing a version out of
# prose ("Keyboard Layout Creator 1.4") or out of a parenth--sised "(v1.1)" note.
HISTORY_VERSION_LINE_RE = re.compile(r"(?im)^\s*v?(\d+(?:\.\d+)+)\b")
# PUA codepoints in `.kmn` output literals (informational in experimental/):
# a literal private-use char (BMP + planes 15/16), or a U+E000..U+F8FF escape.
PUA_RE = re.compile(r"[-\U000F0000-\U000FFFFD\U00100000-\U0010FFFD]"
                    r"|U\+(?:E[0-9A-Fa-f]{3}|F[0-8][0-9A-Fa-f]{2})")
# A populated .kvks has at least one <key ...> element.
KVKS_KEY_RE = re.compile(r"<key\b", re.IGNORECASE)
# §4.5 well-formed copyright line: literal "Copyright", a space-separated (c)/c,
# then a year. Looser glyph set than just "" so we accept (C)/(c) variants only
# when "Copyright" precedes -- the criterion requires the literal word + symbol.
COPYRIGHT_LINE_RE = re.compile(r"Copyright\s+©\s+\d{4}")
# §5.2 a version number embedded in user-facing text (conservative: needs the
# word "version" or a v-prefixed dotted number, to avoid matching dates/counts).
README_VERSION_RE = re.compile(r"(?i)\bversion\b\s*:?\s*v?\d+\.\d+|\bv\d+\.\d+(?:\.\d+)?\b")

SCRATCH_NAME_RE = re.compile(r"(?i)^(test+\w*\.txt|scratch.*|.*\.(bak|tmp|orig|swp))$")
DUP_TRACKED = {"welcome.htm", "readme.htm"}  # source files that must not be duplicated (1.9)
COMPILED_EXTS = (".kmx", ".kvk", ".kmp")  # outputs that must not ship in the source tree (1.12)
# Subdirs a .kmn may sit in below the keyboard's package root.
KMN_SUBDIRS = {"source", "extras"}


def line_of(text: str, needle_match: re.Match) -> int:
    """1-based line number of a regex match in text."""
    return text.count("\n", 0, needle_match.start()) + 1


def parse_version(v: str):
    """Parse a dotted-numeric version to a tuple of ints, trailing zeros trimmed,
    so 1.0 == 1.0.0 (notation-only differences collapse). A leading 'v' is
    tolerated. Returns None if `v` is not a clean numeric version."""
    v = v.strip()
    v = v[1:] if v[:1] in "vV" else v
    if not re.fullmatch(r"\d+(?:\.\d+)*", v):
        return None
    parts = [int(x) for x in v.split(".")]
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    return tuple(parts)


def history_top_version(history_text: str):
    """The highest version among the changelog's version-headed lines, as a
    (tuple, raw-string) pair, or (None, None). Taking the max handles both
    newest-first and oldest-first ordering without guessing."""
    best = None
    best_raw = None
    for m in HISTORY_VERSION_LINE_RE.finditer(history_text):
        parsed = parse_version(m.group(1))
        if parsed is not None and (best is None or parsed > best):
            best, best_raw = parsed, m.group(1)
    return best, best_raw


def keyboard_root(kmn_path: str) -> str:
    """The keyboard's package folder: walk up out of source/ or extras/ so docs
    (HISTORY.md, LICENSE.md) are found at the package root even for extras/ variants."""
    kmn_dir = os.path.dirname(kmn_path)
    if os.path.basename(kmn_dir).lower() in KMN_SUBDIRS:
        return os.path.dirname(kmn_dir)
    return kmn_dir


def list_files(root: str):
    """(basename, full_path, rel_to_root) for every file under a keyboard folder."""
    for dirpath, _dirs, names in os.walk(root):
        for name in names:
            full = os.path.join(dirpath, name)
            yield name, full, os.path.relpath(full, root).replace(os.sep, "/")


def check_keyboard(kmn_path: str, rel_base: str):
    """Run every static green-band check on one keyboard. Yields flag dicts."""
    kb_id = os.path.basename(kmn_path)[:-4]
    root = keyboard_root(kmn_path)
    kmn_text = sf.read_text(kmn_path)
    kmn_rel = os.path.relpath(kmn_path, rel_base).replace(os.sep, "/")

    files = list(list_files(root))
    basenames = Counter(n.lower() for n, _f, _r in files)

    def flag(crit, severity, detail):
        return {"keyboard_id": kb_id, "path": kmn_rel, "criterion": crit,
                "severity": severity, "detail": detail}

    # --- §1 repository hygiene ---------------------------------------------
    if "keyboard" in kb_id.lower():
        yield flag("1.6", "green", "keyboard id contains the redundant word 'keyboard'")
    for name, _full, rel in files:
        if name.lower() == "keyboard.info":
            yield flag("1.7", "green", "keyboard.info present (its data belongs in the .kps): %s" % rel)
        if name.lower().endswith(".kpj.user"):
            yield flag("1.11", "green", "committed user-state file: %s" % rel)
        if SCRATCH_NAME_RE.match(name):
            yield flag("1.13", "green", "stray scratch/temp file: %s" % rel)
    # 1.8 docs/ subfolder duplicating root docs
    docs_dir = os.path.join(root, "docs")
    if os.path.isdir(docs_dir):
        dupes = [n for n in os.listdir(docs_dir)
                 if n.upper() in ("HISTORY.MD", "README.MD", "INSTALL.MD")]
        if dupes:
            yield flag("1.8", "green", "docs/ subfolder duplicates root docs: %s" % ", ".join(sorted(dupes)))
    # 1.9 duplicate copies of a tracked source file
    for tracked in sorted(DUP_TRACKED):
        if basenames.get(tracked, 0) > 1:
            locs = [r for n, _f, r in files if n.lower() == tracked]
            yield flag("1.9", "green", "duplicate %s at: %s" % (tracked, "; ".join(sorted(locs))))
    # 1.12 compiled outputs committed in the source tree
    build_dir = os.path.join(root, "build")
    has_build = os.path.isdir(build_dir)
    committed = []
    for name, full, rel in files:
        if name.lower().endswith(COMPILED_EXTS):
            committed.append(rel)
        elif has_build and os.path.commonpath([build_dir, os.path.abspath(full)]) == build_dir:
            committed.append(rel)
    if committed:
        yield flag("1.12", "green", "compiled/build output in source tree: %s" % "; ".join(sorted(set(committed))[:5]))

    # --- §2 version format (keyboard version in the .kmn) ------------------
    mver = KEYBOARDVERSION_RE.search(kmn_text)
    kb_version = mver.group(1).strip() if mver else None
    if kb_version:
        ln = line_of(kmn_text, mver)
        if re.search(r"[A-Za-z]", kb_version):
            yield flag("2.5", "green", "version has a v-prefix/non-numeric label: '%s' (line %d)" % (kb_version, ln))
        elif any(re.fullmatch(r"0\d+", comp) for comp in kb_version.split(".")):
            yield flag("2.4", "green", "version component has a leading zero: '%s' (line %d)" % (kb_version, ln))
        elif not re.fullmatch(r"\d+(?:\.\d+)*", kb_version):
            yield flag("2.3", "green", "version is not dot-separated numeric: '%s' (line %d)" % (kb_version, ln))

    # --- §3 HISTORY.md ------------------------------------------------------
    history_path = os.path.join(root, "HISTORY.md")
    if not os.path.isfile(history_path):
        yield flag("3.1", "green", "HISTORY.md missing from the keyboard package folder")
    elif kb_version:
        htext = sf.read_text(history_path)
        top, top_raw = history_top_version(htext)
        kbv = parse_version(kb_version)
        # Only compare when both sides parse to a real version; otherwise stay
        # silent rather than risk a false positive on an unparseable changelog.
        if top is not None and kbv is not None and top != kbv:
            yield flag("3.6", "green",
                       "HISTORY.md top version '%s' != .kmn version '%s'" % (top_raw, kb_version))

    # --- §4 LICENSE.md ------------------------------------------------------
    license_path = os.path.join(root, "LICENSE.md")
    if not os.path.isfile(license_path):
        yield flag("4.1", "green", "LICENSE.md missing -- no copyright statement present")
    else:
        ltext = sf.read_text(license_path)
        if not COPYRIGHT_LINE_RE.search(ltext):
            yield flag("4.5", "green",
                       "LICENSE.md has no well-formed 'Copyright © <year> <holder>' line")

    # --- §5 README / §6 source docs ----------------------------------------
    # 5.2 version embedded in user-facing text (README.md, welcome.htm, readme.htm)
    for name, full, rel in files:
        low = name.lower()
        if low in ("readme.md", "welcome.htm", "readme.htm"):
            mv = README_VERSION_RE.search(sf.read_text(full))
            if mv:
                yield flag("5.2", "green",
                           "version number embedded in user-facing %s ('%s')" % (rel, mv.group(0).strip()))
    # §6 readme.htm / welcome.htm must exist somewhere under source/. The corpus
    # uses two layouts -- source/welcome.htm and source/welcome/welcome.htm -- so
    # search the whole source/ subtree, not just the flat path, to avoid false flags.
    src_rel_basenames = {n.lower() for n, _f, rel in files if rel.lower().startswith("source/")}
    has_source = any(rel.lower().startswith("source/") for _n, _f, rel in files)
    if has_source:
        for doc in ("readme.htm", "welcome.htm"):
            if doc not in src_rel_basenames:
                yield flag("6", "green", "%s missing from source/ (shown on package install)" % doc)

    # --- §7 source ----------------------------------------------------------
    mtargets = sf.TARGETS_RE.search(kmn_text)
    targets = re.sub(r"\s+", " ", mtargets.group(1).strip()) if mtargets else ""
    touch_path = os.path.join(os.path.dirname(kmn_path),
                              os.path.basename(kmn_path)[:-4] + ".keyman-touch-layout")
    if targets:
        toks = re.split(r"\s+", targets)
        if "any" in toks and len(toks) > 1:
            yield flag("7.2", "green", "targets lists platforms alongside 'any': '%s'" % targets)
        if EXPLICIT_TOUCH_RE.search(targets) and not os.path.isfile(touch_path):
            yield flag("7.3", "green", "targets names a touch platform but no .keyman-touch-layout exists: '%s'" % targets)
    mbitmap = BITMAP_RE.search(kmn_text)
    if mbitmap and os.path.basename(mbitmap.group(1)).lower().startswith("qaa"):
        yield flag("7.11", "green", "store(&BITMAP) points at template placeholder '%s' (line %d)"
                   % (mbitmap.group(1), line_of(kmn_text, mbitmap)))
    # 7.18 blank .kvks
    for name, full, rel in files:
        if name.lower().endswith(".kvks"):
            ktext = sf.read_text(full)
            if not KVKS_KEY_RE.search(ktext):
                yield flag("7.18", "green", "on-screen keyboard .kvks is blank (no <key> elements): %s" % rel)

    # --- §13 encoding (informational in experimental/) ---------------------
    stripped = sf.COMMENT_RE.sub(r"\1", kmn_text)
    if PUA_RE.search(stripped):
        yield flag("13.1", "info", "uses PUA codepoints (allowed in experimental/; must carry PUA notices)")


def scan(roots):
    rows = []
    for root in roots:
        rel_base = os.path.dirname(os.path.abspath(root))
        for kmn_path in sf.walk_kmn(root):
            rows.extend(check_keyboard(kmn_path, rel_base))
    return rows


def build_summary(rows, n_keyboards, elapsed):
    by_kb = defaultdict(list)
    for r in rows:
        by_kb[r["keyboard_id"]].append(r)
    crit_tally = Counter(r["criterion"] for r in rows if r["severity"] == "green")
    green_kbs = {kb for kb, fs in by_kb.items() if any(f["severity"] == "green" for f in fs)}

    def green_count(fs):
        return sum(1 for f in fs if f["severity"] == "green")

    ranked = sorted(by_kb.items(), key=lambda kv: (green_count(kv[1]), len(kv[1])), reverse=True)

    lines = []
    lines.append("# Corpus hygiene scan (auto-generated)")
    lines.append("")
    lines.append(
        "Generated by `content/tools/scan_hygiene.py`. A static, deterministic pass over the "
        "green-band (mechanically-checkable) checks in [docs/criteria.md](../docs/criteria.md). "
        "A keyboard is flagged **rough** when it trips one or more green criteria. PUA use (13.1) "
        "is reported as *info* only -- it is allowed in `experimental/`. Checks needing the "
        "compiler, a version baseline, or font metadata are out of scope for this pass."
    )
    lines.append("")
    lines.append("## Scan stats")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append("| Keyboards (.kmn) scanned | %d |" % n_keyboards)
    lines.append("| Keyboards with >=1 green flag | %d |" % len(green_kbs))
    lines.append("| Total green flags | %d |" % sum(crit_tally.values()))
    lines.append("| Scan time (s) | %.1f |" % elapsed)
    lines.append("")
    lines.append("## Flags per criterion (green only)")
    lines.append("")
    lines.append("| Criterion | Flags |")
    lines.append("|---|---|")
    for crit, n in sorted(crit_tally.items(), key=lambda kv: kv[1], reverse=True):
        lines.append("| %s | %d |" % (crit, n))
    lines.append("")
    lines.append("## Roughest keyboards (by green-flag count)")
    lines.append("")
    lines.append("| Keyboard | Green flags | Criteria tripped | Path |")
    lines.append("|---|---|---|---|")
    for kb, fs in ranked:
        g = green_count(fs)
        if g == 0:
            continue
        crits = ", ".join(sorted({f["criterion"] for f in fs if f["severity"] == "green"}))
        path = fs[0]["path"]
        lines.append("| %s | %d | %s | %s |" % (kb, g, crits, path))
    lines.append("")
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Green-band hygiene scanner for the keyboards corpus.")
    parser.add_argument("corpus_path", nargs="+", help="Corpus root(s) to scan (e.g. the experimental/ tree).")
    parser.add_argument("--out-dir", default=None,
                        help="Directory for the outputs (default: the content/ dir two levels above this script).")
    args = parser.parse_args(argv)

    roots = args.corpus_path
    for root in roots:
        if not os.path.isdir(root):
            print("[ERROR] corpus path is not a directory: %s" % root)
            return 2

    out_dir = args.out_dir or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(out_dir, exist_ok=True)

    print("[OK] scanning %s ..." % ", ".join(roots))
    start = time.time()
    rows = scan(roots)
    elapsed = time.time() - start
    n_all = sum(1 for root in roots for _ in sf.walk_kmn(root))

    report_csv = os.path.join(out_dir, "hygiene_report.csv")
    md_path = os.path.join(out_dir, "hygiene_summary.md")
    sf.write_csv([[r["keyboard_id"], r["path"], r["criterion"], r["severity"], r["detail"]] for r in rows],
                 ["keyboard_id", "path", "criterion", "severity", "detail"], report_csv)
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(build_summary(rows, n_all, elapsed))

    green = sum(1 for r in rows if r["severity"] == "green")
    print("[OK] scanned %d .kmn in %.1fs" % (n_all, elapsed))
    print("[OK] %d green flags across %d keyboards (%d info flags)"
          % (green, len({r["keyboard_id"] for r in rows if r["severity"] == "green"}),
             sum(1 for r in rows if r["severity"] == "info")))
    print("[OK] wrote %s (%d rows)" % (report_csv, len(rows)))
    print("[OK] wrote %s" % md_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
