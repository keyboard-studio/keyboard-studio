// Check 18.13 — KM_LINT_FONT_GLYPH_COVERAGE (issue #2593).
//
// For each packaged font the studio lists the output characters with no
// glyph in that font's cmap. The produced set is the reachability-aware
// view (the same view 18.6 uses); the coverage ranges arrive pre-parsed
// in CriteriaLintInput.kpsFontCoverage — the studio assembly reads the
// font binaries from the judged VFS (packages/studio/src/criteria/
// fontCmap.ts), because keyboard-lint must not import the engine and
// never sees raw VFS bytes itself.
//
// Severity is warning by the Layer C ceiling: a missing glyph never
// blocks download. A keyboard with no packaged font in the VFS passes
// silently (the normal case); a font whose cmap could not be read
// contributes no coverage entry and is never blamed. Named-but-not-
// packaged fonts cannot be checked in v1 and produce no finding —
// their absence is already 8.7's substance.
//
// Shaping is out of scope (ruling R1): a combining mark IN the cmap
// counts as covered even though correct rendering also needs mark
// attachment.

import type { FontCoverage, KeyboardIR } from "@keyboard-studio/contracts";
import {
  auditFontGlyphCoverage,
  formatCodepoint,
  producedCodepoints,
} from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/** How many missing characters a finding names before "and N more". */
const MAX_LISTED = 10;

function describeMissing(missing: readonly number[]): string {
  const shown = missing.slice(0, MAX_LISTED).map(
    (cp) => `${formatCodepoint(cp)} "${String.fromCodePoint(cp)}"`,
  );
  const rest = missing.length - shown.length;
  return rest > 0
    ? `${shown.join(", ")}, and ${rest} more`
    : shown.join(", ");
}

export interface FontGlyphCoverageInput {
  ir: KeyboardIR;
  /** Per-font cmap coverage from the assembly (empty when no packaged font is in the VFS). */
  coverage: readonly FontCoverage[];
  /** VFS path used in `location.file`. */
  kmnPath: string;
}

/**
 * 18.13 — one warning per packaged font with gaps between what the
 * keyboard types and what the font's cmap covers.
 */
export function checkFontGlyphCoverage(input: FontGlyphCoverageInput): CheckResult {
  // The code literal lives here (not behind a named constant) so the
  // criteria-catalog scanner (registeredLintCodes in the studio's
  // criteriaCatalog test) sees this check as a lint producer — the same
  // `const code = "KM_LINT_…"` shape every other check uses.
  const code = "KM_LINT_FONT_GLYPH_COVERAGE";
  // Same guard as 18.6: opaque raw fragments hide output the static
  // analysis cannot see, so a coverage verdict would be dishonest.
  if (input.ir.raw.length > 0) {
    return checkPassed(code, [
      "Skipped: the keyboard has raw fragments whose output cannot be analysed statically.",
    ]);
  }
  if (input.coverage.length === 0) {
    return checkPassed(code, ["No packaged font in the VFS to check."]);
  }
  const gaps = auditFontGlyphCoverage(producedCodepoints(input.ir), input.coverage);
  if (gaps.length === 0) {
    const fonts = input.coverage.map((f) => f.ref).join(", ");
    return checkPassed(code, [
      `Every character the keyboard types has a glyph in ${fonts}.`,
    ]);
  }
  return checkFailed(
    code,
    gaps.map((gap) =>
      criteriaFinding({
        code,
        file: input.kmnPath,
        message:
          `Packaged font "${gap.fontRef}" has no glyph for ` +
          `${gap.missing.length} character(s) the keyboard types: ${describeMissing(gap.missing)}.`,
        hint:
          `Use a font that covers ${describeMissing(gap.missing)} (or extend "${gap.fontRef}"), ` +
          `or remove those characters from the keyboard's output. A missing glyph shows as a box on the OSK and touch keys.`,
      }),
    ),
  );
}
