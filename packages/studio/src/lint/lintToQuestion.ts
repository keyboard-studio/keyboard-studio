import type { LintFinding } from "@keyboard-studio/contracts";

// Sparse mapping from LintCode string to the survey question IDs where
// showing that finding inline is genuinely useful to the author.
// Codes not listed here have no natural survey-question remediation surface
// and will not appear as inline chips (they're still visible in LintSummary).
const LINT_CODE_TO_QUESTION_IDS: Partial<Record<string, string[]>> = {
  // Character inventory (Phase B)
  KM_LINT_INVENTORY_UNCOVERED:    ["pb_standard_letters", "pb_special_letters"],
  KM_LINT_MANDATED_CHAR_MISSING:  ["pb_standard_letters"],
  KM_LINT_MATH_LATIN_LOOKALIKE:   ["pb_special_letters", "pb_special_letters_list"],
  KM_LINT_PUA_KEYBOARD_PLACEMENT: ["pb_special_letters", "pb_special_letters_list"],

  // Identity (IdentityLite)
  KM_LINT_DISPLAY_NAME_UNDERSCORE: ["language_name_english"],
  KM_LINT_KPS_NUMERIC_REGION_TAG:  ["region"],
};

/**
 * Distribute a flat findings array into a record keyed by survey question ID.
 * A finding may appear under multiple question IDs if its code maps to several.
 * Findings with no mapping entry are silently omitted.
 */
export function buildFindingsByQuestionId(
  findings: LintFinding[],
): Record<string, LintFinding[]> {
  const result: Record<string, LintFinding[]> = {};
  for (const finding of findings) {
    const questionIds = LINT_CODE_TO_QUESTION_IDS[finding.code];
    if (!questionIds) continue;
    for (const qid of questionIds) {
      (result[qid] ??= []).push(finding);
    }
  }
  return result;
}
