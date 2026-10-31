// Checks 10.1b / 10.2b / 10.7b / 10.8b / 10.9b — the .kps-metadata twins
// (Group A2, Batch 3).
//
// Each is the post-hoc checkable twin of a scaffolder-bake criterion: the
// bake row is Met-by-guarantee for studio-built keyboards and
// not-yet-checkable ("foreign-bake") for foreign keyboards; the twin row
// is a real layer-c check that reads the .kps package-tab selections.
//
// All five are pure functions of the pre-parsed .kps details (engine
// parseKpsPackageDetails, handed over via CriteriaLintInput). An ABSENT
// .kps never reaches these checks — the studio assembly names it in
// contextMissing for all five codes.

import {
  checkFailed,
  checkPassed,
  criteriaFinding,
  mergeResults,
  type CheckResult,
} from "./_shared.js";

export interface KpsMetadataFacts {
  /** VFS path of the judged .kps (finding location). */
  kpsPath: string;
  /** First non-empty <OSKFont>/<DisplayFont>; "" when no font selected. */
  fontSelected: string;
  /** A .ttf/.otf font file is included in the .kps <Files>. */
  fontsInFiles: boolean;
  /** BCP47 language tags declared by the .kps. */
  languages: readonly string[];
  /** <Options> ReadMeFile text; "" when unselected. */
  detailsReadme: string;
  /** <Options> WelcomeFile text; "" when unselected. */
  detailsWelcome: string;
  /** <Options> LicenseFile text; "" when unselected. */
  detailsLicense: string;
  /** <Options><FollowKeyboardVersion/> is present. */
  followKeyboardVersion: boolean;
  /** <Info><Description> text; "" when absent. */
  description: string;
}

/**
 * 10.1b — no font is selected in the .kps Keyboards tab although a font
 * is included in the package files.
 */
export function checkKpsFontUnselected(
  facts: KpsMetadataFacts,
): CheckResult {
  const code = "KM_LINT_KPS_FONT_UNSELECTED";
  if (!facts.fontsInFiles)
    return checkPassed(code, ["No font files in the package."]);
  if (facts.fontSelected !== "")
    return checkPassed(code, [`File: ${facts.kpsPath}`, `Font selected: ${facts.fontSelected}`]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_FONT_UNSELECTED",
      file: facts.kpsPath,
      message:
        "The .kps includes font files but no font is selected in the Keyboards tab.",
      hint: "Select the package font (OSKFont / DisplayFont) in the .kps Keyboards tab.",
    }),
  ]);
}

/** 10.2b — no language tag is selected in the .kps Keyboards tab. */
export function checkKpsLanguagesUnselected(
  facts: KpsMetadataFacts,
): CheckResult {
  const code = "KM_LINT_KPS_LANGUAGES_UNSELECTED";
  if (facts.languages.length > 0)
    return checkPassed(code, [
      `File: ${facts.kpsPath}`,
      `Language tags: ${facts.languages.join(", ")}`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_LANGUAGES_UNSELECTED",
      file: facts.kpsPath,
      message: "No language tag is selected in the .kps Keyboards tab.",
      hint: "Select at least one BCP47 language tag in the .kps Keyboards tab.",
    }),
  ]);
}

/**
 * 10.7b — readme.htm, welcome.htm, and/or LICENSE.md are not selected
 * in the .kps Details tab. One finding names everything missing.
 */
export function checkKpsDetailsUnselected(
  facts: KpsMetadataFacts,
): CheckResult {
  const code = "KM_LINT_KPS_DETAILS_UNSELECTED";
  const missing: string[] = [];
  if (facts.detailsReadme === "") missing.push("readme.htm (ReadMeFile)");
  if (facts.detailsWelcome === "") missing.push("welcome.htm (WelcomeFile)");
  if (facts.detailsLicense === "") missing.push("LICENSE.md (LicenseFile)");
  if (missing.length === 0)
    return checkPassed(code, [
      `File: ${facts.kpsPath}`,
      `Details tab: ReadMeFile=${facts.detailsReadme || "(none)"}, WelcomeFile=${facts.detailsWelcome || "(none)"}, LicenseFile=${facts.detailsLicense || "(none)"}.`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_DETAILS_UNSELECTED",
      file: facts.kpsPath,
      message: `Not selected in the .kps Details tab: ${missing.join(", ")}.`,
      hint: "Select readme.htm, welcome.htm, and LICENSE.md in the .kps Details tab.",
    }),
  ]);
}

/** 10.8b — "Follow keyboard version" is not selected in the .kps. */
export function checkKpsFollowVersionUnset(
  facts: KpsMetadataFacts,
): CheckResult {
  const code = "KM_LINT_KPS_FOLLOW_VERSION_UNSET";
  if (facts.followKeyboardVersion)
    return checkPassed(code, ["Follow keyboard version is enabled."]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_FOLLOW_VERSION_UNSET",
      file: facts.kpsPath,
      message: '"Follow keyboard version" is not selected in the .kps Details tab.',
      hint: "Enable Follow keyboard version in the .kps Details tab so the package version tracks the keyboard.",
    }),
  ]);
}

/** 10.9b — the .kps description is empty. */
export function checkKpsDescriptionEmpty(
  facts: KpsMetadataFacts,
): CheckResult {
  const code = "KM_LINT_KPS_DESCRIPTION_EMPTY";
  if (facts.description !== "")
    return checkPassed(code, [`File: ${facts.kpsPath}`, `Description: "${facts.description}"`]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_DESCRIPTION_EMPTY",
      file: facts.kpsPath,
      message: "The .kps description is empty.",
      hint: "Fill in the package description in the .kps Info tab.",
    }),
  ]);
}

/** Run all five .kps-metadata checks over one .kps details set. */
export function checkKpsMetadata(
  facts: KpsMetadataFacts,
): ReturnType<typeof mergeResults> {
  return mergeResults(
    checkKpsFontUnselected(facts),
    checkKpsLanguagesUnselected(facts),
    checkKpsDetailsUnselected(facts),
    checkKpsFollowVersionUnset(facts),
    checkKpsDescriptionEmpty(facts),
  );
}

/** The five .kps-metadata twin codes, for the assembly's contextMissing. */
export const KPS_METADATA_CODES = [
  "KM_LINT_KPS_FONT_UNSELECTED",
  "KM_LINT_KPS_LANGUAGES_UNSELECTED",
  "KM_LINT_KPS_DETAILS_UNSELECTED",
  "KM_LINT_KPS_FOLLOW_VERSION_UNSET",
  "KM_LINT_KPS_DESCRIPTION_EMPTY",
] as const;
