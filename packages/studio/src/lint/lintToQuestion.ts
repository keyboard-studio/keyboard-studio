import type { LintFinding, LintCode } from "@keyboard-studio/contracts";

// Sparse mapping from LintCode string to the survey question IDs where
// showing that finding inline is genuinely useful to the author.
// Codes not listed here have no natural survey-question remediation surface
// and will not appear as inline chips. Use selectUnmappedFindings to collect
// them for display in a global LintSummary outside the survey question flow.
const LINT_CODE_TO_QUESTION_IDS: Partial<Record<LintCode, string[]>> = {
  // Character inventory (Phase B)
  KM_LINT_INVENTORY_UNCOVERED:   ["pb_standard_letters", "pb_special_letters"],
  KM_LINT_MANDATED_CHAR_MISSING: ["pb_standard_letters"],
  // KM_LINT_MATH_LATIN_LOOKALIKE and KM_LINT_PUA_KEYBOARD_PLACEMENT removed:
  // both fire against compiled-output codepoints — the author cannot fix them
  // by changing a survey inventory answer (layer-confusion: Layer C artifact
  // check presented as a survey-remediation chip).

  // Identity (IdentityLite)
  KM_LINT_DISPLAY_NAME_UNDERSCORE:        ["language_name_english"],
  KM_LINT_KPS_NUMERIC_REGION_TAG:         ["region"],
  KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE: ["region"],
  KM_LINT_REGION_001_TAG:                 ["region"],
  KM_LINT_ISO_639_5_LANG_CODE:            ["iso_code"],
};

/**
 * Distribute a flat findings array into a record keyed by survey question ID.
 * A finding may appear under multiple question IDs if its code maps to several.
 * Findings with no mapping entry are silently omitted here; use
 * selectUnmappedFindings to retrieve them for the global LintSummary.
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

/**
 * Findings whose code has no survey-question remediation surface (not present
 * in LINT_CODE_TO_QUESTION_IDS). These won't appear as inline question chips,
 * so the survey flow renders them in a global LintSummary instead.
 * This is also the natural surface for synthetic infrastructure findings (e.g.
 * KM_WARN_* validator/lint-crash codes) which by definition map to no survey
 * question.
 */
export function selectUnmappedFindings(findings: LintFinding[]): LintFinding[] {
  return findings.filter((f) => !LINT_CODE_TO_QUESTION_IDS[f.code]);
}
