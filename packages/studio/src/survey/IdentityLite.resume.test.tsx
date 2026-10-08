// Resume-wiring tests for IdentityLite (history-pop resume, PR follow-up):
//   - toResumeAnswers(): exhaustive per-answerType flattening of a completed
//     SurveyPhaseResult into SurveyRunner's resumeAnswers shape.
//   - DOM: rendering IdentityLite with a `resume` payload mounts the flow on
//     its LAST question (il_target_script since #1901 moved the author/
//     copyright questions to the post-track attribution step) with the
//     recorded answer restored,
//     Back walks to the prior question with its value, and Finish re-completes
//     with the same extracted identity.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import React from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

import {
  IdentityLite,
  buildTargetBcp47,
  toResumeAnswers,
  type IdentityLiteResult,
} from "./IdentityLite.tsx";

afterEach(() => {
  cleanup();
});

// A completed identity-lite run: Hausa, Latin script.
const COMPLETED: SurveyPhaseResult = {
  phase: "A",
  answers: [
    { questionId: "il_language_autonym", answerType: "text", value: "Hausa" },
    { questionId: "il_language_english", answerType: "text", value: "Hausa" },
    { questionId: "il_language_code", answerType: "text", value: "ha" },
    { questionId: "il_target_script", answerType: "select", value: "Latn" },
  ],
};

// A completed run for a region-AMBIGUOUS language (Afar, region DJ) — the
// original walk routed through il_language_region via getNextOverride. On
// resume, langtags is not yet loaded (getNextOverride can't fire), so the
// region step is reconstructed purely from the recorded answer. Regression
// guard for the resume-replay region-drop bug.
const COMPLETED_AMBIGUOUS: SurveyPhaseResult = {
  phase: "A",
  answers: [
    { questionId: "il_language_code", answerType: "text", value: "aa" },
    { questionId: "il_language_region", answerType: "text", value: "DJ" },
    { questionId: "il_language_english", answerType: "text", value: "Afar" },
    { questionId: "il_language_autonym", answerType: "text", value: "Qafar" },
    { questionId: "il_target_script", answerType: "select", value: "Latn" },
  ],
};

// ---------------------------------------------------------------------------
// toResumeAnswers — per-answerType flattening
// ---------------------------------------------------------------------------

describe("toResumeAnswers", () => {
  it("flattens a real identity-lite phase result to questionId → value", () => {
    expect(toResumeAnswers(COMPLETED)).toEqual({
      il_language_autonym: "Hausa",
      il_language_english: "Hausa",
      il_language_code: "ha",
      il_target_script: "Latn",
    });
  });

  it("maps every answerType to the runner's value shape", () => {
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "q_text", answerType: "text", value: "plain" },
        { questionId: "q_select", answerType: "select", value: "opt" },
        { questionId: "q_bool_t", answerType: "boolean", value: true },
        { questionId: "q_bool_f", answerType: "boolean", value: false },
        { questionId: "q_chars", answerType: "char-list", value: ["ɓ", "ɗ"] },
        { questionId: "q_char", answerType: "char-single", value: "ŋ" },
        { questionId: "q_key", answerType: "key-name", value: "K_QUOTE" },
        { questionId: "q_store", answerType: "store-content", value: "abc" },
      ],
    };
    expect(toResumeAnswers(result)).toEqual({
      q_text: "plain",
      q_select: "opt",
      q_bool_t: "true",
      q_bool_f: "false",
      q_chars: ["ɓ", "ɗ"],
      q_char: "ŋ",
      q_key: "K_QUOTE",
      q_store: "abc",
    });
  });

  it("returns a fresh array for char-list values (no aliasing of the source)", () => {
    const source: SurveyPhaseResult = {
      phase: "A",
      answers: [{ questionId: "q", answerType: "char-list", value: ["a"] }],
    };
    const out = toResumeAnswers(source);
    expect(out["q"]).toEqual(["a"]);
    expect(out["q"]).not.toBe(source.answers[0]!.value);
  });
});

// ---------------------------------------------------------------------------
// IdentityLite with resume — DOM behaviour over the REAL identity_lite flow
// ---------------------------------------------------------------------------

describe("IdentityLite — resume", () => {
  // #1901: the last question is the target script again — the author/
  // copyright questions moved to the post-track attribution step.
  it("mounts on the LAST question (target script) with the answer restored", () => {
    render(<IdentityLite onComplete={vi.fn()} resume={COMPLETED} />, { withStepNav: true });
    expect(screen.getByText("Which script will THIS keyboard type?")).toBeTruthy();
    expect(
      screen.queryByText("What is your language called in your own language?"),
    ).toBeNull();
    // Restored select answer keeps Finish enabled.
    const advance = screen.getByTestId("survey-advance") as HTMLButtonElement;
    expect(advance.textContent).toBe("Continue");
    expect(advance.disabled).toBe(false);
  });

  it("Back from the resumed last question restores the prior answer", () => {
    render(<IdentityLite onComplete={vi.fn()} resume={COMPLETED} />, { withStepNav: true });
    fireEvent.click(screen.getByTestId("survey-back"));
    // Flow order: english → region? → autonym → code → target_script. Back
    // from the last question (target script) lands on il_language_code with
    // its restored value; assert on the display value rather than the
    // input role.
    expect(screen.getByDisplayValue("ha")).toBeTruthy();
  });

  it("Finish on a resumed flow re-completes with the same extracted identity", () => {
    const onComplete =
      vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(<IdentityLite onComplete={onComplete} resume={COMPLETED} />, { withStepNav: true });
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result, identity] = onComplete.mock.calls[0]!;
    // Through the composer, not a spelled-out tag (the region test below
    // documents why): whether the canonical form elides the script subtag
    // depends on the langtags chunk having loaded this session, and the
    // post-#1901 walk reaches Finish before it reliably has.
    expect(identity.bcp47).toBe(buildTargetBcp47("ha", "Latn", ""));
    expect(identity.autonym).toBe("Hausa");
    expect(identity.supported).toBe(true);
    // #1901: the identity result no longer carries attribution — it is
    // composed from the attribution decisions at the store level
    // (decisions/identitySelectors.ts, covered by its own suite).
    expect(identity.attribution).toBeNull();
    // The replayed result carries every original answer exactly once.
    const ids = result.answers.map((a) => a.questionId);
    expect(ids.sort()).toEqual([
      "il_language_autonym",
      "il_language_code",
      "il_language_english",
      "il_target_script",
    ]);
  });

  it("without resume, mounts on the first question as before", () => {
    render(<IdentityLite onComplete={vi.fn()} />, { withStepNav: true });
    // il_language_english (English-name picker) is the first question in the
    // reordered flow (spec 030 FR-009).
    expect(
      screen.getByText("What is your language called in English?"),
    ).toBeTruthy();
  });

  it("resuming a region-ambiguous run preserves the region on Finish (no drop)", () => {
    const onComplete =
      vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(<IdentityLite onComplete={onComplete} resume={COMPLETED_AMBIGUOUS} />, { withStepNav: true });
    // Mounts on the last question; Finish without touching anything must not
    // silently drop il_language_region (langtags is unloaded at replay time).
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result, identity] = onComplete.mock.calls[0]!;
    expect(result.answers.map((a) => a.questionId)).toContain("il_language_region");
    expect(identity.region).toBe("DJ");
    // Through the composer, not a spelled-out tag: what this guards is that the
    // region survived the replay, and `Latn` is Afar's default script, so
    // whether the composed tag carries the script subtag depends on langtags
    // having resolved — which is not what this test is about.
    expect(identity.bcp47).toBe(buildTargetBcp47("aa", "Latn", "DJ"));
    expect(identity.bcp47).toContain("-DJ");
  });
});
