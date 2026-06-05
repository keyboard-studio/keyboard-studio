# content/tools

## scan_features.py — corpus feature scanner + mobile classifier

A cheap scanner that walks a Keyman corpus and produces two analyses in one pass:

1. **`.kmn` primitive frequency** — anchored-regex counts of how often each Keyman
   primitive appears, to prioritize the pattern catalog. It is **not** a real `.kmn`
   parser; naive regexes are intentionally cheap and good enough for rough frequency.
2. **Mobile-keyboard classification** — a port of `keyboards/tools/classify-mobile.js`
   that labels each keyboard `DEVELOPED`, `DEFAULT_SCAFFOLD`, or `DESKTOP_ONLY`.

### Prerequisites

- Python 3.8+ (standard library only — no `pip install` needed).

### Re-run it

```sh
python content/tools/scan_features.py <corpus-root> [<corpus-root> ...]
```

Scan just `release/`:

```sh
python content/tools/scan_features.py c:/github/SIL_SummerProject/keyboards/release
```

Reproduce `classify-mobile.js`'s count (it scans `release` + `experimental`):

```sh
python content/tools/scan_features.py \
  c:/github/SIL_SummerProject/keyboards/release \
  c:/github/SIL_SummerProject/keyboards/experimental
```

Options:

- `--top N` — number of top primitives in the summary (default `20`).
- `--out-dir DIR` — where to write the outputs (default: this repo's `content/`).

### Outputs

- `content/scan_report.csv` — one row per `keyboard_id, primitive, count`
  (only counts > 0). Includes `mobile:developed = 1` for DEVELOPED keyboards.
- `content/mobile_layout_report.csv` — per-keyboard mobile classification, with the
  same columns as `classify-mobile.js`'s `mobile-layout-report.csv`
  (`keyboard, path, targets, touch_target, layoutfile, touch_file, platforms, layers,
  nondefault_longpress, flick, multitap, verdict`) for direct diffing.
- `content/scan_summary.md` — scan stats, the mobile-verdict tally, and the top-N
  `.kmn` primitives.

> `content/scan_report.md` is a **separate** hand-written catalog of 22 keyboards.
> It is **not** produced by this script and is never overwritten by it (note `.md`
> vs this script's `scan_report.csv`).

### What it counts

- **`.kmn` primitives**: `any(`, `deadkey(`, `dk(`, `use(`, `store(`, `context`,
  `platform(`, `if(`, `set(`, `match`, `nomatch`, `notany(`, `index(`, `outs(`,
  `beep`, `nul`, `K_LOPT`, `K_ROPT`, `K_ALT`, `K_LCTRL`, `caps`,
  `notcaps`. Keyman comments are stripped before counting: a `c` token at the
  start of a line or after whitespace (and followed by whitespace or end of line)
  begins a comment to end of line, so primitives inside `c ...` comments are not
  counted (and `context`/`caps`/`nomatch` are not mistaken for comments).

- **Mobile classification** (per keyboard, keyed off each `.kmn`). Mirrors
  `classify-mobile.js` exactly:
  - **DESKTOP_ONLY** — `store(&TARGETS)` mentions no touch platform
    (`any|web|mobile|tablet|phone|iphone|ipad|android`), **or** there is no
    `<keyboard>.keyman-touch-layout` file. No mobile keyboard at all.
  - **DEFAULT_SCAFFOLD** — a touch layout exists but is essentially Keyman
    Developer's auto-generated default: longpress only on the default
    punctuation/bracket/modifier keys (the `DEFAULT_SK` exclusion set:
    `K_PERIOD`, `K_LBRKT`, `K_RBRKT`, `K_SLASH`, `K_HYPHEN`, `K_QUOTE`, `K_COMMA`,
    `K_LCONTROL`, `K_RCONTROL`, `K_SHIFT`, `K_BKSLASH`, `K_EQUAL`, and their
    `U_00xx` equivalents). Not real mobile work.
  - **DEVELOPED** — a hand-edited mobile layout, **phone or tablet**: at least one
    longpress (`sk`) on a non-default key (a letter/number), **or** any flick gesture.
    Platform blocks are **not** a signal (they only reflect which era's scaffold the
    keyboard started from). `multitap` is reported in the CSV but **not** used for the
    verdict, since Keyman can auto-generate it on the number row.

### Corpus scope

`classify-mobile.js` scans `release` + `experimental` (it excludes `legacy`). Pass
those two roots to match its total and its `DEVELOPED` count. The companion CSV uses
repo-relative paths so you can diff it against `keyboards/tools/mobile-layout-report.csv`.

### Performance

Single pass; each file is read once. The full corpus (~1k keyboards) scans in well
under the 60s budget. The script prints elapsed time and warns if it exceeds 60s.
