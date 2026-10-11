// Regression coverage for BaseResolutionAdapter's suggest-target wiring
// (refs #1021). The adapter must build SuggestTarget from
// surveySessionStore.identityResult (written by IdentityLiteAdapter before
// this step is reached), not from workingCopyStore.identity, which is null
// at base-resolution time. Covers:
//   1. identityResult with a declared language -> language-match badge.
//   2. identityResult === null -> falls back to script "Latn", no crash,
//      no language-match badge.
//   3. identityResult.bcp47 === "" -> same fallback behaviour as (2).
//   4. identityResult.prefill.script === "" (unrecognized language) -> script
//      falls back to "Latn" instead of failing every script comparison.

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import {
  basicKbdus,
  silEuroLatin,
} from "@keyboard-studio/contracts/fixtures";

import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import type { Decision } from "../../decisions/decisionTypes.ts";
import { useBasePreviewStatusStore } from "../../stores/basePreviewStatusStore.ts";
import { recordAnswersAsDecisions } from "../../steps/reducer.ts";

// ---------------------------------------------------------------------------
// jsdom does not implement scrollIntoView — BaseKeyboardPicker (rendered
// inside BaseResolution) may call it; stub it out globally like the existing
// BaseKeyboardPicker.test.tsx does.
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ---------------------------------------------------------------------------
// Service mock — BaseResolution loads bases via getBaseBrowserService().
// vi.mock is hoisted, so it runs before the panelAdapters import below.
// ---------------------------------------------------------------------------

const BASES: BaseKeyboard[] = [basicKbdus, silEuroLatin];

vi.mock("../../lib/services.ts", () => ({
  getBaseBrowserService: () => ({ listAll: () => Promise.resolve(BASES) }),
  // spec 080 FR-008: BaseResolution's doc-profile hook calls this on every
  // preview; default every base to "unknown" (no badge) — this file's
  // coverage is the preview/commit wiring, not the classification badge
  // itself (see BaseResolution.test.tsx for that).
  getBaseDocProfile: () =>
    Promise.resolve({
      level: "unknown",
      members: [],
      welcomeConvention: "absent",
      hasUsableDescription: false,
      welcomeImages: [],
    }),
  USE_REAL: false,
}));

import { BaseResolutionAdapter, IdentityLiteAdapter } from "./panelAdapters.tsx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Seed the identity decisions the identity step's completion records
 * (spec 089: BaseResolutionAdapter reads deriveIdentityResult(decisions)
 * in place of the deleted surveySessionStore.identityResult field).
 * Defaults reproduce the old makeIdentityResult({}) fixture: Hausa/Latn.
 */
function seedIdentityDecisions(
  overrides: { languageCode?: string; targetScript?: string } = {},
): void {
  const record = useDecisionStore.getState().record;
  record({ id: "language-name", value: "Hausa", provenance: "asked" });
  record({ id: "language-autonym", value: "Hausa", provenance: "asked" });
  record({ id: "language-code", value: overrides.languageCode ?? "ha", provenance: "asked" });
  record({ id: "target-script", value: overrides.targetScript ?? "Latn", provenance: "asked" });
}

afterEach(() => {
  cleanup();
  // Reset the preview-status store between tests — it is a module-level
  // singleton (Zustand), so a test that flips it to "ready" would otherwise
  // leak into the next test's initial render.
  useBasePreviewStatusStore.setState({ status: "idle" });
});

describe("BaseResolutionAdapter — suggest target derived from the decision store (spec 089)", () => {
  it("declared-language identity decisions surface the language-match badge", async () => {
    seedIdentityDecisions();

    render(<BaseResolutionAdapter onComplete={() => {}} />, { withStepNav: true });

    await waitFor(() => {
      expect(screen.getByText("Already supports your language")).toBeDefined();
    });
  });

  it("no identity decisions falls back to script-only target without crashing", async () => {
    // No decisions recorded — deriveIdentityResult returns null.

    render(<BaseResolutionAdapter onComplete={() => {}} />, { withStepNav: true });

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });

  it("empty language-code decision (bcp47 === '') falls back to script-only target without crashing", async () => {
    seedIdentityDecisions({ languageCode: "" });

    render(<BaseResolutionAdapter onComplete={() => {}} />, { withStepNav: true });

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });

  it("empty target-script decision falls back to 'Latn' so script matching still works", async () => {
    // deriveIdentityResult: an empty recorded script composes to
    // prefill.script "" — the adapter's `|| "Latn"` fallback covers it.
    seedIdentityDecisions({ languageCode: "", targetScript: "" });

    render(<BaseResolutionAdapter onComplete={() => {}} />, { withStepNav: true });

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BaseResolutionAdapter — preview-before-commit split (gallery-hosted since
// spec 090 T013: the adapter is the host wrapper; the renderer is
// survey/chooseBase/BaseKeyboardRenderer.tsx).
//
// Preview (every suggestion-card / search-result click) must write
// setLocalBase WITHOUT calling onComplete and WITHOUT recording any
// decision (the wizard does not advance, the working copy is not
// instantiated). Commit (the "Choose this keyboard" button) must record
// the `base-keyboard` decision BEFORE calling onComplete (R7 ordering —
// StudioShell's single-instantiation effect arms off the recorded
// decision; the session baseConfirmed flag is no longer written at all).
// ---------------------------------------------------------------------------

describe("BaseResolutionAdapter — preview vs commit", () => {
  it("previewing a suggestion card writes setLocalBase and does NOT call onComplete", async () => {
    seedIdentityDecisions();
    const onComplete = vi.fn();

    render(<BaseResolutionAdapter onComplete={onComplete} />, { withStepNav: true });

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    await waitFor(() => {
      expect(useSurveySessionStore.getState().localBase?.id).toBe("sil_euro_latin");
    });
    expect(onComplete).not.toHaveBeenCalled();
    // A preview is not a decision — nothing is recorded.
    expect(useDecisionStore.getState().decisions["base-keyboard"]).toBeUndefined();
    // basePreviewStatusStore stays at its default "idle" (nothing in this
    // unit test publishes to it), so the confirm button stays disabled too —
    // a preview alone can never reach the commit path.
    expect((screen.getByTestId("base-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("committing after a preview records the base-keyboard decision BEFORE calling onComplete (R7 ordering)", async () => {
    seedIdentityDecisions();

    // Spy on the decision store's record via the setState escape hatch,
    // wrapping the real action so both the spy AND the actual mutation
    // fire — same pattern as the golden-walk oracle in
    // tests/steps/stepHost.goldenWalk.test.tsx.
    const originalRecord = useDecisionStore.getState().record;
    const recordSpy = vi.fn((d: Decision) => originalRecord(d));
    useDecisionStore.setState({ record: recordSpy });

    const onComplete = vi.fn();
    render(<BaseResolutionAdapter onComplete={onComplete} />, { withStepNav: true });

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    // Follow-up fix on PR #1174: the confirm button is now gated on
    // previewStatus === "ready" (read from basePreviewStatusStore). This unit
    // test has no StudioShell/SurveyView mounted to publish that status from
    // the real compile pipeline, so drive it directly — mirroring what a
    // settled preview compile would publish.
    useBasePreviewStatusStore.getState().setStatus("ready");

    const confirm = await waitFor(() => {
      const btn = screen.getByTestId("base-confirm") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(confirm);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      base: expect.objectContaining({ id: "sil_euro_latin" }),
    });

    // Exactly one decision is recorded — the commit's — carrying the
    // previewed base's catalog identity with asked provenance.
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0]![0]).toMatchObject({
      id: "base-keyboard",
      value: { id: "sil_euro_latin" },
      provenance: "asked",
      step: "choose_base",
    });
    expect(useDecisionStore.getState().decisions["base-keyboard"]).toBeDefined();
    // The retired session flag is untouched by the whole flow.
    expect(useSurveySessionStore.getState().baseConfirmed).toBe(false);

    // Call-order assertion: the record fires strictly before onComplete
    // (R7 — "writes before advance").
    const recordOrder = recordSpy.mock.invocationCallOrder[0];
    const onCompleteOrder = onComplete.mock.invocationCallOrder[0];
    expect(recordOrder).toBeLessThan(onCompleteOrder!);
  });
});

// ---------------------------------------------------------------------------
// IdentityLiteAdapter — history-pop resume wiring (decision-derived, spec 089)
// ---------------------------------------------------------------------------

/** A completed identity-lite phase result, as the flow would produce it. */
const IDENTITY_PHASE_RESULT = {
  phase: "A" as const,
  answers: [
    { questionId: "il_language_autonym", answerType: "text" as const, value: "Hausa" },
    { questionId: "il_language_english", answerType: "text" as const, value: "Hausa" },
    { questionId: "il_language_code", answerType: "text" as const, value: "ha" },
    { questionId: "il_target_script", answerType: "select" as const, value: "Latn" },
    // #1901: a genuinely COMPLETED identity result ends here — the
    // author/copyright answers (spec 064 US1) are the attribution step's
    // completion now, recorded under that step, not this one.
  ],
};

/** Record the completed identity run the way StepHost does at completion. */
function seedCompletedIdentityDecisions(): void {
  recordAnswersAsDecisions(IDENTITY_PHASE_RESULT, "identity", {
    writeDecisionRecords: (records) => useDecisionStore.getState().recordAll(records),
    readDecisionSet: () => useDecisionStore.getState().decisions,
  });
}

describe("IdentityLiteAdapter — resume from recorded decisions (spec 089)", () => {
  it("first visit (no decisions recorded) starts the flow at question 1", () => {
    render(<IdentityLiteAdapter onComplete={() => {}} />, { withStepNav: true });
    // il_language_english (English-name picker) is the first question in the
    // reordered flow (spec 030 FR-009).
    expect(
      screen.getByText("What is your language called in English?"),
    ).toBeDefined();
  });

  it("re-entry with decisions recorded resumes on the flow's last question", () => {
    seedCompletedIdentityDecisions();

    render(<IdentityLiteAdapter onComplete={() => {}} />, { withStepNav: true });

    // #1901: the flow's last question is the target script again.
    expect(screen.getByText("Which script will THIS keyboard type?")).toBeDefined();
    expect(
      screen.queryByText("What is your language called in your own language?"),
    ).toBeNull();
  });

  it("T018 round trip: decisions recorded at completion rebuild the resume payload field-for-field", () => {
    seedCompletedIdentityDecisions();

    render(<IdentityLiteAdapter onComplete={() => {}} />, { withStepNav: true });

    // The resumed flow shows the last question (target script) with its
    // recorded answer restored — Finish is available directly.
    expect(screen.getByText("Which script will THIS keyboard type?")).toBeDefined();
    const advance = screen.getByTestId("survey-advance") as HTMLButtonElement;
    expect(advance.disabled).toBe(false);
  });

  it("completion writes NOTHING to any store — it forwards the result untouched (spec 089)", () => {
    seedCompletedIdentityDecisions();
    const onComplete = vi.fn();

    render(<IdentityLiteAdapter onComplete={onComplete} />, { withStepNav: true });
    // Resumed on the last question with its answer restored — Finish directly.
    fireEvent.click(screen.getByTestId("survey-advance"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    // The forwarded value is the phase result StepHost consumes (recordPhase +
    // recordAnswersAsDecisions + applyDecisionEffects run there).
    const forwarded = onComplete.mock.calls[0]![0] as { phase: string; answers: unknown[] };
    expect(forwarded.phase).toBe("A");
    // The four identity answers — the attribution trio is the attribution
    // step's own completion (#1901), not appended here.
    expect(forwarded.answers.length).toBe(4);
    // And the session store carries no identity residue from the adapter:
    // the fields it used to write no longer exist at all (T017).
    const session = useSurveySessionStore.getState();
    expect("identityResult" in session).toBe(false);
    expect("surveyContext" in session).toBe(false);
    expect("identityPhaseResult" in session).toBe(false);
  });
});
