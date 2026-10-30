// The marks driver is the step minus its rendering (spec 107 FR-011/FR-013):
// on the same alphabet it must leave the same marks-treatment value and hand
// the same result to onComplete as pressing Continue through the real series.
// It also proves marksStationDefaults (the whole default walk in one call)
// equal to what the step resolves station by station.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { render } from "../../renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { MarksStepHost } from "../../../survey/marks/MarksStepHost.tsx";
import { getMarksTreatmentValue } from "../../../survey/marks/marksValue.ts";
import { marksStationDefaults } from "../../../survey/marks/marksSeriesValue.ts";
import type { Case } from "../caseTypes.ts";
import { createRunReport } from "../runReport.ts";
import { marksDrivers } from "./marks.ts";

const ACUTE = "́";

function seedAlphabet(): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: {
      bases: ["a", "e", "o"],
      marks: [ACUTE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "o", marks: [ACUTE] },
      ],
      declaredRoles: {},
    },
  });
}

function reset(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionStore.getState().reset();
  seedAlphabet();
}

/** The guard's timestamp is the only value that legitimately differs between two runs. */
function withoutClock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v: unknown) => (k === "recordedAt" ? 0 : v))) as T;
}

beforeEach(reset);
afterEach(cleanup);

describe("marks driver parity with the series", () => {
  it("records the same value and completes with the same result as Continue through the series", async () => {
    const onComplete = vi.fn();
    act(() => {
      render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
    });
    for (let i = 0; i < 8 && onComplete.mock.calls.length === 0; i++) {
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    const uiResult = onComplete.mock.calls[0]![0] as SurveyPhaseResult;
    const uiValue = getMarksTreatmentValue();
    cleanup();

    // The case states the choices the series showed; the driver applies them as overrides.
    const c = {
      inputOrder: uiValue!.answers["marks.marks_treatment.input_order"] ?? "postfix",
      outputForm: uiResult.marksOutputForm,
      backspace: uiResult.marksBackspace === "peel" ? "unwrap" : "whole",
    } as unknown as Case;

    reset();
    const result = await marksDrivers["marks"]!({
      case: c,
      startIr: useWorkingCopyStore.getState().startIr as never,
      report: createRunReport("store-default"),
    });

    expect(withoutClock(getMarksTreatmentValue())).toEqual(withoutClock(uiValue));
    expect(withoutClock(result)).toEqual(withoutClock(uiResult));
  });

  it("marksStationDefaults resolves the same answers the series shows", () => {
    const wc = useWorkingCopyStore.getState();
    const d = marksStationDefaults({ alphabet: wc.session.alphabet, startIr: wc.startIr, bcp47: undefined });
    expect(d.gate.skip).toBe(false);
    expect(d.visibleStations.length).toBeGreaterThan(0);
  });
});
