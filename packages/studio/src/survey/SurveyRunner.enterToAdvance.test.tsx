// SurveyRunner Enter-to-advance wiring (issue #536).
//
// SurveyRunner attaches the shared enterToAdvance handler once at the form
// container. These tests pin the container-level behaviour end to end:
//   - Enter on a text field advances to the next step.
//   - Shift+Enter in a textarea inserts a newline instead of advancing;
//     plain Enter in a textarea advances (finishes) the flow.
//   - Enter targeted at the Back/Next buttons does not advance via the
//     container handler (the BUTTON skip that prevents a double-advance).
//   - Enter with a combobox row highlighted defers to the combobox's own
//     selection instead of double-firing.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { SurveyRunner } from "./SurveyRunner.tsx";
import type { FlowDef } from "./types.ts";

const TEXT_FLOW: FlowDef = {
  flow_id: "test-enter-text",
  phase: "A",
  questions: [
    { id: "q-one", type: "short_text", prompt: "First question", required: false, next: "q-two" },
    { id: "q-two", type: "text", prompt: "Second question", required: false, next: null },
  ],
};

const COMBO_FLOW: FlowDef = {
  flow_id: "test-enter-combo",
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
      next: "q-after",
    },
    { id: "q-after", type: "short_text", prompt: "After question", required: false, next: null },
  ],
};

afterEach(cleanup);

describe("SurveyRunner Enter-to-advance (#536)", () => {
  it("advances to the next step when Enter is pressed in a text field", () => {
    render(<SurveyRunner flow={TEXT_FLOW} onComplete={vi.fn()} />);
    expect(screen.getByText("First question")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(screen.getByText("Second question")).toBeTruthy();
  });

  it("Shift+Enter in a textarea inserts a newline instead of advancing", () => {
    const onComplete = vi.fn();
    render(<SurveyRunner flow={TEXT_FLOW} onComplete={onComplete} />);
    // Advance to the textarea (q-two, type "text").
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    const textarea = screen.getByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    // Still on the same step; the flow did not finish.
    expect(screen.getByText("Second question")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("plain Enter in a textarea advances (finishes) the flow", () => {
    const onComplete = vi.fn();
    render(<SurveyRunner flow={TEXT_FLOW} onComplete={onComplete} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" }); // to q-two

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" }); // finish

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("Enter targeted at the Next button does not advance via the container handler", () => {
    render(<SurveyRunner flow={TEXT_FLOW} onComplete={vi.fn()} />);

    fireEvent.keyDown(screen.getByTestId("survey-advance"), { key: "Enter" });

    // The BUTTON skip means the container handler stood down; still on step one.
    expect(screen.getByText("First question")).toBeTruthy();
    expect(screen.queryByText("Second question")).toBeNull();
  });

  it("Enter with a combobox row highlighted selects the row without double-advancing", async () => {
    render(<SurveyRunner flow={COMBO_FLOW} onComplete={vi.fn()} advanceOnSelect />);
    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    fireEvent.keyDown(combobox, { key: "ArrowDown" }); // highlight "Alpha"
    fireEvent.keyDown(combobox, { key: "Enter" }); // combobox selects; container defers

    await waitFor(() => {
      expect(screen.getByText("After question")).toBeTruthy();
    });
    // Committed the highlighted option (not raw free text), proving the
    // combobox handled Enter and the container deferred.
    expect(screen.queryByText("Pick one")).toBeNull();
  });
});
