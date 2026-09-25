// CharactersStep — self-contained characters step adapter (spec 027 Stage 4).
//
// Owns the prefill -> PhaseB substage internally. Satisfies EditorStepProps so
// the manifest can drive it as a component (first runtime use of step.component).
//
// Store reads:
//   surveySessionStore: identityResult, localBase, surveyContext, charactersSubStage
//   workingCopyStore:   validatorFindings (via useValidatorFindings hook)
//
// No survey-level side effects (Article IV / G2): the component reports
// completion and back via props; the host (SurveyView) runs the reducer path.
//
// placementMap is intentionally omitted from PhaseB props (D-INT-2, v1).

import { useEffect, useRef, type ComponentType } from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { EditorStepProps } from "../steps/types.ts";
import { alphabetKeyOf, graphemeFitsScript } from "../steps/evidence.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore, draftConfirmedAlphabet } from "../stores/phaseBDraftStore.ts";
import type { IdentityLiteResult } from "./identityLiteResult.ts";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useStepWalkStore, peekStepCursor } from "../stores/stepWalkStore.ts";
import type { StepWalkPositions } from "../lib/stepWalk.ts";
import { ADDITION_ANSWER_PREFIX } from "./characterFlags.ts";
import { useValidatorFindings } from "../hooks/useValidatorFindings.ts";
import { Prefill, PhaseB } from "./index.ts";

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

/** Seed-key prefixes the punctuation step records (see PunctuationStep's seed effects). */
const PUNCTUATION_SEED_PREFIXES = ["punctuation:", "punctuation-base:"] as const;

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
 *   5. `rejected` is untouched by `reset()` (phaseBDraftStore.ts), so a
 *      removal the author made of a PROPOSED character is re-applied for
 *      free — nothing here needs to replay it;
 *   6-7. every author addition is re-added regardless of fit (`draft.add`
 *      never drops one); an addition whose codepoints no longer belong to
 *      the new target script is ALSO saved as a `characters.addition.<ch>`
 *      answer stamped with the OLD key, so `reconcile()`/`characterFlags.ts`
 *      renders it `reproposed{outside-script}` until the author reconfirms
 *      or removes it (T080).
 */
function confirmPrefill(identity: IdentityLiteResult, base: BaseKeyboard): void {
  const draft = usePhaseBDraftStore.getState();
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

  draft.reset();
  if (oldKey !== undefined) {
    usePhaseBDraftStore.setState({
      seededProposals: usePhaseBDraftStore
        .getState()
        .seededProposals.filter((k) => !PUNCTUATION_SEED_PREFIXES.some((p) => k.startsWith(p))),
    });
  }
  usePhaseBDraftStore.getState().setAlphabetEvidenceKey(key);

  if (authorAdditions.length === 0) return;
  const targetScript = identity.prefill.script;
  const saveAnswer = useSurveyAnswerStore.getState().saveAnswer;
  for (const grapheme of authorAdditions) {
    usePhaseBDraftStore.getState().add(grapheme);
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

/**
 * Self-contained characters step adapter.
 *
 * Hosts the prefill -> PhaseB substage driven by the persisted
 * `charactersSubStage` store slot, so back-from-carve remounts at PhaseB
 * rather than replaying prefill (spec 027 §4).
 */
const CharactersStep: ComponentType<EditorStepProps> = ({
  onComplete,
  onBack,
}: EditorStepProps) => {
  // --- store reads (selectors) ---
  const identityResult = useSurveySessionStore((s) => s.identityResult);
  const localBase = useSurveySessionStore((s) => s.localBase);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const charactersSubStage = useSurveySessionStore((s) => s.charactersSubStage);
  const setCharactersSubStage = useSurveySessionStore((s) => s.setCharactersSubStage);
  const discoveryMethod = useSurveySessionStore((s) => s.discoveryMethod);
  const setDiscoveryMethod = useSurveySessionStore((s) => s.setDiscoveryMethod);
  const setPosition = useSurveyAnswerStore((s) => s.setPosition);

  const findingsByQuestionId = useValidatorFindings();

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
  const hasDraftLetters = usePhaseBDraftStore((s) => s.chars.length > 0);
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

  // Guard: prefill requires both identity and base (unreachable once the step
  // is properly entered, but matches today's null fallback).
  if (charactersSubStage === "prefill") {
    if (identityResult === null || localBase === null) {
      return null;
    }
    return (
      <Prefill
        identity={identityResult}
        base={localBase}
        onConfirm={() => {
          // Only this prefill -> B transition may reset the draft alphabet —
          // never a BuildListView/CharacterMapPane render — and only when the
          // evidence it was built from changed (confirmPrefill above).
          confirmPrefill(identityResult, localBase);
          setCharactersSubStage("B");
        }}
        // Conditionally spread (not `() => onBack?.()`) — F7 sweep: an
        // always-truthy wrapper would make Prefill always render its own Back
        // button (Prefill gates on `onBack !== undefined`) even when StepHost
        // omitted onBack because there is genuinely nothing to back into.
        {...(onBack !== undefined ? { onBack } : {})}
      />
    );
  }

  // substage === "B"
  // NOTE: placementMap intentionally omitted (D-INT-2).
  return (
    <PhaseB
      context={surveyContext}
      onComplete={(result) => {
        // Commit the three-store ConfirmedAlphabet alongside the flat
        // confirmedInventory (spec 071 US5): the build-list draft store is
        // canonical for it; a manual-flow completion leaves the draft empty,
        // so the field stays absent there (additive optional).
        const phaseResult = result as SurveyPhaseResult;
        const alphabet = draftConfirmedAlphabet();
        const hasStores =
          alphabet.bases.length > 0 ||
          alphabet.marks.length > 0 ||
          alphabet.attestedStacks.length > 0;
        onComplete(hasStores ? { ...phaseResult, alphabet } : phaseResult);
      }}
      onBack={() => setCharactersSubStage("prefill")}
      findingsByQuestionId={findingsByQuestionId}
    />
  );
};

export { CharactersStep };
