/**
 * Pinned in-repo Unicode data table (spec 082, FR-021).
 *
 * The single authoritative source of Unicode General_Category, canonical
 * combining class (ccc), and character name for engine, contracts, and
 * studio. Generated from the repo's SHA-256-pinned `lib/ucd/UnicodeData.txt`
 * (Unicode 17.0.0, see scripts/ucd-version.json) by
 * `node scripts/generate-unicode-data.mjs`; the generated data module
 * (`unicodeData.generated.ts`) is checked in so builds never need network.
 *
 * Import from the subpath, never the package root — the table is ~1.5 MB
 * and is only parsed when this subpath is imported:
 *
 *   import { getCategory, getCCC, getName } from "@keyboard-studio/contracts/unicode";
 *
 * ## Behaviour
 *
 * - Full range 0x0–0x10FFFF. Unassigned codepoints appear in no run:
 *   all three lookups return `undefined` (never `"Cn"`).
 * - Out-of-range input (negative, > 0x10FFFF, non-integer, NaN) also
 *   returns `undefined`.
 * - `getName` returns `undefined` where UnicodeData has no real name:
 *   `<control>` rows, surrogates, and private-use codepoints. CJK ideograph,
 *   Tangut, and Hangul syllable ranges use their normative algorithmic
 *   names — never `"?"`, never a `<…>` placeholder.
 *
 * ## Policy: new hand-rolled codepoint ranges are forbidden
 *
 * Do NOT add another hand-rolled `cp >= 0x0300 && cp <= 0x036f`-style range
 * (or block list, or "common marks" list) anywhere in this repo to answer a
 * question this table already answers. The table is pinned, versioned, and
 * tested; a hand-rolled range is none of those, and every one shipped so
 * far has been wrong somewhere (see marks/mark-classes.ts's retired v1
 * gap: U+035C "double breve BELOW" was bucketed "above").
 *
 * Legitimate exceptions, all documented at their call site:
 * - Structural invariants the table cannot express (surrogate bounds,
 *   0x10FFFF maximum, noncharacters — unassigned by definition).
 * - Product policy ranges (key-id minting segments), not Unicode claims.
 * - Unicode *block* boundaries — this table carries category/name/ccc only;
 *   a block question needs a Blocks.txt join, which is future work.
 * - Engine `\p{…}` regexes, which read the runtime's own ICU data.
 *
 * If you are about to write a range over codepoints, stop and check this
 * module first.
 */

import {
  CATEGORIES,
  NAME_DATA,
  NAME_KIND,
  NAME_OFFSETS,
  RUNS,
  UNICODE_VERSION,
} from "./unicodeData.generated.js";

export { UNICODE_VERSION };

/** Every General_Category value present in the pinned table. */
export type GeneralCategory = (typeof CATEGORIES)[number];

type Run = readonly [number, number, number, number, number, number];

const MAX_CODE_POINT = 0x10ffff;

function isValidCodePoint(cp: number): boolean {
  return Number.isInteger(cp) && cp >= 0 && cp <= MAX_CODE_POINT;
}

/** Binary search over RUNS (sorted by start); undefined when unassigned. */
function findRun(cp: number): Run | undefined {
  let lo = 0;
  let hi = RUNS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const run = RUNS[mid];
    if (run === undefined) return undefined;
    if (cp < run[0]) hi = mid - 1;
    else if (cp > run[1]) lo = mid + 1;
    else return run;
  }
  return undefined;
}

// Hangul syllable name generation (Unicode Standard §3.12 — normative and
// version-stable; the generator asserts the U+AC00–U+D7A3 range length).
const HANGUL_L = ["G","GG","N","D","DD","R","M","B","BB","S","SS","","J","JJ","C","K","T","P","H"] as const;
const HANGUL_V = ["A","AE","YA","YAE","EO","E","YEO","YE","O","WA","WAE","OE","YO","U","WEO","WE","WI","YU","EU","YI","I"] as const;
const HANGUL_T = ["","G","GG","GS","N","NJ","NH","D","L","LG","LM","LB","LS","LT","LP","LH","M","B","BS","S","SS","NG","J","C","K","T","P","H"] as const;
const HANGUL_START = 0xac00;

function hangulSyllableName(cp: number): string | undefined {
  const sIndex = cp - HANGUL_START;
  const l = HANGUL_L[Math.floor(sIndex / 588)];
  const v = HANGUL_V[Math.floor((sIndex % 588) / 28)];
  const t = HANGUL_T[sIndex % 28];
  if (l === undefined || v === undefined || t === undefined) return undefined;
  return `HANGUL SYLLABLE ${l}${v}${t}`;
}

/**
 * Unicode General_Category of `cp` ("Lu", "Mn", …), or `undefined` when
 * `cp` is unassigned or out of range. Unassigned is NOT reported as "Cn".
 */
export function getCategory(cp: number): GeneralCategory | undefined {
  if (!isValidCodePoint(cp)) return undefined;
  const run = findRun(cp);
  if (run === undefined) return undefined;
  return CATEGORIES[run[2]];
}

/**
 * Unicode canonical combining class of `cp` (0–255), or `undefined` when
 * `cp` is unassigned or out of range.
 */
export function getCCC(cp: number): number | undefined {
  if (!isValidCodePoint(cp)) return undefined;
  const run = findRun(cp);
  if (run === undefined) return undefined;
  return run[3];
}

/**
 * Unicode character name of `cp`, or `undefined` when `cp` is unassigned,
 * out of range, or has no real name (`<control>` rows, surrogates,
 * private-use codepoints). CJK/Tangut ideograph ranges and Hangul
 * syllables resolve via their normative algorithmic names.
 */
export function getName(cp: number): string | undefined {
  if (!isValidCodePoint(cp)) return undefined;
  const run = findRun(cp);
  if (run === undefined) return undefined;
  const kind = run[4];
  if (kind === NAME_KIND.NONE) return undefined;
  if (kind === NAME_KIND.CJK) return `CJK UNIFIED IDEOGRAPH-${cp.toString(16).toUpperCase()}`;
  if (kind === NAME_KIND.TANGUT) return `TANGUT IDEOGRAPH-${cp.toString(16).toUpperCase()}`;
  if (kind === NAME_KIND.HANGUL) return hangulSyllableName(cp);
  if (kind !== NAME_KIND.STORED) return undefined;
  const index = run[5] + (cp - run[0]);
  const offset = NAME_OFFSETS[index];
  if (offset === undefined) return undefined;
  const next = NAME_OFFSETS[index + 1];
  // Names are "\n"-joined; every name but the last is followed by "\n".
  return next === undefined ? NAME_DATA.slice(offset) : NAME_DATA.slice(offset, next - 1);
}
