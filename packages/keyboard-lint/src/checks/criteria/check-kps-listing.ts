// Checks 8.1b–8.6b / 8.8b–8.11b — the .kps-listing twins (Group A2,
// Batch 2).
//
// Each is the post-hoc checkable twin of a scaffolder-bake criterion: the
// bake row is Met-by-guarantee for studio-built keyboards and
// not-yet-checkable ("foreign-bake") for foreign keyboards; the twin row
// is a real layer-c check that reads the .kps `<File>` names.
//
// All ten are pure functions of the .kps file-name list (raw `<Name>`
// values, backslashes intact) plus whether the keyboard has a touch
// layout (for 8.3b). An ABSENT .kps never reaches these checks — the
// studio assembly names it in contextMissing for all ten codes, so the
// rows resolve Not yet checkable, never a fabricated verdict.

import type { LintFinding } from "@keyboard-studio/contracts";
import { criteriaFinding } from "./_shared.js";

/** Normalize one .kps `<Name>` for comparison: POSIX separators, lowered. */
function norm(name: string): string {
  return name.trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

/** Basename of a normalized .kps name. */
function base(name: string): string {
  const parts = norm(name).split("/");
  return parts[parts.length - 1] ?? "";
}

export interface KpsListingFacts {
  /** Raw .kps `<File><Name>` values. */
  fileNames: readonly string[];
  /** The keyboard has a touch layout (criterion 8.3's condition). */
  hasTouchLayout: boolean;
  /** VFS path of the judged .kps (finding location). */
  kpsPath: string;
}

const IMAGE_EXTS = [".bmp", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
const SOURCE_EXTS = [".kmn", ".ico", ".kvks", ".keyman-touch-layout", ".kps"];

/** 8.1b — no compiled `.kmx` is listed in the .kps. */
export function checkKpsKmxAbsent(facts: KpsListingFacts): LintFinding[] {
  if (facts.fileNames.some((n) => norm(n).endsWith(".kmx"))) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_KMX_ABSENT",
      file: facts.kpsPath,
      message: "The .kps package does not list a compiled .kmx." +
        (facts.fileNames.length > 0
          ? ` Listed files: ${facts.fileNames.join(", ")}`
          : " The package lists no files."),
      hint: "List the built <id>.kmx in the .kps <Files>.",
    }),
  ];
}

/** 8.2b — no compiled `.kvk` is listed in the .kps. */
export function checkKpsKvkAbsent(facts: KpsListingFacts): LintFinding[] {
  if (facts.fileNames.some((n) => norm(n).endsWith(".kvk"))) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_KVK_ABSENT",
      file: facts.kpsPath,
      message: "The .kps package does not list a compiled .kvk." +
        (facts.fileNames.length > 0
          ? ` Listed files: ${facts.fileNames.join(", ")}`
          : " The package lists no files."),
      hint: "List the built <id>.kvk in the .kps <Files>.",
    }),
  ];
}

/**
 * 8.3b — no compiled `.js` is listed in the .kps although the keyboard
 * has a touch layout (mobile). Without a touch layout there is nothing
 * to check — no finding either way.
 */
export function checkKpsJsAbsent(facts: KpsListingFacts): LintFinding[] {
  if (!facts.hasTouchLayout) return [];
  if (facts.fileNames.some((n) => norm(n).endsWith(".js"))) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_JS_ABSENT",
      file: facts.kpsPath,
      message:
        "The keyboard has a touch layout but the .kps package does not list a compiled .js." +
        (facts.fileNames.length > 0
          ? ` Listed files: ${facts.fileNames.join(", ")}`
          : " The package lists no files."),
      hint: "List the built <id>.js in the .kps <Files> so the mobile package includes it.",
    }),
  ];
}

/** 8.4b — `LICENSE.md` is not listed in the .kps. */
export function checkKpsLicenseAbsent(facts: KpsListingFacts): LintFinding[] {
  if (facts.fileNames.some((n) => base(n) === "license.md")) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_LICENSE_ABSENT",
      file: facts.kpsPath,
      message: "The .kps package does not list LICENSE.md." +
        (facts.fileNames.length > 0
          ? ` Listed files: ${facts.fileNames.join(", ")}`
          : " The package lists no files."),
      hint: "List LICENSE.md in the .kps <Files>.",
    }),
  ];
}

/** 8.5b — `readme.htm` is not listed in the .kps. */
export function checkKpsReadmeAbsent(facts: KpsListingFacts): LintFinding[] {
  if (facts.fileNames.some((n) => base(n) === "readme.htm")) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_README_ABSENT",
      file: facts.kpsPath,
      message: "The .kps package does not list readme.htm." +
        (facts.fileNames.length > 0
          ? ` Listed files: ${facts.fileNames.join(", ")}`
          : " The package lists no files."),
      hint: "List readme.htm in the .kps <Files>.",
    }),
  ];
}

/**
 * 8.6b — `welcome.htm` and/or associated graphics are not listed in the
 * .kps. One finding names everything missing.
 */
export function checkKpsWelcomeAbsent(facts: KpsListingFacts): LintFinding[] {
  const names = facts.fileNames.map(norm);
  const missing: string[] = [];
  if (!names.some((n) => base(n) === "welcome.htm")) missing.push("welcome.htm");
  if (!names.some((n) => IMAGE_EXTS.some((e) => n.endsWith(e)))) {
    missing.push("graphics (no image file listed)");
  }
  if (missing.length === 0) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_WELCOME_ABSENT",
      file: facts.kpsPath,
      message: `The .kps package does not list ${missing.join(" or ")}.` +
        (facts.fileNames.length > 0
          ? ` Listed files: ${facts.fileNames.join(", ")}`
          : " The package lists no files."),
      hint: "List welcome.htm and its associated graphics in the .kps <Files>.",
    }),
  ];
}

/** 8.8b — a `.php` help file is listed in the .kps. */
export function checkKpsPhpListed(facts: KpsListingFacts): LintFinding[] {
  const hit = facts.fileNames.find((n) => norm(n).endsWith(".php"));
  if (hit === undefined) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_PHP_LISTED",
      file: facts.kpsPath,
      message: `The .kps package lists a .php help file (${hit}).`,
      hint: "Remove the .php from the .kps <Files> — help is served from the built package, not the source.",
    }),
  ];
}

/** 8.9b — files from the `help/` folder are listed in the .kps. */
export function checkKpsHelpListed(facts: KpsListingFacts): LintFinding[] {
  const hit = facts.fileNames.find((n) =>
    norm(n).split("/").includes("help"),
  );
  if (hit === undefined) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_HELP_LISTED",
      file: facts.kpsPath,
      message: `The .kps package lists a file from the help/ folder (${hit}).`,
      hint: "Remove help/ files from the .kps <Files>.",
    }),
  ];
}

/** 8.10b — uncompiled sources are listed in the .kps. */
export function checkKpsSourceListed(facts: KpsListingFacts): LintFinding[] {
  const hit = facts.fileNames.find((n) =>
    SOURCE_EXTS.some((e) => norm(n).endsWith(e)),
  );
  if (hit === undefined) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_SOURCE_LISTED",
      file: facts.kpsPath,
      message: `The .kps package lists an uncompiled source (${hit}).`,
      hint: "Remove uncompiled sources (.kmn, .ico, .kvks, .keyman-touch-layout, .kps) from the .kps <Files> — only built artifacts ship.",
    }),
  ];
}

/** 8.11b — font display-map `.json` files are listed in the .kps. */
export function checkKpsJsonListed(facts: KpsListingFacts): LintFinding[] {
  const hit = facts.fileNames.find((n) => norm(n).endsWith(".json"));
  if (hit === undefined) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_JSON_LISTED",
      file: facts.kpsPath,
      message: `The .kps package lists a .json file (${hit}) — font display maps do not ship in the package.`,
      hint: "Remove the .json display-map from the .kps <Files>.",
    }),
  ];
}

/** Run all ten .kps-listing checks over one .kps file-name list. */
export function checkKpsListing(facts: KpsListingFacts): LintFinding[] {
  return [
    ...checkKpsKmxAbsent(facts),
    ...checkKpsKvkAbsent(facts),
    ...checkKpsJsAbsent(facts),
    ...checkKpsLicenseAbsent(facts),
    ...checkKpsReadmeAbsent(facts),
    ...checkKpsWelcomeAbsent(facts),
    ...checkKpsPhpListed(facts),
    ...checkKpsHelpListed(facts),
    ...checkKpsSourceListed(facts),
    ...checkKpsJsonListed(facts),
  ];
}

/** The ten .kps-listing twin codes, for the assembly's contextMissing. */
export const KPS_LISTING_CODES = [
  "KM_LINT_KPS_KMX_ABSENT",
  "KM_LINT_KPS_KVK_ABSENT",
  "KM_LINT_KPS_JS_ABSENT",
  "KM_LINT_KPS_LICENSE_ABSENT",
  "KM_LINT_KPS_README_ABSENT",
  "KM_LINT_KPS_WELCOME_ABSENT",
  "KM_LINT_KPS_PHP_LISTED",
  "KM_LINT_KPS_HELP_LISTED",
  "KM_LINT_KPS_SOURCE_LISTED",
  "KM_LINT_KPS_JSON_LISTED",
] as const;
