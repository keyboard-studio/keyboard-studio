// Unit tests for SequencesPlaceholder — the stub step for the upcoming
// Sequence Gallery (S-03 multi-key sequences), inserted between mechanisms
// and the touch fork on the manifest spine.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SequencesPlaceholder } from "./SequencesPlaceholder.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

afterEach(cleanup);
beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("SequencesPlaceholder", () => {
  it("renders the 'Sequence Gallery' heading and a not-yet-implemented notice", () => {
    render(<SequencesPlaceholder />);
    expect(screen.getByRole("heading", { level: 1, name: /Sequence Gallery/ })).toBeTruthy();
    expect(screen.getByText(/not yet implemented/i)).toBeTruthy();
  });

  it("shows the empty-state line when no characters are flagged", () => {
    render(<SequencesPlaceholder />);
    expect(screen.getByText(/No characters flagged yet\./i)).toBeTruthy();
  });

  it("renders the flagged characters as a to-do list when seeded from the store", () => {
    useWorkingCopyStore.getState().flagCharForSequence("á");
    useWorkingCopyStore.getState().flagCharForSequence("é");
    render(<SequencesPlaceholder />);
    expect(
      screen.getByText(/Characters you flagged for sequences \(2\):/i),
    ).toBeTruthy();
    expect(screen.getByText("á")).toBeTruthy();
    expect(screen.getByText("é")).toBeTruthy();
    expect(screen.queryByText(/No characters flagged yet\./i)).toBeNull();
  });

  it("fires onComplete when 'Continue' is clicked", () => {
    const onComplete = vi.fn();
    render(<SequencesPlaceholder onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("fires onBack when 'Back' is clicked", () => {
    const onBack = vi.fn();
    render(<SequencesPlaceholder onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits the Back button when onBack is not provided", () => {
    render(<SequencesPlaceholder onComplete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
  });

  it("omits the Continue button when onComplete is not provided", () => {
    render(<SequencesPlaceholder onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
  });
});
