// Check 3.3 — KM_LINT_HISTORY_ORDER
// Criteria (criteria.json "3.3-history-recent-change-at-top"): "Most recent
// change entry is at the top of the file." Fires when the top HISTORY.md
// entry's version is not the newest among the parsed entries.

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, parseHistoryEntries, compareVersions } from "./_shared.js";

/**
 * Check that HISTORY.md's top entry is the newest version present.
 *
 * @param input - Documentation check input (uses `members["history-md"]`).
 */
export function checkHistoryOrder(input: DocLintInput): LintFinding[] {
  const text = input.members["history-md"];
  if (text === undefined) return [];

  const entries = parseHistoryEntries(text).filter(
    (e): e is typeof e & { version: string } => e.version !== null,
  );
  if (entries.length < 2) return [];

  const top = entries[0]!;
  let newest = top;
  for (const entry of entries) {
    if (compareVersions(entry.version, newest.version) > 0) newest = entry;
  }
  if (top.version === newest.version) return [];

  const path = docMemberPath("history-md", input.keyboardId);
  return [
    {
      code: "KM_LINT_HISTORY_ORDER",
      severity: "warning",
      layer: "C",
      message: `HISTORY.md's top entry is version ${top.version}, but ${newest.version} is a newer entry further down the file.`,
      location: { file: path, line: 1 },
      hint: `Move the ${newest.version} entry to the top of HISTORY.md so the most recent change is listed first.`,
    },
  ];
}
