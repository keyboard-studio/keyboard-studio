// Full-flow regression suite for issue #2293 (composed forms presented
// for placement despite an own-key marks treatment).
//
// #2294 fixed the galleries' Next/Back WALK (the published step-walk
// positions and the positional-nav list now intersect the marks series'
// placement worklist). Its suites seeded the session from hand-built
// fixtures and never drove the real flow — and they never exercised
// the galleries' OTHER placement entry point: the SHOW-ALL
// CharScrollStrip. Strip chips (and ArrowLeft/ArrowRight cycling, which
// shares the same selection handler) select ANY confirmed-inventory
// character into the placement pane — including composed forms the
// treatment answer had filtered out of placement — with live Apply
// controls. That is the seam this suite pins: placement follows the
// marks treatment answer on every entry path, not only via Next.
//
// The flow driven here is the real one, end to end in jsdom:
//   real basic_kbdus IR (parsed from the keyboards corpus .kmn)
//   → real CharactersStep/PhaseB (real CLDR bfd exemplars + the author's
//     exact NFD sample, pasted voluntarily and at the #1784 prompt)
//   → the REAL StepHost.handleComplete sequence (recordPhase +
//     recordAnswersAsDecisions + applyDecisionEffects +
//     rebuildFromDecisions + applyStepCompletion)
//   → real MarksStepHost/MarksSeriesStep (own-key + postfix)
//   → punctuation / invisibles / convenience / carve / deadkeys / rules
//     through the same StepHost
//   → the real MechanismGallery: published walk, placement derivation,
//     and strip-chip selection.

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { ActiveStepNav } from "../../test/ActiveStepNav.tsx";
import { StepHost } from "../../components/StepHost.tsx";
import { createStudioDecisionRecorder } from "../../decisions/createStudioDecisionRecorder.ts";
import { createSourceSnapshotter } from "../../decisions/snapshotSource.ts";
import { rebuildWorkingCopyFromStores } from "../../decisions/rebuildWorkingCopy.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import {
  useDecisionStore,
  getDecisionSnapshot,
  applyDecisionSnapshot,
  peekDecision,
} from "../../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
import { resetInventoryDecisions, resetInventoryDraft } from "../useInventoryDraft.ts";
import { bindManifest } from "../../stores/workingCopyStore.ts";
import { manifest } from "../../steps/manifest.ts";
import {
  recordAnswersAsDecisions,
  applyDecisionEffects,
  recordStepCompletion,
  type ReducerDeps,
} from "../../steps/reducer.ts";
import { createVirtualFS, type SurveyPhaseResult } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { parseKmn } from "@keyboard-studio/engine";
import { derivePlacementInventory } from "../../lib/placementInventory.ts";
import { positionTokenToChar } from "../../lib/stepWalk.ts";
import {
  saveDraft,
  loadDraft,
  PENDING_PROJECT_KEY,
} from "../../lib/draftPersistence.ts";

// ---------------------------------------------------------------------------
// Gallery-side mocks (same as MechanismGallery.placementWalk.test.tsx).
// ---------------------------------------------------------------------------

vi.mock("../../hooks/useKeyboardArtifact.ts", async () => {
  const m = await import("../../test/mechanismGallery/mocks.tsx");
  return { useKeyboardArtifact: m.useKeyboardArtifact };
});
vi.mock("../../components/OSKFrame.tsx", async () => {
  const m = await import("../../test/mechanismGallery/mocks.tsx");
  return { OSKFrame: m.OSKFrame };
});
vi.mock("../../lib/services.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/services.ts")>();
  const m = await import("../../test/mechanismGallery/mocks.tsx");
  return {
    ...original,
    getPatternLibraryService: m.getPatternLibraryService,
    getPatternByIdSync: m.getPatternByIdSync,
  };
});
vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  const m = await import("../../test/mechanismGallery/mocks.tsx");
  return m.withMockedEngine(original);
});

import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
installMechanismGalleryHooks();

// ---------------------------------------------------------------------------
// The author's exact sample (fully NFD Bafut passage, Luke text).
// ---------------------------------------------------------------------------

const BAFUT_SAMPLE =
  "Ŋù àkɨ̀kwen yî mɔ̀ʼɔ à lɛ nzì a mbɛ̀ɛ Yesu ǹswɛtə mɨkuʼutə̂ mi ghu nsi, m̀buʼu mbo ghu mbo mə tâ à kwɛtə yi; ǹswoŋ mə: “Ò bə kɔ̌ŋ boŋ ò ghɨ̀rə nû yà ɨ laà.” \\p \\v 41 Yesu à lɛ ŋko mɨlɨ̀ŋnə̀ yì ǹnâsə abô yi, m̀mɔɔntə yi ghu nswoŋ mə: “Mə̀ kɔ̀ŋə̂; tâ nû yò ya laa!” \\v 42 Àkɨ̀kwɛn ya a lɛ ŋkɨ mburə ŋghɛnsə nsɨgə ghu nû, nû yì ya ɨ kɨ̂ ǹtɨgə nlaa. \\v 43 Yesu a tɨgə̀ ǹnaŋsə ŋghaa ghu mbo tsiʼì sɨgɨ̀nə̀ ǹswoŋ mə tâ à lo ŋghɛ̀ɛ̀ yi \\v 44 ŋkɨ nswoŋ mə: “Yə̂, ò ghɛɛ, ò tsuu annù tsu a mbo ŋù lǒ swoŋə, lâ m̀bàŋnə̀ ŋ̀ghɛɛ ndɨ̀ʼɨ ɨbɨɨ nû gho a mbô ŋ̀gàŋmàʼa Nwì, ŋ̀kɨ mfa ayoo mmaʼanwì yìi mə Moses à lɛ lə̀ə̀ aa, tǎ dɨ̀ʼɨ a mbo bə̀ mə nû yò ɨ̀ làà mə̂.” \\v 45 Lâ ŋù wa a bâŋnə̀ ŋ̀ghɛɛ ŋ̀ka lɛnsə nɨ̂ àjàŋ yìi mə Yesu à lɛ ŋghùrə̀ yi aa a mbo bə̀ bɨ̀tsɨ̀mə̀, a tɨgə̀ ŋ̀ghɨrə a tsyânə̀ a mbo Yesu mə tâ à bu ŋka ŋkuu alaʼa yì tsu nɨ̂ nsî. Ma mùu àjàŋ, Yesu a tɨgə̀ ǹtswe tsiʼì a ɨdɨgə jìi mə bə̀ lɛ waʼà ghu tswe aà, bə̀ tɨgə̀ ǹlo nɨ ɨdɨgə ɨdɨgə nzi ghu mbɛ̀ɛ̀.";

/** Every composed form the sample attests (NFC), lower + upper case. */
const COMPOSED_FORMS = [
  "à", "â", "ǎ", "è", "ê", "ì", "î", "ò", "ô", "ù", "û", "ǹ", "ǒ",
  "ə̀", "ə̂", "ɨ̀", "ɨ̂", "ŋ̀", "ɛ̀", "ɔ̀", "ɔ̌", "m̀",
  "À", "Â", "Ǎ", "È", "Ê", "Ì", "Î", "Ò", "Ô", "Ù", "Û", "Ǹ", "Ǒ",
];

const BAFUT_MARKS = ["̀", "̂", "̌"]; // U+0300, U+0302, U+030C

// ---------------------------------------------------------------------------
// Real reducer deps — mirrors StudioShell's composition.
// ---------------------------------------------------------------------------

function makeRealDeps(): ReducerDeps {
  const snapshotter = createSourceSnapshotter({
    readProjectedFiles: async () => null,
  });
  const recordDecision = createStudioDecisionRecorder({
    getWorkingCopyState: () => useWorkingCopyStore.getState(),
    snapshotter,
    onScreenRecorded: (stepId, screenId, entryIds, hash) => {
      const answers = useSurveyAnswerStore.getState();
      answers.markScreenRecorded(stepId, screenId, hash);
      for (const entryId of entryIds) answers.setRecordedScreen(entryId, screenId);
    },
    getLastRecordedHash: (stepId, screenId) =>
      useSurveyAnswerStore.getState().steps[stepId]?.lastRecorded[screenId],
    resolveCompletionScreen: (stepId) =>
      useSurveyAnswerStore.getState().steps[stepId]?.position ?? stepId,
    getSavedAnswer: (stepId, questionId) =>
      useSurveyAnswerStore.getState().steps[stepId]?.answers[questionId],
    getDecisions: () => getDecisionSnapshot(),
  });
  return {
    recordPhase: (result: SurveyPhaseResult) =>
      useWorkingCopyStore.getState().recordPhase(result),
    instantiateFromStart: (start, source) =>
      useWorkingCopyStore.getState().instantiateFromStart(start, source),
    instantiateFromStartIfConfirmed: async () => false,
    getDecisions: () => getDecisionSnapshot(),
    applyDecisions: (snapshot) => applyDecisionSnapshot(snapshot),
    peekDecision: (id) => peekDecision(id),
    writeDecisionRecords: (records) => useDecisionStore.getState().recordAll(records),
    recordDecision,
    recordQuestionAnswers: recordDecision.recordQuestionAnswers,
    rebuildFromDecisions: (changed) => {
      rebuildWorkingCopyFromStores(changed);
    },
  };
}

function resetAllStores(): void {
  useWorkingCopyStore.setState(useWorkingCopyStore.getInitialState(), true);
  useDecisionStore.setState(useDecisionStore.getInitialState(), true);
  useSurveyAnswerStore.setState(useSurveyAnswerStore.getInitialState(), true);
  useSurveySessionStore.setState(useSurveySessionStore.getInitialState(), true);
  useStepWalkStore.setState(useStepWalkStore.getInitialState(), true);
  resetInventoryDraft();
  resetInventoryDecisions();
}

function seedStartAndIdentity(deps: ReducerDeps): void {
  bindManifest(manifest);
  const kmnText = readFileSync(
    `${process.env.HOME}/workspace/keyboards/release/basic/basic_kbdus/source/basic_kbdus.kmn`,
    "utf8",
  );
  const { ir } = parseKmn(kmnText, "basic_kbdus");
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: kmnText, isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir });
  // Identity completion replayed through the same functions StepHost calls.
  const identityResult: SurveyPhaseResult = {
    phase: "A",
    answers: [
      { questionId: "il_language_english", answerType: "text", value: "Bafut" },
      { questionId: "il_language_code", answerType: "text", value: "bfd" },
      { questionId: "il_target_script", answerType: "select", value: "Latn" },
    ],
  };
  deps.recordPhase(identityResult);
  recordAnswersAsDecisions(identityResult, "identity", deps);
  applyDecisionEffects(identityResult, deps);
  recordStepCompletion("identity", identityResult, deps);
  useSurveySessionStore.setState({
    activeStepId: "characters",
    charactersSubStage: "B",
  });
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

const MECHANISMS_STEP_ID = "mechanisms";

function activeStep(): string {
  return useSurveySessionStore.getState().activeStepId;
}

function sessionNow() {
  return useWorkingCopyStore.getState().session;
}

async function pasteSampleIntoAffordance(): Promise<void> {
  const placeholder = await screen.findByTestId("text-sample-placeholder");
  fireEvent.click(placeholder);
  const textarea = await screen.findByTestId("text-sample-textarea");
  fireEvent.change(textarea, { target: { value: BAFUT_SAMPLE } });
  fireEvent.click(screen.getByTestId("text-sample-submit"));
  await screen.findByTestId("text-sample-proposal");
  fireEvent.click(screen.getByTestId("text-sample-confirm"));
}

async function driveCharacters(opts: { prompted: boolean }): Promise<void> {
  // Page 1 (discovery intro): exemplar radio pre-checked once the real CLDR
  // inventory for bfd resolves; Continue seeds the exemplars into the draft.
  await waitFor(() => {
    const radio = document.querySelector<HTMLInputElement>("#discovery_method-exemplars");
    expect(radio).not.toBeNull();
    expect(radio?.checked).toBe(true);
  });
  fireEvent.click(screen.getByTestId("charlist-continue"));
  // Page 2 (build list).
  await screen.findByTestId("charlist-done");
  if (!opts.prompted) {
    await pasteSampleIntoAffordance();
  }
  fireEvent.click(screen.getByTestId("charlist-done"));
  if (opts.prompted) {
    // Deferred: the #1784 marks text-sample prompt replaces the build list.
    await screen.findByTestId("marks-text-sample-prompt");
    await pasteSampleIntoAffordance();
  }
  await waitFor(() => expect(activeStep()).toBe("marks"));
}

interface TreatmentCapture {
  /** The marks-treatment decision's recorded answers at completion. */
  recordedAnswers: Record<string, unknown> | null;
}

function captureTreatment(): TreatmentCapture {
  const decisions = getDecisionSnapshot() as Record<
    string,
    { value?: { answers?: Record<string, unknown> } } | undefined
  >;
  return {
    recordedAnswers: decisions["marks-treatment"]?.value?.answers ?? null,
  };
}

/**
 * Drive the marks series to completion. With `touchTreatment`, explicitly
 * select own-key in every treatment radio group (class groups and
 * per-mark overrides). The input order is left at its standing answer —
 * postfix (letter first, then diacritic) in this flow; the tests assert
 * the recorded answers, so a different standing order would fail loudly
 * rather than pass silently. The guard station keeps its guard.
 */
async function driveMarks(opts: { touchTreatment: boolean }): Promise<TreatmentCapture> {
  for (let i = 0; i < 16 && activeStep() === "marks"; i++) {
    const guard = document.querySelector<HTMLElement>('[data-testid="guard-option-emit"]');
    if (guard) fireEvent.click(guard);
    const hasTreatment =
      document.querySelector('input[type="radio"][name^="treatment-"]') !== null;
    if (hasTreatment && opts.touchTreatment) {
      // Select own-key in every treatment radio group (class groups and
      // per-mark overrides). The inputs carry no distinguishing value
      // attributes, so identify the option by its label copy: own-key is
      // "The mark gets a key of its own…"; composed is "Each marked
      // character gets a key of its own…".
      const groups = new Map<string, HTMLInputElement[]>();
      for (const input of document.querySelectorAll<HTMLInputElement>(
        'input[type="radio"][name^="treatment-"]',
      )) {
        const arr = groups.get(input.name) ?? [];
        arr.push(input);
        groups.set(input.name, arr);
      }
      for (const inputs of groups.values()) {
        for (const input of inputs) {
          const labelText =
            input.closest("label")?.textContent ??
            (input.id
              ? document.querySelector(`label[for="${input.id}"]`)?.textContent ?? ""
              : "");
          if (
            /mark gets a key of its own/i.test(labelText) &&
            !input.checked
          ) {
            fireEvent.click(input);
          }
        }
      }
    }
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="marks-continue"]');
    if (!btn) break;
    if (btn.disabled) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
      continue;
    }
    fireEvent.click(btn);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
  await waitFor(() => expect(activeStep()).not.toBe("marks"), { timeout: 5000 });
  return captureTreatment();
}

async function driveIntermediateSteps(): Promise<void> {
  // punctuation → invisibles → convenience → carve → deadkeys → rules,
  // each through the same StepHost.
  for (let i = 0; i < 60; i++) {
    const id = activeStep();
    if (id === MECHANISMS_STEP_ID) return;
    if (id === "marks" || id === "characters") {
      throw new Error(`driveIntermediateSteps: unexpected step ${id}`);
    }
    const candidates = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
      (b) =>
        !b.disabled &&
        !/back/i.test(b.dataset.testid ?? "") &&
        (/continue|done|keep-all/i.test(b.dataset.testid ?? "") ||
          /^(punctuation|invisibles|convenience|carve|deadkeys|rules)-/.test(
            b.dataset.testid ?? "",
          )),
    );
    const forward =
      candidates.find((b) => /(continue|done)$/.test(b.dataset.testid ?? "")) ??
      candidates[0];
    if (forward) {
      fireEvent.click(forward);
      if (activeStep() === id) {
        const keepNone = candidates.find(
          (b) => b.dataset.testid === "convenience-keep-none",
        );
        if (keepNone && forward.dataset.testid !== "convenience-keep-none") {
          fireEvent.click(keepNone);
        }
      }
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
  throw new Error(`driveIntermediateSteps: stuck at ${activeStep()}`);
}

async function renderGalleryAndCaptureWalk(): Promise<{
  walk: string[];
  placement: string[];
}> {
  if (activeStep() !== MECHANISMS_STEP_ID) {
    act(() => {
      useSurveySessionStore.setState({ activeStepId: MECHANISMS_STEP_ID });
    });
  }
  useWorkingCopyStore.getState().markGalleryIntroSeen("mechanism");
  await waitFor(
    () => {
      expect(
        useStepWalkStore.getState().walks[MECHANISMS_STEP_ID]?.length,
      ).toBeGreaterThan(0);
    },
    { timeout: 10000 },
  );
  // Dismiss the gallery intro splash if it is showing (the author's Start).
  const introStart = document.querySelector<HTMLButtonElement>(
    '[data-testid="gallery-intro-start"]',
  );
  if (introStart) {
    fireEvent.click(introStart);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
  const positions = useStepWalkStore.getState().walks[MECHANISMS_STEP_ID] ?? [];
  const walk = positions
    .map((p) => positionTokenToChar(p.id))
    .filter((c): c is string => c !== null);
  const s = sessionNow();
  const placement = derivePlacementInventory(
    s.confirmedInventory ?? [],
    s.alphabet,
    s.marksWorklist,
  );
  return { walk, placement };
}

function expectCleanPlacement(placement: string[], walk: string[]): void {
  expect(placement.filter((c) => COMPOSED_FORMS.includes(c))).toEqual([]);
  expect(walk.filter((c) => COMPOSED_FORMS.includes(c))).toEqual([]);
  for (const mark of BAFUT_MARKS) {
    expect(walk).toContain(mark);
    expect(placement).toContain(mark);
  }
  // The special bases needing keys are placement units and walk stops.
  for (const base of ["ə", "ɨ", "ŋ", "ɛ", "ɔ", "ʼ"]) {
    expect(walk).toContain(base);
  }
}

async function runFlow(opts: {
  prompted: boolean;
  touchTreatment: boolean;
  variant?: "reload" | "backnav" | "repaste";
}): Promise<{
  treatment: TreatmentCapture;
  walk: string[];
  placement: string[];
}> {
  const deps = makeRealDeps();
  resetAllStores();
  seedStartAndIdentity(deps);
  render(
    <>
      <StepHost reducerDeps={deps} onStartOver={() => {}} />
      <ActiveStepNav />
    </>,
  );
  await driveCharacters({ prompted: opts.prompted });
  const treatment = await driveMarks({ touchTreatment: opts.touchTreatment });
  if (opts.variant === "backnav") {
    // Back from punctuation into marks, then re-complete the series.
    const back = document.querySelector<HTMLButtonElement>(
      '[data-testid="punctuation-back"]',
    );
    if (!back) throw new Error("backnav: no punctuation-back button");
    fireEvent.click(back);
    await waitFor(() => expect(activeStep()).toBe("marks"));
    await driveMarks({ touchTreatment: opts.touchTreatment });
  }
  await driveIntermediateSteps();
  if (opts.variant === "reload") {
    saveDraft(PENDING_PROJECT_KEY);
    // The persisted envelope must carry the marks worklist.
    let raw = "";
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes("pending")) raw = localStorage.getItem(key) ?? "";
    }
    expect(raw).toContain("marksWorklist");
    cleanup();
    resetAllStores();
    const ok = loadDraft(PENDING_PROJECT_KEY);
    expect(ok).toBe(true);
    render(
      <>
        <StepHost reducerDeps={deps} onStartOver={() => {}} />
        <ActiveStepNav />
      </>,
    );
  }
  const { walk, placement } = await renderGalleryAndCaptureWalk();
  if (opts.variant === "repaste") {
    // Back-navigate all the way to characters, re-paste, walk forward again.
    const backChain = [
      "rules",
      "deadkeys",
      "carve",
      "convenience",
      "invisibles",
      "punctuation",
      "marks",
      "characters",
    ];
    for (const target of backChain) {
      let lastError: unknown = null;
      for (let hop = 0; hop < 12 && activeStep() !== target; hop++) {
        const current = activeStep();
        const backBtn = document.querySelector<HTMLButtonElement>(
          `[data-testid="${current}-back"]`,
        );
        if (!backBtn) {
          lastError = new Error(`repaste: no ${current}-back button`);
          break;
        }
        fireEvent.click(backBtn);
        await act(async () => {
          await new Promise((r) => setTimeout(r, 25));
        });
      }
      if (activeStep() !== target) {
        throw lastError ?? new Error(`repaste: stuck at ${activeStep()}, want ${target}`);
      }
    }
    await screen.findByTestId("charlist-done");
    await pasteSampleIntoAffordance();
    fireEvent.click(screen.getByTestId("charlist-done"));
    await waitFor(() => expect(activeStep()).toBe("marks"));
    await driveMarks({ touchTreatment: opts.touchTreatment });
    await driveIntermediateSteps();
    const again = await renderGalleryAndCaptureWalk();
    return { treatment, walk: again.walk, placement: again.placement };
  }
  return { treatment, walk, placement };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Bafut full flow (#2293)", () => {
  afterEach(() => cleanup());

  it("voluntary sample + own-key: walk and placement exclude composed forms", async () => {
    const r = await runFlow({ prompted: false, touchTreatment: true });
    expectCleanPlacement(r.placement, r.walk);
    // The session carries the filtered worklist out of the real flow:
    // both rendered classes recorded own-key; the output-form answer is
    // independent and must not leak into placement (it is
    // "base-plus-mark" here, and placement follows treatment alone).
    const s = sessionNow();
    expect(s.alphabet).toBeDefined();
    expect(s.marksWorklist?.markUnits.map((u) => u.mark)).toEqual(
      expect.arrayContaining(BAFUT_MARKS),
    );
    expect(r.treatment.recordedAnswers?.["marks.marks_treatment.class.above-1"]).toBe("own-key");
    expect(r.treatment.recordedAnswers?.["marks.marks_treatment.class.above-2"]).toBe("own-key");
    expect(r.treatment.recordedAnswers?.["marks.marks_treatment.input_order"]).toBe("postfix");
  }, 120000);

  it("prompted sample (#1784) + own-key: walk and placement exclude composed forms", async () => {
    const r = await runFlow({ prompted: true, touchTreatment: true });
    expectCleanPlacement(r.placement, r.walk);
  }, 120000);

  it("order-only author (treatment radios untouched): standing answers are own-key, placement clean", async () => {
    const r = await runFlow({ prompted: false, touchTreatment: false });
    expectCleanPlacement(r.placement, r.walk);
    // The author who only confirms the station records the presented
    // treatment: own-key for both rendered classes — no class is left
    // recorded as composed by the prefill.
    expect(r.treatment.recordedAnswers?.["marks.marks_treatment.class.above-1"]).toBe("own-key");
    expect(r.treatment.recordedAnswers?.["marks.marks_treatment.class.above-2"]).toBe("own-key");
    expect(r.treatment.recordedAnswers?.["marks.marks_treatment.input_order"]).toBe("postfix");
    expect(r.treatment.recordedAnswers?.["marks.marks_output_form.form"]).toBe("base-plus-mark");
  }, 120000);

  it("variant (a): draft save + reload + resume before the gallery", async () => {
    const r = await runFlow({ prompted: false, touchTreatment: true, variant: "reload" });
    expectCleanPlacement(r.placement, r.walk);
  }, 120000);

  it("variant (b): back-nav into marks and re-completion", async () => {
    const r = await runFlow({ prompted: false, touchTreatment: true, variant: "backnav" });
    expectCleanPlacement(r.placement, r.walk);
  }, 120000);

  it("variant (c): gallery, back to characters, re-paste, return", async () => {
    const r = await runFlow({ prompted: false, touchTreatment: true, variant: "repaste" });
    expectCleanPlacement(r.placement, r.walk);
  }, 120000);

  it("strip selection: a composed form cannot be selected into the placement pane", async () => {
    const r = await runFlow({ prompted: false, touchTreatment: true });
    expectCleanPlacement(r.placement, r.walk);

    const chip = (testid: string) =>
      document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);
    const pressedChip = () =>
      document.querySelector('[data-testid^="char-scroll-chip-"][aria-pressed="true"]');

    // The strip is SHOW-ALL: à's chip is rendered (coverage display)…
    const aChip = chip("char-scroll-chip-00E0"); // à
    expect(aChip).not.toBeNull();
    const entryPressed = pressedChip()?.getAttribute("data-testid");
    expect(entryPressed).toBeTruthy();

    // …but clicking it must NOT select it into the placement pane: the
    // treatment answer (own-key) already decided how à is typed.
    fireEvent.click(aChip!);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 25));
    });
    expect(aChip!.getAttribute("aria-pressed")).toBe("false");
    expect(pressedChip()?.getAttribute("data-testid")).toBe(entryPressed);

    // A decomposed-only composed form (ə̀, no precomposed codepoint) is
    // filtered identically.
    const schwaGraveChip = chip("char-scroll-chip-0259-0300");
    expect(schwaGraveChip).not.toBeNull();
    fireEvent.click(schwaGraveChip!);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 25));
    });
    expect(schwaGraveChip!.getAttribute("aria-pressed")).toBe("false");
    expect(pressedChip()?.getAttribute("data-testid")).toBe(entryPressed);

    // Placement units remain selectable: the schwa base and a lone mark.
    const schwaChip = chip("char-scroll-chip-0259"); // ə
    expect(schwaChip).not.toBeNull();
    fireEvent.click(schwaChip!);
    await waitFor(() =>
      expect(schwaChip!.getAttribute("aria-pressed")).toBe("true"),
    );
    const markChip = chip("char-scroll-chip-0300"); // U+0300
    expect(markChip).not.toBeNull();
    fireEvent.click(markChip!);
    await waitFor(() => expect(markChip!.getAttribute("aria-pressed")).toBe("true"));
  }, 120000);
});
