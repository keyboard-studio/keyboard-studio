import { describe, it, expect } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { buildFlowStepDeps, flowStepCompletion } from "./flowStepDeps.ts";

describe("buildFlowStepDeps", () => {
  it("derives the survey context and selected track from the decision set", () => {
    const displayNameRef = { current: "" };
    const deps = buildFlowStepDeps({
      localStart: null,
      decisions: {},
      findingsByQuestionId: {},
      displayNameRef,
      historyEntryState: null,
      authorProfile: { name: null, email: null },
    });
    expect(deps.selectedTrack).toBeNull();
    expect(deps.surveyContext).toEqual(expect.any(Object));
    expect(deps.displayNameRef).toBe(displayNameRef);
    expect(deps.localStart).toBeNull();
  });
});

describe("flowStepCompletion", () => {
  const result: SurveyPhaseResult = { phase: "A", answers: [] };

  it("returns the untouched result when extract yields a payload", () => {
    expect(flowStepCompletion({ extract: () => ({ ok: true }) }, result)).toBe(result);
  });

  it("stays on the step (undefined) when extract yields nothing", () => {
    expect(flowStepCompletion({ extract: () => undefined }, result)).toBeUndefined();
  });
});
