// Component tests for SurveyRunner's resumeAnswers prop: re-entering a flow
// that already completed (history pop back onto its step) mounts on the LAST
// question with the recorded answers restored — not on question 1 — and Back
// walks the replayed stack question by question.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

import { SurveyRunner, buildResumeStack } from "./SurveyRunner.tsx";
import type { FlowDef, FlowQuestion } from "./types.ts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixture — a three-question linear flow (mirrors identity-lite's shape).
// ---------------------------------------------------------------------------

const FLOW: FlowDef = {
  flow_id: "resume-test",
  phase: "A",
  questions: [
    {
      id: "q1",
      type: "short_text",
      prompt: "First question",
      required: true,
      next: "q2",
    },
    {
      id: "q2",
      type: "short_text",
      prompt: "Second question",
      required: false,
      next: "q3",
    },
    {
      id: "q3",
      type: "select",
      prompt: "Third question",
      required: true,
      options: [
        { value: "a", label: "Option A" },
        { value: "b", label: "Option B" },
      ],
      next: null,
    },
  ],
};

const RESUME = {
  q1: "alpha",
  q2: "beta",
  q3: "b",
} as const;

// ---------------------------------------------------------------------------
// DOM behaviour
// ---------------------------------------------------------------------------

describe("SurveyRunner — resumeAnswers", () => {
  it("mounts on the LAST question with its answer restored, not question 1", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} resumeAnswers={RESUME} />);
    expect(screen.getByText("Third question")).toBeTruthy();
    expect(screen.queryByText("First question")).toBeNull();
    // Restored answer keeps Finish enabled.
    const advanceBtn = screen.getByTestId("survey-advance") as HTMLButtonElement;
    expect(advanceBtn.textContent).toBe("Finish");
    expect(advanceBtn.disabled).toBe(false);
  });

  it("Back walks the replayed stack to the previous question with its value", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} resumeAnswers={RESUME} />);
    fireEvent.click(screen.getByTestId("survey-back"));
    expect(screen.getByText("Second question")).toBeTruthy();
    const input = screen.getByRole("textbox") as HTMLInputElement | HTMLTextAreaElement;
    expect(input.value).toBe("beta");
  });

  it("finishing a resumed flow reports the full replayed answer set", () => {
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    render(<SurveyRunner flow={FLOW} onComplete={onComplete} resumeAnswers={RESUME} />);
    fireEvent.click(screen.getByTestId("survey-advance"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]![0];
    expect(result.answers).toEqual([
      { questionId: "q1", answerType: "text", value: "alpha" },
      { questionId: "q2", answerType: "text", value: "beta" },
      { questionId: "q3", answerType: "select", value: "b" },
    ]);
  });

  it("mounts on question 1 as usual when resumeAnswers is absent", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    expect(screen.getByText("First question")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// buildResumeStack — pure replay logic
// ---------------------------------------------------------------------------

function idx(...questions: FlowQuestion[]): Map<string, FlowQuestion> {
  return new Map(questions.map((q) => [q.id, q]));
}

describe("buildResumeStack", () => {
  const index = idx(...FLOW.questions);

  it("replays a completed linear flow onto the last question", () => {
    const stack = buildResumeStack("q1", RESUME, {}, index);
    expect(stack).toEqual([
      { questionId: "q1", value: "alpha" },
      { questionId: "q2", value: "beta" },
      { questionId: "q3", value: "b" },
    ]);
  });

  it("stops at the first required question with no recorded answer", () => {
    const stack = buildResumeStack("q1", { q1: "alpha", q2: "beta" }, {}, index);
    expect(stack?.map((e) => e.questionId)).toEqual(["q1", "q2", "q3"]);
    expect(stack?.[2]?.value).toBeUndefined();
  });

  it("follows conditional routing using the recorded answers", () => {
    const branching = idx(
      {
        id: "b1",
        type: "select",
        required: true,
        options: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
        next: [
          { condition: "value == 'x'", goto: "bx" },
          { default: true, goto: "by" },
        ],
      },
      { id: "bx", type: "short_text", required: false, next: null },
      { id: "by", type: "short_text", required: false, next: null },
    );
    const stack = buildResumeStack("b1", { b1: "x", bx: "done" }, {}, branching);
    expect(stack?.map((e) => e.questionId)).toEqual(["b1", "bx"]);
  });

  it("returns null when there is no first renderable question", () => {
    expect(buildResumeStack(null, RESUME, {}, index)).toBeNull();
  });
});
