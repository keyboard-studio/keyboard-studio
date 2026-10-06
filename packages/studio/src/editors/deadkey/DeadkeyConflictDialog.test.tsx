// DeadkeyConflictDialog tests — spec 083 US6: explicit choices, no silent
// default, Cancel always present.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";

afterEach(cleanup);
import {
  DeadkeyConflictDialog,
  type DeadkeyConflictChoice,
} from "./DeadkeyConflictDialog.tsx";

function renderDialog(choices: DeadkeyConflictChoice[], onCancel = vi.fn()) {
  const onSelects = choices.map(() => vi.fn());
  const wired = choices.map((c, i) => ({ ...c, onSelect: onSelects[i]! }));
  render(
    <DeadkeyConflictDialog
      heading="; already triggers a deadkey"
      detail="Only one deadkey may own a trigger key."
      choices={wired}
      onCancel={onCancel}
    />,
  );
  return { onSelects, onCancel };
}

describe("DeadkeyConflictDialog", () => {
  it("renders every supplied choice with its title and body", () => {
    renderDialog([
      { key: "merge", title: "Merge into dk(003b)", body: "Move the pairs over, then delete mine." },
      { key: "reid", title: "Pick a different id", body: "Go back and edit the proposed id." },
    ]);
    expect(screen.getByText("Merge into dk(003b)")).toBeTruthy();
    expect(screen.getByText("Move the pairs over, then delete mine.")).toBeTruthy();
    expect(screen.getByText("Pick a different id")).toBeTruthy();
  });

  it("always renders Cancel, and Cancel calls onCancel without selecting anything", () => {
    const { onSelects, onCancel } = renderDialog([
      { key: "merge", title: "Merge", body: "Merge it." },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelects[0]).not.toHaveBeenCalled();
  });

  it("has no silent default — no choice is pre-selected or submitted without a click", () => {
    const { onSelects } = renderDialog([
      { key: "a", title: "Choice A", body: "Does A." },
      { key: "b", title: "Choice B", body: "Does B." },
    ]);
    // Nothing auto-fires on mount.
    expect(onSelects[0]).not.toHaveBeenCalled();
    expect(onSelects[1]).not.toHaveBeenCalled();
    // No radio/checked semantics — choices are plain buttons.
    expect(screen.queryByRole("radio")).toBeNull();
    // Clicking a choice fires exactly that choice.
    fireEvent.click(screen.getByRole("button", { name: /Choice B/ }));
    expect(onSelects[1]).toHaveBeenCalledTimes(1);
    expect(onSelects[0]).not.toHaveBeenCalled();
  });

  it("a disabled choice shows its reason and cannot be selected", () => {
    const { onSelects } = renderDialog([
      {
        key: "merge",
        title: "Merge",
        body: "Merge it.",
        disabled: true,
        disabledNote: "rule shape not recognized — pair editing unavailable",
      },
    ]);
    const notes = screen.getAllByText((_, el) =>
      el?.textContent?.includes("rule shape not recognized — pair editing unavailable") ?? false,
    );
    // The note is appended to the disabled choice's body text.
    expect(notes.length).toBeGreaterThan(0);
    const btn = screen.getByRole("button", { name: /Merge/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSelects[0]).not.toHaveBeenCalled();
  });
});
