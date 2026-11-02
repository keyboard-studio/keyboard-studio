// Checks 1.7b / 1.8b / 1.11b / 1.12b / 3.1b / 6.1b / 6.3b — the file-inventory
// twins (Group A2, Batch 1) — plus the seven required-file existence checks
// (1.14 / 4.0 / 5.0 / 8.0 / 18.0 / 7.0-kvks / 7.0-ico): README.md,
// LICENSE.md, the .kpj, the .kps, the touch layout, the .kvks and the .ico
// are required files (2026-11-02 ruling), so their absence is a finding,
// and the checks that read them nest under that absence via the
// assembly's contextMissing (never a vacuous pass).
//
// Each is the post-hoc checkable twin of a scaffolder-bake criterion: the
// bake row is Met-by-guarantee for studio-built keyboards and
// not-yet-checkable ("foreign-bake") for foreign keyboards; the twin row is
// a real layer-c check that reads the judged VFS. All fourteen are pure
// functions of the VFS path list — no parsing, no IR.
//
// Conventions: comparisons are case-insensitive on the basename (the
// keyboards corpus has mixed-case history), paths use forward slashes
// (the VFS normalizes to POSIX).

import {
  checkFailed,
  checkPassed,
  criteriaFinding,
  mergeResults,
  type CheckResult,
} from "./_shared.js";

/** 1.7b — a `keyboard.info` file is present in the keyboard folder. */
export function checkKeyboardInfoPresent(
  paths: readonly string[],
): CheckResult {
  const hit = paths.find(
    (p) => (p.split("/").pop() ?? "").toLowerCase() === "keyboard.info",
  );
  if (hit === undefined)
    return checkPassed("KM_LINT_KEYBOARD_INFO_PRESENT", [
      "No keyboard.info file present.",
    ]);
  return checkFailed("KM_LINT_KEYBOARD_INFO_PRESENT", [
    criteriaFinding({
      code: "KM_LINT_KEYBOARD_INFO_PRESENT",
      file: hit,
      message: "A `keyboard.info` file is present in the keyboard folder.",
      hint: "Remove `keyboard.info` — it is a legacy artifact the scaffolder never emits.",
    }),
  ]);
}

/**
 * 1.8b — a `docs/` (or similar) subfolder holds duplicate HISTORY / README /
 * INSTALL files.
 */
export function checkDuplicateDocsSubfolder(
  paths: readonly string[],
): CheckResult {
  const hasDocsFolder = paths.some((p) =>
    p
      .toLowerCase()
      .split("/")
      .some((s) => /^(docs?|documentation)$/.test(s)),
  );
  if (!hasDocsFolder)
    return checkPassed("KM_LINT_DOCS_SUBFOLDER_DUPLICATES", [
      "No docs/ folder to check.",
    ]);
  const dups = paths.filter((p) => {
    const segments = p.toLowerCase().split("/");
    // A docs-like folder: docs, doc, documentation — not at the root.
    const dirIdx = segments.findIndex((s) =>
      /^(docs?|documentation)$/.test(s),
    );
    if (dirIdx < 0 || dirIdx >= segments.length - 1) return false;
    const base = segments[segments.length - 1] ?? "";
    return /^(history|readme|install)/.test(base);
  });
  if (dups.length === 0)
    return checkPassed("KM_LINT_DOCS_SUBFOLDER_DUPLICATES", [
      "No duplicate documentation subfolders found.",
    ]);
  return checkFailed("KM_LINT_DOCS_SUBFOLDER_DUPLICATES", [
    criteriaFinding({
      code: "KM_LINT_DOCS_SUBFOLDER_DUPLICATES",
      file: dups[0]!,
      message: `A docs subfolder contains duplicate documentation files: ${dups.join(", ")}.`,
      hint: "Keep a single HISTORY.md / README.md at the keyboard root; remove the docs/ duplicates.",
    }),
  ]);
}

/** 1.11b — a `.kpj.user` file is committed. */
export function checkKpjUserPresent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => p.toLowerCase().endsWith(".kpj.user"));
  if (hit === undefined)
    return checkPassed("KM_LINT_KPJ_USER_PRESENT", [
      "No .kpj.user file committed.",
    ]);
  return checkFailed("KM_LINT_KPJ_USER_PRESENT", [
    criteriaFinding({
      code: "KM_LINT_KPJ_USER_PRESENT",
      file: hit,
      message: "A `.kpj.user` file is committed.",
      hint: "Remove the `.kpj.user` file — it holds per-user IDE state and must not be committed.",
    }),
  ]);
}

/** 1.12b — `build/` folder contents are committed. */
export function checkBuildFolderPresent(paths: readonly string[]): CheckResult {
  const hits = paths.filter((p) =>
    p.toLowerCase().split("/").includes("build"),
  );
  if (hits.length === 0)
    return checkPassed("KM_LINT_BUILD_FOLDER_PRESENT", [
      "No build/ folder contents committed.",
    ]);
  return checkFailed("KM_LINT_BUILD_FOLDER_PRESENT", [
    criteriaFinding({
      code: "KM_LINT_BUILD_FOLDER_PRESENT",
      file: hits[0]!,
      message: `Committed build output found (${hits.length} file(s) under build/).`,
      hint: "Remove the build/ folder contents — compiled artifacts are built by CI, never committed.",
    }),
  ]);
}

/** 3.1b — `HISTORY.md` is absent from the keyboard root. */
export function checkHistoryMdAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => {
    const segments = p.toLowerCase().split("/");
    return (
      segments.length === 1 &&
      (segments[0] === "history.md" || segments[0] === "history.txt")
    );
  });
  if (hit !== undefined)
    return checkPassed("KM_LINT_HISTORY_MD_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_HISTORY_MD_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_HISTORY_MD_ABSENT",
      file: "HISTORY.md",
      message: "No HISTORY.md at the keyboard root.",
      hint: "Add a HISTORY.md change log at the keyboard root.",
    }),
  ]);
}

/** 6.1b — `readme.htm` is absent from `source/`. */
export function checkReadmeHtmAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => p.toLowerCase() === "source/readme.htm");
  if (hit !== undefined)
    return checkPassed("KM_LINT_README_HTM_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_README_HTM_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_README_HTM_ABSENT",
      file: "source/readme.htm",
      message: "No readme.htm in source/.",
      hint: "Add source/readme.htm — the package's read-me page.",
    }),
  ]);
}

/**
 * 6.3b — `welcome.htm` is absent from `source/`. Accepts both the flat
 * (`source/welcome.htm`) and the folder (`source/welcome/welcome.htm`)
 * conventions — the loader resolves them in that order.
 */
export function checkWelcomeHtmAbsent(paths: readonly string[]): CheckResult {
  const lowered = new Map(paths.map((p) => [p.toLowerCase(), p]));
  const hit =
    lowered.get("source/welcome.htm") ??
    lowered.get("source/welcome/welcome.htm");
  if (hit !== undefined)
    return checkPassed("KM_LINT_WELCOME_HTM_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_WELCOME_HTM_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_WELCOME_HTM_ABSENT",
      file: "source/welcome.htm",
      message: "No welcome.htm in source/ (flat or source/welcome/ folder).",
      hint: "Add source/welcome.htm — the package's welcome page.",
    }),
  ]);
}

/** 1.14 — a `.kpj` project file is absent from the keyboard root. */
export function checkKpjAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => p.toLowerCase().endsWith(".kpj"));
  if (hit !== undefined)
    return checkPassed("KM_LINT_KPJ_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_KPJ_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_KPJ_ABSENT",
      file: "<keyboard-id>.kpj",
      message: "No .kpj project file at the keyboard root.",
      hint: "Add the <keyboard-id>.kpj Keyman Developer project file.",
    }),
  ]);
}

/** 4.0 — `LICENSE.md` is absent from the keyboard root. */
export function checkLicenseMdAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => {
    const segments = p.toLowerCase().split("/");
    return segments.length === 1 && segments[0] === "license.md";
  });
  if (hit !== undefined)
    return checkPassed("KM_LINT_LICENSE_MD_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_LICENSE_MD_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_LICENSE_MD_ABSENT",
      file: "LICENSE.md",
      message: "No LICENSE.md at the keyboard root.",
      hint: "Add a LICENSE.md with the copyright statement at the keyboard root.",
    }),
  ]);
}

/** 5.0 — `README.md` is absent from the keyboard root. */
export function checkReadmeMdAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => {
    const segments = p.toLowerCase().split("/");
    return segments.length === 1 && segments[0] === "readme.md";
  });
  if (hit !== undefined)
    return checkPassed("KM_LINT_README_MD_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_README_MD_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_README_MD_ABSENT",
      file: "README.md",
      message: "No README.md at the keyboard root.",
      hint: "Add a README.md describing the keyboard at the keyboard root.",
    }),
  ]);
}

/** 8.0 — a `.kps` package file is absent from `source/`. */
export function checkKpsAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => p.toLowerCase().endsWith(".kps"));
  if (hit !== undefined)
    return checkPassed("KM_LINT_KPS_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_KPS_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_KPS_ABSENT",
      file: "source/<keyboard-id>.kps",
      message: "No .kps package file in source/.",
      hint: "Add the source/<keyboard-id>.kps Keyman package source file.",
    }),
  ]);
}

/** 18.0 — a `.keyman-touch-layout` file is absent from the keyboard. */
export function checkTouchLayoutAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) =>
    p.toLowerCase().endsWith(".keyman-touch-layout"),
  );
  if (hit !== undefined)
    return checkPassed("KM_LINT_TOUCH_LAYOUT_ABSENT", [
      `File: ${hit}`,
      `Found: ${hit}`,
    ]);
  return checkFailed("KM_LINT_TOUCH_LAYOUT_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_TOUCH_LAYOUT_ABSENT",
      file: "source/<keyboard-id>.keyman-touch-layout",
      message: "No .keyman-touch-layout touch layout file in source/.",
      hint: "Add the source/<keyboard-id>.keyman-touch-layout touch layout file.",
    }),
  ]);
}

/** 7.0 (kvks) — a `.kvks` on-screen keyboard file is absent. */
export function checkKvksAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => p.toLowerCase().endsWith(".kvks"));
  if (hit !== undefined)
    return checkPassed("KM_LINT_KVKS_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_KVKS_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_KVKS_ABSENT",
      file: "source/<keyboard-id>.kvks",
      message: "No .kvks on-screen keyboard file in source/.",
      hint: "Add the source/<keyboard-id>.kvks visual keyboard file.",
    }),
  ]);
}

/** 7.0 (ico) — an `.ico` icon file is absent. */
export function checkIcoAbsent(paths: readonly string[]): CheckResult {
  const hit = paths.find((p) => p.toLowerCase().endsWith(".ico"));
  if (hit !== undefined)
    return checkPassed("KM_LINT_ICO_ABSENT", [`File: ${hit}`, `Found: ${hit}`]);
  return checkFailed("KM_LINT_ICO_ABSENT", [
    criteriaFinding({
      code: "KM_LINT_ICO_ABSENT",
      file: "source/<keyboard-id>.ico",
      message: "No .ico icon file for the keyboard.",
      hint: "Add the keyboard's .ico icon file (referenced by store(&BITMAP)).",
    }),
  ]);
}

/** Run all fourteen file-inventory checks over one VFS path list. */
export function checkFileInventory(paths: readonly string[]): ReturnType<typeof mergeResults> {
  return mergeResults(
    checkKeyboardInfoPresent(paths),
    checkDuplicateDocsSubfolder(paths),
    checkKpjUserPresent(paths),
    checkBuildFolderPresent(paths),
    checkHistoryMdAbsent(paths),
    checkReadmeHtmAbsent(paths),
    checkWelcomeHtmAbsent(paths),
    checkKpjAbsent(paths),
    checkLicenseMdAbsent(paths),
    checkReadmeMdAbsent(paths),
    checkKpsAbsent(paths),
    checkTouchLayoutAbsent(paths),
    checkKvksAbsent(paths),
    checkIcoAbsent(paths),
  );
}
