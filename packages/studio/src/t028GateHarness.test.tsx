// t028GateHarness — StepHost-faithful reproduction harness for the spec 034
// T028 convenience-gate regression (copy-edit.spec.ts:744).
//
// PROVEN ground (predecessor lane, not re-derived here): on the union the
// convenience screen never renders in the T028 walk — computeConvenienceGate
// evaluates not-applicable (surplus empty, signal present) at the
// invisibles -> carve transition, while 089's CI passed the identical walk.
// Every gate feeder is code-identical 089 -> union; the divergence is in
// runtime state accumulation through the real prefill + build-list flow,
// whose accumulator spec 090 re-homed from a zustand draft store into
// decision values written through the gallery host. No existing headless
// harness replays that flow — this file is that harness.
//
// Method: the pre-characters setup (identity -> choose_base -> track ->
// attribution -> project_name) is driven at store level through the REAL
// StepHost completion sequence (recordPhase -> recordAnswersAsDecisions ->
// applyDecisionEffects -> rebuildFromDecisions -> applyStepCompletion ->
// recordStepCompletion -> advance) with StudioShell-faithful ReducerDeps
// over the real stores, a real corpus keyboard (basic_kbdfr, Track 1 copy),
// the real instantiation, and the real live-extraction pass at the setup
// commit (doCommit's position, after the track decision — the setup gate
// spec 092 added). From "characters" on, the REAL SurveyView + StepHost +
// step components render and are driven by DOM, exactly as the e2e walk
// drives them (prefill confirm -> intro -> build list, add "é" -> Done ->
// marks stations -> punctuation Done -> invisibles Continue). At the
// invisibles completion the exact gate inputs are read from the live
// stores and computeConvenienceGate is evaluated with them.
//
// FINDING (2026-10-08, this harness — outcome (a) of the brief, with the
// root one level up): the gate dies because the identity's composed
// bcp47 is "fr-Latn" even though the walk's author never entered a
// language code. Chain, each link dump-verified in the run log:
//   1. The walk's identity result omits il_language_code (the name "Test"
//      resolves no langtags entry, so IdentityLite seeds no default, and
//      the untouched optional question is omitted from the result).
//   2. Spec 092's live extraction pass, run at the setup commit, SEEDS
//      the language-code decision from the base catalog
//      (extractLanguageCode: ctx.catalog.languages[0] = "fr").
//   3. The identity channel recomposes (project_keyboard_id's apply) with
//      the seeded code inside: wc.identity.bcp47 = "fr-Latn".
//   4a. Phase B's BuildListView defaults-first auto-seed (PhaseB.tsx,
//      "exactly as accepting the chooser's pre-selected option would")
//      sees context.bcp47_tag = "fr-Latn", resolves the sourced CLDR
//      exemplar alphabet, and seeds the WHOLE French alphabet into the
//      character-inventory value — session.alphabet.bases ends at 56
//      (a-z A-Z + æ/œ), where 089's identical walk held just ["e"].
//   4b. useCarveNeededSet unions the CLDR slice for "fr-Latn"
//      (neededCharsForLanguage = 93 chars) into the needed set.
//   5. needed (145) covers produced (145): surplus is empty, the gate
//      evaluates not-applicable / convenience-no-surplus, the step
//      records {kind:"not-asked"} and auto-completes — invisibles ->
//      carve directly, exactly the union CI trace's signature.
// On 089 none of this fires: there is no live extraction pass, no
// language-code seed, bcp47 stays "", the exemplar auto-seed resolves
// null, and the CLDR slice never joins — surplus = 25 letters, gate
// applies (this harness's answered-empty variant, which keeps the seed
// out, reproduces that state and passes).
// The seeded record was value="fr", provenance="extracted",
// source="basic_kbdfr" (dump-verified) — a machine-proposed fact the
// author never saw, let alone confirmed; nothing in the walk ever
// surfaced it for confirmation before it started driving derivations.
//
// RULED + FIXED (owner ruling, 2026-10-08 — specs/092-live-extraction/
// followups.md): the author's target-language choice is the code's only
// live source; choosing a base contributes metadata for available keys,
// never the identity's language value. il_language_code now declares
// seedWhen: () => false, so the live pass never seeds or offers it.
// The assertions below encode the 089 behaviour and now PASS — this
// file is the regression test for the ruled contract.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "./test/renderWithI18n.tsx";
import { ActiveStepNav } from "./test/ActiveStepNav.tsx";

// ---------------------------------------------------------------------------
// Mocks — the same seams StudioShell.test.tsx mocks (preview artifact
// pipeline, working-copy transform hook, OSK chrome, navigation), plus the
// carve gallery (past the gate; the verdict is read from stores, and the
// convenience step's own status record, before carve matters). Everything
// in the gate's causal path — StepHost, SurveyView's deps, CharactersStep,
// PhaseB, marks, punctuation, invisibles, convenience — is REAL.
// ---------------------------------------------------------------------------

vi.mock("./hooks/useKeyboardArtifact.ts", () => import("./test/studioShellMocks/useKeyboardArtifact.ts"));
vi.mock("./hooks/useWorkingCopyTransform.ts", () => import("./test/studioShellMocks/useWorkingCopyTransform.ts"));
vi.mock("./components/OSKFrame.tsx", () => import("./test/studioShellMocks/OSKFrame.tsx"));
vi.mock("./components/OskModeToggle.tsx", () => import("./test/studioShellMocks/OskModeToggle.tsx"));
vi.mock("./lib/navigate.ts", () => import("./test/studioShellMocks/navigate.ts"));
vi.mock("./editors/carve/CarveGalleryV2.tsx", () => import("./test/studioShellMocks/CarveGalleryV2.tsx"));

import {
  createVirtualFS,
  buildProducedSet,
  nonAlphabetConfirmedInventory,
  type SurveyPhaseResult,
  type VirtualFS,
} from "@keyboard-studio/contracts";
import { makeBaseKeyboard, type BaseKeyboard } from "@keyboard-studio/contracts/fixtures";
import { SurveyView } from "./StudioShell.tsx";
import {
  applyDecisionEffects,
  applyStepCompletion,
  recordAnswersAsDecisions,
  recordStepCompletion,
  type ReducerDeps,
} from "./steps/reducer.ts";
import { advance, STEPS_WITH_APPLY_COMPLETION } from "./steps/advance.ts";
import { applyMutatePatch } from "./steps/mutateApply.ts";
import { questionRegistry } from "./survey/questions/registry.ts";
import {
  useDecisionStore,
  getDecisionSnapshot,
  selectTrack,
  selectTouchSeedSource,
} from "./stores/decisionStore.ts";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { useSurveyAnswerStore, peekStepAnswers } from "./stores/surveyAnswerStore.ts";
import { useStepNavStore } from "./stores/stepNavStore.ts";
import { useStepWalkStore } from "./stores/stepWalkStore.ts";
import { createStudioDecisionRecorder } from "./decisions/createStudioDecisionRecorder.ts";
import type { SourceSnapshotter } from "./decisions/snapshotSource.ts";
import { deriveIdentityResult } from "./decisions/identitySelectors.ts";
import { runLiveExtractionFromStores } from "./decisions/liveExtraction.ts";
import { rebuildWorkingCopyFromStores } from "./decisions/rebuildWorkingCopy.ts";
import {
  instantiateFromBaseIfConfirmed,
  instantiateFromExistingWithIdentitySeed,
} from "./lib/confirmRebase.ts";
import { decideGalleryValue } from "./steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "./lib/galleryHostDeps.ts";
import baseKeyboardModule from "./survey/questions/gallery/baseKeyboard.ts";
import { resetInventoryDecisions } from "./survey/useInventoryDraft.ts";
import type { CharacterInventoryValue } from "./survey/phaseBDraftOps.ts";
import { computeConvenienceGate } from "./survey/convenience/convenienceGate.ts";

// ---------------------------------------------------------------------------
// Fixture: basic_kbdfr from the local corpus clone (the e2e fixture's base).
// ---------------------------------------------------------------------------

const KB_DIR = resolve(process.cwd(), "../../../keyboards/release/basic/basic_kbdfr");

const basicKbdfr: BaseKeyboard = makeBaseKeyboard({
  id: "basic_kbdfr",
  path: "release/basic/basic_kbdfr",
  script: "Latn",
  targets: ["windows", "macosx", "linux", "web"],
  displayName: "French Basic",
  version: "1.0",
  sourceUrl:
    "https://github.com/keymanapp/keyboards/tree/master/release/basic/basic_kbdfr",
  languages: ["fr"],
});

function loadBaseVfs(): VirtualFS {
  const files: Array<{ path: string; content: string | Uint8Array; isBinary: boolean }> = [];
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const r = rel === "" ? name : `${rel}/${name}`;
      if (statSync(abs).isDirectory()) {
        walk(abs, r);
      } else if (/\.(ico|png|ttf|otf)$/i.test(name)) {
        files.push({ path: r, content: new Uint8Array(readFileSync(abs)), isBinary: true });
      } else {
        files.push({ path: r, content: readFileSync(abs, "utf-8"), isBinary: false });
      }
    }
  };
  walk(join(KB_DIR, "source"), "source");
  return createVirtualFS(files);
}

type Engine = typeof import("@keyboard-studio/engine");
let engine: Engine;

beforeAll(async () => {
  engine = await import("@keyboard-studio/engine");
  await engine.init();
}, 180_000);

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
  useStepNavStore.getState().reset();
  useStepWalkStore.getState().reset();
  // NOTE: resetInventoryDecisions() is deliberately NOT called here — it
  // RECORDS an empty character-inventory value with provenance "asked",
  // a state the real app never holds at setup (the decision is simply
  // absent until extraction seeds it). StudioShell.test.tsx calls it in
  // afterEach to scrub the sticky mirror between its many tests; a fresh
  // process + the store resets above are this harness's fresh state.
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetInventoryDecisions();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// StudioShell-faithful ReducerDeps (StudioShell.tsx's composition, union
// version — includes spec 093's rebuildFromDecisions).
// ---------------------------------------------------------------------------

function inertSnapshotter(): SourceSnapshotter {
  return { captureAtBoundary: () => Promise.resolve(null), reset: () => {} };
}

function makeLiveDeps(): ReducerDeps {
  const recorder = createStudioDecisionRecorder({
    getWorkingCopyState: () => useWorkingCopyStore.getState(),
    snapshotter: inertSnapshotter(),
  });
  return {
    instantiateFromBase: (base, opts) =>
      useWorkingCopyStore.getState().instantiateFromBase(base, opts),
    instantiateFromExisting: (base, opts) =>
      instantiateFromExistingWithIdentitySeed(base, opts),
    instantiateFromBaseIfConfirmed: (base, opts, options) =>
      instantiateFromBaseIfConfirmed(base, opts, options),
    getWorkingIR: () => useWorkingCopyStore.getState().ir,
    setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
    recordDecision: recorder,
    recordQuestionAnswers: recorder.recordQuestionAnswers,
    writeDecisionRecords: (records) => useDecisionStore.getState().recordAll(records),
    readDecisionSet: () => getDecisionSnapshot(),
    getDecisions: () => getDecisionSnapshot(),
    getSavedAnswer: (stepId, questionId) => peekStepAnswers(stepId)?.answers[questionId],
    getBaseKeyboardId: () => useWorkingCopyStore.getState().baseKeyboard?.id,
    getHistoryEntryState: () => useWorkingCopyStore.getState().historyEntryState,
    applyWorkingCopyPatch: (patch, writes) => {
      const wc = useWorkingCopyStore.getState();
      if (patch.ir !== undefined && wc.ir !== null) {
        wc.setWorkingIR(applyMutatePatch(wc.ir, patch.ir, writes));
      }
      if (patch.identity !== undefined) wc.setIdentity(patch.identity);
      if (patch.attribution !== undefined) wc.setAttribution(patch.attribution);
      if (patch.helpDocs !== undefined) wc.setHelpDocs(patch.helpDocs);
      if (patch.historyEntryState !== undefined) wc.setHistoryEntryState(patch.historyEntryState);
    },
    rebuildFromDecisions: (changed) => {
      rebuildWorkingCopyFromStores(changed);
    },
  };
}

function isSurveyPhaseResult(r: unknown): r is SurveyPhaseResult {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof (r as { phase?: unknown }).phase === "string" &&
    Array.isArray((r as { answers?: unknown }).answers)
  );
}

/** StepHost.handleComplete's sequence, verbatim order (StepHost.tsx). */
function handleComplete(stepId: string, result: unknown, deps: ReducerDeps): void {
  if (isSurveyPhaseResult(result)) {
    useWorkingCopyStore.getState().recordPhase(result, { stepId });
    recordAnswersAsDecisions(result, stepId, deps);
    applyDecisionEffects(result, deps);
    if (deps.rebuildFromDecisions !== undefined) {
      const changed: string[] = [];
      for (const answer of result.answers) {
        const mod = questionRegistry[answer.questionId];
        if (mod?.provides !== undefined) changed.push(...mod.provides);
      }
      if (changed.length > 0) deps.rebuildFromDecisions(changed as never);
    }
  }
  if (STEPS_WITH_APPLY_COMPLETION.has(stepId)) {
    applyStepCompletion(stepId, result, deps);
  }
  recordStepCompletion(stepId, result, deps);
  const decisions = getDecisionSnapshot();
  const outcome = advance(stepId as Parameters<typeof advance>[0], result, {
    decisions,
    selectedTrack: selectTrack(decisions),
    identitySupported: deriveIdentityResult(decisions)?.supported ?? true,
    touchSeedSource: selectTouchSeedSource(decisions),
    allCharactersImplemented: true,
  });
  useSurveySessionStore.getState().advance(outcome.next);
  if (outcome.setCharactersSubStage !== undefined) {
    useSurveySessionStore.getState().setCharactersSubStage(outcome.setCharactersSubStage);
  }
}

// ---------------------------------------------------------------------------
// Gate-state dump: the exact inputs useCarveNeededSet + ConvenienceCharsStep
// read, evaluated with the pure functions they call.
// ---------------------------------------------------------------------------

async function dumpGateState(label: string): Promise<{ gateKind: string; surplus: string[] }> {
  const wc = useWorkingCopyStore.getState();
  const decisions = getDecisionSnapshot();
  const ci = decisions["character-inventory"];
  const ciValue = ci?.value as CharacterInventoryValue | undefined;
  const session = wc.session;
  const produced = wc.ir !== null ? buildProducedSet(wc.ir) : new Set<string>();
  const alphabet = session.alphabet;
  const carveNeeded = engine.deriveCarveNeededSet({
    alphabet,
    worklist: session.marksWorklist,
    ...(session.marksOutputForm !== undefined
      ? { outputForm: session.marksOutputForm }
      : {}),
  });
  const nonAlpha = nonAlphabetConfirmedInventory(session.confirmedInventory, alphabet);
  const form = engine.normalizationFormForOutputForm(session.marksOutputForm);
  const tiered = new Set<string>([
    ...carveNeeded.requiredPrimary,
    ...carveNeeded.optionalSecondary,
    ...nonAlpha,
  ]);
  // Mirror useCarveNeededSet exactly: the CLDR/SLDR slice joins when the
  // composed identity bcp47 resolves (services.neededCharsForLanguage —
  // the same call the hook makes), and hasSignal includes its presence.
  const bcp47 = wc.identity?.bcp47;
  const { neededCharsForLanguage } = await import("./lib/services.ts");
  const cldrNeeded = bcp47 ? await neededCharsForLanguage(bcp47) : null;
  const needed = new Set(
    [...(cldrNeeded ? [...cldrNeeded, ...tiered] : tiered)].map((ch) => ch.normalize(form)),
  );
  const hasSignal = tiered.size > 0 || cldrNeeded !== null;
  console.log(
    `[T028 ${label}] CLDR slice: bcp47=${JSON.stringify(bcp47)} neededChars=${cldrNeeded === null ? "null" : cldrNeeded.size}`,
  );
  const gate = computeConvenienceGate({
    produced,
    needed,
    hasSignal,
    instantiated: wc.instantiationMode !== null,
  });
  const surplus =
    gate.kind === "applies" ? gate.candidates.map((c) => c.primary) : [];
  const phaseSummary = wc.phaseResults.map((p) => ({
    phase: p.phase,
    alphabetBases: p.alphabet?.bases.length ?? null,
    confirmedInventory: p.confirmedInventory ?? null,
    marksWorklist: p.marksWorklist !== undefined,
  }));
  console.log(
    `[T028 ${label}] activeStep=${useSurveySessionStore.getState().activeStepId} ` +
      `bcp47=${JSON.stringify(wc.identity?.bcp47)} mode=${wc.instantiationMode}`,
  );
  console.log(
    `[T028 ${label}] character-inventory record: provenance=${ci?.provenance} ` +
      `chars=${JSON.stringify(ciValue?.chars)} bases=${JSON.stringify(ciValue?.bases)}`,
  );
  const lc = decisions["language-code"];
  console.log(
    `[T028 ${label}] language-code record: ${lc === undefined ? "ABSENT" : `value=${JSON.stringify(lc.value)} provenance=${lc.provenance} source=${JSON.stringify(lc.source)}`}`,
  );
  console.log(`[T028 ${label}] phaseResults=${JSON.stringify(phaseSummary)}`);
  console.log(
    `[T028 ${label}] session.alphabet.bases=${JSON.stringify(alphabet?.bases)} ` +
      `marks=${JSON.stringify(alphabet?.marks)}`,
  );
  console.log(
    `[T028 ${label}] session.confirmedInventory=${JSON.stringify(session.confirmedInventory)}`,
  );
  console.log(
    `[T028 ${label}] produced(${produced.size})=${JSON.stringify([...produced].sort())}`,
  );
  console.log(
    `[T028 ${label}] needed(${needed.size})=${JSON.stringify([...needed].sort())} hasSignal=${hasSignal}`,
  );
  console.log(
    `[T028 ${label}] GATE=${gate.kind}${gate.kind === "not-applicable" ? ` reason=${gate.reason.code}` : ""} surplus=${JSON.stringify(surplus)}`,
  );
  console.log(
    `[T028 ${label}] convenience answer-store status=${JSON.stringify(
      useSurveyAnswerStore.getState().steps["convenience"]?.status ?? null,
    )}`,
  );
  return { gateKind: gate.kind, surplus };
}

// ---------------------------------------------------------------------------
// The walk (mirrors copy-edit.spec.ts T028's forward pass up to carve).
// ---------------------------------------------------------------------------

describe("T028 convenience-gate reproduction (union)", () => {
  it(
    "drives identity -> ... -> invisibles with the real steps and reads the gate inputs",
    async () => {
      const deps = makeLiveDeps();

      // --- Setup (store level, real completion sequence) -------------------

      // 1. Identity — the walk's inputs (driveIdentityLite with the copy-edit
      // fixture): English name "Test", autonym "Test", script Latn. The
      // language-code field is left blank AND UNTOUCHED: for an unresolved
      // language name ("Test" matches no langtags entry) IdentityLite's
      // lookup default seeds nothing, and the runner's result omits the
      // unanswered question (spec 088 D1). Whether an answered-empty ("")
      // is recorded instead is the fork this harness tests — see the git
      // history of this file for the answered-empty variant (gate APPLIES
      // there; the omission variant is the live walk's shape).
      handleComplete(
        "identity",
        {
          phase: "A",
          answers: [
            { questionId: "il_language_english", answerType: "text", value: "Test" },
            { questionId: "il_language_autonym", answerType: "text", value: "Test" },
            { questionId: "il_target_script", answerType: "select", value: "Latn" },
          ],
        } satisfies SurveyPhaseResult,
        deps,
      );

      await dumpGateState("setup post-identity");

      // 2. Layout — its decision cannot feed the convenience gate; advance
      // only (the session store's own advance, as StepHost performs it).
      useSurveySessionStore.getState().advance("choose_base");

      // 3. choose_base — the base-keyboard decision recorded through the real
      // gallery host write path (BaseKeyboardRenderer's confirm path), then
      // the track completion, then doCommit's dispatch: applyStepCompletion
      // (instantiation) + the live extraction pass, in the setup commit's
      // position (track known — spec 092's setup gate).
      decideGalleryValue(
        baseKeyboardModule,
        { id: "basic_kbdfr", name: "French Basic" },
        { provenance: "asked" },
        "choose_base",
        buildGalleryHostDeps(),
      );
      recordStepCompletion("choose_base", { base: basicKbdfr }, deps);
      useSurveySessionStore.getState().advance("track");
      await dumpGateState("setup post-choose_base");

      handleComplete(
        "track",
        {
          phase: "G",
          answers: [
            { questionId: "track_choice", answerType: "select", value: "copy" },
          ],
        } satisfies SurveyPhaseResult,
        deps,
      );

      // doCommit equivalent: instantiate the working copy from the real
      // corpus base (parsed + recognized with the real engine), then run
      // the extraction pass once, synchronously — StudioShell's order.
      const vfs = loadBaseVfs();
      const kmnText = readFileSync(join(KB_DIR, "source/basic_kbdfr.kmn"), "utf-8");
      const parsed = engine.parseKmn!(kmnText, basicKbdfr.id);
      const recognized = engine.recognizePatterns!(parsed.ir);
      useSurveySessionStore.getState().setLocalBase(basicKbdfr);
      applyStepCompletion(
        "choose_base",
        {
          base: basicKbdfr,
          vfs,
          ir: recognized.ir,
          track: "copy",
          skipRebaseConfirm: true,
        },
        deps,
      );
      await dumpGateState("setup post-instantiate (pre-extraction)");
      const extraction = runLiveExtractionFromStores();
      console.log(
        `[T028 setup] extraction seeded=${JSON.stringify(extraction.seeded)} offered=${JSON.stringify(extraction.offered)}`,
      );
      expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
      await dumpGateState("setup post-extraction");

      // 4. Attribution (#1901 step): author name filled, email + holder left
      // blank (the walk's driveAttributionStep defaults) — omitted answers.
      handleComplete(
        "attribution",
        {
          phase: "A",
          answers: [
            { questionId: "il_author_name", answerType: "text", value: "Test Author" },
          ],
        } satisfies SurveyPhaseResult,
        deps,
      );

      // 5. Project name — acceptProjectName accepts the step's proposals.
      handleComplete(
        "project_name",
        {
          phase: "G",
          answers: [
            { questionId: "project_display_name", answerType: "text", value: "Test French" },
            { questionId: "project_keyboard_id", answerType: "text", value: "test_fr" },
          ],
        } satisfies SurveyPhaseResult,
        deps,
      );


      // Harness-validity: the walk's state at characters entry.
      const sessionAtCharacters = useSurveySessionStore.getState();
      expect(sessionAtCharacters.activeStepId).toBe("characters");
      expect(sessionAtCharacters.charactersSubStage).toBe("prefill");
      // The composed bcp47 at characters entry — logged, not asserted: it
      // is the fork's readout ("" = the code stayed unanswered; "fr-Latn"
      // = the extraction pass's language-code seed was composed in).
      console.log(
        `[T028 validity] identity bcp47 at characters entry = ${JSON.stringify(useWorkingCopyStore.getState().identity?.bcp47 ?? "")}`,
      );

      // --- Rendered drive (real SurveyView + StepHost + steps) -------------

      render(
        <>
          {/* StudioShell renders SurveyView with the working copy's base
              (StudioShell.tsx:2060), and SurveyView syncs that prop into
              the session store's localBase (its :564 effect) — passing the
              real base is load-bearing: null would clear localBase and
              CharactersStep would render nothing. */}
          <SurveyView baseKeyboard={basicKbdfr} />
          <ActiveStepNav />
        </>,
      );

      // Prefill -> Phase B (the walk's confirmPrefill).
      fireEvent.click(await screen.findByTestId("prefill-confirm", {}, { timeout: 30_000 }));
      await dumpGateState("post-prefill-confirm");

      // IntroChooser -> build list (the walk's completePhaseB).
      fireEvent.click(await screen.findByTestId("phase-b-intro-next", {}, { timeout: 30_000 }));

      // Build list: add the fixture's one character.
      const charInput = await screen.findByLabelText("Character to add", {}, { timeout: 30_000 });
      fireEvent.change(charInput, { target: { value: "é" } });
      fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
      await dumpGateState("post-add-é");

      // Done -> marks.
      fireEvent.click(await screen.findByTestId("phase-b-done", {}, { timeout: 30_000 }));
      await dumpGateState("post-characters-done");

      // Marks series: accept each station's proposal (the walk's
      // driveMarksSeries) until the punctuation step lands.
      for (let i = 0; i < 8; i++) {
        if (screen.queryByTestId("punctuation-done") !== null) break;
        const cont = await screen
          .findByTestId("marks-continue", {}, { timeout: 5_000 })
          .catch(() => null);
        if (cont === null) break;
        fireEvent.click(cont);
      }
      await dumpGateState("post-marks");

      // Punctuation: accept empty (the walk's drivePunctuationStep).
      fireEvent.click(await screen.findByTestId("punctuation-done", {}, { timeout: 30_000 }));
      await dumpGateState("post-punctuation");

      // Invisibles: continue with nothing selected (driveInvisiblesStep).
      fireEvent.click(await screen.findByTestId("invisibles-continue", {}, { timeout: 30_000 }));

      // The gate point: convenience has now been entered (and has either
      // rendered or auto-completed). Read the exact inputs.
      const { gateKind, surplus } = await dumpGateState("post-invisibles GATE POINT");
      console.log(
        `[T028 verdict] convenience rendered=${screen.queryByTestId("convenience-chars") !== null} ` +
          `activeStep=${useSurveySessionStore.getState().activeStepId}`,
      );

      // 089 behaviour (its CI passed this walk): the gate APPLIES with a
      // surplus of spare basic-Latin letters (~25 for this fixture).
      expect(gateKind).toBe("applies");
      expect(surplus.length).toBeGreaterThan(0);
    },
    300_000,
  );
});
