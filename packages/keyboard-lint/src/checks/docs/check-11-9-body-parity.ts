// Check 11.9 — KM_LINT_PHP_HTM_BODY_MISMATCH
// Criteria (criteria.json "11.9-php-htm-body-parity"): "`welcome.htm` and
// `.php` body content are identical after stripping headers and normalizing
// whitespace" (spec 076 US7-3).

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, normalizeDocBody } from "./_shared.js";

/**
 * Check that the welcome page and the help page render the same body
 * content, once the help page's PHP header and the welcome-only "Keyboard
 * Layout" section are stripped and whitespace is normalized.
 *
 * @param input - Documentation check input (uses `members["welcome-htm"]`
 *   and `members["help-php"]`).
 */
export function checkBodyParity(input: DocLintInput): LintFinding[] {
  const welcome = input.members["welcome-htm"];
  const help = input.members["help-php"];
  if (welcome === undefined || help === undefined) return [];

  if (normalizeDocBody(welcome) === normalizeDocBody(help)) return [];

  const path = docMemberPath("help-php", input.keyboardId);
  return [
    {
      code: "KM_LINT_PHP_HTM_BODY_MISMATCH",
      severity: "warning",
      layer: "C",
      message: `source/welcome/welcome.htm and ${path} bodies differ after stripping headers and normalizing whitespace.`,
      location: { file: path, line: 1 },
      hint: `Keep the welcome page and help page body content identical — only the help page's header (and the welcome page's own layout images) may differ.`,
    },
  ];
}
