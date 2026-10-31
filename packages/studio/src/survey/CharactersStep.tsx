// CharactersStep — self-contained characters step adapter (spec 027 Stage 4).
//
// Owns the prefill -> PhaseB substage internally. Since spec 090 T021 this
// component is the `character-inventory` gallery module's RENDERER, hosted
// by CharactersStepHost (the manifest component): navigation arrives via
// GalleryStepContext, and the Phase B draft it drives is the recorded
// decision value — edited through the shared inventory-draft surface
// (useInventoryDraft.ts, research D-090-10), never a store write.
//
// Store reads:
//   surveySessionStore: identityResult, localStart, surveyContext, charactersSubStage
//   workingCopyStore:   validatorFindings (via useValidatorFindings hook)
//
// No survey-level side effects (Article IV / G2): the component reports
// completion and back via the step context; the host (SurveyView) runs the
// reducer path.
//
// placementMap is intentionally omitted from PhaseB props (D-INT-2, v1).

import { useEffect, useRef, useState, type ComponentType } from "react";
import type {
  LintFinding,
  RemapPosture,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import type { SurveyContext } from "./types.ts";
import type { Decision, DecisionId, DecisionRendererProps } from "../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../steps/galleryHost.tsx";
import { alphabetKeyOf } from "../steps/evidence.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { deriveIdentityResult, deriveSurveyContext } from "../decisions/identitySelectors.ts";
import { draftConfirmedAlphabet, type CharacterInventoryValue } from "./phaseBDraftOps.ts";
import {
  getCharacterInventoryValue,
  useCharacterInventoryValue,
} from "./useInventoryDraft.ts";
import type { IdentityLiteResult } from "./identityLiteResult.ts";
import type { KeyboardIR, StartKeyboard } from "@keyboard-studio/contracts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useStepWalkStore, peekStepCursor } from "../stores/stepWalkStore.ts";
import type { StepWalkPositions } from "../lib/stepWalk.ts";
import { useValidatorFindings } from "../hooks/useValidatorFindings.ts";
import { MarksTextSamplePrompt } from "./MarksTextSamplePrompt.tsx";
import {
  TEXT_SAMPLE_PROMPT_ANSWER_ID,
  proposeTextSample,
  textSampleSkipAnswer,
} from "./marksTextSample.ts";
import {
  REMAP_POSTURE_ANSWER_ID,
  confirmPrefill,
  charactersCompletion,
  derivedRemapPostureOf,
  remapPostureAnswer,
  savedRemapChoiceOf,
  shouldPromptTextSample,
  syncRemapPostureFromPrefill,
} from "./charactersStepRules.ts";
// The substage views (Prefill, PhaseB) arrive through the gallery
// host's step-context extras, supplied by CharactersStepHost — NOT by
// import. Both views transitively import the question registry
// (PhaseB via steps/flowSources, Prefill via IdentityLite), and since
// T021 the registry imports THIS component (as the character-inventory
// module's renderer, via the module file): importing either view from
// here — statically, lazily, or even type-only (this repo's depcruise
// counts a type-only import of a .tsx module as an import edge) —
// closes that cycle in the static module graph (depcruise
// no-circular — the D-090-7 cycle, closed for good in T060). Their
// prop shapes are therefore mirrored structurally below, from types
// this file already imports.
import { Suspense } from "react";

/**
 * The extras shape CharactersStepHost supplies (see galleryHost.tsx).
 * The prop shapes mirror PrefillProps / the PhaseBProps subset this
 * component passes — structural typing keeps the real components
 * assignable without an import edge to their files.
 */
export interface CharactersStepExtras {
  Prefill: ComponentType<{
    identity: IdentityLiteResult;
    base: StartKeyboard;
    startIr?: KeyboardIR | null;
    onConfirm: () => void;
    onBack?: () => void;
    remapConfirmation?: {
      value: RemapPosture;
      onChange: (next: RemapPosture) => void;
    };
    identityEdits?: {
      onLanguageName: (value: string) => void;
      onTargetScript: (rawValue: string) => void;
      languageEdited?: boolean;
      scriptEdited?: boolean;
    };
  }>;
  PhaseB: ComponentType<{
    context?: SurveyContext;
    onComplete: (result: SurveyPhaseResult) => void;
    onBack?: () => void;
    findingsByQuestionId?: Record<string, LintFinding[]>;
  }>;
}
// The survey-answer id recording a #1784 text-sample-prompt dismissal. The
// value is `skipped:<alphabet key>` — keyed by alphabet content so a
// genuinely changed alphabet re-arms the prompt.

// Manifest step id — matches steps/manifest.ts's "characters" entry.
//
// SINGLE WRITER (spec 079 T035/T081/FR-004): this component is the ONLY place
// that writes this step's surveyAnswerStore position. Two writers sharing one
// slot (this component's coarse "prefill"/"B" and PhaseB's own "intro"/
// "build-list") used to overwrite each other and race on restore; now the
// vocabulary is PhaseB's screen id — "prefill" | "intro" | "build-list" — all
// written from here by combining `charactersSubStage` with `discoveryMethod`
// (both already live in surveySessionStore). While discoveryMethod ===
// "manual" the position is instead a question id owned entirely by
// SurveyRunner's own per-question cursor (spec 079 T031, same step id) — this
// component must never write while manual, and PhaseB writes nothing here at
// all any more (see PhaseB.tsx's module comment).
//
// Restore-from-position is a fallback only: charactersSubStage and
// discoveryMethod are themselves already restored via surveySessionStore's
// own persisted snapshot on an app reload, so this only fills the gap for a
// same-session deep link (lib/jumpToLocation.ts writes the position directly,
// ahead of the remount that reads it) or a bare mock (a mocked PhaseB in a
// unit test) that never reaches PhaseB's own state to restore it.
const CHARACTERS_STEP_ID = "characters";

/**
 * Self-contained characters step adapter — the `character-inventory`
 * module's renderer (spec 090 T021).
 *
 * Bases the prefill -> PhaseB substage driven by the persisted
 * `charactersSubStage` store slot, so back-from-carve remounts at PhaseB
 * rather than replaying prefill (spec 027 §4). The DecisionRendererProps
 * value is the shared accumulator's current record; the draft edits
 * themselves flow through useInventoryDraft (D-090-10), so the props are
 * accepted for the contract and not otherwise consumed here.
 */
const CharactersStep: ComponentType<DecisionRendererProps<CharacterInventoryValue>> = () => {
  const { onComplete, onBack, extras } = useGalleryStepContext();
  const views = extras as unknown as CharactersStepExtras | undefined;
  const Prefill = views?.Prefill;
  const PhaseB = views?.PhaseB;
  // --- store reads (selectors) ---
  // Spec 089 FR-005: identity + context are derived from the decision store.
  const decisions = useDecisionStore((s) => s.decisions);
  const identityResult = deriveIdentityResult(decisions);
  const localStart = useSurveySessionStore((s) => s.localStart);
  const surveyContext = deriveSurveyContext(decisions);
  const charactersSubStage = useSurveySessionStore((s) => s.charactersSubStage);
  const setCharactersSubStage = useSurveySessionStore((s) => s.setCharactersSubStage);
  const discoveryMethod = useSurveySessionStore((s) => s.discoveryMethod);
  const setDiscoveryMethod = useSurveySessionStore((s) => s.setDiscoveryMethod);
  const setPosition = useSurveyAnswerStore((s) => s.setPosition);

  const findingsByQuestionId = useValidatorFindings();

  // #1784: completing character discovery while marks lack letter+mark
  // pairing evidence defers the real completion behind the text-sample
  // prompt. The PhaseB result waits here until the harvest covers the
  // marks (predicate clears) or the designer skips.
  const [deferredResult, setDeferredResult] = useState<SurveyPhaseResult | null>(null);
  const draftValue = useCharacterInventoryValue();

  // --- A7a remap-posture confirmation (spec §7.2 rule 8) ---
  // The derived producer: the target identity (decision spine) crossed with
  // the base IR (the instantiated start). When it fires, the prefill
  // surface below presents "full-remap" as a pre-filled, changeable
  // answer; the recorded choice rides this step's phase result as a
  // tier-1 computed axis, outranking the irAxes baseline the store
  // reconciles from the same derivation. Nothing renders and nothing is
  // recorded when the derivation does not fire.
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const syncRemapPosture = useWorkingCopyStore((s) => s.syncRemapPostureFromIdentity);
  const identityPrefill = identityResult?.prefill;
  const derivedRemapPosture = derivedRemapPostureOf(identityPrefill, startIr);

  // The derivation runs when the target script lands — the identity is
  // composed before this step renders — reconciling the irAxes baseline.
  const prefillScript = identityPrefill?.script;
  const prefillScriptClass = identityPrefill?.scriptClass;
  useEffect(() => {
    if (prefillScript !== undefined && prefillScriptClass !== undefined) {
      syncRemapPostureFromPrefill({ scriptClass: prefillScriptClass, script: prefillScript }, syncRemapPosture);
    }
  }, [prefillScript, prefillScriptClass, startIr, syncRemapPosture]);

  // The author's recorded choice, stamped with the current evidence key:
  // a base or script change re-derives the key and the old choice no
  // longer applies (the derived prefill stands again). A choice made this
  // session wins over the restored one.
  const remapEvidenceKey =
    identityResult !== null && localStart !== null
      ? alphabetKeyOf(identityResult, localStart)
      : undefined;
  const savedRemapAnswer = useSurveyAnswerStore(
    (s) => s.steps[CHARACTERS_STEP_ID]?.answers[REMAP_POSTURE_ANSWER_ID],
  );
  const savedRemapChoice: RemapPosture | undefined = savedRemapChoiceOf(savedRemapAnswer, remapEvidenceKey);
  const [remapChoice, setRemapChoice] = useState<RemapPosture | null>(null);
  useEffect(() => {
    setRemapChoice(null);
  }, [remapEvidenceKey]);
  const remapAnswer: RemapPosture | undefined = remapPostureAnswer({
    derived: derivedRemapPosture,
    chosen: remapChoice,
    saved: savedRemapChoice,
  });

  // --- Prefill inline edits (issue 542) ---
  // The Language / Script rows on the prefill screen edit the identity
  // step's OWN decision records — the single source of truth
  // deriveIdentityResult reads — so the identity this component passes
  // back down to Prefill (and every downstream derivation: script class,
  // routing group, BCP 47, the remap posture above, the alphabet evidence
  // key) recomputes from the edited value. No Prefill-local override
  // exists. The replacement record is stamped with this step and carries
  // the replaced value as `offered`, which is what lets Prefill mark the
  // row "edited by you" — including after a draft restore, since the
  // decision set is the persisted slice. A later identity-step re-answer
  // rewrites the record under the identity step and the mark clears.
  const languageNameRecord = useDecisionStore((s) => s.decisions["language-name"]);
  const targetScriptRecord = useDecisionStore((s) => s.decisions["target-script"]);
  const prefillIdentityEdits = {
    onLanguageName: (value: string) => recordPrefillIdentityEdit("language-name", value),
    onTargetScript: (rawValue: string) => recordPrefillIdentityEdit("target-script", rawValue),
    languageEdited:
      languageNameRecord?.step === CHARACTERS_STEP_ID && languageNameRecord.offered !== undefined,
    scriptEdited:
      targetScriptRecord?.step === CHARACTERS_STEP_ID && targetScriptRecord.offered !== undefined,
  };

  function recordPrefillIdentityEdit(id: DecisionId, value: string): void {
    const current = useDecisionStore.getState().decisions[id];
    if (current?.value === value) return;
    const next: Decision = {
      ...current,
      id,
      value,
      provenance: "asked",
      step: CHARACTERS_STEP_ID,
    };
    // The replaced value is the offer the author overrode (FR-001's
    // `offered` contract); an absent/empty prior value leaves no offer.
    if (typeof current?.value === "string" && current.value !== "") {
      next.offered = current.value;
    } else {
      delete next.offered;
    }
    // An extraction source named the value's origin; an author-stated
    // value has none.
    delete next.source;
    useDecisionStore.getState().record(next);
  }

  function handleRemapChange(next: RemapPosture): void {
    setRemapChoice(next);
    if (remapEvidenceKey !== undefined) {
      useSurveyAnswerStore.getState().saveAnswer(CHARACTERS_STEP_ID, REMAP_POSTURE_ANSWER_ID, {
        value: next,
        answerType: "select",
        origin: "confirmed",
        stage: "confirmed",
        evidenceKey: remapEvidenceKey,
        screenId: "prefill",
      });
    }
  }

  /** The pre-existing completion path: attach the confirmed alphabet and advance. */
  function completeCharacters(result: SurveyPhaseResult): void {
    // Read the draft NOW so pairs harvested in the #1784 prompt land in the
    // attached alphabet; see charactersCompletion for the alphabet and the A7a
    // remap-posture axis.
    onComplete(charactersCompletion(result, draftConfirmedAlphabet(getCharacterInventoryValue()), remapAnswer));
  }

  function handlePhaseBComplete(result: SurveyPhaseResult): void {
    const alphabet = draftConfirmedAlphabet(getCharacterInventoryValue());
    const savedPrompt = useSurveyAnswerStore.getState().steps[CHARACTERS_STEP_ID]?.answers[TEXT_SAMPLE_PROMPT_ANSWER_ID];
    if (shouldPromptTextSample(alphabet, savedPrompt)) {
      setDeferredResult(result);
      return;
    }
    completeCharacters(result);
  }

  function handlePromptSkip(): void {
    const { answerId, answer } = textSampleSkipAnswer(draftConfirmedAlphabet(getCharacterInventoryValue()));
    useSurveyAnswerStore.getState().saveAnswer(CHARACTERS_STEP_ID, answerId, answer);
    const done = deferredResult;
    setDeferredResult(null);
    if (done !== null) completeCharacters(done);
  }

  // A harvest inside the prompt re-derives the draft through the shared
  // inventory ops; once every mark has pairing evidence, fire the
  // deferred completion with the enriched alphabet.
  useEffect(() => {
    if (deferredResult === null) return;
    if (proposeTextSample(draftConfirmedAlphabet(draftValue)) === null) {
      setDeferredResult(null);
      completeCharacters(deferredResult);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completeCharacters closes over stable store accessors
  }, [deferredResult, draftValue]);

  // Restore, once, on a fresh mount: if charactersSubStage is still at its
  // default "prefill" but a finer position was saved for this step, the
  // author had reached "B" before — land there rather than replaying prefill
  // (FR-004), also restoring `discoveryMethod` so PhaseB renders the right
  // branch immediately (IntroChooser / BuildListView / the manual
  // SurveyRunner walk) instead of always landing back on the intro chooser.
  // A saved token that is neither "intro" nor "build-list" is a SurveyRunner
  // question id (the manual path) — SurveyRunner reads the SAME saved
  // position itself (its own restore, spec 079 T031) once discoveryMethod
  // says "manual", so nothing further is written here for that case.
  // Only fires once per mount; a genuine Back to prefill afterwards is the
  // author's own choice and must not be reverted by this effect running
  // again.
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current) return;
    restoredOnce.current = true;
    if (charactersSubStage === "prefill") {
      const saved = peekStepCursor(CHARACTERS_STEP_ID);
      if (saved !== undefined && saved !== "prefill") {
        setCharactersSubStage("B");
        if (saved === "build-list") setDiscoveryMethod("build-list");
        else if (saved !== "intro") setDiscoveryMethod("manual");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once by design (restoredOnce guard)
  }, []);

  // Mirror the step's position into the answer store on every change — the
  // ONLY writer for this step's position slot (see the module comment
  // above). While inside "B" the value is `discoveryMethod`'s own vocabulary
  // ("intro" for the chooser, "build-list" once chosen); while
  // discoveryMethod === "manual" nothing is written here at all —
  // SurveyRunner owns that finer per-question cursor.
  useEffect(() => {
    if (charactersSubStage === "prefill") {
      setPosition(CHARACTERS_STEP_ID, "prefill");
      return;
    }
    if (discoveryMethod === "manual") return;
    setPosition(CHARACTERS_STEP_ID, discoveryMethod === null ? "intro" : discoveryMethod);
  }, [charactersSubStage, discoveryMethod, setPosition]);

  // R-11/T061: publish this step's coarse screens as its walk, so the footer
  // gets a question mark per screen the way marks' stations do. While
  // discoveryMethod === "manual" nothing is published here — SurveyRunner
  // publishes the finer per-question walk for that sub-flow under this same
  // step id, and a second publisher here would race it.
  const publishStepWalk = useStepWalkStore((s) => s.publishStepWalk);
  // The build list is done once it holds letters — not when every optional
  // box on it has been filled.
  const hasDraftLetters = draftValue.chars.length > 0;
  useEffect(() => {
    if (discoveryMethod === "manual") return;
    const stops: StepWalkPositions =
      charactersSubStage === "prefill"
        ? [{ id: "prefill", done: false }]
        : [
            { id: "prefill", done: true },
            { id: "intro", done: discoveryMethod !== null },
            ...(discoveryMethod === "build-list" ? [{ id: "build-list", done: hasDraftLetters }] : []),
          ];
    publishStepWalk(CHARACTERS_STEP_ID, stops);
  }, [publishStepWalk, charactersSubStage, discoveryMethod, hasDraftLetters]);

  // #1784 prompt: a deferred completion renders the text-sample prompt in
  // place of PhaseB until the harvest covers the marks or the designer
  // skips. Back returns to the build list (Done re-fires the prompt).
  if (deferredResult !== null) {
    const proposal = proposeTextSample(draftConfirmedAlphabet(draftValue));
    if (proposal !== null) {
      return (
        <MarksTextSamplePrompt
          lackingMarks={proposal.lackingMarks}
          hadTextSample={proposal.hadTextSample}
          onBack={() => setDeferredResult(null)}
          onSkip={handlePromptSkip}
        />
      );
    }
    // Raced the harvest-resolution effect above; fall through and let it
    // fire the deferred completion on this render's commit.
  }

  // Guard: prefill requires both identity and base (unreachable once the step
  // is properly entered, but matches today's null fallback).
  if (charactersSubStage === "prefill") {
    if (identityResult === null || localStart === null || Prefill === undefined) {
      return null;
    }
    return (
      <Prefill
        identity={identityResult}
        base={localStart}
        startIr={startIr}
        onConfirm={() => {
          // Only this prefill -> B transition may reset the draft alphabet —
          // never a BuildListView/CharacterMapPane render — and only when the
          // evidence it was built from changed (confirmPrefill above).
          confirmPrefill(identityResult, localStart);
          setCharactersSubStage("B");
        }}
        // Conditionally spread (not `() => onBack?.()`) — F7 sweep: an
        // always-truthy wrapper would make Prefill always render its own Back
        // button (Prefill gates on `onBack !== undefined`) even when StepHost
        // omitted onBack because there is genuinely nothing to back into.
        {...(onBack !== undefined ? { onBack } : {})}
        // The A7a confirmation renders only when the derivation fired for
        // this evidence; the recorded choice pre-fills from the author's
        // saved answer when one exists for this evidence key.
        {...(remapAnswer !== undefined
          ? {
              remapConfirmation: {
                value: remapAnswer,
                onChange: handleRemapChange,
              },
            }
          : {})}
        identityEdits={prefillIdentityEdits}
      />
    );
  }

  // substage === "B"
  // NOTE: placementMap intentionally omitted (D-INT-2).
  if (PhaseB === undefined) {
    return null;
  }
  return (
    <Suspense fallback={null}>
    <PhaseB
      context={surveyContext}
      onComplete={handlePhaseBComplete}
      onBack={() => setCharactersSubStage("prefill")}
      findingsByQuestionId={findingsByQuestionId}
    />
    </Suspense>
  );
};

export { CharactersStep };
