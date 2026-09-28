# Unicode data table (`@keyboard-studio/contracts/unicode`)

Pinned in-repo Unicode data table — spec 082, FR-021. The single
authoritative source of Unicode **General_Category**, **canonical combining
class (ccc)**, and **character name** for engine, contracts, and studio.
Prerequisite for the kmAssist tracks (FR-019/FR-020).

## Import

```ts
import { getCategory, getCCC, getName } from "@keyboard-studio/contracts/unicode";
```

The `./unicode` subpath export keeps the ~1.5 MB table out of the package
root's import graph — it is parsed only when this subpath is imported.
`contracts` is the dependency root, so engine and studio can both depend on
it with no new package and no dependency-cycle risk. (Splitting it into a
standalone `@keyboard-studio/unicode` package later is a mechanical move of
this one directory.)

## Version pin

- **Unicode 17.0.0** — recorded in the generated file's header, in
  `UNICODE_VERSION`, and here. The repo's UCD pin
  (`scripts/ucd-version.json`, `unicodeVersion: "17.0.0"`) already covers
  UnicodeData.txt alongside Scripts.txt/DerivedAge.txt, so this table is
  version-consistent with the facet-index script lookup and the
  display-difficulty DerivedAge join.
- `lib/ucd/UnicodeData.txt` carries no in-file version stamp; the **SHA-256
  pin is the version binding**. The generator verifies the hash before
  parsing and fails loud on mismatch.

## Encoding

Range-encoded for size — maximal runs of identical
(General_Category, ccc, nameKind), **not** per-codepoint rows:

| Table | Contents |
|---|---|
| `RUNS` | `[start, end, categoryIndex, ccc, nameKind, nameBase]` tuples, sorted by start. Unassigned codepoints appear in **no** run → lookups return `undefined`. |
| `NAME_DATA` | All stored names joined with `\n` (names are ASCII; asserted at generation). |
| `NAME_OFFSETS` | Byte offset of each stored name, in codepoint order. |
| `CATEGORIES` | General_Category values index-addressed by `RUNS`. |

Current stats: 40,575 source rows → 3,666 runs covering 299,382 assigned
codepoints (full 0x0–0x10FFFF range); 40,470 stored names. Algorithmic
names (CJK/Tangut/Hangul) are computed at lookup time and stored nowhere.

Name derivation per run (`nameKind`): `0` = no real name (`<control>`,
surrogates, private use) → `undefined`; `1` = stored; `2` =
`CJK UNIFIED IDEOGRAPH-` + hex; `3` = `TANGUT IDEOGRAPH-` + hex;
`4` = normative Hangul syllable name (Unicode Standard §3.12).

Lookups are binary search over runs — O(log n), no per-call allocation
beyond the returned string.

## API

```ts
getCategory(cp: number): GeneralCategory | undefined
getCCC(cp: number): number | undefined
getName(cp: number): string | undefined
```

Unassigned **or** out-of-range codepoints → `undefined` for all three
(unassigned is never reported as `"Cn"`).

## Regenerating

```sh
node scripts/generate-unicode-data.mjs            # verify pin + regenerate
node scripts/generate-unicode-data.mjs --check    # diff against checked-in (CI determinism test)
node scripts/generate-unicode-data.mjs --compute-sha  # re-pin after a deliberate UCD bump
```

The generated file (`unicodeData.generated.ts`) is **checked in** —
deterministic (sorted, write-only-if-changed, no timestamps), so builds
never need network. To bump the Unicode version: replace
`lib/ucd/UnicodeData.txt`, re-run with `--compute-sha`, commit the pin and
the regenerated module together. The generator fails loud on any
unrecognised `<…, First/Last>` range marker, so a new algorithmic range
type in a future Unicode version is a deliberate code change, never silent
mis-naming.

## Policy

**New hand-rolled codepoint ranges are forbidden** — see the module header
in `index.ts`. If a question is answerable from this table, answer it from
this table.
