// characterSearch — multi-modal search predicate for CharacterMapPane's search
// box. A single `matchesQuery(cell, query, filters)` call answers "does this
// cell match this (already-typed) search query" across four independent
// modes — any one match is enough:
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
// `filters` (optional; defaults to all-true, i.e. "search all fields" — the
// backward-compatible default so existing call sites keep matching every
// mode) gates which modes are considered, mapped to the pane's three search
// checkboxes:
//   - filters.character  gates (a) GLYPH and (d) BASE LETTER — both are
//                   "search by the character itself".
//   - filters.name      gates (c) NAME.
//   - filters.codepoint gates (b) CODEPOINT.
// If every flag is false, matchesQuery always returns false (WYSIWYG — no
// silent fallback to "search everything").
//
// Search is intentionally whole-set (see CharacterMapPane.tsx's
// filteredGroups): it is never scoped by the "show only my keyboard's
// scripts" checkbox, so a query can surface a character from a script the
// checkbox is currently hiding.

import { toUPlusNotation } from "@keyboard-studio/contracts";

/**
 * Which fields a search query is matched against. Maps 1:1 onto the pane's
 * three "Search in:" checkboxes. All-false is a valid (if useless) state —
 * matchesQuery returns false for every cell rather than silently falling
 * back to "search everything".
 */
export interface SearchFilters {
  /** Gates mode (b) CODEPOINT. */
  codepoint: boolean;
  /** Gates mode (c) NAME. */
  name: boolean;
  /** Gates modes (a) GLYPH and (d) BASE LETTER. */
  character: boolean;
}

/**
 * The default "search every mode" filter state — all three checkboxes
 * checked. Shared by matchesQuery's default parameter and (imported) by
 * CharacterMapPane for its useState initializer and its language-change
 * reset, so the all-true literal exists in exactly one place.
 */
export const ALL_FILTERS: SearchFilters = { codepoint: true, name: true, character: true };

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
 * described above, restricted to the modes enabled by `filters` (defaults to
 * all-true — every mode considered, the pre-filter-checkbox behavior). An
 * empty (post-trim) query never matches anything — the pane's own
 * filteredGroups gates on this to fall back to the checkbox filter instead
 * of the search filter. If `filters` disables every mode, this always
 * returns false.
 */
export function matchesQuery(
  cell: SearchableCell,
  rawQuery: string,
  filters: SearchFilters = ALL_FILTERS,
): boolean {
  const q = rawQuery.trim();
  if (q === "") return false;

  // (a) GLYPH — raw substring.
  if (filters.character && cell.char.includes(q)) return true;

  // (b) CODEPOINT — optional "U+"/"u+" prefix, then 1-6 hex digits matched
  // as a prefix of the cell's padded uppercase hex.
  if (filters.codepoint) {
    const stripped = q.replace(/^[Uu]\+/, "");
    if (/^[0-9A-Fa-f]{1,6}$/.test(stripped)) {
      const paddedHex = toUPlusNotation(cell.char).slice(2); // drop the "U+"
      if (paddedHex.startsWith(stripped.toUpperCase())) return true;
    }
  }

  // (c) NAME — case-insensitive substring.
  if (
    filters.name &&
    cell.name !== undefined &&
    cell.name.toLowerCase().includes(q.toLowerCase())
  ) {
    return true;
  }

  // (d) BASE LETTER — single-character queries only.
  if (filters.character && [...q].length === 1) {
    const nfdCps = [...cell.char.normalize("NFD")];
    const base = nfdCps[0] ?? cell.char;
    const baseLower = base.toLowerCase();
    const folded = BASE_FOLD[baseLower] ?? baseLower;
    if (folded === q.toLowerCase()) return true;
  }

  return false;
}
