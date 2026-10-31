// Check 3.7 — KM_LINT_HISTORY_STALE_FILE_REFS
// Criteria (criteria.json "3.7-history-bullets-no-deleted-files"): "HISTORY.md
// bullets do not reference files that no longer exist in the keyboard."
// Fires per bullet that names a filename in `deletedFilenames`.

import type { DocLintInput } from "@keyboard-studio/contracts";
import { docMemberPath, parseHistoryEntries } from "./_shared.js";
import { checkFailed, checkPassed, type CheckResult } from "../criteria/_shared.js";

/**
 * Check that no HISTORY.md bullet references a since-deleted file.
 *
 * @param input - Documentation check input (uses `members["history-md"]`
 *   and `deletedFilenames`).
 */
export function checkHistoryStaleFileRefs(input: DocLintInput): CheckResult {
  const code = "KM_LINT_HISTORY_STALE_FILE_REFS";
  const text = input.members["history-md"];
  const code_path = docMemberPath("history-md", input.keyboardId);
  if (text === undefined) return checkPassed(code, ["No HISTORY.md to check."]);
  if (input.deletedFilenames.length === 0)
    return checkPassed(code, [
      "File: " + code_path,
      "No deleted files to check references against.",
    ]);

  const path = code_path;
  const findings: import("@keyboard-studio/contracts").LintFinding[] = [];
  let bulletCount = 0;
  for (const entry of parseHistoryEntries(text)) {
    for (const bullet of entry.bullets) {
      bulletCount++;
      const deleted = input.deletedFilenames.find((f) => bullet.includes(f));
      if (deleted === undefined) continue;
      findings.push({
        code: "KM_LINT_HISTORY_STALE_FILE_REFS",
        severity: "warning",
        layer: "C",
        message: `HISTORY.md bullet "${bullet}" references "${deleted}", which no longer exists in the keyboard.`,
        location: { file: path, line: 1 },
        hint: `Remove or update the HISTORY.md reference to "${deleted}" since that file was deleted.`,
      });
    }
  }
  if (findings.length === 0)
    return checkPassed(code, [
      "File: " + path,
      `All ${bulletCount} bullet file reference${bulletCount === 1 ? "" : "s"} resolve.`,
    ]);
  return checkFailed(code, findings);
}
