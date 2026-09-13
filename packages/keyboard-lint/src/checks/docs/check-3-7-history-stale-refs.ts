// Check 3.7 — KM_LINT_HISTORY_STALE_FILE_REFS
// Criteria (criteria.json "3.7-history-bullets-no-deleted-files"): "HISTORY.md
// bullets do not reference files that no longer exist in the keyboard."
// Fires per bullet that names a filename in `deletedFilenames`.

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, parseHistoryEntries } from "./_shared.js";

/**
 * Check that no HISTORY.md bullet references a since-deleted file.
 *
 * @param input - Documentation check input (uses `members["history-md"]`
 *   and `deletedFilenames`).
 */
export function checkHistoryStaleFileRefs(input: DocLintInput): LintFinding[] {
  const text = input.members["history-md"];
  if (text === undefined || input.deletedFilenames.length === 0) return [];

  const path = docMemberPath("history-md", input.keyboardId);
  const findings: LintFinding[] = [];
  for (const entry of parseHistoryEntries(text)) {
    for (const bullet of entry.bullets) {
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
  return findings;
}
