// createDecisionRecorder.test.ts — the recorder's decisionLogStore <->
// surveyAnswerStore wiring (spec 079 T009, R-04).
//
// Deps are wired to the REAL `useSurveyAnswerStore` (not a stub) so this pins
// the actual contract: `onScreenRecorded` calls `markScreenRecorded` +
// `setRecordedScreen`, and `getLastRecordedHash` reads
// `steps[stepId].lastRecorded[screenId]` — exactly what the studio wires in
// production (createStudioDecisionRecorder.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionImpact, SurveyAnswer } from "@keyboard-studio/contracts";
import {
  createDecisionRecorder,
  type DecisionRecorderDeps,
} from "./createDecisionRecorder.ts";
import { resetDecisionEntryIds, useDecisionLogStore } from "./decisionLogStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { createSourceSnapshotter } from "./snapshotSource.ts";
import { DecisionEntryRow } from "./DecisionEntryRow.tsx";
import { createElement } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";

const NONE: DecisionImpact = { state: "none" };

function answer(questionId: string, value: string): SurveyAnswer {
  return { questionId, answerType: "text", value };
}

/** A recorder wired to the real survey-answer store, plus an inert working copy. */
function makeRecorder(overrides: Partial<DecisionRecorderDeps> = {}) {
  const captureAtBoundary = vi.fn(async (): Promise<DecisionImpact | null> => NONE);
  const answerStore = useSurveyAnswerStore.getState();
  const deps: DecisionRecorderDeps = {
    snapshotter: { captureAtBoundary, reset: () => {} },
    getDeletionCounts: () => ({ nodes: 0, items: 0, touchKeys: 0 }),
    getDeletedIds: () => [],
    getMechanismAssignments: () => [],
    getBaseIr: () => null,
    getDeletedNodeIds: () => new Set<string>(),
    getDeletedItemIds: () => new Set<string>(),
    getKeyboardId: () => null,
    getBaseKeyboard: () => null,
    getIrAxes: () => ({}),
    getInstantiationMode: () => null,
    getRemovalCapabilities: () => new Map(),
    onScreenRecorded: (stepId, screenId, entryIds, hash) => {
      answerStore.markScreenRecorded(stepId, screenId, hash);
      for (const entryId of entryIds) answerStore.setRecordedScreen(entryId, screenId);
    },
    getLastRecordedHash: (stepId, screenId) =>
      useSurveyAnswerStore.getState().steps[stepId]?.lastRecorded[screenId],
    resolveCompletionScreen: undefined,
    ...overrides,
  };
  return { record: createDecisionRecorder(deps), captureAtBoundary, deps };
}

function entries() {
  return useDecisionLogStore.getState().read().entries;
}

async function waitForImpacts(count: number) {
  await vi.waitFor(() => {
    const es = entries();
    expect(es).toHaveLength(count);
    expect(es.filter((e) => e.impact !== undefined)).toHaveLength(count);
  });
  return entries();
}

beforeEach(() => {
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
  useSurveyAnswerStore.getState().reset();
});

describe("recordQuestionAnswers", () => {
  it("appends via decisionLogStore and attaches impact via captureAtBoundary", async () => {
    const { record, captureAtBoundary } = makeRecorder();
    record.recordQuestionAnswers("identity", "identity", [answer("il_language_english", "Ewondo")]);

    expect(entries()).toHaveLength(1);
    expect(entries()[0]!.payload).toMatchObject({ questionId: "il_language_english", value: "Ewondo" });

    const withImpact = await waitForImpacts(1);
    expect(withImpact[0]!.impact).toEqual(NONE);
    expect(captureAtBoundary).toHaveBeenCalledTimes(1);
  });

  it("a repeat with identical answers appends nothing and does not call captureAtBoundary again", async () => {
    const { record, captureAtBoundary } = makeRecorder();
    record.recordQuestionAnswers("identity", "identity", [answer("il_language_english", "Ewondo")]);
    await waitForImpacts(1);

    record.recordQuestionAnswers("identity", "identity", [answer("il_language_english", "Ewondo")]);
    // No new entry.
    expect(entries()).toHaveLength(1);
    // No new capture — the FR-040 no-op check short-circuited before appendAnswers.
    expect(captureAtBoundary).toHaveBeenCalledTimes(1);
  });

  it("a changed answer supersedes: one new entry, with an intact supersedes chain", async () => {
    const { record } = makeRecorder();
    record.recordQuestionAnswers("identity", "identity", [answer("il_language_english", "Ewondo")]);
    await waitForImpacts(1);
    const firstId = entries()[0]!.entryId;

    record.recordQuestionAnswers("identity", "identity", [answer("il_language_english", "Bulu")]);
    await waitForImpacts(2);

    const all = entries();
    expect(all).toHaveLength(2);
    const second = all.find((e) => e.entryId !== firstId);
    expect(second).toBeDefined();
    expect(second!.supersedes).toBe(firstId);
    expect(second!.payload).toMatchObject({ value: "Bulu" });
  });

  it("an intermediate boundary whose snapshotter returns {state:'none'} attaches {state:'none'}", async () => {
    const { record } = makeRecorder();
    record.recordQuestionAnswers("identity", "screen-a", [answer("il_language_english", "Ewondo")]);
    const [withImpact] = await waitForImpacts(1);
    expect(withImpact!.impact).toEqual({ state: "none" });
  });

  it("every appended entry id lands in recordedScreenOf with the passed screenId", async () => {
    const { record } = makeRecorder();
    record.recordQuestionAnswers("identity", "screen-a", [
      answer("il_language_english", "Ewondo"),
      answer("il_language_autonym", "Kolo"),
    ]);
    await waitForImpacts(2);

    const recordedScreenOf = useSurveyAnswerStore.getState().recordedScreenOf;
    for (const e of entries()) {
      expect(recordedScreenOf[e.entryId]).toBe("screen-a");
    }
  });
});

describe("step completion", () => {
  it("calling the recorder for step completion with the SAME answers as an earlier Next appends nothing new", async () => {
    const { record } = makeRecorder();
    record.recordQuestionAnswers("identity", "identity", [answer("il_language_english", "Ewondo")]);
    await waitForImpacts(1);

    record({ stepId: "identity", result: { phase: "A", answers: [answer("il_language_english", "Ewondo")] } });
    await vi.waitFor(() => {
      // A completion always re-captures the boundary (advances the baseline),
      // but appends no new decision entry for an identical answer set.
      expect(entries()).toHaveLength(1);
    });
  });

  it("completion with a NEW answer stamps onScreenRecorded with resolveCompletionScreen(stepId)", async () => {
    const onScreenRecorded = vi.fn();
    const { record } = makeRecorder({
      onScreenRecorded: (stepId, screenId, entryIds, hash) => {
        onScreenRecorded(stepId, screenId, entryIds, hash);
      },
      resolveCompletionScreen: (stepId) => `${stepId}-final-screen`,
    });

    record({ stepId: "identity", result: { phase: "A", answers: [answer("il_language_english", "Ewondo")] } });

    await vi.waitFor(() => expect(onScreenRecorded).toHaveBeenCalledTimes(1));
    expect(onScreenRecorded).toHaveBeenCalledWith(
      "identity",
      "identity-final-screen",
      expect.any(Array),
      expect.any(String),
    );
  });

  it("completion falls back to the stepId as the screen when resolveCompletionScreen is not provided", async () => {
    const onScreenRecorded = vi.fn();
    const { record } = makeRecorder({
      onScreenRecorded: (stepId, screenId, entryIds, hash) => {
        onScreenRecorded(stepId, screenId, entryIds, hash);
      },
      resolveCompletionScreen: undefined,
    });

    record({ stepId: "help", result: { phase: "F", answers: [answer("help_tips", "yes")] } });

    await vi.waitFor(() => expect(onScreenRecorded).toHaveBeenCalledTimes(1));
    expect(onScreenRecorded).toHaveBeenCalledWith("help", "help", expect.any(Array), expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// Plan risk 2 (spec 079 T076): recording at an intermediate Next makes every
// Next a capture boundary. Driven through the REAL source snapshotter over a
// fake projection, so the impacts are what the diff actually yields — not a
// stubbed return value.
// ---------------------------------------------------------------------------

describe("multi-screen step capture boundaries (plan risk 2)", () => {
  const BASE_KMN = "store(&NAME) 'test'\nbegin Unicode > use(main)\ngroup(main) using keys\n";
  const GUARDED_KMN = `${BASE_KMN}+ [K_A] > 'a'\n`;

  function marksAnswer(questionId: string, value: string[] | string): SurveyAnswer {
    return Array.isArray(value)
      ? { questionId, answerType: "char-list", value }
      : { questionId, answerType: "select", value };
  }

  it("an intermediate marks station carries {state:'none'}; the final station carries the whole series' diff", async () => {
    let kmn = BASE_KMN;
    const snapshotter = createSourceSnapshotter({
      readProjectedFiles: async () => ({
        entries: [{ path: "source/test.kmn", content: kmn, encoding: "utf-8" } as never],
      }),
    });
    const { record } = makeRecorder({ snapshotter });

    // An earlier step's boundary establishes the baseline (first capture is null).
    record({ stepId: "characters", result: { phase: "B", answers: [answer("alphabet", "a")] } });
    await vi.waitFor(() => expect(entries()).toHaveLength(1));

    // Intermediate station: the IR is untouched until the series completes.
    record.recordQuestionAnswers("marks", "marks_attachment", [
      marksAnswer("marks.marks_attachment.́", ["a"]),
    ]);
    await vi.waitFor(() => {
      const e = entries().find((x) => x.stepId === "marks");
      expect(e?.impact).toEqual({ state: "none" });
    });

    // Final station: completion applies the series' keyboard effect.
    kmn = GUARDED_KMN;
    record({
      stepId: "marks",
      result: {
        phase: "C",
        answers: [
          marksAnswer("marks.marks_attachment.́", ["a"]),
          marksAnswer("marks.marks_output_form.form", "composed"),
        ],
      },
    });
    await vi.waitFor(() => {
      const finalEntry = entries().find(
        (x) => x.payload.kind === "survey-answer" && x.payload.questionId === "marks.marks_output_form.form",
      );
      expect(finalEntry?.impact?.state).toBe("captured");
    });

    const marksEntries = entries().filter((x) => x.stepId === "marks");
    // The intermediate entry was not re-appended by completion (identical value).
    expect(marksEntries).toHaveLength(2);
    const [intermediate, final] = marksEntries;
    expect(intermediate!.impact).toEqual({ state: "none" });
    const captured = final!.impact as Extract<DecisionImpact, { state: "captured" }>;
    expect(captured.magnitude).toEqual({ added: 1, removed: 0 });
  });

  it("the trail renders the intermediate entry as confirmed-with-no-change, not as an applied diff", () => {
    const intermediate = {
      entryId: "m1",
      stepId: "marks",
      payload: {
        kind: "survey-answer" as const,
        questionId: "marks.marks_attachment.́",
        answerType: "char-list" as const,
        value: ["a"],
      },
      provenance: { agency: "hand-set" as const },
      recordedAt: 1,
      supersedes: null,
      impact: { state: "none" as const },
    };
    render(
      createElement(
        "ul",
        null,
        createElement(DecisionEntryRow, {
          entry: intermediate,
          superseded: false,
          resolveImpact: () => intermediate.impact,
        }),
      ),
    );
    fireEvent.click(screen.getByTestId("decision-entry-expand"));
    const region = screen.getByTestId("decision-entry-impact");
    expect(region.textContent).toMatch(/changed nothing/i);
    expect(region.textContent).not.toContain("@@");
  });
});
