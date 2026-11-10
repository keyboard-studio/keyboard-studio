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

  // LDML export (spec 108 FR-015): codes owned by a question surface. Routing is by code
  // alone; the rules-step codes route by step instead (LINT_CODE_TO_STEP_IDS).
  KM_LINT_LDML_FRAME_KEY:          ["physical-layout"],
  KM_LINT_LDML_FORM_KEY_MISSING:   ["physical-layout"],
  KM_LINT_LDML_SHIFT_SIDE:         ["physical-layout"],
  KM_LINT_LDML_MNEMONIC:           ["physical-layout"],
  KM_LINT_LDML_CAPS_MODE:          ["physical-layout"],
  KM_LINT_LDML_MODIFIER:           ["physical-layout"],
  KM_LINT_LDML_MODIFIER_SIDES:     ["physical-layout"],
  KM_LINT_LDML_BKSP_NO_CONTEXT:    ["physical-layout"],
  KM_LINT_LDML_TOUCH_PRESENTATION: ["touch-layout"],
  KM_LINT_LDML_TOUCH_SPECIAL_KEY:  ["touch-layout"],
  // The parser sets `readonly` only on NewContext/PostKeystroke groups, so every no-trigger
  // row is touch layer behaviour.
  KM_LINT_LDML_NO_KEY_TRIGGER:     ["touch-layout"],
  KM_LINT_LDML_NO_LOCALE:          ["iso_code"],
};

/**
 * Codes owned by a whole step rather than a question (spec 108 FR-015): the `rules` step
 * has no per-question surface, so it renders its findings as one grouped summary. Consulted
 * only when a code has no question route.
 */
export const LINT_CODE_TO_STEP_IDS: Partial<Record<LintCode, string[]>> = {
  KM_LINT_LDML_KEY_STORE:              ["rules"],
  KM_LINT_LDML_NEGATED_CLASS:          ["rules"],
  KM_LINT_LDML_CONTEXT_START:          ["rules"],
  KM_LINT_LDML_GROUP_CHAIN_PARTIAL:    ["rules"],
  KM_LINT_LDML_MATCH_NOMATCH_OUTPUT:   ["rules"],
  KM_LINT_LDML_CALL:                   ["rules"],
  KM_LINT_LDML_PLATFORM_CONDITION:     ["rules"],
  KM_LINT_LDML_OPTION_STATE:           ["rules"],
  KM_LINT_LDML_BASELAYOUT_CONDITION:   ["rules"],
  KM_LINT_LDML_LAYER_STATE:            ["rules"],
  KM_LINT_LDML_NORMALIZATION:          ["rules"],
  KM_LINT_LDML_OPAQUE:                 ["rules"],
  KM_LINT_LDML_BEEP:                   ["rules"],
  KM_LINT_LDML_EXPANSION_LIMIT:        ["rules"],
  KM_LINT_LDML_NOTANY_MULTI:           ["rules"],
  KM_LINT_LDML_CAPTURE_LIMIT:          ["rules"],
  KM_LINT_LDML_UNREACHABLE:            ["rules"],
};

/** A code the Output page owns outright: no question or step route, listed with the download. */
const LDML_CODE_PREFIX = "KM_LINT_LDML_";

/**
 * The steps that own a code: the steps of its question routes, else its step routes. An empty
 * result means the Output page owns it.
 */
function ownerStepsOf(code: LintCode): string[] {
  const steps = new Set<string>();
  for (const qid of LINT_CODE_TO_QUESTION_IDS[code] ?? []) {
    const step = QUESTION_ID_TO_STEP_ID[qid];
    if (step !== undefined) steps.add(step);
  }
  if (steps.size === 0) for (const step of LINT_CODE_TO_STEP_IDS[code] ?? []) steps.add(step);
  return [...steps];
}

/**
 * Route fallback (spec 108 FR-015): a finding whose owning step is not in the author's
 * current route is treated as unmapped and appears on the Output page. With no route given
 * every step counts as present, which is the behaviour before routes were consulted.
 */
function ownedInRoute(code: LintCode, route: ReadonlySet<string> | undefined): boolean {
  if (route === undefined) {
    return LINT_CODE_TO_QUESTION_IDS[code] !== undefined || LINT_CODE_TO_STEP_IDS[code] !== undefined;
  }
  return ownerStepsOf(code).some((step) => route.has(step));
}

export interface BuildFindingsByQuestionIdOptions {
  /**
   * When set, only distribute findings whose mapped question id is in this set.
   * Used by the headless author's Phase F driver so tens of thousands of
   * `rules`-step LDML findings are not scanned for questions that do not exist
   * on that flow (#2469).
   */
  questionIdFilter?: ReadonlySet<string>;
}

/**
 * Distribute a flat findings array into a record keyed by survey question ID.
 * A finding may appear under multiple question IDs if its code maps to several.
 * Findings with no mapping entry are silently omitted here; use
 * selectUnmappedFindings to retrieve them for the Output screen.
 */
export function buildFindingsByQuestionId(
  findings: LintFinding[],
  route?: ReadonlySet<string>,
  options?: BuildFindingsByQuestionIdOptions,
): Record<string, LintFinding[]> {
  const filter = options?.questionIdFilter;
  const result: Record<string, LintFinding[]> = {};
  for (const finding of findings) {
    const questionIds = LINT_CODE_TO_QUESTION_IDS[finding.code];
    if (!questionIds) continue;
    if (route !== undefined && !ownedInRoute(finding.code, route)) continue;
    for (const qid of questionIds) {
      if (filter !== undefined && !filter.has(qid)) continue;
      (result[qid] ??= []).push(finding);
    }
  }
  return result;
}

/**
 * Findings with no surface in the current route: a code with no question or step route, or
 * one whose owning step is absent from `route`. These won't appear as inline question
 * chips; their owner surface is the Output screen (#2145), where the accumulated
 * set renders beside the documentation checklist.
 * This is also the natural surface for synthetic infrastructure findings (e.g.
 * KM_WARN_* validator/lint-crash codes) which by definition map to no survey
 * question — the Output surface filters those out (never author-facing).
 */
export function selectUnmappedFindings(
  findings: LintFinding[],
  route?: ReadonlySet<string>,
): LintFinding[] {
  return findings.filter((f) => !ownedInRoute(f.code, route));
}

/** The findings a step owns by step route (not by question): the rules step's grouped summary. */
export function selectStepOwnedFindings(
  findings: LintFinding[],
  stepId: string,
): LintFinding[] {
  return findings.filter(
    (f) => !LINT_CODE_TO_QUESTION_IDS[f.code] && (LINT_CODE_TO_STEP_IDS[f.code] ?? []).includes(stepId),
  );
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
 * question chips (and the step-owned summaries) render. A finding whose code
 * maps to several questions on the SAME step counts once for that step; a
 * finding mapped to questions on different steps counts once per step.
 * Unmapped findings contribute nothing — they have no step owner (their
 * surface is the Output screen). A `KM_LINT_LDML_*` code counts once per
 * step however many findings carry it, hints included, so a step with 300
 * option-state warnings and 2 call warnings badges 2 (spec 108 FR-018).
 */
export function buildStepWarningCounts(
  findings: LintFinding[],
  route?: ReadonlySet<string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const ldmlSeen = new Set<string>();
  for (const finding of findings) {
    if (!ownedInRoute(finding.code, route)) continue;
    const isLdml = finding.code.startsWith(LDML_CODE_PREFIX);
    for (const step of ownerStepsOf(finding.code)) {
      if (isLdml) {
        const key = `${step}|${finding.code}`;
        if (ldmlSeen.has(key)) continue;
        ldmlSeen.add(key);
      }
      counts[step] = (counts[step] ?? 0) + 1;
    }
  }
  return counts;
}
