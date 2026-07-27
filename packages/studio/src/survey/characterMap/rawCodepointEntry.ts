// Raw U+XXXX entry — the "all options" escape hatch. The browse grid only
// ever shows what buildCharacterMap decided was relevant to the language; this
// field lets the author add ANY scalar value directly (Common punctuation,
// PUA, or an out-of-script character the grid doesn't list), by code point.
//
// Accepted formats: "U+1E900", "u+1e900", bare "1E900" (4-6 hex digits) — the
// same set parseUPlusNotation itself accepts. A bare "0x1E900" 0x-prefix
// form is NOT accepted (dropped rather than kept as a second parser).

import { parseUPlusNotation } from "@keyboard-studio/contracts";

export type CodepointParseResult =
  | { ok: true; char: string }
  | { ok: false };

/**
 * Parse a free-typed code point string into a validated Unicode character.
 * Delegates the actual hex-parse / surrogate / range / noncharacter checks to
 * the canonical `parseUPlusNotation` (@keyboard-studio/contracts) rather than
 * re-implementing them. Returns a stable ok/not-ok result only — CharacterMapPane
 * (the caller) turns a `false` result into the translated error message, since it
 * (not this pure helper) holds the live `t` binding the extractor tracks.
 * PUA code points (e.g. U+E000) pass through unchanged: that is the escape
 * hatch's whole point.
 */
export function parseCodepointInput(raw: string): CodepointParseResult {
  const trimmed = raw.trim();
  const resolved = parseUPlusNotation(trimmed);
  if (resolved === null) return { ok: false };
  return { ok: true, char: resolved };
}
