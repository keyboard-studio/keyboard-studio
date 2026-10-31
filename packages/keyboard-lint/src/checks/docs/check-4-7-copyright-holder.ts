// Check 4.7 — KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT
// Criteria (criteria.json "4.7-copyright-holder-consistent-across-files"):
// "Copyright holder name is identical across `LICENSE.md`, `.kmn`, `.kps`,
// `README.md`, and `HISTORY.md`." Absent files are skipped (only present
// holder strings are compared).

import type { DocLintInput } from "@keyboard-studio/contracts";
import { docMemberPath } from "./_shared.js";
import { checkFailed, checkPassed, type CheckResult } from "../criteria/_shared.js";

const HOLDER_SOURCES = ["license", "kmn", "kps", "readme", "history"] as const;

/**
 * Check that every present copyright-holder string names the same holder.
 *
 * @param input - Documentation check input (uses `copyrightHolders`).
 */
export function checkCopyrightHolder(input: DocLintInput): CheckResult {
  const code = "KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT";
  const present: Array<{ source: (typeof HOLDER_SOURCES)[number]; value: string }> = [];
  for (const source of HOLDER_SOURCES) {
    const value = input.copyrightHolders[source];
    if (value !== undefined) present.push({ source, value });
  }
  if (present.length < 2)
    return checkPassed(code, [
      `Only ${present.length} file${present.length === 1 ? "" : "s"} declare${present.length === 1 ? "s" : ""} a holder — nothing to compare.`,
    ]);

  const first = present[0]!.value;
  const mismatched = present.some(({ value }) => value !== first);
  if (!mismatched)
    return checkPassed(code, [
      "File: " + docMemberPath("license-md", input.keyboardId),
      `Holder "${first}" consistent across ${present.length} files (${present.map((p) => p.source).join(", ")}).`,
    ]);

  const path = docMemberPath("license-md", input.keyboardId);
  const summary = present.map(({ source, value }) => `${source}: "${value}"`).join("; ");
  return checkFailed(code, [
    {
      code: "KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT",
      severity: "warning",
      layer: "C",
      message: `Copyright holder is not identical across files: ${summary}.`,
      location: { file: path, line: 1 },
      hint: `Use the same copyright holder name in LICENSE.md, the .kmn file, the .kps file, README.md, and HISTORY.md.`,
    },
  ]);
}
