// Check 1.13 (foreign arm) — KM_LINT_STRAY_SCRATCH_FILES (spec 084
// Batch 1, CHECK-NOW in foreign mode).
//
// No stray scratch or test files in the keyboard folder. In AUTHORED
// mode this criterion is precertified by generation (closed output
// manifest) and this scan never runs — see CriteriaLintInput.scratchScan.
// A foreign keyboard makes no generation claim, so its folder is
// actually scanned: backup/temp/editor artefacts and obvious scratch
// names are findings. Deliberately pattern-based and conservative — a
// real source file merely containing "test" in a longer name is not
// flagged (fixtures and test data are judged by human review, not by a
// name scan pretending to certainty).

import {
  baseNameLower,
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/** File names / suffixes that mark an artefact, not a shipped source. */
const SCRATCH_SUFFIXES: readonly string[] = [
  ".bak",
  ".tmp",
  ".swp",
  ".swo",
  ".orig",
  ".rej",
  "~",
];

const SCRATCH_NAMES: ReadonlySet<string> = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
]);

const SCRATCH_STEMS: readonly RegExp[] = [
  /^test\d*\./,
  /^temp\d*\./,
  /^tmp\d*\./,
  /^scratch/,
  /^untitled/,
  /^new file/,
  / - copy(\.|$)/,
  /^\.~lock\./,
];

/** True when one VFS path names a scratch/test artefact. */
export function isScratchPath(path: string): boolean {
  const base = baseNameLower(path);
  if (SCRATCH_NAMES.has(base)) return true;
  if (SCRATCH_SUFFIXES.some((s) => base.endsWith(s))) return true;
  return SCRATCH_STEMS.some((re) => re.test(base));
}

/** 1.13 foreign arm — one finding naming every scratch artefact found. */
export function checkStrayScratchFiles(
  filePaths: readonly string[],
): CheckResult {
  const offenders = filePaths.filter(isScratchPath);
  if (offenders.length === 0)
    return checkPassed("KM_LINT_STRAY_SCRATCH_FILES", [
      `Scanned ${filePaths.length} file(s): no scratch or test artefacts.`,
    ]);
  return checkFailed("KM_LINT_STRAY_SCRATCH_FILES", [
    criteriaFinding({
      code: "KM_LINT_STRAY_SCRATCH_FILES",
      file: offenders[0]!,
      message: `The keyboard folder contains stray scratch/test file(s): ${offenders.join(", ")}.`,
      hint: "Remove scratch, backup, and test files from the keyboard folder before submitting.",
    }),
  ]);
}
