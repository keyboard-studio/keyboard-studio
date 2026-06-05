#!/usr/bin/env python3
"""Feature scanner + mobile-keyboard classifier for the keymanapp/keyboards corpus.

Two analyses over one walk of the corpus:

1. `.kmn` primitive frequency -- cheap, anchored-regex counts of how often each
   Keyman primitive appears, to prioritize the pattern catalog. It does NOT parse
   `.kmn` properly; naive regexes are intentionally cheap.

2. Mobile-keyboard classification -- a port of `keyboards/tools/classify-mobile.js`.
   Each keyboard is given a verdict:
     DESKTOP_ONLY     - &TARGETS has no touch platform, or no .keyman-touch-layout.
     DEFAULT_SCAFFOLD - a touch layout exists but is essentially Keyman Developer's
                        auto-generated default (longpress only on the default
                        punctuation/bracket/modifier keys). Not real mobile work.
     DEVELOPED        - a hand-edited mobile layout (phone OR tablet): at least one
                        longpress on a non-default key (a letter/number), OR a flick.
                        Platform blocks are not a signal; multitap is reported but not
                        used (Keyman can auto-generate it on the number row).

See content/tools/README.md for usage. Stdlib only -- no third-party dependencies.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict

# --- .kmn primitives -------------------------------------------------------
# Map: primitive label -> compiled regex. The label is what lands in the CSV.
# Anchored / word-boundary patterns keep us from matching substrings inside
# identifiers (e.g. "anywhere" should not count as `any(`).
_KMN_PATTERNS = {
    "any(": r"\bany\(",
    "deadkey(": r"\bdeadkey\(",
    "dk(": r"\bdk\(",
    "use(": r"\buse\(",
    "store(": r"\bstore\(",
    "context": r"\bcontext\b",
    "platform(": r"\bplatform\(",
    "if(": r"\bif\(",
    "set(": r"\bset\(",
    "match": r"\bmatch\b",
    "nomatch": r"\bnomatch\b",
    "notany(": r"\bnotany\(",
    "index(": r"\bindex\(",
    "outs(": r"\bouts\(",
    "beep": r"\bbeep\b",
    "nul": r"\bnul\b",
    "K_LOPT": r"K_LOPT",
    "K_ROPT": r"K_ROPT",
    "K_ALT": r"K_ALT",
    "K_LCTRL": r"K_LCTRL",
    "caps": r"\bcaps\b",
    "notcaps": r"\bnotcaps\b",
}
KMN_REGEXES = {label: re.compile(pat, re.IGNORECASE) for label, pat in _KMN_PATTERNS.items()}

# Strip Keyman comments before counting so commented-out rules and prose do not
# inflate the numbers. In .kmn a `c` token starts a comment to end of line when it
# sits at the start of a line or after whitespace and is followed by whitespace or
# end of line (so `context`/`caps`/`nomatch` are NOT treated as comments). The
# captured boundary char is preserved on substitution; full-line and first-line
# comments are handled via the `^` alternation.
COMMENT_RE = re.compile(r"(?m)(^|[^\S\n])c(?=[^\S\n]|$)[^\n]*$")

# --- mobile classification (ported from keyboards/tools/classify-mobile.js) --
# A &TARGETS value mentioning any of these substrings targets a touch platform.
TOUCH_RE = re.compile(r"any|web|mobile|tablet|phone|iphone|ipad|android", re.IGNORECASE)
# Parse the (single/double-quoted) &TARGETS and &LAYOUTFILE store values.
TARGETS_RE = re.compile(r"store\(\s*&TARGETS\s*\)\s*['\"]([^'\"]*)['\"]", re.IGNORECASE)
LAYOUTFILE_RE = re.compile(r"store\(\s*&LAYOUTFILE\s*\)", re.IGNORECASE)
# Keys whose longpress is part of the auto-generated default (punctuation /
# brackets / modifiers, plus their Unicode-id equivalents). Longpress on these
# does NOT count as customization.
DEFAULT_SK = frozenset({
    "K_PERIOD", "K_LBRKT", "K_RBRKT", "K_SLASH", "K_HYPHEN", "K_QUOTE", "K_COMMA",
    "K_LCONTROL", "K_RCONTROL", "K_SHIFT", "K_BKSLASH", "K_EQUAL",
    "U_002E", "U_005B", "U_005D", "U_005C", "U_002C", "U_002F", "U_0027",
})

VERDICTS = ("DEVELOPED", "DEFAULT_SCAFFOLD", "DESKTOP_ONLY")


def read_text(path: str) -> str:
    """Read a file as UTF-8, tolerating bad bytes (corpus has mixed encodings)."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def count_kmn_primitives(text: str) -> Counter:
    # Substitute back the captured boundary char (group 1) so adjacent tokens are
    # not glued together when a comment is removed.
    stripped = COMMENT_RE.sub(r"\1", text)
    counts = Counter()
    for label, regex in KMN_REGEXES.items():
        n = len(regex.findall(stripped))
        if n:
            counts[label] = n
    return counts


def analyze_touch_layout(path: str) -> dict:
    """Analyze a .keyman-touch-layout for mobile-development signals.

    Mirrors classify-mobile.js analyzeTouch(): counts longpress (`sk`) on keys
    outside DEFAULT_SK, plus flick/multitap presence, and records platforms/layers.
    """
    blank = {"ok": False, "platforms": [], "layers": [], "sk_nondefault": 0,
             "flick": 0, "multitap": 0, "has_phone": False}
    try:
        data = json.loads(read_text(path))
    except (json.JSONDecodeError, ValueError):
        return blank
    if not isinstance(data, dict):
        return blank

    platforms = list(data.keys())
    layer_ids = []
    sk_nondefault = flick = multitap = 0
    for plat in data.values():
        if not isinstance(plat, dict):
            continue
        for layer in plat.get("layer", []) or []:
            if not isinstance(layer, dict):
                continue
            if layer.get("id") is not None and layer["id"] not in layer_ids:
                layer_ids.append(layer["id"])
            for row in layer.get("row", []) or []:
                if not isinstance(row, dict):
                    continue
                for key in row.get("key", []) or []:
                    if not isinstance(key, dict):
                        continue
                    if isinstance(key.get("sk"), list) and key.get("id") not in DEFAULT_SK:
                        sk_nondefault += 1
                    if key.get("flick"):
                        flick += 1
                    if isinstance(key.get("multitap"), list):
                        multitap += 1
    return {"ok": True, "platforms": platforms, "layers": layer_ids,
            "sk_nondefault": sk_nondefault, "flick": flick, "multitap": multitap,
            "has_phone": "phone" in platforms}


def classify_mobile(kmn_text: str, touch_path: str) -> dict:
    """Classify one keyboard (from its .kmn text + expected touch-layout path).

    Returns a record with the columns classify-mobile.js emits plus the verdict.
    """
    m = TARGETS_RE.search(kmn_text)
    targets = re.sub(r"\s+", " ", m.group(1).strip()) if m else "(none)"
    touch_target = bool(TOUCH_RE.search(targets))
    layoutfile = bool(LAYOUTFILE_RE.search(kmn_text))
    has_touch_file = os.path.isfile(touch_path)
    a = analyze_touch_layout(touch_path) if has_touch_file else {
        "platforms": [], "layers": [], "sk_nondefault": 0, "flick": 0,
        "multitap": 0, "has_phone": False}

    # Platform blocks (phone vs tablet) are NOT a signal -- they only reflect which
    # era's default scaffold the keyboard started from. multitap is reported but not
    # used (Keyman can auto-generate it on the number row). A non-default longpress or
    # a flick is a deliberate hand-edit on either form factor. (Matches classify-mobile.js.)
    if not has_touch_file or not touch_target:
        verdict = "DESKTOP_ONLY"
    elif a["sk_nondefault"] >= 1 or a["flick"] > 0:
        verdict = "DEVELOPED"
    else:
        verdict = "DEFAULT_SCAFFOLD"

    return {
        "targets": targets,
        "touch_target": "yes" if touch_target else "no",
        "layoutfile": "yes" if layoutfile else "no",
        "touch_file": "yes" if has_touch_file else "no",
        "platforms": "+".join(a["platforms"]),
        "layers": "|".join(str(x) for x in a["layers"]),
        "nondefault_longpress": a["sk_nondefault"],
        "flick": a["flick"],
        "multitap": a["multitap"],
        "verdict": verdict,
    }


def walk_kmn(root: str):
    """Yield every `.kmn` file path under `root`, skipping build/ output dirs.
    Matches classify-mobile.js's walk(): keyboard-file-centric, not source-dir."""
    for dirpath, dirnames, filenames in os.walk(root):
        if "build" in dirnames:
            dirnames.remove("build")
        for name in filenames:
            if name.endswith(".kmn"):
                yield os.path.join(dirpath, name)


def scan(roots):
    """Scan one or more corpus roots. Returns (prim_rows, mobile_rows, stats)."""
    per_keyboard: dict[str, Counter] = defaultdict(Counter)
    file_counts = Counter()
    verdict_tally = Counter()
    mobile_rows = []

    for root in roots:
        # repo-relative paths in the mobile report (e.g. "release/a/akan/source/..")
        rel_base = os.path.dirname(os.path.abspath(root))
        for kmn_path in walk_kmn(root):
            file_counts["kmn"] += 1
            base = os.path.basename(kmn_path)[:-4]  # strip ".kmn"
            text = read_text(kmn_path)
            per_keyboard[base].update(count_kmn_primitives(text))

            touch_path = os.path.join(os.path.dirname(kmn_path), base + ".keyman-touch-layout")
            rec = classify_mobile(text, touch_path)
            if rec["touch_file"] == "yes":
                file_counts["touch"] += 1
            verdict_tally[rec["verdict"]] += 1
            if rec["verdict"] == "DEVELOPED":
                per_keyboard[base]["mobile:developed"] += 1
            rel = os.path.relpath(kmn_path, rel_base).replace(os.sep, "/")
            # Sort key = native absolute path, matching classify-mobile.js (which
            # sorts os-native paths before emitting forward-slash relative paths).
            mobile_rows.append((os.path.abspath(kmn_path), [
                base, rel, rec["targets"], rec["touch_target"], rec["layoutfile"],
                rec["touch_file"], rec["platforms"], rec["layers"],
                rec["nondefault_longpress"], rec["flick"], rec["multitap"], rec["verdict"],
            ]))

    prim_rows = []
    for kb_id in sorted(per_keyboard):
        for primitive, count in sorted(per_keyboard[kb_id].items()):
            if count > 0:
                prim_rows.append((kb_id, primitive, count))

    mobile_rows.sort(key=lambda r: r[0])  # by native abspath, matching classify-mobile.js
    mobile_rows = [row for _key, row in mobile_rows]
    stats = {
        "per_keyboard": per_keyboard,
        "file_counts": file_counts,
        "verdict_tally": verdict_tally,
        "kmn_count": file_counts["kmn"],
    }
    return prim_rows, mobile_rows, stats


def write_csv(rows, header, out_path: str) -> None:
    # LF line endings to match classify-mobile.js output for clean diffing.
    with open(out_path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def build_summary(stats, top_n: int, elapsed: float) -> str:
    per_keyboard = stats["per_keyboard"]
    file_counts = stats["file_counts"]
    verdict_tally = stats["verdict_tally"]

    # Aggregate occurrence totals and how many keyboards use each primitive.
    total_occurrences = Counter()
    keyboards_using = Counter()
    for counts in per_keyboard.values():
        for primitive, count in counts.items():
            total_occurrences[primitive] += count
            keyboards_using[primitive] += 1

    kmn_labels = set(KMN_REGEXES)

    lines = []
    lines.append("# Corpus feature scan (auto-generated)")
    lines.append("")
    lines.append(
        "Generated by `content/tools/scan_features.py`. A cheap grep-based frequency scan "
        "of the keymanapp/keyboards corpus plus a mobile-keyboard classification (ported "
        "from `keyboards/tools/classify-mobile.js`). It is separate from "
        "`content/scan_report.md`, which is a different hand-written catalog of 22 keyboards."
    )
    lines.append("")
    lines.append("## Scan stats")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append("| Keyboards (.kmn) scanned | %d |" % stats["kmn_count"])
    lines.append("| Scan time (s) | %.1f |" % elapsed)
    lines.append("")

    # Mobile-keyboard classification.
    total = sum(verdict_tally.values())
    developed = verdict_tally["DEVELOPED"]
    lines.append("## Mobile keyboard classification")
    lines.append("")
    lines.append(
        "Ported from `keyboards/tools/classify-mobile.js`. A keyboard is **DEVELOPED** "
        "(a hand-edited mobile keyboard, phone or tablet) when it targets a touch platform, "
        "ships a `.keyman-touch-layout`, and adds a deliberate edit -- at least one longpress "
        "on a non-default key (a letter/number), or a flick. **DEFAULT_SCAFFOLD** is the "
        "untouched Keyman default; **DESKTOP_ONLY** has no mobile target/layout."
    )
    lines.append("")
    lines.append("| Verdict | Keyboards |")
    lines.append("|---|---|")
    lines.append("| **DEVELOPED** | **%d** |" % developed)
    lines.append("| DEFAULT_SCAFFOLD | %d |" % verdict_tally["DEFAULT_SCAFFOLD"])
    lines.append("| DESKTOP_ONLY | %d |" % verdict_tally["DESKTOP_ONLY"])
    lines.append("| Total | %d |" % total)
    lines.append("")

    # Top-N .kmn primitives by how many keyboards use each (ties broken by
    # total occurrences).
    lines.append("## Top %d .kmn primitives (by keyboards using)" % top_n)
    lines.append("")
    lines.append("| Primitive | Keyboards using | Total occurrences |")
    lines.append("|---|---|---|")
    kmn_ranked = sorted(
        ((p, keyboards_using[p], total_occurrences[p]) for p in total_occurrences if p in kmn_labels),
        key=lambda x: (x[1], x[2]),
        reverse=True,
    )
    for primitive, kb_using, total_occ in kmn_ranked[:top_n]:
        lines.append("| `%s` | %d | %d |" % (primitive, kb_using, total_occ))
    lines.append("")

    return "\n".join(lines) + "\n"


MOBILE_HEADER = ["keyboard", "path", "targets", "touch_target", "layoutfile", "touch_file",
                 "platforms", "layers", "nondefault_longpress", "flick", "multitap", "verdict"]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Feature scanner + mobile classifier for the keyboards corpus."
    )
    parser.add_argument(
        "corpus_path", nargs="+",
        help="One or more corpus roots to scan (e.g. the release/ and experimental/ "
        "trees). To reproduce classify-mobile.js's count, pass both.",
    )
    parser.add_argument(
        "--top", type=int, default=20, help="Number of top primitives in the summary (default 20)."
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Directory for the CSV/markdown outputs "
        "(default: the content/ dir two levels above this script).",
    )
    args = parser.parse_args(argv)

    roots = args.corpus_path
    for root in roots:
        if not os.path.isdir(root):
            print("[ERROR] corpus path is not a directory: %s" % root)
            return 2

    if args.out_dir:
        out_dir = args.out_dir
    else:
        # content/tools/scan_features.py -> content/
        out_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(out_dir, exist_ok=True)

    print("[OK] scanning %s ..." % ", ".join(roots))
    start = time.time()
    prim_rows, mobile_rows, stats = scan(roots)
    elapsed = time.time() - start

    report_csv = os.path.join(out_dir, "scan_report.csv")
    mobile_csv = os.path.join(out_dir, "mobile_layout_report.csv")
    md_path = os.path.join(out_dir, "scan_summary.md")
    write_csv(prim_rows, ["keyboard_id", "primitive", "count"], report_csv)
    write_csv(mobile_rows, MOBILE_HEADER, mobile_csv)
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(build_summary(stats, args.top, elapsed))

    vt = stats["verdict_tally"]
    print("[OK] scanned %d .kmn in %.1fs" % (stats["kmn_count"], elapsed))
    print("[OK] mobile verdicts: DEVELOPED=%d DEFAULT_SCAFFOLD=%d DESKTOP_ONLY=%d"
          % (vt["DEVELOPED"], vt["DEFAULT_SCAFFOLD"], vt["DESKTOP_ONLY"]))
    print("[OK] wrote %s (%d rows)" % (report_csv, len(prim_rows)))
    print("[OK] wrote %s (%d rows)" % (mobile_csv, len(mobile_rows)))
    print("[OK] wrote %s" % md_path)
    if elapsed > 60:
        print("[WARN] scan took longer than the 60s budget.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
