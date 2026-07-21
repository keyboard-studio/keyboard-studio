// Direct coverage for FlowStepHost — the shared shell around SurveyRunner
// (spec 029 Stage 6, T002). Every prior test vi.mock-stubbed FlowStepHost
// (makeFlowStepComponent.test.tsx, stepHost.goldenWalk.test.tsx,
// stepHost.renderSmoke.test.tsx, StudioShell.test.tsx), so its own render
// path — title, SurveyRunner wiring, getSeedValue/onAnswerCommit plumbing,
// onBack/onComplete forwarding — had zero direct coverage.
//
// FlowStepHost is deliberately pure (no store imports — C1.3), and
// SurveyRunner is itself store-free, so this suite renders BOTH for real;
// no mocking is needed anywhere in this file.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { FlowStepHost } from "./FlowStepHost.tsx";
import type { FlowDef } from "./types.ts";
import type { LintFinding, SurveyPhaseResult } from "@keyboard-studio/contracts";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixture flows
// ---------------------------------------------------------------------------

/** Single required short_text question, terminal (next: null). */
function buildSingleQuestionFlow(): FlowDef {
  return {
    flow_id: "fsh-single",
    phase: "G",
    questions: [
      {
        id: "q1",
        type: "short_text",
        prompt: "Question one",
        required: true,
        next: null,
      },
    ],
  };
}

/** Two required short_text questions: q1 -> q2 -> terminal. */
function buildTwoQuestionFlow(): FlowDef {
  return {
    flow_id: "fsh-two",
    phase: "G",
    questions: [
      {
        id: "q1",
        type: "short_text",
        prompt: "Question one",
        required: true,
        next: "q2",
      },
      {
        id: "q2",
        type: "short_text",
        prompt: "Question two",
        required: true,
        next: null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Title render
// ---------------------------------------------------------------------------

describe("FlowStepHost — title render", () => {
  it("renders the title prop as an <h2>", () => {
    render(
      <FlowStepHost
        flow={buildSingleQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={vi.fn()}
      />,
    );

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Test Title");
  });
});

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

describe("FlowStepHost — back button", () => {
  it("invokes onBack when Back is clicked on the first question (onBack forwarded to SurveyRunner)", () => {
    const onBack = vi.fn();

    render(
      <FlowStepHost
        flow={buildSingleQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={vi.fn()}
        onBack={onBack}
      />,
    );

    // SurveyRunner only renders Back when onBack !== undefined OR stack.length > 1;
    // this proves the prop reaches SurveyRunner (FlowStepHost's optional-prop guard).
    const backButton = screen.getByTestId("survey-back");
    fireEvent.click(backButton);

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does NOT render a Back button when onBack is omitted on the first question", () => {
    render(
      <FlowStepHost
        flow={buildSingleQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("survey-back")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Completion path
// ---------------------------------------------------------------------------

describe("FlowStepHost — completion path", () => {
  it("invokes onComplete with the SurveyPhaseResult once the single question is answered", async () => {
    const onComplete = vi.fn();

    render(
      <FlowStepHost
        flow={buildSingleQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={onComplete}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "answer one" } });

    const finishButton = screen.getByRole("button", { name: /finish/i });
    await act(async () => {
      fireEvent.click(finishButton);
    });

    expect(onComplete).toHaveBeenCalledOnce();
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.phase).toBe("G");
    expect(result.answers).toEqual([
      { questionId: "q1", answerType: "text", value: "answer one" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Seed value plumbing
// ---------------------------------------------------------------------------

describe("FlowStepHost — getSeedValue plumbing", () => {
  it("pre-fills the first question's input from the getSeedValue prop", () => {
    const getSeedValue = vi.fn((questionId: string) =>
      questionId === "q1" ? "seeded-value" : undefined,
    );

    render(
      <FlowStepHost
        flow={buildSingleQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={vi.fn()}
        getSeedValue={getSeedValue}
      />,
    );

    expect(getSeedValue).toHaveBeenCalledWith("q1");
    const input = screen.getByRole("textbox") as HTMLInputElement | HTMLTextAreaElement;
    expect(input.value).toBe("seeded-value");
  });
});

// ---------------------------------------------------------------------------
// onAnswerCommit plumbing
// ---------------------------------------------------------------------------

describe("FlowStepHost — onAnswerCommit plumbing", () => {
  it("propagates the committed question id + value through onAnswerCommit when advancing", async () => {
    const onAnswerCommit = vi.fn();

    render(
      <FlowStepHost
        flow={buildTwoQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={vi.fn()}
        onAnswerCommit={onAnswerCommit}
      />,
    );

    const q1Input = screen.getByRole("textbox");
    fireEvent.change(q1Input, { target: { value: "first answer" } });

    const nextButton = screen.getByRole("button", { name: /next/i });
    await act(async () => {
      fireEvent.click(nextButton);
    });

    // SurveyRunner fires onAnswerCommit(currentQId, value) BEFORE pushing q2 —
    // this is the plumbing FlowStepHost forwards from its own onAnswerCommit prop.
    expect(onAnswerCommit).toHaveBeenCalledWith("q1", "first answer");

    // q2 is now on screen (proves the flow actually advanced past q1).
    expect(screen.getByText("Question two")).toBeTruthy();
  });

  it("does not render provenance / crash when onAnswerCommit is omitted (optional-prop guard)", () => {
    expect(() =>
      render(
        <FlowStepHost
          flow={buildSingleQuestionFlow()}
          title="Test Title"
          context={{}}
          onComplete={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// findingsByQuestionId plumbing
// ---------------------------------------------------------------------------

describe("FlowStepHost — findingsByQuestionId plumbing", () => {
  it("forwards findingsByQuestionId to SurveyRunner/QuestionField, which renders a lint chip for the current question (optional-prop guard: absent when omitted)", () => {
    const finding: LintFinding = {
      code: "KM_WARN_TEST_FINDING",
      severity: "warning",
      layer: "B",
      message: "Something to fix",
    };

    const { rerender } = render(
      <FlowStepHost
        flow={buildSingleQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={vi.fn()}
      />,
    );

    // Omitted — no lint chip rendered, matching the guard pattern used for
    // onBack / onAnswerCommit above.
    expect(screen.queryByText("Something to fix")).toBeNull();

    rerender(
      <FlowStepHost
        flow={buildSingleQuestionFlow()}
        title="Test Title"
        context={{}}
        onComplete={vi.fn()}
        findingsByQuestionId={{ q1: [finding] }}
      />,
    );

    // Present — forwarded through to QuestionField's lint-chip rail.
    expect(screen.getByText("Something to fix")).toBeTruthy();
  });
});
