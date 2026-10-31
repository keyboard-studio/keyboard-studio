// Checks 8.12 / 9.6 — fonts in the package (spec 084 Batch 1).
//
//   8.12 KM_LINT_KPS_INDUSTRY_FONT    — no industry fonts (Arial, Times,
//        Tahoma, …) in the package
//   9.6  KM_LINT_WOFF_FONT_IN_PACKAGE — no .woff / .woff2 web fonts in
//        the package
//
// Sources for 8.12 (name matching — a renamed font file can evade the
// file-name arm, so family strings are matched too): the .kps <File>
// names and font references (engine parseKpsFiles / parseKpsFontRefs,
// handed over via CriteriaLintInput), the .kvks font family, and the
// touch-layout platform fonts. 9.6 scans the judged VFS inventory plus
// the .kps <File> names. Neither is precertification: adapt tracks can
// carry base files through, so the files are actually looked at.

import {
  baseNameLower,
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/**
 * Industry/proprietary font families the criterion names ("Arial,
 * Times, Tahoma, etc."), normalised for comparison: lowercased with all
 * non-alphanumerics removed ("Times New Roman" → "timesnewroman").
 */
const INDUSTRY_FONTS: ReadonlySet<string> = new Set(
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

function normalizeFontName(raw: string): string {
  return raw
    .replace(/\.(ttf|otf|woff2?|ttc)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Font names from a file path: its basename without the font extension. */
function fileFontName(path: string): string {
  return normalizeFontName(baseNameLower(path));
}

export interface IndustryFontInput {
  kpsFileNames: readonly string[];
  kpsFontRefs: readonly string[];
  kvksFontFamily?: string;
  touchFonts: readonly string[];
  /** VFS path of the .kps, for the finding location ("" when unknown). */
  kpsPath: string;
}

/** 8.12 — any industry font among the package's font names/families → finding. */
export function checkIndustryFonts(input: IndustryFontInput): CheckResult {
  const code = "KM_LINT_KPS_INDUSTRY_FONT";
  const candidates: Array<{ name: string; via: string }> = [];
  for (const name of input.kpsFileNames) {
    candidates.push({ name: fileFontName(name), via: `file "${name}"` });
  }
  for (const ref of input.kpsFontRefs) {
    candidates.push({
      name: fileFontName(ref),
      via: `font reference "${ref}"`,
    });
  }
  if (input.kvksFontFamily !== undefined) {
    candidates.push({
      name: normalizeFontName(input.kvksFontFamily),
      via: `visual keyboard font "${input.kvksFontFamily}"`,
    });
  }
  for (const font of input.touchFonts) {
    candidates.push({
      name: normalizeFontName(font),
      via: `touch layout font "${font}"`,
    });
  }
  const offenders = candidates.filter((c) => INDUSTRY_FONTS.has(c.name));
  if (offenders.length === 0) {
    if (candidates.length === 0)
      return checkPassed(code, ["No font names or families to check."]);
    return checkPassed(code, [
      `Checked ${candidates.length} font name(s): none are industry fonts.`,
    ]);
  }
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_INDUSTRY_FONT",
      file: input.kpsPath,
      message: `The package uses industry font(s): ${offenders.map((o) => o.via).join(", ")}.`,
      hint: "Replace industry fonts (Arial, Times, Tahoma, …) with an openly licensed font bundled for this keyboard.",
    }),
  ]);
}

/** 9.6 — any .woff/.woff2 in the VFS inventory or the .kps file list → finding. */
export function checkWoffInPackage(
  filePaths: readonly string[],
  kpsFileNames: readonly string[],
  kpsPath: string,
): CheckResult {
  const code = "KM_LINT_WOFF_FONT_IN_PACKAGE";
  const scanned = [...filePaths, ...kpsFileNames];
  const offenders = scanned.filter((p) => /\.woff2?$/i.test(p.trim()));
  if (offenders.length === 0)
    return checkPassed(code, [
      `Checked ${scanned.length} file(s): no .woff/.woff2.`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_WOFF_FONT_IN_PACKAGE",
      file: kpsPath,
      message: `The package contains web font(s): ${[...new Set(offenders)].join(", ")}.`,
      hint: "Remove .woff/.woff2 files from the package; ship the font as .ttf or .otf instead.",
    }),
  ]);
}
