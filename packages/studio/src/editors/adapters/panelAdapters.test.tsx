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
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import {
  basicKbdus,
  silEuroLatin,
} from "@keyboard-studio/contracts/fixtures";

import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type { IdentityLiteResult } from "../../survey/IdentityLite.tsx";

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
  USE_REAL: false,
}));

import { BaseResolutionAdapter, IdentityLiteAdapter } from "./panelAdapters.tsx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Full IdentityLiteResult shape (see survey/IdentityLite.tsx). */
function makeIdentityResult(overrides: Partial<IdentityLiteResult>): IdentityLiteResult {
  return {
    autonym: "Hausa",
    english: "Hausa",
    languageSubtag: "ha",
    targetScriptRaw: "Latn",
    bcp47: "ha-Latn",
    supported: true,
    prefill: {
      script: "Latn",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
});

describe("BaseResolutionAdapter — suggest target sourced from surveySessionStore", () => {
  it("declared-language identityResult surfaces the language-match badge", async () => {
    useSurveySessionStore.getState().setIdentityResult(makeIdentityResult({}));

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Already supports your language")).toBeDefined();
    });
  });

  it("identityResult === null falls back to script-only target without crashing", async () => {
    useSurveySessionStore.getState().setIdentityResult(null);

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });

  it("identityResult.bcp47 === '' falls back to script-only target without crashing", async () => {
    useSurveySessionStore.getState().setIdentityResult(
      makeIdentityResult({ bcp47: "" }),
    );

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });

  it("prefill.script === '' falls back to 'Latn' so script matching still works", async () => {
    useSurveySessionStore.getState().setIdentityResult(
      makeIdentityResult({
        bcp47: "",
        prefill: { script: "", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
      }),
    );

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// IdentityLiteAdapter — history-pop resume wiring (identityPhaseResult)
// ---------------------------------------------------------------------------

/** A completed identity-lite phase result, as the flow would produce it. */
const IDENTITY_PHASE_RESULT = {
  phase: "A" as const,
  answers: [
    { questionId: "il_language_autonym", answerType: "text" as const, value: "Hausa" },
    { questionId: "il_language_english", answerType: "text" as const, value: "Hausa" },
    { questionId: "il_language_code", answerType: "text" as const, value: "ha" },
    { questionId: "il_target_script", answerType: "select" as const, value: "Latn" },
    // spec 037 US1: identity-lite continues into attribution, so a genuinely
    // COMPLETED result includes these. Without them, resume correctly lands on
    // the first unanswered attribution question rather than the flow's end.
    { questionId: "il_author_name", answerType: "text" as const, value: "Alice Example" },
    { questionId: "il_author_email", answerType: "text" as const, value: "alice@example.org" },
    { questionId: "il_copyright_holder", answerType: "text" as const, value: "Hausa Language Committee" },
  ],
};

describe("IdentityLiteAdapter — resume from identityPhaseResult", () => {
  it("first visit (no stored phase result) starts the flow at question 1", () => {
    render(<IdentityLiteAdapter onComplete={() => {}} />);
    // il_language_english (English-name picker) is the first question in the
    // reordered flow (spec 030 FR-009).
    expect(
      screen.getByText("What is your language called in English?"),
    ).toBeDefined();
  });

  it("re-entry with a stored phase result resumes on the flow's last question", () => {
    useSurveySessionStore.getState().setIdentityPhaseResult(IDENTITY_PHASE_RESULT);

    render(<IdentityLiteAdapter onComplete={() => {}} />);

    // spec 037 US1: the flow's last question is now the copyright holder.
    expect(screen.getByText("Who holds the copyright for this keyboard?")).toBeDefined();
    expect(
      screen.queryByText("What is your language called in your own language?"),
    ).toBeNull();
  });

  it("completion writes identityResult, surveyContext, AND identityPhaseResult before onComplete", () => {
    useSurveySessionStore.getState().setIdentityPhaseResult(IDENTITY_PHASE_RESULT);
    // R7 ordering: SNAPSHOT the store from inside the callback, but ASSERT
    // outside it.
    //
    // An expect() that throws in here surfaces as an uncaught React error and
    // does NOT fail the test — verified by mutation: removing the author_contact
    // write made this assertion throw while the suite still reported all green.
    // Capturing and asserting afterwards is what actually gates.
    let atCompletion: ReturnType<typeof useSurveySessionStore.getState> | null = null;
    const onComplete = vi.fn((_result: unknown) => {
      atCompletion = { ...useSurveySessionStore.getState() };
    });

    render(<IdentityLiteAdapter onComplete={onComplete} />);
    // Resumed on the last question with its answer restored — Finish directly.
    fireEvent.click(screen.getByTestId("survey-advance"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(atCompletion, "store was not snapshotted — onComplete never ran").not.toBeNull();
    const s = atCompletion!;
    // Every write below must have landed BEFORE onComplete fired.
    expect(s.identityResult?.bcp47).toBe("ha-Latn");
    expect(s.surveyContext.language_name).toBe("Hausa");
    // 4 -> 7: spec 037 US1 appends the three attribution answers.
    expect(s.identityPhaseResult?.answers.length).toBe(7);
    // spec 037 FR-016: publishing the contact here is what activates the Phase F
    // pf_contact_info pre-fill.
    expect(s.surveyContext.author_contact).toBe("alice@example.org");
  });
});
