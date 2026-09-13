// Check 11.7 — KM_LINT_PHP_PAGENAME_FORMAT
// Criteria (criteria.json "11.7-php-pagename-format"): "`.php` `pagename`
// follows the standard help-site format." Fires when `$pagename` does not
// match the help-header contract's form for the keyboard's display name
// (contracts/help-header.md).

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, expectedPagename, parsePagename } from "./_shared.js";

/**
 * Check that the help page's `$pagename` matches the standard help-site
 * format for the keyboard's display name.
 *
 * @param input - Documentation check input (uses `members["help-php"]`
 *   and `displayName`).
 */
export function checkPagenameFormat(input: DocLintInput): LintFinding[] {
  const text = input.members["help-php"];
  if (text === undefined) return [];

  const actual = parsePagename(text);
  if (actual === null) return [];

  const expected = expectedPagename(input.displayName);
  if (actual === expected) return [];

  const path = docMemberPath("help-php", input.keyboardId);
  return [
    {
      code: "KM_LINT_PHP_PAGENAME_FORMAT",
      severity: "warning",
      layer: "C",
      message: `${path}'s $pagename is "${actual}"; expected "${expected}".`,
      location: { file: path, line: 1 },
      hint: `Set $pagename to "${expected}" — the display name, plus " Keyboard Help" (or " Help" if the name already ends in "Keyboard").`,
    },
  ];
}
