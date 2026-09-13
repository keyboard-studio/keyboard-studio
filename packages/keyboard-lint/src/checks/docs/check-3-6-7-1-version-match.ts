// Checks 3.6 and 7.1 — KM_LINT_HISTORY_VERSION_MISMATCH / KM_LINT_KMN_VERSION_MISMATCH
// Criteria: 3.6 "Top HISTORY.md entry version matches the version in the
// `.kmn` file"; 7.1 "`.kmn` version matches `HISTORY.md` top entry" — the
// same fact viewed from each file's side (contracts/lint-checks.md). One
// comparison, both codes emitted at most once each, message naming both
// versions (spec 076 US7-1).

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, parseHistoryEntries } from "./_shared.js";

/**
 * Check that HISTORY.md's top entry version matches the keyboard's `.kmn`
 * version, emitting both the HISTORY-side and `.kmn`-side codes when it
 * doesn't.
 *
 * @param input - Documentation check input (uses `members["history-md"]`
 *   and `keyboardVersion`).
 */
export function checkHistoryVersionMatch(input: DocLintInput): LintFinding[] {
  const text = input.members["history-md"];
  if (text === undefined) return [];

  const entries = parseHistoryEntries(text).filter(
    (e): e is typeof e & { version: string } => e.version !== null,
  );
  const top = entries[0];
  if (top === undefined) return [];
  if (top.version === input.keyboardVersion) return [];

  const historyPath = docMemberPath("history-md", input.keyboardId);
  const kmnPath = `source/${input.keyboardId}.kmn`;
  const message = `HISTORY.md's top entry is version ${top.version}, but the .kmn file's version is ${input.keyboardVersion}.`;

  return [
    {
      code: "KM_LINT_HISTORY_VERSION_MISMATCH",
      severity: "warning",
      layer: "C",
      message,
      location: { file: historyPath, line: 1 },
      hint: `Update HISTORY.md's top entry to version ${input.keyboardVersion} to match the .kmn file, or bump the .kmn version to ${top.version}.`,
    },
    {
      code: "KM_LINT_KMN_VERSION_MISMATCH",
      severity: "warning",
      layer: "C",
      message,
      location: { file: kmnPath, line: 1 },
      hint: `Update the .kmn file's version to ${top.version} to match HISTORY.md's top entry, or update HISTORY.md's top entry to ${input.keyboardVersion}.`,
    },
  ];
}
