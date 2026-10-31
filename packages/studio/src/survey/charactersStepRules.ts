// charactersStepRules -- the characters step's decisions as plain functions, so
// the UI (CharactersStep, PhaseB's IntroChooser and BuildListView) and a
// headless caller (spec 107's scripted author) take the same path.
//
// What the author sees, in screen order, and the function behind each:
//
//   PREFILL   `syncRemapPostureFromPrefill` (the mount effect that reconciles
//             the irAxes baseline), `remapPostureAnswer` / `savedRemapChoiceOf`
//             (the pre-filled "addition"/"full-remap" answer); Confirm is
//             CharactersStep's `confirmPrefill`.
//   INTRO     `resolveIntroSelection` (the pre-selected discovery option) and
//             `continueFromIntro` (Continue: record the choice, seed or
//             decline the exemplar set, hand on the resolved method).
//   BUILD     `restampFlaggedAdditions` and `buildListDoneResult` (Done: the
//             result, with each cased letter's counterpart recorded too).
//   PROMPT    `shouldPromptTextSample` (does Done open the #1784 prompt), then
//             marksTextSample.ts for the harvest.
//   COMPLETE  `charactersCompletion` (the alphabet and remap axis attached).

import type {
  ConfirmedAlphabet,
  StartKeyboard,
  KeyboardIR,
  RemapPosture,
  ScriptClass,
  SurveyAnswer,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import {
  CASING_FACET_ID,
  caseCounterpart,
  deriveRemapPosture,
  getEffectiveFacet,
} from "@keyboard-studio/engine";
import type { SourcedInventory } from "@keyboard-studio/engine";
import type { ExemplarInventory } from "../lib/services.ts";
import type { SavedAnswer } from "../steps/answerTypes.ts";
import type { DiscoveryMethod } from "../stores/surveySessionStore.ts";
import { alphabetKeyOf, graphemeFitsScript } from "../steps/evidence.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import type { IdentityLiteResult } from "./identityLiteResult.ts";
import { getCharacterInventoryValue, inventoryOps } from "./useInventoryDraft.ts";
import { nfcDedup } from "./charNormUtils.ts";
import { ADDITION_ANSWER_PREFIX, CHARACTERS_BUILD_LIST_SCREEN_ID, deriveCharacterFlags } from "./characterFlags.ts";
import { PUNCTUATION_BASE_SEED_PREFIX, PUNCTUATION_TIER_SEED_PREFIX } from "./punctuation/punctuationStepRules.ts";
import { isTextSamplePromptDismissed, proposeTextSample } from "./marksTextSample.ts";

/** The survey-answer id the A7a remap-posture confirmation records under. */
export const REMAP_POSTURE_ANSWER_ID = "characters.remapPosture";

// ---------------------------------------------------------------------------
// Casing gate
// ---------------------------------------------------------------------------

/**
 * Whether ANY case behaviour happens on the characters step (spec 048 FR-006):
 * decided once from the starting point's `casing` facet. "cased"/"mixed" opens
 * the gate; a caseless start (or none yet) closes it.
 */
export function isCasedBaseOf(startIr: KeyboardIR | null | undefined): boolean {
  const casingValue = startIr != null ? getEffectiveFacet(startIr, CASING_FACET_ID).value : undefined;
  return casingValue === "cased" || casingValue === "mixed";
}

// ---------------------------------------------------------------------------
// Prefill: Confirm
// ---------------------------------------------------------------------------

/** Manifest step id -- matches steps/manifest.ts's "characters" entry. */
const CHARACTERS_STEP_ID = "characters";

/** Seed-key prefixes the punctuation step records (punctuationStepRules). */
const PUNCTUATION_SEED_PREFIXES = [PUNCTUATION_TIER_SEED_PREFIX, PUNCTUATION_BASE_SEED_PREFIX] as const;

/**
 * The prefill confirm — the ONE chokepoint every route into the build list
 * passes (Back from Phase B, Done on Project name, Done on the adapt track:
 * steps/advance.ts leaves them all at substage "prefill"), so FR-020 holds on
 * every route by construction (spec 079 R-07).
 *
 * - Unchanged evidence with a built alphabet: nothing is reset. The author
 *   returns to the build list where they were — `discoveryMethod` survives the
 *   trip through prefill, so PhaseB reopens on the same screen (FR-004).
 * - A different key is a real shape change: fresh alphabet, the punctuation
 *   seeds tied to the old evidence cleared so its defaults are proposed again
 *   (FR-022), and the new key stamped. Carrying the author's edits across is
 *   US3's carry-over reset.
 * - No stamp is a first build — or a new working copy, whose instantiate
 *   cleared the stamp but not the previous project's draft — so it resets
 *   too. A draft saved before spec 079 is stamped on restore instead
 *   (lib/draftPersistence.ts `loadDraft`), so it is never mistaken for one.
 *
 * A REAL change is a carry-over reset (spec 079 US3 T059, R-07 steps 1-7),
 * so nothing the author already decided is silently dropped:
 *   1. snapshot the author's own additions (provenance "author") before
 *      `reset()` wipes `picks`/`provenance` — proposal-origin characters are
 *      re-seeded by the normal proposal path (IntroChooser / seedProposals),
 *      not carried here;
 *   2-3. reset, then clear the punctuation seed keys tied to the old
 *      evidence (unchanged from before this task);
 *   4. re-seeding for the NEW evidence happens the normal way once PhaseB
 *      re-renders against the fresh (empty) draft;
 *   5. `rejected` is untouched by `reset()` (phaseBDraftOps.ts), so a
 *      removal the author made of a PROPOSED character is re-applied for
 *      free — nothing here needs to replay it;
 *   6-7. every author addition is re-added regardless of fit (`draft.add`
 *      never drops one); an addition whose codepoints no longer belong to
 *      the new target script is ALSO saved as a `characters.addition.<ch>`
 *      answer stamped with the OLD key, so `reconcile()`/`characterFlags.ts`
 *      renders it `reproposed{outside-script}` until the author reconfirms
 *      or removes it (T080).
 */
export function confirmPrefill(identity: IdentityLiteResult, base: StartKeyboard): void {
  const draft = getCharacterInventoryValue();
  const ops = inventoryOps(CHARACTERS_STEP_ID);
  const key = alphabetKeyOf(identity, base);
  const oldKey = draft.alphabetEvidenceKey;
  if (draft.chars.length > 0 && oldKey === key) return;

  // A real shape change only when there was a built alphabet to carry over —
  // a first build (no stamp yet) or an already-empty draft has nothing to
  // snapshot.
  const authorAdditions =
    oldKey !== undefined && draft.chars.length > 0
      ? Object.entries(draft.provenance)
          .filter(([, origin]) => origin === "author")
          .map(([grapheme]) => grapheme)
      : [];

  ops.reset();
  if (oldKey !== undefined) {
    ops.clearSeededProposals(PUNCTUATION_SEED_PREFIXES);
  }
  ops.setAlphabetEvidenceKey(key);

  if (authorAdditions.length === 0) return;
  const targetScript = identity.prefill.script;
  const saveAnswer = useSurveyAnswerStore.getState().saveAnswer;
  for (const grapheme of authorAdditions) {
    ops.add(grapheme);
    if (!graphemeFitsScript(grapheme, targetScript)) {
      saveAnswer(CHARACTERS_STEP_ID, `${ADDITION_ANSWER_PREFIX}${grapheme}`, {
        value: grapheme,
        answerType: "char-list",
        origin: "confirmed",
        stage: "confirmed",
        evidenceKey: oldKey ?? null,
        screenId: "build-list",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Prefill: the remap-posture confirmation
// ---------------------------------------------------------------------------

/** The identity's prefill fields the remap derivation reads. */
export interface RemapPrefill {
  scriptClass: ScriptClass;
  script: string;
}

/** The posture the derivation proposes, or undefined when it does not fire. */
export function derivedRemapPostureOf(
  prefill: RemapPrefill | undefined,
  startIr: KeyboardIR | null,
): RemapPosture | undefined {
  return prefill !== undefined && startIr !== null
    ? deriveRemapPosture({ scriptClass: prefill.scriptClass, targetScript: prefill.script, baseIr: startIr })
    : undefined;
}

/**
 * The mount effect: when the target script lands, reconcile the working copy's
 * irAxes baseline. `sync` is the store's `syncRemapPostureFromIdentity`.
 */
export function syncRemapPostureFromPrefill(
  prefill: RemapPrefill | undefined,
  sync: (identity: { scriptClass: ScriptClass; targetScript: string }) => void,
): void {
  if (prefill !== undefined) sync({ scriptClass: prefill.scriptClass, targetScript: prefill.script });
}

/**
 * The author's saved remap choice, valid only for the current evidence key: a
 * base or script change re-derives the key and the old choice no longer applies.
 */
export function savedRemapChoiceOf(
  saved: Pick<SavedAnswer, "value" | "evidenceKey"> | undefined,
  evidenceKey: string | undefined,
): RemapPosture | undefined {
  return saved?.evidenceKey === evidenceKey && (saved?.value === "addition" || saved?.value === "full-remap")
    ? saved.value
    : undefined;
}

/**
 * The posture the prefill screen shows: a choice made this session, else the
 * restored one, else the derived value; undefined when the derivation does not
 * fire (nothing renders and nothing is recorded).
 */
export function remapPostureAnswer(args: {
  derived: RemapPosture | undefined;
  chosen: RemapPosture | null;
  saved: RemapPosture | undefined;
}): RemapPosture | undefined {
  return args.derived !== undefined ? (args.chosen ?? args.saved ?? args.derived) : undefined;
}

// ---------------------------------------------------------------------------
// Intro chooser
// ---------------------------------------------------------------------------

/**
 * The chooser's own option vocabulary. `"exemplars"` is NOT a `DiscoveryMethod`:
 * accepting the exemplar set lands on the same build-list page, prefilled, so
 * it resolves to `"build-list"` on Continue.
 */
export type IntroChoice = DiscoveryMethod | "exemplars";

/**
 * The selected option: the author's choice, else the derived default (the
 * exemplar option whenever an offer exists and was not declined, else
 * "build-list"). A choice of "exemplars" with no offer falls back to build-list.
 */
export function resolveIntroSelection(args: {
  authorChoice: IntroChoice | null;
  loading: boolean;
  offerExemplars: boolean;
  declinedBefore: boolean;
}): IntroChoice {
  const defaultChoice: IntroChoice =
    !args.loading && args.offerExemplars && !args.declinedBefore ? "exemplars" : "build-list";
  return args.authorChoice === "exemplars" && !args.offerExemplars
    ? "build-list"
    : (args.authorChoice ?? defaultChoice);
}

export interface IntroContinueDeps {
  /** The step's per-screen recorder (`useRecordQuestionAnswers`). */
  record: (screenId: string, answers: readonly SurveyAnswer[]) => void;
  seedFromProposal: (inventory: SourcedInventory, bcp47?: string) => void;
  declineExemplarMethod: () => void;
  onChoose: (method: DiscoveryMethod) => void;
}

/** What the chooser's Continue does. `inventory` is the exemplar offer (null when none). */
export function continueFromIntro(
  selected: IntroChoice,
  inventory: ExemplarInventory | null,
  bcp47: string | undefined,
  deps: IntroContinueDeps,
): void {
  // Record the choice on this screen's own Next, before dispatching it --
  // "exemplars" resolves to the "build-list" DiscoveryMethod either way, so the
  // recorded value matches what onChoose below actually sets.
  const resolvedMethod: DiscoveryMethod = selected === "exemplars" ? "build-list" : selected;
  deps.record("intro", [
    { questionId: "phaseB.discoveryMethod", answerType: "select", value: resolvedMethod },
  ]);

  if (selected === "exemplars" && inventory !== null) {
    // Exactly once, here -- never on the prefill -> B transition. seedFromProposal
    // is idempotent, so a Back-and-Continue is safe.
    deps.seedFromProposal(inventory, bcp47);
    deps.onChoose("build-list");
    return;
  }
  // Any other choice, when an offer was actually available, is a decline --
  // remembered so it is never re-asserted as the default.
  if (inventory !== null) deps.declineExemplarMethod();
  deps.onChoose(selected as DiscoveryMethod);
}

// ---------------------------------------------------------------------------
// Build list: Done
// ---------------------------------------------------------------------------

/**
 * Done on the build list re-stamps every flagged carried-over addition with the
 * CURRENT evidence key (the author has seen the alphabet in full): the
 * confirm/keep action that clears the flag.
 */
export function restampFlaggedAdditions(args: {
  answers: Readonly<Record<string, SavedAnswer>> | undefined;
  evidenceKey: string | undefined;
  saveAnswer: (stepId: string, answerId: string, answer: Omit<SavedAnswer, "savedAt">) => void;
}): void {
  const flagged = deriveCharacterFlags(args.answers ?? {}, args.evidenceKey ?? "");
  for (const f of flagged) {
    const grapheme = f.answerId.slice(ADDITION_ANSWER_PREFIX.length);
    args.saveAnswer("characters", f.answerId, {
      value: grapheme,
      answerType: "char-list",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey: args.evidenceKey ?? null,
      screenId: CHARACTERS_BUILD_LIST_SCREEN_ID,
    });
  }
}

/** The build list's Continue is disabled with an empty alphabet. */
export function buildListDoneDisabled(charCount: number): boolean {
  return charCount === 0;
}

/**
 * The result the build list's Done reports: each cased letter's locale-correct
 * counterpart is recorded too (spec 047 FR-009; a null counterpart contributes
 * nothing), behind the casing gate. Loanword letters are needed, so they are in
 * the inventory, but they stay out of the alphabet.
 */
export function buildListDoneResult(args: {
  chars: readonly string[];
  loanwordChars: readonly string[];
  exemplarDigraphs: readonly string[];
  bcp47: string | undefined;
  isCasedBase: boolean;
}): SurveyPhaseResult {
  const derivedUppercases = args.isCasedBase
    ? args.chars
        .map((c) => caseCounterpart(c, args.bcp47)?.counterpart)
        .filter((u): u is string => u != null)
    : [];
  return {
    phase: "B",
    answers: [],
    confirmedInventory: nfcDedup(nfcDedup([...args.chars], derivedUppercases), [...args.loanwordChars]),
    // Always emitted, `[]` included: recordPhase merges per field.
    loanwordChars: [...args.loanwordChars],
    ...(args.exemplarDigraphs.length > 0 ? { attestedDigraphs: [...args.exemplarDigraphs] } : {}),
  };
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

/** Completing discovery while marks lack pairing evidence defers behind the text-sample prompt. */
export function shouldPromptTextSample(
  alphabet: ConfirmedAlphabet,
  savedPromptAnswer: Pick<SavedAnswer, "value"> | undefined,
): boolean {
  return proposeTextSample(alphabet) !== null && !isTextSamplePromptDismissed(savedPromptAnswer, alphabet);
}

/**
 * The characters step's completion: the three-store ConfirmedAlphabet rides
 * alongside the flat confirmedInventory when the draft has any (a manual-flow
 * completion leaves it absent), and the confirmed remap posture rides as a
 * tier-1 computed axis (stripped when the derivation no longer fires, since
 * recordPhase merges over the prior same-phase entry).
 */
export function charactersCompletion(
  result: SurveyPhaseResult,
  alphabet: ConfirmedAlphabet,
  remapAnswer: RemapPosture | undefined,
): SurveyPhaseResult {
  const hasStores =
    alphabet.bases.length > 0 || alphabet.marks.length > 0 || alphabet.attestedStacks.length > 0;
  let withAxes: SurveyPhaseResult = result;
  if (remapAnswer !== undefined) {
    withAxes = { ...result, computedAxes: { ...result.computedAxes, remapPosture: remapAnswer } };
  } else if (result.computedAxes?.remapPosture !== undefined) {
    const { remapPosture: _stalePosture, ...restAxes } = result.computedAxes;
    withAxes = { ...result, computedAxes: restAxes };
  }
  return hasStores ? { ...withAxes, alphabet } : withAxes;
}
