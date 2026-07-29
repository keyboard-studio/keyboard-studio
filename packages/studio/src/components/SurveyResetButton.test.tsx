// Tests for SurveyResetButton — the floating corner Reset control on the
// survey route. Verifies the two-step arm/confirm flow: Reset arms an inline
// "Are you sure?" + Yes (no browser dialog), Yes fires onReset exactly once,
// and Escape / outside pointer-down disarm without firing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SurveyResetButton } from "./SurveyResetButton.tsx";

afterEach(cleanup);

describe("SurveyResetButton", () => {
  it("does not fire onReset on the first click — it arms the confirmation", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    expect(screen.getByTestId("survey-reset-yes")).toBeTruthy();
  });

  it("fires onReset once on Yes and returns to the idle button", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.click(screen.getByTestId("survey-reset-yes"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Are you sure?")).toBeNull();
    expect(screen.getByTestId("survey-reset-arm")).toBeTruthy();
  });

  it("Escape disarms without firing onReset", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByText("Are you sure?")).toBeNull();
  });

  it("pointer-down outside the control disarms without firing onReset", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.pointerDown(document.body);
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByText("Are you sure?")).toBeNull();
  });

  it("pointer-down inside the control keeps the confirmation armed", () => {
    const onReset = vi.fn();
    render(<SurveyResetButton onReset={onReset} />);

    fireEvent.click(screen.getByTestId("survey-reset-arm"));
    fireEvent.pointerDown(screen.getByTestId("survey-reset"));
    expect(screen.getByTestId("survey-reset-yes")).toBeTruthy();
  });
});
