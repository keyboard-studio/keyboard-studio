// Unit tests for SequenceBuilderPanel — the S-03 sequence builder that now
// renders inline in the Mechanism Gallery's right pane (formerly the
// standalone SequenceGallery step; see the module docstring in
// SequenceBuilderPanel.tsx). These tests restore edge-case coverage that was
// dropped when SequenceGallery.test.tsx was deleted but whose underlying
// behavior still lives, unchanged, in this component:
//
//   - An Indicator that cannot resolve to a physical key (charToVkey returns
//     null) blocks Apply (canApply stays false) even though resolveCharInput
//     itself accepts the value.
//   - Content accepts a multi-grapheme digraph (e.g. "ng") and records it
//     verbatim as firstLetterOut.
//   - Apply is deduped: an identical (content, indicator) pair applied twice
//     does not create a second MechanismRef.
//   - Removal is index-stable: removing the middle of 3+ recorded sequences
//     drops exactly that entry and keeps the others, in order.
//
// The component takes sessionAssignments/recordAssignments as plain props
// (it is not wired to the working-copy store directly), so these tests use a
// small stateful harness (Harness below) that mirrors what MechanismGallery
// actually does: recordAssignments writes into local state, which is fed
// back in as the next sessionAssignments prop.

import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../../test/renderWithI18n.tsx";
import { SequenceBuilderPanel } from "./SequenceBuilderPanel.tsx";
import type { MechanismAssignment } from "@keyboard-studio/contracts";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Harness — owns sessionAssignments as real state so recordAssignments
// round-trips exactly the way MechanismGallery's store-backed prop does.
// onAssignmentsChange lets a test observe every committed array without
// re-deriving it from the DOM.
// ---------------------------------------------------------------------------

function Harness({
  char,
  onApplied = () => {},
  onCancel = () => {},
  onAssignmentsChange,
}: {
  char: string;
  onApplied?: () => void;
  onCancel?: () => void;
  onAssignmentsChange?: (next: MechanismAssignment[]) => void;
}) {
  const [assignments, setAssignments] = useState<MechanismAssignment[]>([]);
  return (
    <SequenceBuilderPanel
      char={char}
      sessionAssignments={assignments}
      recordAssignments={(next) => {
        setAssignments(next);
        onAssignmentsChange?.(next);
      }}
      onApplied={onApplied}
      onCancel={onCancel}
    />
  );
}

// ---------------------------------------------------------------------------
// Indicator unresolvable — charToVkey has no entry for it (KEY_OPTIONS only
// covers ASCII letters/digits/punctuation), so Apply must stay disabled.
// ---------------------------------------------------------------------------

describe("SequenceBuilderPanel — indicator not resolvable to a physical key", () => {
  it("blocks Apply (canApply false) when the indicator has no physical-key mapping", async () => {
    const user = userEvent.setup();
    let latest: MechanismAssignment[] | undefined;
    render(<Harness char="ŋ" onAssignmentsChange={(a) => (latest = a)} />);

    await user.type(screen.getByTestId("sequences-content"), "n");
    // "ñ" is a valid single-grapheme character (resolveCharInput accepts it)
    // but is not on KEY_OPTIONS' ASCII-only physical-key list — charToVkey
    // returns null for it.
    await user.type(screen.getByTestId("sequences-indicator"), "ñ");

    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(screen.getByText(/isn't a key on this layout/i)).toBeTruthy();

    // Clicking a disabled button is a no-op — nothing recorded.
    await user.click(applyBtn);
    expect(latest).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Multi-grapheme digraph content
// ---------------------------------------------------------------------------

describe("SequenceBuilderPanel — multi-grapheme digraph content", () => {
  it("accepts a digraph like 'ng' as Content and records it verbatim as firstLetterOut", async () => {
    const user = userEvent.setup();
    let latest: MechanismAssignment[] | undefined;
    render(<Harness char="ŋ" onAssignmentsChange={(a) => (latest = a)} />);

    await user.type(screen.getByTestId("sequences-content"), "ng");
    await user.type(screen.getByTestId("sequences-indicator"), "y");

    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
    await user.click(applyBtn);

    expect(latest).toHaveLength(1);
    const mechanisms = latest?.[0]?.mechanisms ?? [];
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.slotValues?.["firstLetterOut"]).toBe("ng");
    expect(mechanisms[0]?.slotValues?.["secondLetter"]).toBe("y");
    expect(mechanisms[0]?.slotValues?.["collapsedChar"]).toBe("ŋ");
  });
});

// ---------------------------------------------------------------------------
// Apply-dedup — identical (content, indicator) applied twice is a no-op.
// ---------------------------------------------------------------------------

describe("SequenceBuilderPanel — apply dedup", () => {
  it("applying an identical (content, indicator) pair twice does not create a duplicate MechanismRef", async () => {
    const user = userEvent.setup();
    let latest: MechanismAssignment[] | undefined;
    render(<Harness char="ŋ" onAssignmentsChange={(a) => (latest = a)} />);

    const contentInput = screen.getByTestId("sequences-content") as HTMLInputElement;
    const indicatorInput = screen.getByTestId("sequences-indicator") as HTMLInputElement;
    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;

    await user.type(contentInput, "n");
    await user.type(indicatorInput, "g");
    await user.click(applyBtn);

    expect(latest?.[0]?.mechanisms).toHaveLength(1);

    // Re-render with the SAME pair — panel does not prefill the boxes after
    // Apply, so re-type the identical values by hand.
    await user.clear(contentInput);
    await user.type(contentInput, "n");
    await user.clear(indicatorInput);
    await user.type(indicatorInput, "g");
    await user.click(applyBtn);

    // Still exactly one MechanismRef — the second identical Apply was a no-op.
    expect(latest?.[0]?.mechanisms).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Index-stable removal — removing the middle of 3+ recorded sequences drops
// exactly that entry, in order.
// ---------------------------------------------------------------------------

describe("SequenceBuilderPanel — index-stable removal", () => {
  it("removing index 1 of 3 recorded sequences keeps the other two, in order", async () => {
    const user = userEvent.setup();
    let latest: MechanismAssignment[] | undefined;
    render(<Harness char="ŋ" onAssignmentsChange={(a) => (latest = a)} />);

    const contentInput = screen.getByTestId("sequences-content") as HTMLInputElement;
    const indicatorInput = screen.getByTestId("sequences-indicator") as HTMLInputElement;
    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;

    const applySeq = async (contentVal: string, indicatorVal: string) => {
      await user.clear(contentInput);
      await user.type(contentInput, contentVal);
      await user.clear(indicatorInput);
      await user.type(indicatorInput, indicatorVal);
      await user.click(applyBtn);
    };

    await applySeq("n", "g");
    await applySeq("n", "y");
    await applySeq("n", "h");

    expect(latest?.[0]?.mechanisms).toHaveLength(3);
    expect(screen.getByTestId("sequences-remove-0")).toBeTruthy();
    expect(screen.getByTestId("sequences-remove-1")).toBeTruthy();
    expect(screen.getByTestId("sequences-remove-2")).toBeTruthy();

    // Remove the MIDDLE entry ("n"+"y").
    await user.click(screen.getByTestId("sequences-remove-1"));

    const mechanisms = latest?.[0]?.mechanisms ?? [];
    expect(mechanisms).toHaveLength(2);
    expect(mechanisms.map((m) => m.slotValues)).toEqual([
      { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
      { firstLetterOut: "n", secondLetter: "h", collapsedChar: "ŋ" },
    ]);
  });
});
