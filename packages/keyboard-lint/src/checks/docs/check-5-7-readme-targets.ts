// Check 5.7 — KM_LINT_README_TARGETS_MISMATCH
// Criteria (criteria.json "5.7-readme-targets-match-kmn"): "Targets listed in
// README.md match those in the `.kmn`." Fires naming each extra (in README,
// not in `.kmn`) or missing (in `.kmn`, not in README) platform (spec 080
// US7-2). Both sides are compared as concrete platform sets, so the `.kmn`'s
// `any` matches a README listing "Windows, macOS, Linux, Web, iOS, Android".

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, expandPlatforms, parseReadmePlatforms } from "./_shared.js";

/**
 * Check that README.md's "Supported Platforms" list covers exactly the
 * platforms the `.kmn` TARGETS list covers. Composite targets (`any`,
 * `desktop`, `mobile`, `tablet`) and README display names (`iOS`, `Android`,
 * `MacOS`) are expanded to concrete platforms before comparing.
 *
 * @param input - Documentation check input (uses `members["readme-md"]`
 *   and `targets`).
 */
export function checkReadmeTargets(input: DocLintInput): LintFinding[] {
  const text = input.members["readme-md"];
  if (text === undefined) return [];

  const listedSet = expandPlatforms(parseReadmePlatforms(text));
  const targetSet = expandPlatforms(input.targets);

  const missing = [...targetSet].filter((t) => !listedSet.has(t));
  const extra = [...listedSet].filter((t) => !targetSet.has(t));
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
