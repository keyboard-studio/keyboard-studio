/**
 * Shared NFC-dedup utilities for Phase B character handling.
 * Pure functions — no React dependencies, no side effects.
 */

import { glyphCategory, caseCounterpart } from "@keyboard-studio/engine";

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
/**
 * The full case pair for a character: `[c]` when it is caseless or has no
 * single-character counterpart, or `[c, counterpart]` when both cases exist
 * (spec 047). Used so selecting/removing a cased letter acts on both cases at
 * once — the map adds both, "Your alphabet" removes both — even when one case is
 * hidden in the UI. Order is `[c, counterpart]` (the passed char first).
 */
export function casePairOf(c: string, bcp47?: string): string[] {
  const cc = caseCounterpart(c, bcp47);
  return cc !== null ? [c, cc.counterpart] : [c];
}

// ---------------------------------------------------------------------------
// Casing fold — shared source of truth for the character step (PhaseB) and the
// marks step (spec 049, FR-006). Fold an uppercase base behind its lowercase
// counterpart only when that counterpart is actually present; caseless /
// uppercase-only-without-lowercase input is left untouched.
// ---------------------------------------------------------------------------

/** The uppercase counterpart of `b` when `b` is a cased lowercase letter, else null. */
function upperCounterpartOf(b: string, bcp47?: string): string | null {
  const cc = caseCounterpart(b, bcp47);
  return cc?.direction === "toUpper" ? cc.counterpart : null;
}

/**
 * The set of uppercase bases hidden behind a present lowercase counterpart:
 * for each base whose lowercase counterpart maps up, that uppercase is hidden
 * (FR-001). Caseless / uppercase-only-without-lowercase input yields an empty
 * set (FR-004).
 */
export function hiddenUppercaseBases(bases: string[], bcp47?: string): Set<string> {
  const hidden = new Set<string>();
  for (const b of bases) {
    const u = upperCounterpartOf(b, bcp47);
    if (u !== null) hidden.add(u);
  }
  return hidden;
}

/**
 * `bases` with the hidden uppercases removed, order preserved — the displayed
 * choice list (FR-001). Caseless input returns `bases` unchanged (FR-004).
 */
export function lowercaseBaseView(bases: string[], bcp47?: string): string[] {
  const hidden = hiddenUppercaseBases(bases, bcp47);
  return bases.filter((b) => !hidden.has(b));
}

/**
 * Count of shown lowercase bases whose uppercase counterpart is also present in
 * `bases` — the "capitals follow automatically" affordance count (FR-005). Zero
 * for caseless input (FR-004).
 */
export function casedBaseCount(bases: string[], bcp47?: string): number {
  const present = new Set(bases);
  let count = 0;
  for (const b of bases) {
    const u = upperCounterpartOf(b, bcp47);
    if (u !== null && present.has(u)) count++;
  }
  return count;
}

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
