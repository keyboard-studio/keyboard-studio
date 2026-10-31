// Checks 13.1 / 13.4 / 7.12 / 7.14 — produced-output character scans
// (spec 084 Batches 1–2). The scan itself is written once and shared:
// every check below consumes the same scanProducedRanges() result.
//
//   13.1 KM_LINT_PUA_KEYBOARD_PLACEMENT — PUA codepoint use means the
//        keyboard must be in experimental/
//   13.4 KM_LINT_MATH_LATIN_LOOKALIKE — no mathematical Latin
//        look-alike characters (U+1D400–U+1D7FF) in the output
//   7.12 KM_LINT_PUA_NOT_IN_EXPERIMENTAL — the same placement
//        condition as 13.1, from the source-review angle (the catalog
//        carries both rows; each resolves on its own check)
//   7.14 KM_LINT_PUA_FONT_NO_DISPLAYMAP — a PUA-encoded bundled font
//        requires a store(&DISPLAYMAP) in the .kmn
//
// Source: buildProducedSet (contracts) over the judged IR — every
// character the keyboard's rules can emit.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { CriteriaPlacement } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

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
 * Every distinct character the keyboard can produce, as a set of
 * single characters (Batch 3, criterion 18.7's reachability test).
 * Same source as the range scan: buildProducedSet over the judged IR.
 */
export function producedCharacters(ir: KeyboardIR): ReadonlySet<string> {
  const chars = new Set<string>();
  for (const glyph of buildProducedSet(ir)) {
    for (const ch of glyph) chars.add(ch);
  }
  return chars;
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
): CheckResult {
  if (ranges.pua.length === 0)
    return checkPassed("KM_LINT_PUA_KEYBOARD_PLACEMENT", [
      "No PUA codepoints in the produced output.",
    ]);
  if (placement === "experimental")
    return checkPassed("KM_LINT_PUA_KEYBOARD_PLACEMENT", [
      `In experimental/; PUA codepoints: ${ranges.pua.join(", ")}.`,
    ]);
  return checkFailed("KM_LINT_PUA_KEYBOARD_PLACEMENT", [
    criteriaFinding({
      code: "KM_LINT_PUA_KEYBOARD_PLACEMENT",
      file: kmnPath(ir.header.keyboardId),
      message: `The keyboard outputs Private Use Area codepoint(s) ${ranges.pua.join(", ")} but is not in the experimental/ folder.`,
      hint: "Keyboards using PUA codepoints belong in experimental/, or the output should use assigned Unicode codepoints.",
    }),
  ]);
}

/**
 * 7.12 — the source-review twin of 13.1: PUA output outside
 * experimental/ → finding. The two catalog rows state the same
 * condition from two review angles (7.12 in the .kmn source pass,
 * 13.1 in the encoding/script pass), so both checks run and each row
 * resolves on its own code.
 */
export function checkPuaNotInExperimental(
  ir: KeyboardIR,
  placement: CriteriaPlacement,
  ranges: ProducedRanges = scanProducedRanges(ir),
): CheckResult {
  if (ranges.pua.length === 0)
    return checkPassed("KM_LINT_PUA_NOT_IN_EXPERIMENTAL", [
      "No PUA codepoints in the produced output.",
    ]);
  if (placement === "experimental")
    return checkPassed("KM_LINT_PUA_NOT_IN_EXPERIMENTAL", [
      `In experimental/; PUA codepoints: ${ranges.pua.join(", ")}.`,
    ]);
  return checkFailed("KM_LINT_PUA_NOT_IN_EXPERIMENTAL", [
    criteriaFinding({
      code: "KM_LINT_PUA_NOT_IN_EXPERIMENTAL",
      file: kmnPath(ir.header.keyboardId),
      message: `The keyboard outputs Private Use Area codepoint(s) ${ranges.pua.join(", ")}, so it belongs in experimental/ rather than release/.`,
      hint: "Move the keyboard to experimental/, or replace the PUA output with assigned Unicode codepoints.",
    }),
  ]);
}

/** The &DISPLAYMAP reference as a single string, when the .kmn declares one. */
export function displayMapReference(ir: KeyboardIR): string | undefined {
  for (const store of ir.stores) {
    if (!store.isSystem || store.name.toUpperCase() !== "DISPLAYMAP") continue;
    const value = store.items
      .map((item) =>
        item.kind === "char" ? item.value : item.kind === "raw" ? item.text : "",
      )
      .join("")
      .trim();
    if (value !== "") return value;
  }
  for (const body of ir.header.storeDirectives) {
    const m = /&?DISPLAYMAP\b[^'"]*['"]([^'"]+)['"]/i.exec(body);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/**
 * 7.14 — the keyboard produces PUA output AND bundles a font, but the
 * .kmn declares no store(&DISPLAYMAP) → finding.
 *
 * Proxy, stated plainly: the strict reading ("the bundled font is
 * PUA-encoded") needs a font cmap parser, which does not exist in this
 * repo. The trigger used here — PUA codepoints in the produced set
 * plus a bundled font — is the decidable form: a keyboard emitting
 * PUA characters through a bundled font is exactly the case the
 * display map exists for (it tells Keyman how to render the PUA
 * glyphs when the font's cmap does not map them).
 */
export function checkPuaFontDisplayMap(
  ir: KeyboardIR,
  input: { hasBundledFont: boolean },
  ranges: ProducedRanges = scanProducedRanges(ir),
): CheckResult {
  const code = "KM_LINT_PUA_FONT_NO_DISPLAYMAP";
  if (ranges.pua.length === 0)
    return checkPassed(code, ["No PUA codepoints in the produced output."]);
  if (!input.hasBundledFont)
    return checkPassed(code, ["No bundled font."]);
  const displayMap = displayMapReference(ir);
  if (displayMap !== undefined)
    return checkPassed(code, [`Found: store(&DISPLAYMAP) -> ${displayMap}.`]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_PUA_FONT_NO_DISPLAYMAP",
      file: kmnPath(ir.header.keyboardId),
      message: `The keyboard outputs Private Use Area codepoint(s) ${ranges.pua.join(", ")} and bundles a font, but the .kmn declares no store(&DISPLAYMAP).`,
      hint: "Add a store(&DISPLAYMAP) referencing the display-map file so the PUA glyphs render with the bundled font.",
    }),
  ]);
}

/** 13.4 — any mathematical Latin look-alike in the output → finding. */
export function checkMathLatinLookalikes(
  ir: KeyboardIR,
  ranges: ProducedRanges = scanProducedRanges(ir),
): CheckResult {
  const code = "KM_LINT_MATH_LATIN_LOOKALIKE";
  if (ranges.mathLatinLookalikes.length === 0)
    return checkPassed(code, [
      "No mathematical Latin look-alikes in the produced output.",
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_MATH_LATIN_LOOKALIKE",
      file: kmnPath(ir.header.keyboardId),
      message: `The keyboard outputs mathematical Latin look-alike character(s): ${ranges.mathLatinLookalikes.join(", ")}.`,
      hint: "Output the regular Latin letters instead of mathematical alphanumeric characters.",
    }),
  ]);
}
