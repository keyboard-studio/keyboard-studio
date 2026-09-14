// Check 5.7 — KM_LINT_README_TARGETS_MISMATCH
// Criteria (criteria.json "5.7-readme-targets-match-kmn"): "Targets listed in
// README.md match those in the `.kmn`." Fires naming each extra (in README,
// not in `.kmn`) or missing (in `.kmn`, not in README) platform (spec 076
// US7-2).

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, parseReadmePlatforms } from "./_shared.js";

/**
 * Check that README.md's "Supported Platforms" list matches the `.kmn`
 * TARGETS list exactly.
 *
 * @param input - Documentation check input (uses `members["readme-md"]`
 *   and `targets`).
 */
export function checkReadmeTargets(input: DocLintInput): LintFinding[] {
  const text = input.members["readme-md"];
  if (text === undefined) return [];

  const listed = parseReadmePlatforms(text);
  const listedSet = new Set(listed);
  const targetSet = new Set(input.targets);

  const missing = input.targets.filter((t) => !listedSet.has(t));
  const extra = listed.filter((t) => !targetSet.has(t));
  if (missing.length === 0 && extra.length === 0) return [];

  const path = docMemberPath("readme-md", input.keyboardId);
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
  if (extra.length > 0) parts.push(`extra: ${extra.join(", ")}`);

  return [
    {
      code: "KM_LINT_README_TARGETS_MISMATCH",
      severity: "warning",
      layer: "C",
      message: `README.md's Supported Platforms list does not match the .kmn TARGETS (${parts.join("; ")}).`,
      location: { file: path, line: 1 },
      hint: `Update README.md's Supported Platforms list so it names exactly the .kmn TARGETS platforms.`,
    },
  ];
}
