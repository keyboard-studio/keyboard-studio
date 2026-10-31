import type { LintFinding, LintCode } from "@keyboard-studio/contracts";

// Sparse mapping from LintCode string to the survey question IDs where
// showing that finding inline is genuinely useful to the author.
// Codes not listed here have no natural survey-question remediation surface
// and will not appear as inline chips. Use selectUnmappedFindings to collect
// them for their owner surface instead (issue #2145's placement model: a
// warning lives only where it can be acted on — unmapped findings surface
// at the Output screen, never at the top of the survey pane).
const LINT_CODE_TO_QUESTION_IDS: Partial<Record<LintCode, string[]>> = {
  // Character inventory (Phase B)
  KM_LINT_INVENTORY_UNCOVERED:   ["pb_standard_letters", "pb_special_letters"],
  KM_LINT_MANDATED_CHAR_MISSING: ["pb_standard_letters"],
  // KM_LINT_MATH_LATIN_LOOKALIKE and KM_LINT_PUA_KEYBOARD_PLACEMENT removed:
  // both fire against compiled-output codepoints — the author cannot fix them
  // by changing a survey inventory answer (layer-confusion: Layer C artifact
  // check presented as a survey-remediation chip).

  // Desktop key assignment (physical-layout gallery decision): a glyph
  // whose only typing route is the oe2 key cannot be typed on ANSI
  // hardware, and placement is decided in the mechanisms gallery — so the
  // finding chips on that decision and badges the mechanisms step, never
  // a pane-top or global notice.
  KM_LINT_OE2_SOLE_SOURCE_GLYPH: ["physical-layout"],

  // Touch key identity (spec 104 FR-024): a producing touch key no rule
  // defines (dead in Keyman) and a touch rule no key exercises are both
  // acted on in the touch gallery — the key property panel's identity
  // section names the criterion and the repair — so the findings chip on
  // the touch-layout decision and badge the touch step, exactly the
  // physical-layout shape above. (These Layer C codes reach this map when
  // the findings carrying them are in the findings array; the criteria
  // pipeline computes them from the same resolver the panel reads.)
  KM_LINT_TOUCH_KEY_NO_RULE: ["touch-layout"],
  KM_LINT_TOUCH_RULE_ORPHAN: ["touch-layout"],

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
 * selectUnmappedFindings to retrieve them for the Output screen.
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
 * in LINT_CODE_TO_QUESTION_IDS). These won't appear as inline question chips;
 * their owner surface is the Output screen (#2145), where the accumulated
 * set renders beside the documentation checklist.
 * This is also the natural surface for synthetic infrastructure findings (e.g.
 * KM_WARN_* validator/lint-crash codes) which by definition map to no survey
 * question — the Output surface filters those out (never author-facing).
 */
export function selectUnmappedFindings(findings: LintFinding[]): LintFinding[] {
  return findings.filter((f) => !LINT_CODE_TO_QUESTION_IDS[f.code]);
}

// ---------------------------------------------------------------------------
// Owner steps (#2145): the step that owns each mapped question, so the
// journey-strip badge for a step is driven by the SAME findings its inline
// question chips render — one data source, so badge and in-page flag can
// never disagree (the useWorkToDo pattern).
// ---------------------------------------------------------------------------

/** The survey step that owns a mapped question ID. */
const QUESTION_ID_TO_STEP_ID: Readonly<Record<string, string>> = {
  // Character inventory (Phase B) questions live on the characters step.
  pb_standard_letters: "characters",
  pb_special_letters: "characters",
  // IdentityLite questions live on the identity step.
  language_name_english: "identity",
  region: "identity",
  iso_code: "identity",
  // The physical-layout gallery decision is the mechanisms step's surface.
  "physical-layout": "mechanisms",
  // The touch-layout gallery decision is the touch step's surface (spec 104).
  "touch-layout": "touch",
};

/**
 * Warning counts per owning step, from the same mapped findings the inline
 * question chips render (`buildFindingsByQuestionId`). A finding whose code
 * maps to several questions on the SAME step counts once for that step; a
 * finding mapped to questions on different steps counts once per step.
 * Unmapped findings contribute nothing — they have no step owner (their
 * surface is the Output screen).
 */
export function buildStepWarningCounts(
  findings: LintFinding[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) {
    const questionIds = LINT_CODE_TO_QUESTION_IDS[finding.code];
    if (!questionIds) continue;
    const steps = new Set<string>();
    for (const qid of questionIds) {
      const step = QUESTION_ID_TO_STEP_ID[qid];
      if (step !== undefined) steps.add(step);
    }
    for (const step of steps) counts[step] = (counts[step] ?? 0) + 1;
  }
  return counts;
}
