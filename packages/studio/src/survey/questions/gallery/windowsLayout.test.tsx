// windowsLayout module tests (spec 090 T015): the module contract, the
// apply's determinism under the frozen-stores harness, and the renderer's
// DecisionRendererProps behaviour (value in, onChange out — no store
// writes; the step-level suite in survey/layout/LayoutStep.test.tsx covers
// the hosted flow end to end).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import { render } from "../../../test/renderWithI18n.tsx";
import windowsLayout, { type WindowsLayoutValue } from "./windowsLayout.ts";
import { WindowsLayoutRenderer } from "../../layout/LayoutStep.tsx";
import { runApplyDeterministically } from "../../../decisions/applyDeterminism.ts";
import type { ApplyContext } from "../../types.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../../stores/surveyAnswerStore.ts";

function makeContext(): ApplyContext {
  return {
    ir: makeTestIR(),
    writes: [irPath("header", "name")],
    decisions: {
      "language-code": { id: "language-code", value: "fra", provenance: "asked" },
    },
    currentHistoryEntryState: null,
  };
}

function fingerprintStores(): string {
  return JSON.stringify({
    decisions: useDecisionStore.getState().decisions,
    base: useWorkingCopyStore.getState().baseKeyboard?.id ?? null,
  });
}

beforeEach(() => {
  useDecisionStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
});
afterEach(cleanup);

describe("windowsLayout module contract", () => {
  it("provides windows-layout, requires language-code, writes nothing", () => {
    expect(windowsLayout.provides).toEqual(["windows-layout"]);
    expect(windowsLayout.requires).toEqual(["language-code"]);
    expect(windowsLayout.writes).toEqual([]);
    expect(windowsLayout.renderer).toBe(WindowsLayoutRenderer);
  });

  it("apply is a deterministic no-op under the frozen-stores harness", () => {
    const value: WindowsLayoutValue = { layoutId: "basic_kbdfr", origin: "confirmed" };
    const patch = runApplyDeterministically({
      apply: windowsLayout.apply,
      value,
      makeContext,
      fingerprintStores,
      runs: 3,
    });
    expect(patch).toEqual({});
    // And with no value recorded yet.
    expect(
      runApplyDeterministically({
        apply: windowsLayout.apply,
        value: undefined,
        makeContext,
        fingerprintStores,
      }),
    ).toEqual({});
  });
});

describe("WindowsLayoutRenderer (module renderer)", () => {
  it("shows the recorded value's layout; picking a different one reports origin overturned", () => {
    useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: "en-US" });
    const onChange = vi.fn();
    render(
      <WindowsLayoutRenderer
        value={{ layoutId: "basic_kbdfr", origin: "confirmed" }}
        provenance="asked"
        onChange={onChange}
      />,
    );
    const input = screen.getByTestId("layout-picker-input") as HTMLInputElement;
    expect(input.value).toContain("French");

    fireEvent.change(input, { target: { value: "greek" } });
    fireEvent.click(screen.getByTestId("layout-option-basic_kbdhe"));
    expect(onChange).toHaveBeenCalledWith({ layoutId: "basic_kbdhe", origin: "overturned" });
    // The renderer itself records nothing — the host owns the record.
    expect(useDecisionStore.getState().decisions["windows-layout"]).toBeUndefined();
  });
});
