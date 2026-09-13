// Check 3.5 — KM_LINT_HISTORY_ENTRY_FORMAT
// Criteria (criteria.json "3.5-history-entry-format"): "Each entry follows
// `<version> (<YYYY-MM-DD>)` format ... and bullet items." The tool's own
// generators (scaffolder generateStubs, output/adapt-staging stageAdaptHistory)
// emit ATX `## <version> (<YYYY-MM-DD>)` headings followed by `*`/`-` bullets —
// that is the shape checked here, not the criteria prose's hyphen-underline
// wording (which predates the generator).

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, parseHistoryEntries } from "./_shared.js";

/**
 * Check that every HISTORY.md entry heading is `<version> (<YYYY-MM-DD>)`
 * followed by one or more bullet lines, with no stray non-bullet body text.
 *
 * @param input - Documentation check input (uses `members["history-md"]`).
 */
export function checkHistoryEntryFormat(input: DocLintInput): LintFinding[] {
  const text = input.members["history-md"];
  if (text === undefined) return [];

  const entries = parseHistoryEntries(text);
  const bad = entries.filter(
    (e) => e.version === null || !e.dateValid || e.bullets.length === 0 || e.strayLines.length > 0,
  );
  if (bad.length === 0) return [];

  const path = docMemberPath("history-md", input.keyboardId);
  const headings = bad.map((e) => (e.headingRaw !== "" ? e.headingRaw : "(unparsable heading)")).join(", ");
  const plural = bad.length !== 1;
  return [
    {
      code: "KM_LINT_HISTORY_ENTRY_FORMAT",
      severity: "warning",
      layer: "C",
      message: `HISTORY.md entr${plural ? "ies" : "y"} not in "<version> (<YYYY-MM-DD>)" plus bullet-list format: ${headings}.`,
      location: { file: path, line: 1 },
      hint: `Format each HISTORY.md entry as "## <version> (<YYYY-MM-DD>)" followed by one or more "* " or "- " bullet lines.`,
    },
  ];
}
