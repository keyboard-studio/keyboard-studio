/**
 * kmAssist Unicode-data adapter — spec 082 FR-019/FR-020/FR-022/FR-023.
 *
 * SEAM, NOT A SOURCE. This module is the single import point through which
 * kmAssist reads Unicode character data (General_Category, names, canonical
 * combining class). It delegates to the FR-021 pinned in-repo table
 * (`@keyboard-studio/contracts/unicode`, generated from the SHA-256-pinned
 * `lib/ucd/UnicodeData.txt`, Unicode 17.0.0).
 *
 * Callers (`explain.ts`, `suggestGuards.ts`) degrade honestly when data is
 * unknown (no invented names, no invented categories; see each caller's
 * fallback). Per the 076 spec assumption, Unicode General Category data is
 * NOT hand-maintained anywhere in kmAssist; this adapter is the only seam.
 */

import {
  getCategory as tableGetCategory,
  getCCC as tableGetCCC,
  getName as tableGetName,
} from "@keyboard-studio/contracts/unicode";

/**
 * General_Category of a code point (e.g. "Mn", "Mc", "Me", "Ll", "Zs",
 * "Nd", "Po"), or `undefined` when unknown.
 */
export function getCategory(cp: number): string | undefined {
  return tableGetCategory(cp);
}

/**
 * Unicode character NAME (e.g. "COMBINING CEDILLA"), or `undefined` when
 * unknown. Range/control names ("<control>" etc.) are never returned.
 */
export function getName(cp: number): string | undefined {
  return tableGetName(cp);
}

/**
 * Canonical_Combining_Class of a code point, or `undefined` when unknown.
 */
export function getCCC(cp: number): number | undefined {
  return tableGetCCC(cp);
}
