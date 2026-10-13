// Checks 13.1 / 13.4 — produced-output character scans (spec 084
// Batch 1). The scan itself is written once and shared: Batch 2's 7.12
// (PUA not in experimental, source-review angle) consumes the same
// scanProducedRanges() result as 13.1.
//
//   13.1 KM_LINT_PUA_KEYBOARD_PLACEMENT — PUA codepoint use means the
//        keyboard must be in experimental/
//   13.4 KM_LINT_MATH_LATIN_LOOKALIKE — no mathematical Latin
//        look-alike characters (U+1D400–U+1D7FF) in the output
//
// Source: buildProducedSet (contracts) over the judged IR — every
// character the keyboard's rules can emit.

import type { KeyboardIR, LintFinding } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { CriteriaPlacement } from "@keyboard-studio/contracts";
import { criteriaFinding, kmnPath } from "./_shared.js";

export interface ProducedRanges {
  /** Distinct produced codepoints in the Private Use Area U+E000–U+F8FF. */
  pua: string[];
  /** Distinct produced codepoints in U+1D400–U+1D7FF (math alphanumerics). */
  mathLatinLookalikes: string[];
}

function inRange(cp: number, lo: number, hi: number): boolean {
  return cp >= lo && cp <= hi;
}

function formatCp(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Scan the produced set once for every range the encoding checks need. */
export function scanProducedRanges(ir: KeyboardIR): ProducedRanges {
  const pua = new Set<number>();
  const math = new Set<number>();
  for (const glyph of buildProducedSet(ir)) {
    for (const ch of glyph) {
      const cp = ch.codePointAt(0)!;
      if (inRange(cp, 0xe000, 0xf8ff)) pua.add(cp);
      if (inRange(cp, 0x1d400, 0x1d7ff)) math.add(cp);
    }
  }
  const sorted = (s: Set<number>): string[] =>
    [...s].sort((a, b) => a - b).map(formatCp);
  return { pua: sorted(pua), mathLatinLookalikes: sorted(math) };
}

/**
 * 13.1 — PUA output outside experimental/ → finding. Authored
 * keyboards are placed in release/ by the generator invariant, so PUA
 * present resolves Not met there; foreign placement comes from the
 * catalog keyboard's repo path.
 */
export function checkPuaPlacement(
  ir: KeyboardIR,
  placement: CriteriaPlacement,
  ranges: ProducedRanges = scanProducedRanges(ir),
): LintFinding[] {
  if (ranges.pua.length === 0 || placement === "experimental") return [];
  return [
    criteriaFinding({
      code: "KM_LINT_PUA_KEYBOARD_PLACEMENT",
      file: kmnPath(ir.header.keyboardId),
      message: `The keyboard outputs Private Use Area codepoint(s) ${ranges.pua.join(", ")} but is not in the experimental/ folder.`,
      hint: "Keyboards using PUA codepoints belong in experimental/, or the output should use assigned Unicode codepoints.",
    }),
  ];
}

/** 13.4 — any mathematical Latin look-alike in the output → finding. */
export function checkMathLatinLookalikes(
  ir: KeyboardIR,
  ranges: ProducedRanges = scanProducedRanges(ir),
): LintFinding[] {
  if (ranges.mathLatinLookalikes.length === 0) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_MATH_LATIN_LOOKALIKE",
      file: kmnPath(ir.header.keyboardId),
      message: `The keyboard outputs mathematical Latin look-alike character(s): ${ranges.mathLatinLookalikes.join(", ")}.`,
      hint: "Output the regular Latin letters instead of mathematical alphanumeric characters.",
    }),
  ];
}
