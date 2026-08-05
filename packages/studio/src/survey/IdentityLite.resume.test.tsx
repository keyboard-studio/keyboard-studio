// Resume-wiring tests for IdentityLite (history-pop resume, PR follow-up):
//   - toResumeAnswers(): exhaustive per-answerType flattening of a completed
//     SurveyPhaseResult into SurveyRunner's resumeAnswers shape.
//   - DOM: rendering IdentityLite with a `resume` payload mounts the flow on
//     its LAST question (il_copyright_holder since spec 059) with the recorded
//     answer restored,
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
    // spec 059 US1: the identity flow now continues into attribution, so a
    // genuinely COMPLETED run includes these. Without them, resume correctly
    // lands on the first unanswered attribution question instead of the end.
    { questionId: "il_author_name", answerType: "text", value: "Alice Example" },
    { questionId: "il_author_email", answerType: "text", value: "alice@example.org" },
    { questionId: "il_copyright_holder", answerType: "text", value: "Hausa Language Committee" },
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
    // spec 059 US1: the identity flow now continues into attribution, so a
    // genuinely COMPLETED run includes these. Without them, resume correctly
    // lands on the first unanswered attribution question instead of the end.
    { questionId: "il_author_name", answerType: "text", value: "Alice Example" },
    { questionId: "il_author_email", answerType: "text", value: "alice@example.org" },
    { questionId: "il_copyright_holder", answerType: "text", value: "Hausa Language Committee" },
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
      // spec 059 US1 — attribution is part of a completed identity run.
      il_author_name: "Alice Example",
      il_author_email: "alice@example.org",
      il_copyright_holder: "Hausa Language Committee",
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
  // spec 059 US1: the last question is now the copyright holder, not the script.
  it("mounts on the LAST question (copyright holder) with the answer restored", () => {
    render(<IdentityLite onComplete={vi.fn()} resume={COMPLETED} />);
    expect(screen.getByText("Who holds the copyright for this keyboard?")).toBeTruthy();
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
    // Flow order: english → autonym → code → target_script → author name →
    // author email → copyright holder (spec 059 US1). Back from the last
    // question (copyright holder) lands on il_author_email with its restored
    // value; assert on the display value rather than the input role.
    expect(screen.getByDisplayValue("alice@example.org")).toBeTruthy();
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
    // spec 059 US1: attribution survives the resume round-trip.
    expect(identity.attribution).toEqual({
      authorName: "Alice Example",
      authorEmail: "alice@example.org",
      copyrightHolder: "Hausa Language Committee",
    });
    // The replayed result carries every original answer exactly once.
    const ids = result.answers.map((a) => a.questionId);
    expect(ids.sort()).toEqual([
      "il_author_email",
      "il_author_name",
      "il_copyright_holder",
      "il_language_autonym",
      "il_language_code",
      "il_language_english",
      "il_target_script",
    ]);
  });

  it("without resume, mounts on the first question as before", () => {
    render(<IdentityLite onComplete={vi.fn()} />);
    // il_language_english (English-name picker) is the first question in the
    // reordered flow (spec 030 FR-009).
    expect(
      screen.getByText("What is your language called in English?"),
    ).toBeTruthy();
  });

  it("resuming a region-ambiguous run preserves the region on Finish (no drop)", () => {
    const onComplete =
      vi.fn<[SurveyPhaseResult, IdentityLiteResult], void>();
    render(<IdentityLite onComplete={onComplete} resume={COMPLETED_AMBIGUOUS} />);
    // Mounts on the last question; Finish without touching anything must not
    // silently drop il_language_region (langtags is unloaded at replay time).
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result, identity] = onComplete.mock.calls[0]!;
    expect(result.answers.map((a) => a.questionId)).toContain("il_language_region");
    expect(identity.region).toBe("DJ");
    expect(identity.bcp47).toBe("aa-Latn-DJ");
  });
});
