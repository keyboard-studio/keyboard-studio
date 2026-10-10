// LayoutStep — the community-layout spine step (spec 076 A4): the proposal is
// preselected, the picker searches every layout, picks persist immediately.
// Since spec 090 T011 the step is the windows-layout gallery module hosted
// by LayoutStepHost: picks persist as the `windows-layout` decision.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { LayoutStepHost } from "./LayoutStepHost.tsx";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { getPickedWindowsLayout } from "../../lib/layoutFamily.ts";

function mount(bcp47: string | undefined) {
  // Spec 089: the step reads the tag from the decision-derived context —
  // record the identity decisions the tag's subtags represent.
  if (bcp47 !== undefined) {
    const parts = bcp47.split("-");
    const record = useDecisionStore.getState().record;
    record({ id: "language-code", value: parts[0]!, provenance: "asked" });
    record({ id: "target-script", value: "Latn", provenance: "asked" });
    const region = parts.slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
    if (region !== undefined) {
      record({ id: "language-region", value: region, provenance: "asked" });
    }
  }
  const onComplete = vi.fn();
  const onBack = vi.fn();
  render(<LayoutStepHost onComplete={onComplete} onBack={onBack} />, { withStepNav: true });
  return { onComplete, onBack };
}

const inputEl = () => screen.getByTestId("layout-picker-input") as HTMLInputElement;

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
  useDecisionStore.getState().reset();
});
afterEach(cleanup);

describe("LayoutStep", () => {
  it("preselects the proposal from the language tag and explains why", () => {
    mount("de-DE");
    expect(inputEl().value).toBe("German");
    // The explanation quotes the tag the step actually read — the composed
    // tag for these decisions is "de-Latn-DE" (spec 089: derived, with the
    // author's chosen script explicit, exactly as the identity step composes
    // it; the pre-089 test seeded the raw string "de-DE" into the context).
    expect(screen.getByTestId("layout-step-why").textContent).toContain("de-Latn-DE");
    // Preselecting does not silently save: nothing persists until a pick/confirm.
    expect(getPickedWindowsLayout()).toBeUndefined();
  });

  it("never shows a blank selection: no tag falls back to the US layout", () => {
    mount(undefined);
    expect(inputEl().value).not.toBe("");
    expect(inputEl().value).toContain("US");
  });

  it("confirming the suggestion saves it and completes", () => {
    const { onComplete } = mount("fr-FR");
    fireEvent.click(screen.getByTestId("layout-continue"));
    expect(getPickedWindowsLayout()?.id).toBe("basic_kbdfr");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("searching filters the whole catalog; choosing an option saves immediately", () => {
    mount("en-US");
    fireEvent.change(inputEl(), { target: { value: "greek" } });
    fireEvent.click(screen.getByTestId("layout-option-basic_kbdhe"));
    expect(getPickedWindowsLayout()?.id).toBe("basic_kbdhe");
    expect(inputEl().value).toContain("Greek");
  });

  it("keyboard: typing opens the popup with an active option and Enter picks it", () => {
    mount("en-US");
    fireEvent.change(inputEl(), { target: { value: "german" } });
    expect(inputEl().getAttribute("aria-expanded")).toBe("true");
    expect(inputEl().getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(inputEl(), { key: "Enter" });
    expect(getPickedWindowsLayout()).toBeDefined();
    expect(inputEl().getAttribute("aria-expanded")).toBe("false");
  });

  it("shows an empty state for a query that matches nothing", () => {
    mount("en-US");
    fireEvent.change(inputEl(), { target: { value: "zzzzqqq" } });
    expect(screen.getByTestId("layout-picker-empty")).toBeTruthy();
  });

  it("Back is published to the footer", () => {
    const { onBack } = mount("en-US");
    fireEvent.click(screen.getByTestId("layout-back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("a stored pick is shown on re-entry instead of the proposal", () => {
    mount("de-DE");
    fireEvent.change(inputEl(), { target: { value: "greek" } });
    fireEvent.click(screen.getByTestId("layout-option-basic_kbdhe"));
    cleanup();
    mount("de-DE");
    expect(inputEl().value).toContain("Greek");
  });
});
