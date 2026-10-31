// Inventory entries for the inventorySteps step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).
//
// The shared store hooks the drivers read (useSurveyAnswerStore) belong in the
// base INVENTORY in ../driftGuard.ts, not here: proposal entries may only be
// imported from stepDrivers/.

import type { InventoryEntry } from "./types.ts";

const CHARACTERS_STEP = "survey/CharactersStep.tsx";
const PHASE_B = "survey/PhaseB.tsx";
const RULES = "survey/charactersStepRules.ts";
const TEXT_SAMPLE = "survey/marksTextSample.ts";
const PUNCTUATION_STEP = "survey/punctuation/PunctuationStep.tsx";
const PUNCTUATION_RULES = "survey/punctuation/punctuationStepRules.ts";
const INVISIBLES_STEP = "survey/invisibles/InvisiblesStep.tsx";
const INVISIBLES_RULES = "survey/invisibles/invisiblesStepRules.ts";
const DRAFT = "survey/useInventoryDraft.ts";
const DRAFT_OPS = "survey/phaseBDraftOps.ts";

export const inventoryStepsInventory: readonly InventoryEntry[] = [
  // --- characters: prefill (CharactersStep) ---
  { fn: "confirmPrefill", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "derivedRemapPostureOf", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "syncRemapPostureFromPrefill", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "savedRemapChoiceOf", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "remapPostureAnswer", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "REMAP_POSTURE_ANSWER_ID", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "deriveIdentityResult", module: "decisions/identitySelectors.ts", callers: [CHARACTERS_STEP] },
  { fn: "alphabetKeyOf", module: "steps/evidence.ts", callers: [CHARACTERS_STEP] },
  // --- characters: intro chooser and build list (PhaseB) ---
  { fn: "resolveIntroSelection", module: RULES, callers: [PHASE_B] },
  { fn: "continueFromIntro", module: RULES, callers: [PHASE_B] },
  { fn: "buildListDoneDisabled", module: RULES, callers: [PHASE_B] },
  { fn: "buildListDoneResult", module: RULES, callers: [PHASE_B] },
  { fn: "restampFlaggedAdditions", module: RULES, callers: [PHASE_B] },
  { fn: "isCasedBaseOf", module: RULES, callers: [PHASE_B] },
  { fn: "resolveSourcedExemplars", module: "survey/sourcedExemplarsLookup.ts", callers: ["survey/useSourcedExemplars.ts"] },
  // --- characters: text sample prompt and completion ---
  { fn: "shouldPromptTextSample", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "charactersCompletion", module: RULES, callers: [CHARACTERS_STEP] },
  { fn: "TEXT_SAMPLE_PROMPT_ANSWER_ID", module: TEXT_SAMPLE, callers: [CHARACTERS_STEP] },
  { fn: "proposeTextSample", module: TEXT_SAMPLE, callers: [CHARACTERS_STEP] },
  { fn: "textSampleSkipAnswer", module: TEXT_SAMPLE, callers: [CHARACTERS_STEP] },
  { fn: "proposeTextSampleInventory", module: TEXT_SAMPLE, callers: ["survey/TextSampleAffordance.tsx"] },
  { fn: "confirmTextSample", module: TEXT_SAMPLE, callers: ["survey/TextSampleAffordance.tsx"] },
  // --- the shared inventory draft ---
  { fn: "draftConfirmedAlphabet", module: DRAFT_OPS, callers: [CHARACTERS_STEP] },
  { fn: "invisibleDecisionsOf", module: DRAFT_OPS, callers: [DRAFT] },
  { fn: "getCharacterInventoryValue", module: DRAFT, callers: [CHARACTERS_STEP] },
  { fn: "getInvisiblesInventoryValue", module: DRAFT, callers: ["survey/phaseCInventory.ts"] },
  { fn: "inventoryOps", module: DRAFT, callers: [RULES] },
  // --- punctuation ---
  { fn: "seedPunctuationTier", module: PUNCTUATION_RULES, callers: [PUNCTUATION_STEP] },
  { fn: "seedPunctuationBase", module: PUNCTUATION_RULES, callers: [PUNCTUATION_STEP] },
  { fn: "isPunctuationAlreadyConfirmed", module: PUNCTUATION_RULES, callers: [PUNCTUATION_STEP] },
  { fn: "completePunctuation", module: PUNCTUATION_RULES, callers: [PUNCTUATION_STEP] },
  { fn: "PUNCTUATION_STEP_ID", module: PUNCTUATION_RULES, callers: [PUNCTUATION_STEP] },
  { fn: "PUNCTUATION_INVENTORY_ANSWER_ID", module: PUNCTUATION_RULES, callers: [PUNCTUATION_STEP] },
  { fn: "punctuationKey", module: "steps/evidence.ts", callers: [PUNCTUATION_STEP] },
  { fn: "baseCoverageOf", module: PUNCTUATION_RULES, callers: [PUNCTUATION_STEP] },
  // --- invisibles ---
  { fn: "invisiblesCandidates", module: INVISIBLES_RULES, callers: [INVISIBLES_STEP] },
  { fn: "invisiblesCarriedOver", module: INVISIBLES_RULES, callers: [INVISIBLES_STEP] },
  { fn: "invisiblesResult", module: INVISIBLES_RULES, callers: [INVISIBLES_STEP] },
  { fn: "directionAnswersFromDecisions", module: "survey/invisibles/invisibleDirection.ts", callers: [INVISIBLES_STEP] },
  { fn: "writingDirectionFrom", module: "survey/invisibles/invisibleDirection.ts", callers: [INVISIBLES_STEP] },
];
