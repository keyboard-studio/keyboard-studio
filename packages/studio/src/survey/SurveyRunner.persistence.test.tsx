// SurveyRunner — answer persistence and per-Next recording (spec 079 T026,
// T031, T083 SurveyRunner half).
//
// Three things this covers, distinct from SurveyRunner.walk.test.tsx (which
// covers the walk-stack mechanics, not the recorder or the answer store):
//
//   1. An answer given but not yet submitted survives an unmount (tab switch),
//      and the current question is restored too — without calling the recorder,
//      since nothing was confirmed with a Next.
//   2. Each forward Next (short of the step's own final Next) calls
//      `recordQuestionAnswers` exactly once with that question's answer.
//      Re-visiting a question and confirming the SAME value calls it again with
//      an identical answer (the store/recorder's own dedupe is out of this
//      component's scope — see questionRecorder.ts's header). A CHANGED answer
//      calls it with the new value.
//   3. `setPosition` written before mount (what `jumpToLocation` does for a
//      never-finished step) lands the runner on that question with its SAVED
//      answer, not a fresh proposal/seed.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import React from "react";

import { SurveyRunner } from "./SurveyRunner.tsx";
import type { FlowDef } from "./types.ts";
import type { SurveyAnswer } from "@keyboard-studio/contracts";
import {
  useSurveyAnswerStore,
  applySurveyAnswerSnapshot,
  getSurveyAnswerSnapshot,
  type SurveyAnswerSnapshot,
} from "../stores/surveyAnswerStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { QuestionRecorderContext, type ScreenRecorder } from "../lib/questionRecorder.ts";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useSurveySessionStore.setState({ activeStepId: "identity" });
});

// Three linear questions — q2/q3 optional, mirroring the walk-test fixture.
const FLOW: FlowDef = {
  flow_id: "persistence-test",
  phase: "A",
  questions: [
    { id: "q1", type: "short_text", prompt: "First question", required: true, next: "q2" },
    { id: "q2", type: "short_text", prompt: "Second question", required: false, next: "q3" },
    { id: "q3", type: "short_text", prompt: "Third question", required: false, next: null },
  ],
};

function field(): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByRole("textbox") as HTMLInputElement | HTMLTextAreaElement;
}

function type(value: string): void {
  fireEvent.change(field(), { target: { value } });
}

function next(): void {
  fireEvent.click(screen.getByTestId("survey-advance"));
}

function back(): void {
  fireEvent.click(screen.getByTestId("survey-back"));
}

/** Renders SurveyRunner wrapped in a recorder spy, returning the spy. */
function renderWithRecorder(): ScreenRecorder & ReturnType<typeof vi.fn> {
  const recorder = vi.fn() as unknown as ScreenRecorder & ReturnType<typeof vi.fn>;
  render(
    <QuestionRecorderContext.Provider value={recorder}>
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} />
    </QuestionRecorderContext.Provider>,
  );
  return recorder;
}

// ---------------------------------------------------------------------------
// 1. An in-progress (never-finished) answer survives an unmount, and does not
//    record anything — only a Next records.
// ---------------------------------------------------------------------------

describe("SurveyRunner — answers persist without a Next", () => {
  it("restores a typed-but-not-submitted value and the current question after unmount/remount", () => {
    const recorder = renderWithRecorder();
    type("alpha");
    next();
    // On q2 now — type something but never press Next.
    type("half-typed");

    // Only q1's Next has fired so far; q2 (the in-progress answer) was never
    // recorded.
    expect(recorder).toHaveBeenCalledTimes(1);
    expect(recorder.mock.calls[0]?.[0]).toBe("q1");

    cleanup();
    renderWithRecorder();

    expect(screen.getByText("Second question")).toBeTruthy();
    expect(field().value).toBe("half-typed");
  });

  it("the saved answer round-trips through the store directly, not just via DOM", () => {
    renderWithRecorder();
    type("alpha");
    next();
    type("half-typed");

    const saved = useSurveyAnswerStore.getState().steps["identity"]?.answers["q2"];
    expect(saved?.value).toBe("half-typed");
    expect(saved?.stage).toBe("draft");
  });
});

// ---------------------------------------------------------------------------
// 2. Recording on Next
// ---------------------------------------------------------------------------

describe("SurveyRunner — records each forward Next", () => {
  it("calls the recorder once per non-final Next, with that question's answer", () => {
    const recorder = renderWithRecorder();
    type("alpha");
    next();

    expect(recorder).toHaveBeenCalledTimes(1);
    const [screenId, answers] = recorder.mock.calls[0] as [string, readonly SurveyAnswer[]];
    expect(screenId).toBe("q1");
    expect(answers).toEqual([{ questionId: "q1", answerType: "text", value: "alpha" }]);
  });

  it("does not record the step's own final Next — that is step completion's job", () => {
    const recorder = renderWithRecorder();
    type("alpha");
    next();
    expect(recorder).toHaveBeenCalledTimes(1);
    type("beta");
    next();
    expect(recorder).toHaveBeenCalledTimes(2);
    // q3 is optional and has no further `next` — this Next ends the flow.
    next();
    // Still 2: the final Next is not recorded here.
    expect(recorder).toHaveBeenCalledTimes(2);
  });

  it("re-confirming the SAME value after Back calls the recorder again with an identical answer", () => {
    const recorder = renderWithRecorder();
    type("alpha");
    next();
    type("beta");
    next();
    expect(recorder).toHaveBeenCalledTimes(2);

    back();
    // Same value re-confirmed.
    next();

    expect(recorder).toHaveBeenCalledTimes(3);
    const [screenId, answers] = recorder.mock.calls[2] as [string, readonly SurveyAnswer[]];
    expect(screenId).toBe("q2");
    expect(answers).toEqual([{ questionId: "q2", answerType: "text", value: "beta" }]);
    // Identical to the original q2 recording — the store/recorder layer, not
    // this component, is responsible for deduping an unchanged value.
    expect(answers).toEqual(recorder.mock.calls[1]?.[1]);
  });

  it("a CHANGED answer records the new value", () => {
    const recorder = renderWithRecorder();
    type("alpha");
    next();
    type("beta");
    next();
    expect(recorder).toHaveBeenCalledTimes(2);

    back();
    type("beta-changed");
    next();

    expect(recorder).toHaveBeenCalledTimes(3);
    const [screenId, answers] = recorder.mock.calls[2] as [string, readonly SurveyAnswer[]];
    expect(screenId).toBe("q2");
    expect(answers).toEqual([{ questionId: "q2", answerType: "text", value: "beta-changed" }]);
  });
});

// ---------------------------------------------------------------------------
// 3. T083 — a jump-parked position lands on the saved answer, not a proposal.
// ---------------------------------------------------------------------------

describe("SurveyRunner — a pre-mount position lands on the saved answer (T083)", () => {
  it("mounts on the parked question with its saved answer restored, not a seed", () => {
    renderWithRecorder();
    type("alpha");
    next();
    type("beta");
    next();
    cleanup();

    // What jumpToLocation does for a never-finished step: write the position
    // before the remount reads it.
    useSurveyAnswerStore.getState().setPosition("identity", "q2");
    const getSeedValue = vi.fn(() => "should-not-be-used");
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedValue={getSeedValue} />);

    expect(screen.getByText("Second question")).toBeTruthy();
    expect(field().value).toBe("beta");
  });

  it("switching tabs away and back keeps a typed-but-not-submitted value and does not record it", () => {
    const recorder = renderWithRecorder();
    type("alpha");
    next();
    type("still-typing");
    expect(recorder).toHaveBeenCalledTimes(1);

    // Tab switch: unmount without a Next, then remount.
    cleanup();
    const recorder2 = renderWithRecorder();

    expect(field().value).toBe("still-typing");
    expect(recorder2).not.toHaveBeenCalled();
  });

  it("honours a same-step jump while already mounted, restoring that question's saved answer", () => {
    renderWithRecorder();
    type("alpha");
    next();
    type("beta");
    next();
    expect(screen.getByText("Third question")).toBeTruthy();

    act(() => {
      useSurveyAnswerStore.getState().setPosition("identity", "q1");
    });

    expect(screen.getByText("First question")).toBeTruthy();
    expect(field().value).toBe("alpha");
  });
});

// ---------------------------------------------------------------------------
// 4. Spec 079 T070 (US4 scenarios 1-2) — restore, then mount: after a reload
//    the store is rebuilt from the durable draft (applySurveyAnswerSnapshot)
//    before the step ever mounts, and the runner must land on the saved
//    question with the saved answer.
// ---------------------------------------------------------------------------

describe("SurveyRunner — restore-then-mount (spec 079 US4)", () => {
  it("mounts on the saved question with the saved answer after applySurveyAnswerSnapshot", () => {
    useSurveyAnswerStore.getState().reset();
    renderWithRecorder();
    type("alpha");
    next();
    type("half-typed");
    // What the durable draft holds: a JSON round trip of the snapshot.
    const persisted = JSON.parse(JSON.stringify(getSurveyAnswerSnapshot())) as SurveyAnswerSnapshot;
    cleanup();

    // Cold start: empty store, then the restore, then the first mount.
    useSurveyAnswerStore.getState().reset();
    applySurveyAnswerSnapshot(persisted);
    renderWithRecorder();

    expect(screen.getByText("Second question")).toBeTruthy();
    expect(field().value).toBe("half-typed");
    expect(useSurveyAnswerStore.getState().steps["identity"]?.answers["q1"]?.value).toBe("alpha");
  });
});
