// Character inventory: the characters, punctuation and invisibles steps.
//
// characters   The build-list path the UI's chooser defaults to, not the
//              phase_b_characters YAML flow: only the build list fills the
//              character-inventory draft (the manual flow leaves it empty), and
//              the recorded keyboards' inventories carry exemplar and text
//              provenance. The screens, in order, and the product function
//              behind each:
//                prefill  confirmPrefill (the draft reset / evidence stamp),
//                         remapPostureAnswer (the pre-filled remap answer);
//                intro    resolveIntroSelection (the pre-selected discovery
//                         option, "exemplars" when the pinned index covers the
//                         tag), continueFromIntro (record, then seed the exemplar
//                         set through the draft's seedFromProposal);
//                build    an empty alphabet disables Continue, so the case's
//                         text sample is submitted first (the page's own text
//                         sample affordance); Continue is buildListDoneResult;
//                prompt   shouldPromptTextSample: while marks lack pairing
//                         evidence the text sample is harvested, then the
//                         prompt is skipped the way its Skip button does when
//                         marks still lack evidence.
//              The text sample is the case's `sampleText`: proposeTextSample-
//              Inventory -> confirmTextSample. A harvest that cannot load fails
//              the case with `network-required` (the product's own message for
//              it is a chunk-load or network failure).
// punctuation  The exemplar tier and the base group are seeded as proposals when
//              the lookup settles (seedPunctuationTier, seedPunctuationBase); the author types
//              nothing and presses Continue (completePunctuation).
// invisibles   Format characters the code-point field left behind are carried
//              over (adoptControlsAsInvisibles), nothing is toggled, Continue
//              reports one answer per offered candidate (invisiblesResult).
//
// Not driven: the position / step-walk mirrors the components publish for the
// journey strip (no decision reads them), the character map pane, and the
// flagged-additions Next gate (never blocks the build list).

import { alphabetKeyOf, punctuationKey } from "../../../steps/evidence.ts";
import { deriveIdentityResult, deriveSurveyContext } from "../../../decisions/identitySelectors.ts";
import { getDecisionSnapshot } from "../../../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../../../stores/surveyAnswerStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import {
  REMAP_POSTURE_ANSWER_ID,
  buildListDoneDisabled,
  buildListDoneResult,
  charactersCompletion,
  confirmPrefill,
  continueFromIntro,
  derivedRemapPostureOf,
  isCasedBaseOf,
  remapPostureAnswer,
  resolveIntroSelection,
  restampFlaggedAdditions,
  savedRemapChoiceOf,
  shouldPromptTextSample,
  syncRemapPostureFromPrefill,
  type IntroChoice,
} from "../../../survey/charactersStepRules.ts";
import {
  TEXT_SAMPLE_PROMPT_ANSWER_ID,
  confirmTextSample,
  proposeTextSample,
  proposeTextSampleInventory,
  textSampleSkipAnswer,
} from "../../../survey/marksTextSample.ts";
import { draftConfirmedAlphabet, invisibleDecisionsOf } from "../../../survey/phaseBDraftOps.ts";
import {
  getCharacterInventoryValue,
  getInvisiblesInventoryValue,
  inventoryOps,
} from "../../../survey/useInventoryDraft.ts";
import { resolveSourcedExemplars } from "../../../survey/sourcedExemplarsLookup.ts";
import {
  PUNCTUATION_INVENTORY_ANSWER_ID,
  PUNCTUATION_STEP_ID,
  baseCoverageOf,
  completePunctuation,
  isPunctuationAlreadyConfirmed,
  seedPunctuationBase,
  seedPunctuationTier,
} from "../../../survey/punctuation/punctuationStepRules.ts";
import {
  invisiblesCandidates,
  invisiblesCarriedOver,
  invisiblesResult,
} from "../../../survey/invisibles/invisiblesStepRules.ts";
import {
  directionAnswersFromDecisions,
  writingDirectionFrom,
} from "../../../survey/invisibles/invisibleDirection.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import { StepFailure } from "../stepFailure.ts";
import type { DriverContext, StepDrivers } from "./types.ts";

const CHARACTERS = "characters";
const INVISIBLES = "invisibles";

/** The survey answers saved for one step, as the components read them. */
const savedAnswers = (stepId: string) => useSurveyAnswerStore.getState().steps[stepId]?.answers;

/** Submit the case's text sample the way the page's affordance does, and confirm the proposal. */
async function submitTextSample(ctx: DriverContext): Promise<void> {
  const outcome = await proposeTextSampleInventory(ctx.case.sampleText);
  if (outcome.status === "error") {
    throw new StepFailure({
      step: CHARACTERS,
      decisionId: "characters.textSample",
      kind: "network-required",
      detail: "the text-sample extraction could not load (a chunk-load or network failure)",
    });
  }
  if (outcome.status === "empty") {
    ctx.report.addSkippedStep({ step: "characters.textSample", reason: "the case has no text sample to harvest" });
    return;
  }
  ctx.report.addStep(
    chooseByPolicy({
      decisionId: "characters.textSample",
      override: ctx.case.sampleText,
      suggestions: [],
      proposalSource: "proposeTextSampleInventory",
    }),
  );
  confirmTextSample(outcome.proposal, inventoryOps(CHARACTERS).seedFromProposal);
}

async function driveCharacters(ctx: DriverContext): Promise<unknown> {
  const identity = deriveIdentityResult(getDecisionSnapshot());
  const localStart = useSurveySessionStore.getState().localStart;
  if (identity === null || localStart === null) {
    // The step renders nothing here: the routing never enters it without both.
    throw new Error("the characters step has no identity or starting keyboard to confirm");
  }

  // --- prefill: the remap-posture answer is pre-filled; Confirm is the chokepoint ---
  const wc = useWorkingCopyStore.getState();
  const derived = derivedRemapPostureOf(identity.prefill, wc.startIr);
  syncRemapPostureFromPrefill(identity.prefill, wc.syncRemapPostureFromIdentity);
  const remapAnswer = remapPostureAnswer({
    derived,
    chosen: null,
    saved: savedRemapChoiceOf(savedAnswers(CHARACTERS)?.[REMAP_POSTURE_ANSWER_ID], alphabetKeyOf(identity, localStart)),
  });
  if (remapAnswer !== undefined) {
    ctx.report.addStep(
      chooseByPolicy({
        decisionId: REMAP_POSTURE_ANSWER_ID,
        suggestions: [],
        defaultValue: remapAnswer,
        proposalSource: "remapPostureAnswer",
      }),
    );
  }
  confirmPrefill(identity, localStart);
  useSurveySessionStore.getState().setCharactersSubStage("B");

  // --- intro: the discovery method, exemplars pre-selected when the index covers the tag ---
  const bcp47 = deriveSurveyContext(getDecisionSnapshot()).bcp47_tag;
  const inventory = await resolveSourcedExemplars(bcp47);
  const ops = inventoryOps(CHARACTERS);
  const pick = chooseByPolicy<IntroChoice>({
    decisionId: "characters.discoveryMethod",
    suggestions: [],
    defaultValue: resolveIntroSelection({
      authorChoice: null,
      loading: false,
      offerExemplars: inventory !== null,
      declinedBefore: getCharacterInventoryValue().exemplarMethodDeclined,
    }),
    proposalSource: "resolveIntroSelection",
  });
  ctx.report.addStep(pick);
  continueFromIntro(pick.value, inventory, bcp47, {
    record: (screenId, answers) => ctx.recorder?.recordQuestionAnswers(CHARACTERS, screenId, answers),
    seedFromProposal: ops.seedFromProposal,
    declineExemplarMethod: ops.declineExemplarMethod,
    onChoose: useSurveySessionStore.getState().setDiscoveryMethod,
  });

  // --- build list: Continue is disabled until the alphabet holds something ---
  if (buildListDoneDisabled(getCharacterInventoryValue().chars.length)) await submitTextSample(ctx);
  const draft = getCharacterInventoryValue();
  if (buildListDoneDisabled(draft.chars.length)) {
    throw new Error("the alphabet is empty: the product offers no exemplars and the case has no text sample");
  }
  restampFlaggedAdditions({
    answers: savedAnswers(CHARACTERS),
    evidenceKey: draft.alphabetEvidenceKey,
    saveAnswer: useSurveyAnswerStore.getState().saveAnswer,
  });
  const done = buildListDoneResult({
    chars: draft.chars,
    loanwordChars: draft.loanwordChars,
    exemplarDigraphs: draft.exemplarDigraphs,
    bcp47,
    isCasedBase: isCasedBaseOf(useWorkingCopyStore.getState().startIr),
  });

  // --- text-sample prompt: opens while marks lack pairing evidence ---
  const prompts = (): boolean =>
    shouldPromptTextSample(
      draftConfirmedAlphabet(getCharacterInventoryValue()),
      savedAnswers(CHARACTERS)?.[TEXT_SAMPLE_PROMPT_ANSWER_ID],
    );
  if (prompts()) {
    await submitTextSample(ctx);
    // Still lacking evidence: the author presses the prompt's Skip.
    if (prompts()) {
      const alphabet = draftConfirmedAlphabet(getCharacterInventoryValue());
      ctx.report.addSkippedStep({
        step: "characters.textSamplePrompt",
        reason: `skipped with marks still lacking pairing evidence: ${(proposeTextSample(alphabet)?.lackingMarks ?? []).join(" ")}`,
      });
      const { answerId, answer } = textSampleSkipAnswer(alphabet);
      useSurveyAnswerStore.getState().saveAnswer(CHARACTERS, answerId, answer);
    }
  }

  return charactersCompletion(done, draftConfirmedAlphabet(getCharacterInventoryValue()), remapAnswer);
}

async function drivePunctuation(ctx: DriverContext): Promise<unknown> {
  const wc = useWorkingCopyStore.getState();
  const bcp47 = deriveSurveyContext(getDecisionSnapshot()).bcp47_tag;
  const inventory = await resolveSourcedExemplars(bcp47);
  const evidenceKey = punctuationKey(inventory?.resolvedTag, wc.startKeyboard?.id);
  const alreadyConfirmed = isPunctuationAlreadyConfirmed({
    phaseResults: wc.phaseResults,
    confirmedForKey: savedAnswers(PUNCTUATION_STEP_ID)?.[PUNCTUATION_INVENTORY_ANSWER_ID]?.evidenceKey,
    evidenceKey,
  });
  const { seedProposals } = inventoryOps(PUNCTUATION_STEP_ID);
  seedPunctuationTier({ inventory, alreadyConfirmed, seedProposals });
  seedPunctuationBase({
    inventory,
    baseCoverage: baseCoverageOf(wc.ir),
    startKeyboardId: wc.startKeyboard?.id,
    alreadyConfirmed,
    seedProposals,
  });
  ctx.report.addStep(
    chooseByPolicy({
      decisionId: "punctuation-inventory",
      suggestions: [],
      defaultValue: getCharacterInventoryValue().punctuation,
      proposalSource: "seedPunctuationTier+seedPunctuationBase",
    }),
  );
  return completePunctuation({ evidenceKey, saveAnswer: useSurveyAnswerStore.getState().saveAnswer });
}

function driveInvisibles(ctx: DriverContext): unknown {
  const decisions = getDecisionSnapshot();
  const direction = writingDirectionFrom(directionAnswersFromDecisions(decisions), deriveSurveyContext(decisions));
  // The mount effect moves format characters the code-point field left in
  // `controls` into accepted decisions; the candidate list keeps offering them.
  inventoryOps(INVISIBLES).adoptControlsAsInvisibles();
  const invisibleDecisions = invisibleDecisionsOf(getInvisiblesInventoryValue());
  const candidates = invisiblesCandidates(
    direction,
    invisiblesCarriedOver(getCharacterInventoryValue().controls, invisibleDecisions),
  );
  ctx.report.addStep(
    chooseByPolicy({
      decisionId: "invisibles-inventory",
      suggestions: [],
      defaultValue: Object.keys(invisibleDecisions).filter((n) => invisibleDecisions[n] === "accepted"),
      proposalSource: "adoptControlsAsInvisibles",
    }),
  );
  return invisiblesResult(candidates, invisibleDecisions);
}

export const inventoryDrivers: StepDrivers = {
  characters: driveCharacters,
  punctuation: drivePunctuation,
  invisibles: driveInvisibles,
};
