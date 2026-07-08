// Resume-wiring tests for IdentityLite (history-pop resume, PR follow-up):
//   - toResumeAnswers(): exhaustive per-answerType flattening of a completed
//     SurveyPhaseResult into SurveyRunner's resumeAnswers shape.
//   - DOM: rendering IdentityLite with a `resume` payload mounts the flow on
//     its LAST question (il_target_script) with the recorded answer restored,
//     Back walks to the prior question with its value, and Finish re-completes
//     with the same extracted identity.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

import {
  IdentityLite,
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
  it("mounts on the LAST question (target script) with the answer restored", () => {
    render(<IdentityLite onComplete={vi.fn()} resume={COMPLETED} />);
    expect(screen.getByText("Which script will THIS keyboard type?")).toBeTruthy();
    expect(
      screen.queryByText("What is your language called in your own language?"),
    ).toBeNull();
    // Restored select answer keeps Finish enabled.
    const advance = screen.getByTestId("survey-advance") as HTMLButtonElement;
    expect(advance.textContent).toBe("Finish");
    expect(advance.disabled).toBe(false);
  });

  it("Back from the resumed last question restores the prior answer", () => {
    render(<IdentityLite onComplete={vi.fn()} resume={COMPLETED} />);
    fireEvent.click(screen.getByTestId("survey-back"));
    expect(screen.getByText("What language is this keyboard for?")).toBeTruthy();
    // il_language_code renders as a datalist-backed input (role combobox) —
    // assert on the restored display value rather than a specific role.
    expect(screen.getByDisplayValue("ha")).toBeTruthy();
  });

  it("Finish on a resumed flow re-completes with the same extracted identity", () => {
    const onComplete =
      vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(<IdentityLite onComplete={onComplete} resume={COMPLETED} />);
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result, identity] = onComplete.mock.calls[0]!;
    expect(identity.bcp47).toBe("ha-Latn");
    expect(identity.autonym).toBe("Hausa");
    expect(identity.supported).toBe(true);
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
    render(<IdentityLite onComplete={vi.fn()} />);
    expect(
      screen.getByText("What is your language called in your own language?"),
    ).toBeTruthy();
  });
});
