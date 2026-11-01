// Check 11.10 — KM_LINT_PHP_HTM_STYLE_MISMATCH
// Criteria (criteria.json "11.10-php-htm-style-parity"): "CSS in `welcome.htm`
// and `.php` are identical modulo non-rendering whitespace."

import type { DocLintInput } from "@keyboard-studio/contracts";
import { arraysEqual, docMemberPath, extractInlineStyles } from "./_shared.js";
import { checkFailed, checkPassed, type CheckResult } from "../criteria/_shared.js";

/**
 * Check that the welcome page and the help page carry the same inline CSS
 * (`style="..."` attributes and `<style>` blocks), ignoring non-rendering
 * whitespace differences.
 *
 * @param input - Documentation check input (uses `members["welcome-htm"]`
 *   and `members["help-php"]`).
 */
export function checkStyleParity(input: DocLintInput): CheckResult {
  const code = "KM_LINT_PHP_HTM_STYLE_MISMATCH";
  const welcome = input.members["welcome-htm"];
  const help = input.members["help-php"];
  if (welcome === undefined || help === undefined)
    return checkPassed(code, ["welcome.htm or help.php absent — nothing to compare."]);

  const welcomeStyles = extractInlineStyles(welcome);
  const helpStyles = extractInlineStyles(help);
  const path = docMemberPath("help-php", input.keyboardId);
  if (arraysEqual(welcomeStyles, helpStyles))
    return checkPassed(code, [
      "File: " + path,
      `${welcomeStyles.length} inline style${welcomeStyles.length === 1 ? "" : "s"} identical modulo whitespace.`,
    ]);

  return checkFailed(code, [
    {
      code: "KM_LINT_PHP_HTM_STYLE_MISMATCH",
      severity: "warning",
      layer: "C",
      message: `source/welcome/welcome.htm and ${path} have different inline CSS.`,
      location: { file: path, line: 0 },
      hint: `Keep inline styles identical between the welcome page and the help page (non-rendering whitespace differences are fine).`,
    },
  ]);
}
