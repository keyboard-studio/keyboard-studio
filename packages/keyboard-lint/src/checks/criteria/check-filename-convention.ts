// Check 1.15 — KM_LINT_FILENAME_CONVENTION.
//
// All files in the keyboard folder follow the filename convention (kmc
// KM0400F WARN_FileInPackageDoesNotFollowFilenameConventions): the
// extension is all lower case, and the filename contains only
// alphanumerics, `-`, `_`, `+` and `.`. Case-sensitive filesystems and
// toolchains break on `.PNG` (#4136) or non-ASCII names (#4184).

import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/** Allowed filename characters per KM0400F (after the basename is taken). */
const NAME_CHARS = /^[A-Za-z0-9\-_+.]+$/;

function basenameOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}

/** 1.15 — one aggregated finding naming every offending file. */
export function checkFilenameConvention(
  filePaths: readonly string[],
): CheckResult {
  const offenders: string[] = [];
  for (const p of filePaths) {
    const base = basenameOf(p);
    if (base === "") continue;
    const dot = base.lastIndexOf(".");
    // A leading dot is not an extension separator (`.gitignore`).
    const ext = dot <= 0 ? "" : base.slice(dot + 1);
    const badExt = ext !== "" && ext !== ext.toLowerCase();
    const badName = !NAME_CHARS.test(base);
    if (badExt || badName) offenders.push(p);
  }
  if (offenders.length > 0) {
    return checkFailed("KM_LINT_FILENAME_CONVENTION", [
      criteriaFinding({
        code: "KM_LINT_FILENAME_CONVENTION",
        file: offenders[0]!,
        message: `File(s) do not follow the filename convention (lowercase extension; only alphanumerics, -, _, + and .): ${offenders.join(", ")}.`,
        hint: "Rename the file(s): lowercase the extension and remove any other characters.",
      }),
    ]);
  }
  return checkPassed("KM_LINT_FILENAME_CONVENTION", [
    `Checked ${filePaths.length} file(s): all filenames follow the convention.`,
  ]);
}
