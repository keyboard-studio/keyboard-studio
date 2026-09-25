// Unit tests for MechanismGallery — method cards: the sequence / deadkey / combined
// Assign-to-a-key choosers, Apply for each method, the per-method delete badge, and
// the sequence builder.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory, instantiateWorkingCopy, getPhaseCPhysicalAssignments } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

// ---------------------------------------------------------------------------
// Method chooser — sequence (always visible)
// ---------------------------------------------------------------------------

describe("MechanismGallery — Apply lives in the open method card", () => {
  it("puts Apply in the open card, and only there", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // "á" decomposes to a + U+0301, so the §3c default method is deadkey — its
    // card is the open one, so its card is where Apply belongs.
    expect(screen.getByTestId("mechanism-apply-deadkey")).toBeTruthy();
    expect(screen.queryByTestId("mechanism-apply-swap")).toBeNull();

    // Exactly one — the reason for moving it off the shared row. A second Apply
    // anywhere on screen would reintroduce "which method does this commit?".
    expect(screen.getAllByRole("button", { name: /Apply method for á/i })).toHaveLength(1);
  });

  it("follows the author into whichever card they open", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByTestId("mechanism-apply-deadkey")).toBeTruthy();

    // Anchored regex: the swap card's key picker carries the aria-label
    // "Physical key for Assign to a key", which an unanchored /Assign to a key/
    // would also match.
    fireEvent.click(screen.getByRole("button", { name: /^Assign to a key/i }));

    expect(screen.getByTestId("mechanism-apply-swap")).toBeTruthy();
    expect(screen.queryByTestId("mechanism-apply-deadkey")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Apply method for á/i })).toHaveLength(1);
  });

  it("offers no Apply on the sequence card — the right-pane builder owns that", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Type a sequence/i));

    expect(screen.queryByTestId("mechanism-apply-swap")).toBeNull();
    expect(screen.queryByTestId("mechanism-apply-deadkey")).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply method for á/i })).toBeNull();
  });
});

describe("MechanismGallery — sequence method chooser", () => {
  it("shows the 'Type a sequence' option for any character", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Type a sequence/i)).toBeTruthy();
  });

  it("selecting 'Type a sequence' swaps the right pane's live preview for the sequence builder", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // "á" decomposes to a + U+0301, so the §3c default method is deadkey and
    // the live preview (OSKFrame mock) is showing (visible, not hidden).
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
    expect(screen.getByTestId("mechanism-preview-wrapper").style.display).not.toBe("none");

    // Selecting the sequence method is itself the trigger — no separate
    // Apply needed to open the builder.
    fireEvent.click(screen.getByText(/Type a sequence/i));

    // The preview stays MOUNTED (never destroyed/recreated — see the
    // rightContent doc comment: OSKFrame's iframe must never unmount, since
    // KMW reinit is expensive/unsafe) — only its wrapper is hidden via CSS.
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
    expect(screen.getByTestId("mechanism-preview-wrapper").style.display).toBe("none");
    expect(screen.getByTestId("sequences-content")).toBeTruthy();
    expect(screen.getByTestId("sequences-indicator")).toBeTruthy();
    // The generic "Apply method" button is hidden for this method — the
    // builder owns its own Apply (sequences-apply).
    expect(screen.queryByRole("button", { name: /Apply method for á/i })).toBeNull();
  });

  it("does NOT unmount/recreate the OSKFrame when toggling the sequence method (KMW reinit is expensive/unsafe — see OSKFrame.tsx's own doc comment)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    const oskFrameBefore = screen.getByTestId("osk-frame");

    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.click(screen.getByTestId("sequence-builder-cancel"));

    // Same DOM node — proves OSKFrame was never unmounted+remounted across
    // the round trip (a fresh mount would be a DIFFERENT node reference).
    expect(screen.getByTestId("osk-frame")).toBe(oskFrameBefore);
    expect(screen.getByTestId("mechanism-preview-wrapper").style.display).not.toBe("none");
  });

  it("the builder's own Apply is disabled until Content and Indicator both resolve", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    const applyBtn = screen.getByTestId("sequences-apply");
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });

    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Cancel returns to the live preview without recording anything", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });

    fireEvent.click(screen.getByTestId("sequence-builder-cancel"));

    expect(screen.getByTestId("osk-frame")).toBeTruthy();
    expect(screen.queryByTestId("sequences-content")).toBeNull();
    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(0);
  });

  it("defaults to the deadkey method (pre-enabled) for a decomposable accented char (§3c)", async () => {
    // Propose-then-confirm: for "á" (a + U+0301) the deadkey method is the
    // natural default, with the base letter pre-filled to "a", so Apply is
    // enabled without further input — the author just confirms.
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    const triggerSelect = screen.getByLabelText(/Trigger key for deadkey/i);
    expect(triggerSelect).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for á/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("defaults to the swap method for a plain (non-accented) character", async () => {
    seedInventory(["z"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByLabelText(/Physical key for Assign to a key/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Abugida-safe gate on the deadkey auto-default (km-domain ruling) — a
// consonant+virama sequence (e.g. Devanagari "क" + U+094D) still matches
// isDecomposableAccented (virama is Mn, General_Category-universal), so the
// predicate alone can't exclude it; the gallery additionally gates on
// axes.scriptClass !== "abugida".
// ---------------------------------------------------------------------------

describe("MechanismGallery — abugida script-class gate on the deadkey default", () => {
  // Devanagari "क" (U+0915) + virama (U+094D) — predicate-matching (Mn mark),
  // but a script-specific abugida mechanism, not a Latin-style accent+base.
  const CONSONANT_VIRAMA = "क्";

  it("does NOT auto-default to the deadkey method when scriptClass is abugida", async () => {
    useWorkingCopyStore.getState().setIrAxes({ scriptClass: "abugida" });
    seedInventory([CONSONANT_VIRAMA]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.queryByLabelText(/Trigger key for deadkey/i)).toBeNull();
    expect(screen.getByLabelText(/Physical key for Assign to a key/i)).toBeTruthy();
  });

  it("still auto-defaults to the deadkey method when scriptClass is alphabetic", async () => {
    useWorkingCopyStore.getState().setIrAxes({ scriptClass: "alphabetic" });
    seedInventory([CONSONANT_VIRAMA]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByLabelText(/Trigger key for deadkey/i)).toBeTruthy();
  });

  it("still auto-defaults to the deadkey method when scriptClass is undefined (fail-open)", async () => {
    seedInventory([CONSONANT_VIRAMA]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByLabelText(/Trigger key for deadkey/i)).toBeTruthy();
  });

  // Regression pin (km-domain note): the gate above is abugida-ONLY — an
  // abjad script (Hebrew/Arabic) must NOT be suppressed, and that "NOT
  // gated" half of the ruling was previously enforced only by code
  // omission (no scriptClass === "abjad" branch), with no test proving it.
  // Hebrew בּ (U+FB31, BET WITH DAGESH) NFD-decomposes to ב (U+05D1, letter)
  // + U+05BC (dagesh, General_Category Mn) — verified via NFD in this repo's
  // Node runtime — so isDecomposableAccented(BET_DAGESH) is true, same as
  // the Latin "á" case, and the deadkey default should fire unmodified.
  const BET_DAGESH = "\u{FB31}";

  it("still auto-defaults to the deadkey method for a decomposable abjad char (Hebrew, scriptClass 'abjad' is NOT gated)", async () => {
    useWorkingCopyStore.getState().setIrAxes({ scriptClass: "abjad" });
    seedInventory([BET_DAGESH]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByLabelText(/Trigger key for deadkey/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Method chooser — deadkey (only for decomposable accented chars)
// ---------------------------------------------------------------------------

describe("MechanismGallery — deadkey method chooser", () => {
  it("shows 'Tap a trigger key, then a letter' option for any character", async () => {
    // S-02 deadkey is now always offered (not restricted to decomposable chars).
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Tap a trigger key, then a letter/i)).toBeTruthy();
  });

  it("shows 'Tap a trigger key, then a letter' for a plain ASCII character too", async () => {
    // S-02 is always shown — deadkey is not restricted to accented chars.
    seedInventory(["a"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Tap a trigger key, then a letter/i)).toBeTruthy();
  });

  it("switching to deadkey method exposes the trigger-key selector", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    expect(screen.getByLabelText(/Trigger key for deadkey/i)).toBeTruthy();
  });

  it("deadkey Add key button is enabled immediately (trigger key has a default)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    const addBtn = screen.getByRole("button", { name: /Apply method for á/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Apply — records assignment into the store
// ---------------------------------------------------------------------------

describe("MechanismGallery — apply (sequence)", () => {
  it("the builder's Apply records a real multi_char_sequence assignment, not a bare flag", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(PATTERN_SEQUENCE);
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-03");
    expect(assignments[0]?.mechanisms[0]?.slotValues).toMatchObject({
      firstLetterOut: "a",
      secondLetter: "s",
      collapsedChar: "á",
    });
  });

  it("Apply returns the right pane to the live preview (mirrors every other method's Apply)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    expect(screen.queryByTestId("sequences-content")).toBeNull();
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
  });

  it("a recorded sequence appears in the 'Sequences' row, not the 'Added' row", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: /Characters with a recorded sequence/i }),
      ).toBeTruthy();
    });
    expect(
      screen.queryByRole("group", { name: /Added characters — click to remove/i }),
    ).toBeNull();
  });

  it("a recorded sequence does not change the coverage count", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    await waitFor(() => {
      // Scoped by name — the Done-blocked inline hint (mechanism-gallery-
      // progression) also carries role="status" once any character is
      // unaccounted for; a bare getByRole("status") would now be ambiguous.
      const status = screen.getByRole("status", { name: "0 of 2 added" });
      expect(status.getAttribute("aria-label")).toBe("0 of 2 added");
    });
  });

  it("a recorded sequence enables Next for the current character", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("the per-char 'Sequence recorded' badge's remove control strips the recorded assignment", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    await waitFor(() => {
      expect(screen.getByText(/Sequence recorded/i)).toBeTruthy();
    });
    // With only one character in the inventory, the per-char badge's remove
    // control and the "Sequences" chip row's remove control both render for
    // "á" simultaneously and share the same aria-label — either one performs
    // the identical unflagCharForSequence(currentChar) action, so click
    // whichever resolves first (getAllByRole, not getByRole).
    const [removeControl] = screen.getAllByRole("button", {
      name: /Remove recorded sequence for U\+00E1 á/i,
    });
    fireEvent.click(removeControl!);

    await waitFor(() => {
      expect(getPhaseCPhysicalAssignments()).toHaveLength(0);
    });
  });

  it("a char with BOTH a real mechanism and a recorded sequence appears in both rows with distinct, addressable remove controls", async () => {
    // Coexistence is intentional (the gallery is multi-disposition, not
    // mutually exclusive) — this documents it and guards the P1 fix: the two
    // rows' remove buttons must not share an aria-label pattern.
    // A second character ("é") is seeded so the assertions below can advance
    // currentChar away from "á" — the per-char inline "Sequence recorded"
    // indicator only renders for currentChar, so this isolates the two
    // chip-row controls (Added / Sequences) under test from that third control.
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Apply a real mechanism (swap) for á.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Record a sequence for á (resetMethodState returns method to "swap"
    // after the swap apply above, so switch back to the sequence method).
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "s" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    // Read the raw (unmerged) Phase C assignments — session.assignments is a
    // MERGED view that collapses multiple assignment objects sharing the same
    // (scope, target) down to one, which would hide the two-separate-objects
    // shape this gallery and SequenceBuilderPanel actually produce (see
    // getPhaseCPhysicalAssignments below).
    await waitFor(() => {
      expect(getPhaseCPhysicalAssignments()).toHaveLength(2);
    });

    // Advance off "á" so only the two chip rows (not the per-char inline
    // indicator) are in play for the assertions below.
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });

    // Distinct aria-labels — each resolves to exactly one, correctly-scoped
    // control. getByLabelText throws on zero or multiple matches, so this
    // itself is the ambiguity assertion.
    const addedChip = screen.getByLabelText("Remove U+00E1 á");
    const sequenceChip = screen.getByLabelText("Remove recorded sequence for U+00E1 á");
    expect(addedChip).toBeTruthy();
    expect(sequenceChip).toBeTruthy();
    expect(addedChip).not.toBe(sequenceChip);

    // Both rows are present simultaneously.
    expect(
      screen.getByRole("group", { name: /Added characters/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: /Characters with a recorded sequence/i }),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Cross-gallery coexistence (P1 fix) — a REAL multi_char_sequence assignment
// recorded some other way (directly via the store, mirroring what
// SequenceBuilderPanel's own Apply produces) must not surface as "Added"/
// covered here, and this gallery's removal controls must never be able to
// delete it.
// ---------------------------------------------------------------------------

describe("MechanismGallery — coexistence with a separately-recorded sequence assignment (P1)", () => {
  it("a char with a recorded multi_char_sequence assignment does not appear as Added/covered", async () => {
    seedInventory(["ŋ", "x"]);
    // Simulate a sequence already recorded for "ŋ" (mirrors
    // SequenceBuilderPanel's own Apply assignment shape).
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Not counted as covered — the "Added characters" chip row never renders
    // for a char whose only recorded assignment is sequence-owned.
    expect(
      screen.queryByRole("group", { name: /Added characters — click to remove/i }),
    ).toBeNull();

    // The coverage line excludes it: 0 of 2, not 1 of 2. Scoped by name — see
    // the note in "renders the coverage status line with initial 0-of-N
    // count" above.
    await waitFor(() => {
      const status = screen.getByRole("status", { name: "0 of 2 added" });
      expect(status.getAttribute("aria-label")).toBe("0 of 2 added");
    });

    // The recorded sequence assignment itself is untouched by rendering this
    // gallery.
    const assignments = getPhaseCPhysicalAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(PATTERN_SEQUENCE);
  });

  it("a char with BOTH a non-sequence mechanism and a separately-recorded sequence assignment still shows as mechanism-covered, and removing its 'Added' chip leaves the sequence assignment untouched", async () => {
    seedInventory(["ŋ", "x"]);
    // Two SEPARATE MechanismAssignment objects for the same target — the
    // shape a non-sequence method and SequenceBuilderPanel actually produce
    // today (each always appends its own new assignment object rather than
    // merging into one shared mechanisms array).
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_N] > U+014B" } }],
        source: "user",
      },
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Mechanism-covered: the "Added" chip row DOES render for "ŋ" — the
    // sequence assignment must never hide a genuinely mechanism-covered char.
    await waitFor(() => {
      expect(screen.getByRole("group", { name: /Added characters/i })).toBeTruthy();
    });
    // Exact label (not a loose regex) — "ŋ" also carries a recorded
    // sequence, which now surfaces its own "Remove recorded sequence for
    // U+014B ŋ" control (a separate dimension); a loose /Remove.*ŋ/ regex
    // would ambiguously match both.
    const addedChip = screen.getByLabelText("Remove U+014B ŋ");
    expect(addedChip).toBeTruthy();

    // Removing the "Added" chip strips only the non-sequence mechanism;
    // the separately-tracked sequence assignment survives.
    fireEvent.click(addedChip);

    await waitFor(() => {
      expect(
        screen.queryByRole("group", { name: /Added characters — click to remove/i }),
      ).toBeNull();
    });
    const remaining = getPhaseCPhysicalAssignments();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.target).toBe("ŋ");
    expect(remaining[0]?.mechanisms.every((m) => m.patternId === PATTERN_SEQUENCE)).toBe(true);
  });
});

describe("MechanismGallery — apply (deadkey)", () => {
  it("clicking Apply method with deadkey method records patternId deadkey_single_tap", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(PATTERN_DEADKEY);
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-02");
  });
});

// ---------------------------------------------------------------------------
// Per-method delete badge — gallery-QoL new behaviour
// ---------------------------------------------------------------------------

describe("MechanismGallery — per-method delete badge", () => {
  it("applying two different methods to one char yields two per-method badges", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // --- Apply first method: deadkey (pre-filled base letter 'a' from á → NFD) ---
    // Expand the deadkey card and click Apply.
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // --- Apply second method: swap (S-01) ---
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Two per-method badges should now be visible (deadkey + swap).
    await waitFor(() => {
      const methodBadges = screen.queryAllByRole("button", {
        name: /^Remove method/i,
      });
      expect(methodBadges.length).toBe(2);
    });
  });

  it("clicking one per-method badge removes only that method (the other remains)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Apply deadkey method.
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Apply swap method.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Wait for both badges.
    let deadkeyBadge: HTMLElement | null = null;
    let swapBadge: HTMLElement | null = null;
    await waitFor(() => {
      const badges = screen.queryAllByRole("button", { name: /^Remove method/i });
      expect(badges.length).toBe(2);
      deadkeyBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("Deadkey")) ?? null;
      swapBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("Key:")) ?? null;
      expect(deadkeyBadge).not.toBeNull();
      expect(swapBadge).not.toBeNull();
    });

    // Click the deadkey badge to remove only that method.
    await act(async () => {
      fireEvent.click(deadkeyBadge!);
    });

    // Swap badge must still be visible; deadkey badge must be gone.
    await waitFor(() => {
      const remaining = screen.queryAllByRole("button", { name: /^Remove method/i });
      expect(remaining.length).toBe(1);
      const remainingLabel = remaining[0]!.getAttribute("aria-label") ?? "";
      expect(remainingLabel).not.toMatch(/Deadkey/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Combined "Assign to a key" card (S-01/S-08 merge) — zero layers is a plain
// base-key simple_swap; one or more filled layers is a
// modifier_as_layer_switch combo instead. There is no separate Base/Shift
// toggle any more — see MechanismGallery.tsx's handleApply, method ===
// "swap" branch.
// ---------------------------------------------------------------------------

describe("MechanismGallery — combined Assign-to-a-key card (S-01/S-08 merge)", () => {
  it("starts with zero layers — no modifier dropdown, no Base/Shift radio — and Apply with none records a plain simple_swap base-key assignment", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));

    // No layer dropdown yet, and no Base/Shift radio at all (removed).
    expect(screen.queryByLabelText(/Layer 1 for layer-switch combo/i)).toBeNull();
    expect(screen.queryByRole("radio", { name: "Base" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Shift" })).toBeNull();
    // The "+ Add layer" button IS available from this empty start.
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();

    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("θ");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_Q] > U+03B8",
    );
  });

  it("adding a layer before Apply records a modifier_as_layer_switch combo instead of simple_swap", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[ALT K_E]",
    );
  });

  it("removing the only layer back to zero re-enables Apply as a plain base-key assignment", async () => {
    // There is no minimum layer count any more — handleRemoveRaltSlot allows
    // removing all the way back to raltTokens = [].
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Remove layer 1/i }));

    expect(screen.queryByLabelText(/Layer 1 for layer-switch combo/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_E] > U+03B5",
    );
  });
});

// ---------------------------------------------------------------------------
// Real-interaction regression (bug report: "I can't click my cursor into any
// of the fields and type") — uses @testing-library/user-event, which
// simulates a genuine click-to-focus + per-character keydown/input/keyup
// sequence (unlike fireEvent.change, which sets a value directly and would
// pass even if the input never accepted real focus/keystrokes). Proves the
// Content/Indicator boxes actually accept focus and typed input end to end,
// through the full gallery (method-card click -> builder mount -> type).
// ---------------------------------------------------------------------------

describe("MechanismGallery — sequence builder accepts real click+type (user-event)", () => {
  it("clicking into Content and Indicator and typing updates their values and the combine-preview", async () => {
    seedInventory(["á"]);
    const user = userEvent.setup();
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));

    const contentInput = screen.getByTestId("sequences-content") as HTMLInputElement;
    const indicatorInput = screen.getByTestId("sequences-indicator") as HTMLInputElement;

    await user.click(contentInput);
    await user.type(contentInput, "a");
    expect(contentInput.value).toBe("a");
    expect(document.activeElement).toBe(contentInput);

    await user.click(indicatorInput);
    await user.type(indicatorInput, "s");
    expect(indicatorInput.value).toBe("s");
    expect(document.activeElement).toBe(indicatorInput);

    // Combine-preview reflects both typed values.
    expect(screen.getByText(/a \+ s/)).toBeTruthy();

    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
  });
});
