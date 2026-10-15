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
    base: useWorkingCopyStore.getState().startKeyboard?.id ?? null,
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
    const value: WindowsLayoutValue = { layoutIds: ["basic_kbdfr"], origin: "confirmed" };
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
  function renderRenderer(value: WindowsLayoutValue, onChange: (v: WindowsLayoutValue) => void) {
    // Spec 089: the renderer derives its survey context (bcp47) from the
    // decision store (LayoutStep.tsx) — seed the identity decisions the
    // en-US tag's subtags represent (the session store's setSurveyContext
    // is gone; LayoutStep.test.tsx uses the same seeding).
    const record = useDecisionStore.getState().record;
    record({ id: "language-code", value: "en", provenance: "asked" });
    record({ id: "target-script", value: "Latn", provenance: "asked" });
    record({ id: "language-region", value: "US", provenance: "asked" });
    render(
      <WindowsLayoutRenderer value={value} provenance="asked" onChange={onChange} />,
    );
  }

  it("shows the recorded value's layout; picking a different one moves it to the front, origin overturned", () => {
    const onChange = vi.fn();
    renderRenderer({ layoutIds: ["basic_kbdfr"], origin: "confirmed" }, onChange);
    const input = screen.getByTestId("layout-picker-input") as HTMLInputElement;
    expect(input.value).toContain("French");

    fireEvent.change(input, { target: { value: "greek" } });
    fireEvent.click(screen.getByTestId("layout-option-basic_kbdhe"));
    expect(onChange).toHaveBeenCalledWith({
      layoutIds: ["basic_kbdhe", "basic_kbdfr"],
      origin: "overturned",
    });
    // The renderer itself records nothing — the host owns the record.
    expect(useDecisionStore.getState().decisions["windows-layout"]).toBeUndefined();
  });

  it("picking the already-primary layout reports nothing", () => {
    const onChange = vi.fn();
    renderRenderer({ layoutIds: ["basic_kbdfr"], origin: "confirmed" }, onChange);
    const input = screen.getByTestId("layout-picker-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "french" } });
    fireEvent.click(screen.getByTestId("layout-option-basic_kbdfr"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removing a chip drops that layout; the last chip's remove stays disabled", () => {
    const onChange = vi.fn();
    renderRenderer({ layoutIds: ["basic_kbdfr", "basic_kbdhe"], origin: "overturned" }, onChange);
    expect(screen.getByTestId("layout-chip-basic_kbdfr")).toBeTruthy();
    expect(screen.getByTestId("layout-chip-basic_kbdhe")).toBeTruthy();

    const removeHe = screen.getByTestId("layout-remove-basic_kbdhe") as HTMLButtonElement;
    expect(removeHe.disabled).toBe(false);
    fireEvent.click(removeHe);
    expect(onChange).toHaveBeenCalledWith({
      layoutIds: ["basic_kbdfr"],
      origin: "overturned",
    });
  });

  it("the last remaining layout cannot be removed", () => {
    const onChange = vi.fn();
    renderRenderer({ layoutIds: ["basic_kbdfr"], origin: "confirmed" }, onChange);
    const remove = screen.getByTestId("layout-remove-basic_kbdfr") as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    // A disabled button fires no click.
    fireEvent.click(remove);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("remove buttons are labelled with the layout name", () => {
    const onChange = vi.fn();
    renderRenderer({ layoutIds: ["basic_kbdfr", "basic_kbdhe"], origin: "overturned" }, onChange);
    expect(screen.getByTestId("layout-remove-basic_kbdhe").getAttribute("aria-label")).toContain(
      "Greek",
    );
  });

  it("loads the pre-#1902 single-id shape", () => {
    const onChange = vi.fn();
    renderRenderer(
      { layoutId: "basic_kbdfr", origin: "confirmed" } as unknown as WindowsLayoutValue,
      onChange,
    );
    const input = screen.getByTestId("layout-picker-input") as HTMLInputElement;
    expect(input.value).toContain("French");
    expect(screen.getByTestId("layout-chip-basic_kbdfr")).toBeTruthy();
  });
});
