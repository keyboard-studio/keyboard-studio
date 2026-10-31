// Check 11.5 — KM_LINT_HTML_NOT_WELL_FORMED
// Criteria (criteria.json "11.5-php-htm-html-wellformed"): "HTML in
// `welcome.htm` and `.php` is well-formed — balanced tags, proper headings,
// no unclosed elements (in-browser check via DOMParser)." Implemented with
// the dependency-free tag-balance scanner in `_shared.ts` rather than
// DOMParser (spec 080 research R7 — see that module's header for why).

import type { DocLintInput, DocMemberId } from "@keyboard-studio/contracts";
import { docMemberPath, findUnbalancedTags, stripPhpHeader } from "./_shared.js";
import { checkFailed, checkPassed, mergeResults, type CheckResult } from "../criteria/_shared.js";

const CHECKED_MEMBERS: readonly DocMemberId[] = ["welcome-htm", "help-php"];

/**
 * Check that welcome.htm and the help page's HTML have balanced, properly
 * closed elements.
 *
 * @param input - Documentation check input (uses `members["welcome-htm"]`
 *   and `members["help-php"]`).
 */
export function checkHtmlWellFormed(input: DocLintInput): CheckResult {
  const code = "KM_LINT_HTML_NOT_WELL_FORMED";
  const results: CheckResult[] = [];
  for (const member of CHECKED_MEMBERS) {
    const raw = input.members[member];
    const path = docMemberPath(member, input.keyboardId);
    if (raw === undefined) {
      results.push(checkPassed(code, []));
      continue;
    }
    // The help page's PHP header block is not HTML; scan the body only, the
    // same way the 11.9 / 11.10 body checks do.
    const text = member === "help-php" ? stripPhpHeader(raw) : raw;
    const unbalanced = findUnbalancedTags(text);
    if (unbalanced.length === 0) {
      results.push(checkPassed(code, ["File: " + path, "HTML well-formed."]));
      continue;
    }

    const tags = [...new Set(unbalanced.map((u) => u.tag))].join(", ");
    results.push(
      checkFailed(code, [
        {
          code: "KM_LINT_HTML_NOT_WELL_FORMED",
          severity: "warning",
          layer: "C",
          message: `${path} has unbalanced or unclosed HTML element(s): ${tags}.`,
          location: { file: path, line: 1 },
          hint: `Check that every opening tag (${tags}) in ${path} has a matching, properly nested closing tag.`,
        },
      ]),
    );
  }
  const merged = mergeResults(...results);
  return { code, findings: merged.findings, verified: merged.verifiedByCode.get(code) ?? [] };
}
