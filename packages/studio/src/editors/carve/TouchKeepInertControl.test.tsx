// T020 — TouchKeepInertControl: touch-layout consequence control for carved
// combinations (spec 076 FR-023, amendment A3). The component is a mount-ready
// STUB (the Behaviours phase-5 touch surface does not exist yet); these tests
// pin the contract the real surface will rely on.

import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchKeepInertControl } from "./TouchKeepInertControl.tsx";

afterEach(() => {
  cleanup();
});

const ROWS = [
  { char: "é", keepInert: false },
  { char: "à", keepInert: true },
];

describe("TouchKeepInertControl", () => {
  it("renders nothing when there are no carved characters", () => {
    const { container } = render(<TouchKeepInertControl rows={[]} onChange={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("offers the removal default and the keep-inert override per character", () => {
    render(<TouchKeepInertControl rows={ROWS} onChange={() => {}} />);
    // Each row carries both options with the exact FR-023 copy.
    expect(screen.getAllByRole("button", { name: /removed from the touch layout/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /kept, does nothing/i })).toHaveLength(2);
    // Pressed state reflects the current disposition.
    const removedButtons = screen.getAllByRole("button", { name: /removed from the touch layout/i });
    expect(removedButtons[0].getAttribute("aria-pressed")).toBe("true");
    expect(removedButtons[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("flipping to keep-inert adds the character to the set", () => {
    const onChange = vi.fn();
    render(<TouchKeepInertControl rows={ROWS} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: /kept, does nothing/i })[0]);
    // à was already keep-inert; é joins it.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(new Set(onChange.mock.calls[0][0])).toEqual(new Set(["é", "à"]));
  });

  it("flipping back to removal drops the character from the set", () => {
    const onChange = vi.fn();
    render(<TouchKeepInertControl rows={ROWS} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: /removed from the touch layout/i })[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([]);
  });

  it("never carries the retired allow/block slogan", () => {
    const { container } = render(<TouchKeepInertControl rows={ROWS} onChange={() => {}} />);
    expect(container.textContent ?? "").not.toMatch(/allow means unpredictable/i);
    expect(container.textContent ?? "").not.toMatch(/block means predictable/i);
  });
});
