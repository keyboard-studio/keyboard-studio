// SurveyRunner advanceOnSelect / onSelectAdvance mechanism (PR #1050).
//
// When advanceOnSelect is set, picking a concrete option from a styled combobox
// field auto-advances to the next question with no Next click. Free-text typing
// never advances, and when advanceOnSelect is absent a selection just sets the
// value (the caller still clicks Next). These tests pin that contract at the
// SurveyRunner level, independent of the identity flow.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { SurveyRunner } from "./SurveyRunner.tsx";
import type { FlowDef } from "./types.ts";

const FLOW: FlowDef = {
  flow_id: "test-advance-on-select",
  phase: "A",
  questions: [
    {
      id: "q-pick",
      type: "autocomplete",
      prompt: "Pick one",
      required: false,
      options: [
        { value: "alpha", label: "Alpha" },
        { value: "beta", label: "Beta" },
      ],
      next: "q-second",
    },
    { id: "q-second", type: "text", prompt: "Second question", required: false, next: null },
  ],
};

afterEach(cleanup);

function pickOption(label: string): void {
  fireEvent.focus(screen.getByRole("combobox"));
  fireEvent.mouseDown(screen.getByRole("option", { name: label }));
}

describe("SurveyRunner advanceOnSelect (PR #1050)", () => {
  it("auto-advances to the next question when a dropdown option is picked", async () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} advanceOnSelect />);
    expect(screen.getByText("Pick one")).toBeTruthy();

    pickOption("Alpha");

    await waitFor(() => {
      expect(screen.getByText("Second question")).toBeTruthy();
    });
  });

  it("does NOT auto-advance on selection when advanceOnSelect is absent", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    pickOption("Alpha");

    // Still on the first question; the value was captured but no advance fired.
    expect(screen.getByText("Pick one")).toBeTruthy();
    expect(screen.queryByText("Second question")).toBeNull();
    expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("alpha");
  });

  it("free-text typing does not auto-advance even with advanceOnSelect", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} advanceOnSelect />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "gamma" } });

    expect(screen.getByText("Pick one")).toBeTruthy();
    expect(screen.queryByText("Second question")).toBeNull();
  });
});
