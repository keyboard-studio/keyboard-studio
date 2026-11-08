// fontGlyphCoverage — the shared audit core for issue #2593: does each
// packaged font have a glyph for every character the keyboard can type?
//
// One implementation, two consumers (the keyboard-lint Layer C check and
// the studio's Output-step hook call the same check, which calls this),
// so the two surfaces cannot diverge.
//
// The produced set is the REACHABILITY-AWARE view
// (buildReachableProducedSet — the same view criterion 18.6 uses): a rule
// keyed on a touch key id no key carries produces nothing an author can
// type, so its characters are not the font's business. Each produced entry
// is split into its codepoints; every codepoint must be in the font's
// cmap. (A keyboard emitting precomposed é needs é in the cmap even when
// the font carries e + U+0301 — the emitted text is the single codepoint
// é. Conversely a keyboard emitting e then a separate combining acute
// needs both codepoints.)
//
// Coverage is expressed as codepoint RANGES, not a materialised set: a
// cmap format-12 group can span thousands of codepoints, and the audit
// only ever asks membership questions. Ranges come from the studio's
// cmap reader (packages/studio/src/criteria/fontCmap.ts); only the
// ranges cross the lint boundary (CriteriaLintInput.kpsFontCoverage).
//
// KNOWN LIMITATION (ruling R1, ~/workspace/keyboard-studio-notes/
// 2593-ruling.md): cmap presence is not shaping. A combining mark that
// is IN the cmap is counted covered even though correct rendering also
// needs mark attachment (GPOS/GSUB); that check needs a shaping engine
// and is out of scope for v1.

import type { KeyboardIR } from "./keyboard-ir.js";
import { buildReachableProducedSet } from "./ir/reachableProducedSet.js";

/** One inclusive codepoint interval a font's cmap covers. */
export interface CodepointRange {
  start: number;
  end: number;
}

/** A packaged font's cmap coverage, as read by the studio's cmap reader. */
export interface FontCoverage {
  /** The font reference as written in the .kps (or the VFS path). */
  ref: string;
  /** Sorted, non-overlapping inclusive codepoint ranges the cmap covers. */
  covered: readonly CodepointRange[];
}

/** The gap for one font: the typed codepoints its cmap lacks. */
export interface FontGlyphGap {
  fontRef: string;
  /** Missing codepoints, ascending. */
  missing: number[];
}

/** True when `cp` falls in any of the (sorted) covered ranges. */
export function coversCodepoint(
  covered: readonly CodepointRange[],
  cp: number,
): boolean {
  // Linear scan is fine: a cmap has tens of ranges, the produced set
  // has hundreds of codepoints at most.
  for (const range of covered) {
    if (cp < range.start) return false;
    if (cp <= range.end) return true;
  }
  return false;
}

/**
 * Every codepoint the keyboard can type, from the reachable produced
 * set, split per codepoint. Space and C0 controls never reach here:
 * buildProducedSet excludes them by default.
 */
export function producedCodepoints(ir: KeyboardIR): number[] {
  const { reachable } = buildReachableProducedSet(ir);
  const out = new Set<number>();
  for (const entry of reachable) {
    for (const ch of entry) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined) out.add(cp);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * For each font, the typed codepoints its cmap lacks. Fonts with no
 * gaps are omitted. A font whose cmap could not be read contributes no
 * coverage entry at all (the reader yields undefined there) — never a
 * false "missing glyph" finding.
 */
export function auditFontGlyphCoverage(
  produced: Iterable<number>,
  fonts: readonly FontCoverage[],
): FontGlyphGap[] {
  const producedList = [...produced];
  const gaps: FontGlyphGap[] = [];
  for (const font of fonts) {
    const missing = producedList.filter((cp) => !coversCodepoint(font.covered, cp));
    if (missing.length > 0) gaps.push({ fontRef: font.ref, missing });
  }
  return gaps;
}

/** `U+` + uppercase hex, minimum 4 digits (e.g. U+025B, U+1D400). */
export function formatCodepoint(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}
