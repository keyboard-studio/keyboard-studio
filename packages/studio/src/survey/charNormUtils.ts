/**
 * Shared NFC-dedup utilities for Phase B character handling.
 * Pure functions — no React dependencies, no side effects.
 */

import { glyphCategory } from "@keyboard-studio/engine";

/**
 * NFC-normalize each element of `incoming`, append to `base` skipping
 * anything already present (first-appearance order preserved).
 *
 * Empty strings (after NFC normalization) are silently dropped.
 */
export function nfcDedup(base: string[], incoming: string[]): string[] {
  const seen = new Set<string>(base);
  const result = [...base];
  for (const raw of incoming) {
    const nfc = raw.normalize("NFC");
    if (nfc.length > 0 && !seen.has(nfc)) {
      seen.add(nfc);
      result.push(nfc);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// harvestChars — whole-string grapheme capture (spec 047, FR-001/002/003)
// ---------------------------------------------------------------------------

/**
 * The ONLY characters dropped when harvesting an alphabet: the five ordinary
 * whitespace forms — carriage return, line feed, the CRLF pair (one grapheme
 * cluster), tab, and plain space (U+0020). Every other character, including
 * unusual invisibles like NBSP (U+00A0) and ZWSP (U+200B), is KEPT (FR-002,
 * SC-006). Deliberately NOT `\s` / `\p{Z}`: those would over-drop the very
 * separators the spec says to keep and record.
 */
const WHITESPACE_SKIP = new Set<string>(["\r", "\n", "\r\n", "\t", " "]);

/** Split a string into grapheme clusters (matches PhaseB's Intl.Segmenter use). */
export function segmentGraphemes(s: string): string[] {
  if (!s) return [];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter();
    return [...seg.segment(s)].map((x) => x.segment);
  }
  return [...s];
}

/**
 * Harvest every distinct grapheme from a typed/pasted string (FR-001): split
 * into grapheme clusters, drop only the five ordinary whitespace forms
 * (FR-002), keep everything else, and NFC-normalize + dedup via {@link nfcDedup}.
 *
 * Returns `{ chars, unusual }`, where `unusual` lists the retained
 * separator/format/control characters (General Category Z or C) so the caller
 * can log them for discoverability (FR-003). `unusual` is a subset of `chars`
 * (both NFC-normalized and deduped).
 */
export function harvestChars(raw: string): { chars: string[]; unusual: string[] } {
  const kept: string[] = [];
  const unusualRaw: string[] = [];
  for (const g of segmentGraphemes(raw)) {
    if (WHITESPACE_SKIP.has(g)) continue;
    kept.push(g);
    const cat = glyphCategory(g);
    if (cat === "separator" || cat === "control") unusualRaw.push(g);
  }
  return { chars: nfcDedup([], kept), unusual: nfcDedup([], unusualRaw) };
}
