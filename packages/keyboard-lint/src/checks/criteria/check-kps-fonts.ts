// Check 8.7 — KM_LINT_KPS_FONT_MISSING (spec 084 Batch 3).
//
// "All fonts used in the keyboard are listed in the .kps <Files>":
// a font family the keyboard REQUIRES (the .kvks encoding font, the
// touch layout platforms' fonts) must be matched by a font family
// BUNDLED in the package. The bundled families cross from the studio
// assembly (CriteriaLintInput.kpsFontFamilies) — name tables extracted
// from the .kps-listed font binaries actually present in the judged
// VFS, because matching "is this font included" by family name is the
// only honest test: a file can be listed yet absent, or present under
// a name that says nothing about its family.
//
// Family comparison is case-insensitive and whitespace-trimmed (font
// name tables and layout JSON disagree on casing in the wild).
// Style/weight suffixes are NOT stripped: "Charis SIL Bold" required
// vs "Charis SIL" bundled is a real mismatch this check cannot paper
// over.

import type { KvksIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

function normalizeFamily(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Industry/system font families ("Arial, Times, Tahoma, etc."),
 * normalised for comparison: lowercased with all non-alphanumerics
 * removed ("Times New Roman" -> "timesnewroman"). Shared by 8.7 (these
 * need not be bundled: the OS supplies them) and 8.12 (these must not be
 * shipped in the package).
 */
export const INDUSTRY_FONTS: ReadonlySet<string> = new Set(
  [
    "Arial",
    "Arial MT",
    "Times",
    "Times New Roman",
    "Tahoma",
    "Verdana",
    "Helvetica",
    "Courier New",
    "Georgia",
    "Calibri",
    "Comic Sans MS",
  ].map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "")),
);

/** True when `name` (a family or file stem) is an industry/system font. */
export function isIndustryFont(name: string): boolean {
  return INDUSTRY_FONTS.has(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** The font families the keyboard requires, deduplicated by normalized name. */
export function requiredFontFamilies(input: {
  kvks?: KvksIR;
  touchLayout?: TouchLayoutIR;
}): string[] {
  const byNorm = new Map<string, string>();
  const add = (name: string | undefined): void => {
    if (name === undefined || name.trim() === "") return;
    const norm = normalizeFamily(name);
    if (!byNorm.has(norm)) byNorm.set(norm, name.trim());
  };
  // Industry/system fonts are supplied by the OS and must not be
  // bundled (8.12), so 8.7 never requires them in the package.
  const addBundlable = (name: string | undefined): void => {
    if (name !== undefined && isIndustryFont(name)) return;
    add(name);
  };
  addBundlable(input.kvks?.fontFamily);
  for (const platform of input.touchLayout?.platforms ?? []) {
    addBundlable(platform.font);
  }
  return [...byNorm.values()];
}

/** 8.7 — a required family with no bundled font of that family → one finding naming all. */
export function checkKpsFontMissing(input: {
  kvks?: KvksIR;
  touchLayout?: TouchLayoutIR;
  /** Family names extracted from the package's bundled font files. */
  bundledFamilies: readonly string[];
  keyboardId: string;
}): CheckResult {
  const code = "KM_LINT_KPS_FONT_MISSING";
  const required = requiredFontFamilies(input);
  if (required.length === 0)
    return checkPassed(code, [
      "No font families required (no .kvks or touch layout font).",
    ]);
  const bundled = new Set(input.bundledFamilies.map(normalizeFamily));
  const missing = required.filter((f) => !bundled.has(normalizeFamily(f)));
  if (missing.length === 0)
    return checkPassed(code, [
      `Required: ${required.join(", ")} — all bundled in the package.`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_FONT_MISSING",
      file: `source/${input.keyboardId}.kps`,
      message: `No font bundled in the package matches the font family the keyboard uses: ${missing.join(", ")}.`,
      hint: "Include a font of each used family in the .kps <Files> (and the package), or change the keyboard to a bundled family.",
    }),
  ]);
}
