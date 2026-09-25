// MarksSeriesStep × context tolerance (spec 078 T040/T044/T048): the station
// joins the series behind the flag, emits the decision and its answers, carries
// a still-valid prior decision forward without re-proposing it (FR-009), and
// re-proposes when the rules' fingerprint changed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { MarksContextToleranceDecision, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore, type ContextToleranceState } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { MarksSeriesStep } from "./MarksSeriesStep.tsx";

vi.mock("../../flags/contextToleranceFlag.ts", () => ({ isContextToleranceEnabled: () => true }));

const ACUTE = "́";
const FINGERPRINT = "0123456789abcdef";

function seedAlphabet(): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: { bases: ["e"], marks: [ACUTE], attestedStacks: [{ base: "e", marks: [ACUTE] }], declaredRoles: {} },
  });
}

function ready(fingerprint = FINGERPRINT): ContextToleranceState {
  return {
    status: "ready",
    runId: 1,
    report: {
      findings: [
        {
          ruleId: "r10",
          location: { file: "k.kmn", line: 10 },
          status: "not-analysed",
          failingKeystrokes: [{ vkey: "K_RBRKT", modifiers: [] }],
        },
      ],
      notAnalysedCount: 0,
    },
    findings: [],
    classification: { r10: "gap" },
    proposal: {
      ir: makeTestIR([]),
      variants: [{ sourceRuleId: "r10", kind: "added-rule", generatedMarker: "m_r10_0" }],
      disclosures: {},
    },
    analysedIr: makeTestIR([]),
    fixableRuleIds: ["r10"],
    siteKeys: { r10: "site-r10" },
    fingerprint,
  };
}

function priorDecision(fingerprint: string, extra: Partial<MarksContextToleranceDecision> = {}): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "C",
    answers: [],
    marksContextTolerance: {
      decision: "decline",
      acceptedSiteIds: [],
      proposedSiteIds: ["site-r10"],
      fingerprint,
      ...extra,
    },
  });
}

/** Click Continue until the station (or the end of the series) is reached. */
function walkToStation(): void {
  for (let i = 0; i < 6; i++) {
    if (screen.queryByTestId("context-tolerance-station") || screen.queryByTestId("context-tolerance-checking")) return;
    const next = screen.queryByTestId("marks-continue");
    if (next === null) return;
    fireEvent.click(next);
  }
}

function renderSeries() {
  const onComplete = vi.fn();
  act(() => {
    render(<MarksSeriesStep onComplete={onComplete} />);
  });
  return onComplete;
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  seedAlphabet();
});

afterEach(() => {
  cleanup();
});

describe("MarksSeriesStep — context-tolerance station (spec 078)", () => {
  it("confirming the pre-filled proposal completes the series with an accept decision and its answer", () => {
    useWorkingCopyStore.getState().setContextTolerance(ready());
    const onComplete = renderSeries();
    walkToStation();
    fireEvent.click(screen.getByRole("button", { name: "Add these rules" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]![0] as SurveyPhaseResult;
    expect(result.marksContextTolerance).toEqual({
      decision: "accept",
      acceptedSiteIds: ["site-r10"],
      proposedSiteIds: ["site-r10"],
      fingerprint: FINGERPRINT,
    });
    expect(result.answers).toEqual([{ questionId: "marks.context_tolerance", answerType: "select", value: "accept" }]);
  });

  it("while the analysis runs it shows 'checking' and lets the author continue with no decision", () => {
    useWorkingCopyStore.getState().setContextTolerance({ status: "analysing", runId: 4 });
    const onComplete = renderSeries();
    walkToStation();
    expect(screen.getByTestId("context-tolerance-checking")).toBeTruthy();
    fireEvent.click(screen.getByTestId("marks-continue"));

    const result = onComplete.mock.calls[0]![0] as SurveyPhaseResult;
    expect(result.marksContextTolerance).toBeUndefined();
    expect(result.answers).toEqual([]);
  });

  it("a prior decision with the same fingerprint is shown read-only and carried forward unchanged (FR-009)", () => {
    priorDecision(FINGERPRINT, { appliedFingerprint: undefined });
    useWorkingCopyStore.getState().setContextTolerance(ready());
    const onComplete = renderSeries();
    walkToStation();

    expect(screen.getByTestId("context-tolerance-station").getAttribute("data-prior")).toBe("decline");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("marks-continue"));

    const result = onComplete.mock.calls[0]![0] as SurveyPhaseResult;
    expect(result.marksContextTolerance).toMatchObject({ decision: "decline", fingerprint: FINGERPRINT });
  });

  it("a changed fingerprint re-raises the proposal, pre-filled", () => {
    priorDecision("ffffffffffffffff");
    useWorkingCopyStore.getState().setContextTolerance(ready());
    renderSeries();
    walkToStation();

    expect(screen.getByTestId("context-tolerance-station").getAttribute("data-prior")).toBeNull();
    const ticks = screen.getAllByRole("checkbox");
    expect(ticks).toHaveLength(1);
    expect((ticks[0] as HTMLInputElement).checked).toBe(true);
  });

  it("no fixable rules: no station", () => {
    useWorkingCopyStore.getState().setContextTolerance({ ...ready(), fixableRuleIds: [] } as ContextToleranceState);
    renderSeries();
    walkToStation();
    expect(screen.queryByTestId("context-tolerance-station")).toBeNull();
    expect(screen.queryByTestId("context-tolerance-checking")).toBeNull();
  });
});
