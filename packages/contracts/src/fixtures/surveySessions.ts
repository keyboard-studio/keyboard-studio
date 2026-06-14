// see spec.md §7.1 §7.2 §8 — SurveySession fixtures for consumer tests.
// Phases are listed in chronological order per §8 (A → B → C).

import type { SurveyPhaseResult } from "../surveyPhaseResult";
import { mergePhaseResults } from "../surveySession";
import type { SurveySession } from "../surveySession";

// ---------------------------------------------------------------------------
// Reusable phase results
// ---------------------------------------------------------------------------

const phaseA: SurveyPhaseResult = {
  phase: "A",
  answers: [],
  computedAxes: { scriptClass: "alphabetic" },
};

const phaseB: SurveyPhaseResult = {
  phase: "B",
  answers: [],
  computedAxes: {
    scale: "medium",
    phoneticIntuition: "strong",
    diacriticBehavior: "stacking-combining",
    spareKeyAvailability: "many",
  },
};

const phaseC: SurveyPhaseResult = {
  phase: "C",
  answers: [],
  computedAxes: {
    multiMode: "single",
    constraintEnforcement: "none",
    clusterSensitivity: false,
    remapPosture: "addition",
  },
};

// ---------------------------------------------------------------------------
// Named session fixtures
// ---------------------------------------------------------------------------

/**
 * Completely empty session — no IR baseline, no phases completed.
 * `axes` is `{}` and `selectedPatternIds` is `[]`.
 * Used to verify consumer behaviour before any survey data is present.
 */
export const emptySession: SurveySession = mergePhaseResults({}, []);

/**
 * Phase A completed only. A2 (scriptClass) is resolved from the BCP47/IR
 * detection step; all other axes are still undefined.
 */
export const phaseASession: SurveySession = mergePhaseResults({}, [phaseA]);

/**
 * Phase A + B completed. A1/A2/A3/A4/A7 are resolved; A5/A6 and sub-axes
 * A2a/A7a are still undefined (Phase C not yet run).
 */
export const phaseABSession: SurveySession = mergePhaseResults({}, [phaseA, phaseB]);

/**
 * Full A+B+C session. All required axes resolved; sub-axes A2a (false — no
 * clusters needed) and A7a (addition — Latin-target additive) explicitly
 * elicited. Ready to pass to the §7.2 decision tree.
 */
export const fullSession: SurveySession = mergePhaseResults({}, [
  phaseA,
  phaseB,
  phaseC,
]);

/**
 * Session with an IR-derived axis baseline pre-populated before Phase A.
 * Simulates the post-#232 flow where pattern recognition seeds A1/A3/A4
 * from the imported KeyboardIR before the survey begins.
 * Phase A's A2 overrides nothing from the IR (IR did not provide scriptClass).
 */
export const irSeedSession: SurveySession = mergePhaseResults(
  { scale: "large", phoneticIntuition: "weak", diacriticBehavior: "none" },
  [phaseA]
);

// ---------------------------------------------------------------------------
// Assignment-map fixture (spec §7.7, issue #368)
// ---------------------------------------------------------------------------

/**
 * Phase C carrying a scoped assignment map: a keyboard-default deadkey strategy,
 * a per-class override for tone vowels, and an individual character (ŋ) reached
 * by two mechanisms at once (multi-access). Demonstrates the additive
 * `assignments` field alongside `selectedPatternIds`.
 */
const phaseCWithAssignments: SurveyPhaseResult = {
  phase: "C",
  answers: [],
  computedAxes: { multiMode: "single", constraintEnforcement: "none" },
  selectedPatternIds: ["latin_deadkey_acute_single"],
  assignments: [
    {
      scope: "keyboard-default",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: "latin_deadkey_acute_single", strategyId: "S-02" }],
      source: "discus-suggested",
    },
    {
      scope: "character-class",
      target: "tone-vowels",
      modality: "physical",
      mechanisms: [{ patternId: "diacritic_cycle", strategyId: "S-07" }],
      source: "user",
    },
    {
      scope: "individual",
      target: "ŋ",
      modality: "physical",
      mechanisms: [
        { patternId: "direct_key_swap", strategyId: "S-01" },
        { patternId: "latin_deadkey_acute_single", strategyId: "S-02" },
      ],
      source: "user",
    },
  ],
};

/**
 * A+B+C session whose Phase C carries a populated assignment map. `assignments`
 * on the merged session is non-empty; pass to `effectiveMechanisms` /
 * `uncoveredTargets` (assignmentMap.ts) to resolve per-character mechanisms.
 */
export const assignmentSession: SurveySession = mergePhaseResults({}, [
  phaseA,
  phaseB,
  phaseCWithAssignments,
]);
