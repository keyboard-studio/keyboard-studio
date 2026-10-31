// Check 3.4 — KM_LINT_HISTORY_TRUNCATED
// Criteria (criteria.json "3.4-history-cumulative"): "HISTORY.md is
// cumulative — prior entries are preserved, not overwritten." Fires when a
// base HISTORY.md entry present at instantiation (`DocLintInput.startHistoryMdText`,
// data-model.md §7) is missing from the current text.

import type { DocLintInput } from "@keyboard-studio/contracts";
import { docMemberPath, parseHistoryEntries } from "./_shared.js";
import { checkFailed, checkPassed, type CheckResult } from "../criteria/_shared.js";

function entryKey(version: string, date: string | null): string {
  return `${version}\u0000${date ?? ""}`;
}

/**
 * Check that every base HISTORY.md entry present at instantiation is still
 * present in the current text (by version + date).
 *
 * @param input - Documentation check input (uses `startHistoryMdText` and
 *   `members["history-md"]`).
 */
export function checkHistoryCumulative(input: DocLintInput): CheckResult {
  const code = "KM_LINT_HISTORY_TRUNCATED";
  const baseText = input.startHistoryMdText;
  const currentText = input.members["history-md"];
  if (baseText === undefined || currentText === undefined)
    return checkPassed(code, ["No base HISTORY.md to compare against."]);

  const baseEntries = parseHistoryEntries(baseText).filter(
    (e): e is typeof e & { version: string } => e.version !== null,
  );
  if (baseEntries.length === 0) return checkPassed(code, ["No base entries to preserve."]);

  const currentKeys = new Set(
    parseHistoryEntries(currentText)
      .filter((e): e is typeof e & { version: string } => e.version !== null)
      .map((e) => entryKey(e.version, e.date)),
  );

  const missing = baseEntries.filter((e) => !currentKeys.has(entryKey(e.version, e.date)));
  if (missing.length === 0)
    return checkPassed(code, [
      "File: " + docMemberPath("history-md", input.keyboardId),
      `All ${baseEntries.length} base entr${baseEntries.length === 1 ? "y" : "ies"} preserved.`,
    ]);

  const path = docMemberPath("history-md", input.keyboardId);
  const versions = missing.map((e) => e.version).join(", ");
  const plural = missing.length === 1;
  return checkFailed(code, [
    {
      code: "KM_LINT_HISTORY_TRUNCATED",
      severity: "warning",
      layer: "C",
      message: `HISTORY.md is missing ${plural ? "an entry" : "entries"} from the base keyboard: ${versions}.`,
      location: { file: path, line: 1 },
      hint: `Restore the ${versions} HISTORY.md entr${plural ? "y" : "ies"} instead of overwriting it — HISTORY.md must be cumulative.`,
    },
  ]);
}
