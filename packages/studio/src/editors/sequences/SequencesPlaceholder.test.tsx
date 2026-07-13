// Unit tests for SequencesPlaceholder — the stub step for the upcoming
// Sequence Gallery (S-03 multi-key sequences), inserted between mechanisms
// and the touch fork on the manifest spine.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SequencesPlaceholder } from "./SequencesPlaceholder.tsx";

afterEach(cleanup);

describe("SequencesPlaceholder", () => {
  it("renders the 'Sequence Gallery' heading and a not-yet-implemented notice", () => {
    render(<SequencesPlaceholder />);
    expect(screen.getByRole("heading", { level: 1, name: /Sequence Gallery/ })).toBeTruthy();
    expect(screen.getByText(/not yet implemented/i)).toBeTruthy();
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
