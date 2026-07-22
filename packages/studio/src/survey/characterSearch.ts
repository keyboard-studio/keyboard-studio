// characterSearch — multi-modal search predicate for CharacterMapPane's search
// box. A single `matchesQuery(cell, query)` call answers "does this cell
// match this (already-typed) search query" across four independent modes —
// any one match is enough:
//
//   (a) GLYPH     — raw substring match against the cell's character itself.
//   (b) CODEPOINT — an optional "U+"/"u+" prefix is stripped; if the
//                   remainder is 1-6 hex digits, it's matched as a PREFIX of
//                   the cell's padded uppercase U+XXXX hex (so "003" matches
//                   every codepoint in the U+0030..U+003F block, and
//                   "0041"/"U+0041" matches exactly U+0041).
//   (c) NAME      — case-insensitive substring against the cell's Unicode
//                   name (e.g. "acute" finds "COMBINING ACUTE ACCENT").
//   (d) BASE LETTER — single-character queries only. The cell's NFD base (its
//                   first code point after normalize("NFD")) is folded
//                   through BASE_FOLD for the handful of Latin letters that
//                   don't decompose under NFD (o-slash, etc.) and compared
//                   case-insensitively, so "o" finds "o", "o with acute", and
//                   "ø" alike.
//
// Search is intentionally whole-set (see CharacterMapPane.tsx's
// filteredGroups): it is never scoped by the "show only my keyboard's
// scripts" checkbox, so a query can surface a character from a script the
// checkbox is currently hiding.

import { toUPlusNotation } from "@keyboard-studio/contracts";

/** The subset of CharacterMapCell that matchesQuery actually reads. */
export interface SearchableCell {
  char: string;
  name?: string;
}

// Non-decomposing letters (NFD leaves them as a single code point) that still
// have an obvious "base letter" a user would type to find them. Precomposed
// letters that DO decompose under NFD (e.g. "ó" -> "o" + acute, or "ơ" -> "o"
// + horn) never need an entry here — normalize("NFD")'s first code point is
// already the plain base letter.
const BASE_FOLD: Record<string, string> = {
  "œ": "o",
  "ø": "o",
  "ơ": "o",
  "ư": "u",
  "æ": "a",
  "ð": "d",
  "đ": "d",
  "ł": "l",
  "ß": "s",
};

/**
 * True when `cell` matches `rawQuery` under any of the four search modes
 * described above. An empty (post-trim) query never matches anything — the
 * pane's own filteredGroups gates on this to fall back to the checkbox
 * filter instead of the search filter.
 */
export function matchesQuery(cell: SearchableCell, rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (q === "") return false;

  // (a) GLYPH — raw substring.
  if (cell.char.includes(q)) return true;

  // (b) CODEPOINT — optional "U+"/"u+" prefix, then 1-6 hex digits matched
  // as a prefix of the cell's padded uppercase hex.
  const stripped = q.replace(/^[Uu]\+/, "");
  if (/^[0-9A-Fa-f]{1,6}$/.test(stripped)) {
    const paddedHex = toUPlusNotation(cell.char).slice(2); // drop the "U+"
    if (paddedHex.startsWith(stripped.toUpperCase())) return true;
  }

  // (c) NAME — case-insensitive substring.
  if (cell.name !== undefined && cell.name.toLowerCase().includes(q.toLowerCase())) {
    return true;
  }

  // (d) BASE LETTER — single-character queries only.
  if ([...q].length === 1) {
    const nfdCps = [...cell.char.normalize("NFD")];
    const base = nfdCps[0] ?? cell.char;
    const baseLower = base.toLowerCase();
    const folded = BASE_FOLD[baseLower] ?? baseLower;
    if (folded === q.toLowerCase()) return true;
  }

  return false;
}
