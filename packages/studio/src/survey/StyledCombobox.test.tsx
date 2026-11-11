// StyledCombobox — the blur-close timer must not shut a list the author has
// already reopened (walk 6c): the 120ms timer can fire late while the main
// thread is busy (synchronous Fuse rounds), after the input was refocused.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { StyledCombobox } from "./StyledCombobox.tsx";

import { useState } from "react";

const OPTIONS = [
  { value: "oci-0", label: "Occitan" },
  { value: "oci-1", label: "Occitan, Aranese" },
];

function renderBox() {
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <>
        <StyledCombobox
          id="test-combobox"
          value={value}
          options={OPTIONS}
          onType={setValue}
          onSelect={() => {}}
        />
        <button type="button">elsewhere</button>
      </>
    );
  }
  return render(<Harness />);
}

describe("StyledCombobox blur-close", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("stays open when the input is refocused before the blur timer fires", () => {
    renderBox();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    input.focus();
    fireEvent.change(input, { target: { value: "Occitan" } });
    expect(screen.queryByRole("option", { name: "Occitan" })).not.toBeNull();
    elsewhere.focus();
    input.focus();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole("option", { name: "Occitan" })).not.toBeNull();
  });

  it("closes when the input stays blurred past the timer", () => {
    renderBox();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    input.focus();
    fireEvent.change(input, { target: { value: "Occitan" } });
    expect(screen.queryByRole("option", { name: "Occitan" })).not.toBeNull();
    elsewhere.focus();
    // jsdom's focus() does not reliably fire the focusout React listens for;
    // the handler itself is what the timer assertion needs.
    fireEvent.focusOut(input);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole("option", { name: "Occitan" })).toBeNull();
  });
});
