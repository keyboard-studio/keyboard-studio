// Tests for SurveyResetButton — the Reset control in the NavBar's top-right
// corner. Verifies the two-step arm/confirm flow: Reset arms a "Start over?"
// + Yes popover (no browser dialog), Yes fires onReset exactly once, and a
// second trigger click / Escape / outside pointer-down disarm without firing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { SurveyResetButton } from "./SurveyResetButton.tsx";

afterEach(cleanup);

const CONFIRM = /^Start over\?/;

describe("SurveyResetButton", () => {
  it("does not fire onReset on the first click — it arms the confirmation", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByText(CONFIRM)).toBeTruthy();
    // spec 094: the prompt names everything start-over deletes.
    expect(screen.getByRole("alert").textContent).toMatch(/draft.*test builds.*tester reports.*cloud/s);
    expect(screen.getByTestId("survey-reset-yes")).toBeTruthy();
  });

  it("fires onReset once on Yes and returns to the idle button", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.click(screen.getByTestId("survey-reset-yes"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(screen.getByTestId("survey-reset-arm")).toBeTruthy();
  });

  it("a second click on the trigger disarms without firing onReset", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    const trigger = screen.getByTestId("survey-reset-arm");
    // aria-haspopup pairs with aria-expanded on a popover trigger and is present
    // regardless of armed state (matches AccountControl/SelectMenu/SearchFiltersPopover).
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(trigger);
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape disarms without firing onReset", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFIRM)).toBeNull();
  });

  it("pointer-down outside the control disarms without firing onReset", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.pointerDown(document.body);
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFIRM)).toBeNull();
  });

  it("pointer-down inside the control keeps the confirmation armed", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.pointerDown(screen.getByTestId("survey-reset"));
    expect(screen.getByTestId("survey-reset-yes")).toBeTruthy();
  });
});
