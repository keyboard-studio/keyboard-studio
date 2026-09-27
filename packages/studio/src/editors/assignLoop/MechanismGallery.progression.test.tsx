// Unit tests for MechanismGallery — progression: advance after Apply, mark for later
// review, the Done state and its blocked hint, the added chip row, Back/Next
// navigation, auto-unlock after Done, full-inventory auto-lock, and the within-step
// walk position.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery, PATTERN_SWAP } from "./MechanismGallery.tsx";
import { useWorkingCopyStore, bindManifest } from "../../stores/workingCopyStore.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { charToPositionToken } from "../../lib/stepWalk.ts";
import { MECHANISMS_STEP_ID, TOUCH_STEP_ID, applyStepCompletion, type ReducerDeps } from "../../steps/reducer.ts";
import type { EditorStep, Step } from "../../steps/types.ts";
import { createVirtualFS, irPath, ARRAY_INDEX, type MechanismAssignment, type IRGroup, type IRRule } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory, getPhaseCPhysicalAssignments } from "../../test/mechanismGallery/harness.ts";

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
// Apply + Next — the component does NOT auto-advance after Apply.
// The user must click "Next character →" (or "All done →") to move forward.
// ---------------------------------------------------------------------------

describe("MechanismGallery — advance after apply", () => {
  it("advances to the next character after Apply and then Next are clicked", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    // "á" defaults to the pre-enabled deadkey method (§3c) — apply directly.
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    // Apply records but stays on á; click Next to advance.
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });

    // Now the current char should be "é".
    await waitFor(() => {
      expectCurrentChar("é");
    });
  });

  it("updates the coverage status after adding a character", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Coverage updates immediately after Apply (á is now covered). Scoped by
    // name — see the note in "renders the coverage status line with initial
    // 0-of-N count" above.
    await waitFor(() => {
      const status = screen.getByRole("status", { name: "1 of 2 added" });
      expect(status.getAttribute("aria-label")).toBe("1 of 2 added");
    });
  });
});

// ---------------------------------------------------------------------------
// Mark for later review — replaces the old "Skip this character" escape
// (mechanism-gallery-progression). A pure per-character TOGGLE: it does not
// itself navigate, records nothing in the working copy (authoring metadata
// only, in surveySessionStore), and satisfies canGoNext so the EXISTING
// Next/Done control (not a second navigation control) advances.
// ---------------------------------------------------------------------------

describe("MechanismGallery — mark for later review", () => {
  it("marking the current character records no MechanismAssignment", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );

    expect(
      useWorkingCopyStore
        .getState()
        .session.assignments.filter((a) => a.modality === "physical"),
    ).toHaveLength(0);
  });

  it("toggles the marked state and reflects it via aria-pressed and the button label", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    const markBtn = screen.getByRole("button", {
      name: /Mark U\+00E1 á for later review/i,
    });
    expect(markBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(markBtn);
    const unmarkBtn = await screen.findByRole("button", {
      name: /Unmark U\+00E1 á/i,
    });
    expect(unmarkBtn.getAttribute("aria-pressed")).toBe("true");
    expect(unmarkBtn.textContent).toContain("Marked for later review");

    fireEvent.click(unmarkBtn);
    await waitFor(() => {
      const remarkBtn = screen.getByRole("button", {
        name: /Mark U\+00E1 á for later review/i,
      });
      expect(remarkBtn.getAttribute("aria-pressed")).toBe("false");
    });
  });

  it("marking the current character enables Next/Done without changing the coverage count", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });

    // Coverage starts at 0 of 2. Scoped by name — see the note in "renders
    // the coverage status line with initial 0-of-N count" above.
    expect(
      screen.getByRole("status", { name: "0 of 2 added" }).getAttribute("aria-label"),
    ).toBe("0 of 2 added");

    // Untouched character — Next is disabled (canGoNext requires Apply OR mark).
    expect(
      (screen.getByRole("button", { name: /Next character/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: /Next character/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });

    // Marking recorded no assignment, so coverage is unchanged.
    expect(
      screen.getByRole("status", { name: "0 of 2 added" }).getAttribute("aria-label"),
    ).toBe("0 of 2 added");

    // Navigating back to the marked "á": Next stays enabled (it is
    // accounted for), even though it is still not counted toward coverage.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("á", { marked: true });
    });
    expect(
      (screen.getByRole("button", { name: /Next character/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Done state
// ---------------------------------------------------------------------------

describe("MechanismGallery — Done state (positional: last char's forward button)", () => {
  it("the only (and therefore last) character's forward button already reads Done, disabled until a method is applied", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    // idx 0 === lettersToAdd.length - 1 for a single-char list, so the
    // forward button reads "Done" from the very first render — there is no
    // separate "Next character" step to click through first.
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    await waitFor(() => {
      expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("clicking Done invokes the onComplete callback directly (no intermediate Next click)", async () => {
    const onComplete = vi.fn();
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          onComplete={onComplete}
        />, { withStepNav: true }
      );
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    await waitFor(() => {
      const doneBtn = screen.getByRole("button", { name: "Done" });
      expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(doneBtn);
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('marking the only (last) character enables Done, which completes directly — no modal', async () => {
    // Marking the last position is itself the phase-completion enabler: once
    // "á" is marked (not applied), Done becomes clickable and completes
    // directly. There is no more "leave-warning" confirm dialog
    // (mechanism-gallery-progression) — the affordance is disabled, not
    // click-intercepted.
    const onComplete = vi.fn();
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          onComplete={onComplete}
        />, { withStepNav: true }
      );
    });
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );
    await waitFor(() => {
      expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(doneBtn);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Done-blocked inline hint — replaces the old leave-warning ConfirmDialog
// (mechanism-gallery-progression). No <dialog> element is rendered by this
// gallery at all anymore; the Done/Continue control is simply disabled while
// any lettersToAdd character is neither implemented nor marked, and an inline
// role="status" hint explains why.
// ---------------------------------------------------------------------------

describe("MechanismGallery — Done-blocked inline hint (no modal)", () => {
  it("never renders a <dialog> element, even while characters remain unimplemented", async () => {
    seedInventory(["á", "é"]);
    const { container } = await act(async () =>
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true }),
    );
    expect(container.querySelector("dialog")).toBeNull();

    // Clicking the (disabled) Next control is a no-op — still no dialog.
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("shows an inline hint naming the unaccounted characters, and hides it once every character is marked", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true });
    });

    const hint = screen.getByRole("status", {
      name: (_accessibleName, element) =>
        element.textContent?.includes("still need an assignment or a mark") ?? false,
    });
    expect(hint.textContent).toContain("á");
    expect(hint.textContent).toContain("é");

    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => expectCurrentChar("é"));
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E9 é for later review/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/still need an assignment or a mark/i),
      ).toBeNull();
    });
  });

  it("the disabled footer forward button is described by the hint, and loses the reference once the hint unmounts (spec 081 FR-033, R-09)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true });
    });

    const group = screen.getByRole("group", { name: "Step navigation" });
    const forward = group.querySelector("button[aria-describedby]") as HTMLButtonElement;
    expect(forward).not.toBeNull();
    expect(forward.disabled).toBe(true);
    const hint = document.getElementById(forward.getAttribute("aria-describedby")!);
    expect(hint?.textContent).toMatch(/still needs? an assignment or a mark/);
    expect(group.contains(hint)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }));

    await waitFor(() => {
      expect(screen.queryByText(/still needs? an assignment or a mark/i)).toBeNull();
    });
    // No dangling IDREF once the hint is gone (axe aria-valid-attr-value).
    for (const btn of screen.getByRole("group", { name: "Step navigation" }).querySelectorAll("button")) {
      const ref = btn.getAttribute("aria-describedby");
      if (ref !== null) expect(document.getElementById(ref)).not.toBeNull();
    }
  });

  it("the ← back button navigates freely while characters remain unimplemented (no modal, no block)", async () => {
    const onBack = vi.fn();
    seedInventory(["á", "é"]);
    const { container } = await act(async () =>
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} onComplete={vi.fn()} />, { withStepNav: true }
      ),
    );
    // Mark "á" so Next is enabled, then advance to "é" without implementing it.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });
    expect(container.querySelector("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("á", { marked: true });
    });
    expect(container.querySelector("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Added chip row
// ---------------------------------------------------------------------------

describe("MechanismGallery — added chip row", () => {
  it("shows a chip for each covered character", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    await waitFor(() => {
      // The "Added characters" group appears.
      const group = screen.getByRole("group", {
        name: /Added characters/i,
      });
      expect(group).toBeTruthy();
      // Chip for "á" exists. Use the "Remove U+00E1 á" aria-label (the "Added
      // characters" chip) rather than the per-method badge ("Remove method … for á")
      // to avoid an ambiguous query now that both buttons match /Remove.*á/i.
      expect(screen.getByRole("button", { name: "Remove U+00E1 á" })).toBeTruthy();
    });
  });

  it("clicking a chip removes the assignment from the store", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    await waitFor(() => {
      // Wait for the "Added characters" chip (exact aria-label) to appear.
      expect(screen.getByRole("button", { name: "Remove U+00E1 á" })).toBeTruthy();
    });

    // Click the "Added characters" chip to remove the whole assignment.
    fireEvent.click(screen.getByRole("button", { name: "Remove U+00E1 á" }));

    // Assignment removed from store.
    await waitFor(() => {
      expect(
        useWorkingCopyStore
          .getState()
          .session.assignments.filter((a) => a.modality === "physical"),
      ).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

describe("MechanismGallery — Back button", () => {
  it("does not render a Back button when onBack is not provided", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    expect(screen.queryByRole("button", { name: /← back/i })).toBeNull();
  });

  it("renders a Back button when onBack is provided (before done)", async () => {
    const onBack = vi.fn();
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />, { withStepNav: true }
      );
    });
    const btn = screen.getByRole("button", { name: /← back/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Positional Back/Next navigation — reported-bug regression coverage.
//
// The reported bug: implementing each character, moving on, and coming back
// only showed the first character, and Next then skipped the others. Root
// cause was a "search for next uncovered" forward nav plus a charHistory
// stack for Back (reset on remount). Both handleNext/handleBack are now
// strictly positional (idx +/- 1 in lettersToAdd) — this suite asserts Next
// never skips an already-covered character and Back walks every character
// in reverse position, including covered ones, landing on onBack only from
// the very first position.
// ---------------------------------------------------------------------------

describe("MechanismGallery — positional Back/Next navigation", () => {
  it("Next advances positionally over covered characters (never skips them); Back walks back through every character including covered ones; Back from the first character calls onBack", async () => {
    const onBack = vi.fn();
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />, { withStepNav: true }
      );
    });

    // --- Implement "á" (idx 0), then Next → "é" (idx 1). ---
    expectCurrentChar("á");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expectCurrentChar("é");
    });

    // --- Implement "é" (idx 1), then Next → "í" (idx 2, the LAST character). ---
    fireEvent.click(screen.getByRole("button", { name: /Apply method for é/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expectCurrentChar("í");
    });

    // The last character's forward button already reads "Done" (not yet
    // applied for "í", so it starts disabled).
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);

    // --- Back from "í" (idx 2) lands on "é" (idx 1) — covered, not skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });
    expect(onBack).not.toHaveBeenCalled();

    // Revisiting the covered "é": Next is already enabled (no re-apply
    // needed) and — critically — advances to "í" (idx 2), NOT past it. This
    // is the regression the reported bug hit: Next used to search forward
    // for the next *uncovered* character and would jump straight to
    // completion/an unrelated character from here.
    const nextFromE = screen.getByRole("button", { name: /Next character/i });
    expect((nextFromE as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(nextFromE);
    await waitFor(() => {
      expectCurrentChar("í");
    });

    // --- Back twice more: "í" → "é" → "á" (idx 0), both covered, neither skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("á");
    });
    expect(onBack).not.toHaveBeenCalled();

    // --- Back from "á" (idx 0) — first position, nowhere further back — calls onBack. ---
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Edit after Done — auto-unlock on first edit (mechanism-gallery-progression
// friction removal). The old explicit "Unlock to edit" button is gone: the
// FIRST edit action on a locked, completed gallery (Apply, Mark for later,
// suggestion accept, existing-method/sequence removal, or a physical-key tap)
// calls the same handleUnlock logic that button used to trigger — the lock
// still gets SET on completion (reducer R1, unchanged) and cleared/re-review-
// flagged the same way, just without a manual gate in between.
//
// Fixture manifest mirrors the shape of the production manifest for this
// purpose: the "touch" step declares empty `inputs` (production deliberately
// avoids a C2 data cycle with "mechanisms" — see registerEditorSteps.ts), so
// there is no mechanisms→touch data edge for markStale("mechanisms") to
// propagate across. handleUnlock therefore marks "touch" directly as a
// re-opened root — that lands it in `staleSteps` regardless of the missing
// edge, which is exactly what these tests assert.
// ---------------------------------------------------------------------------

const PATH_GROUPS_FIXTURE = irPath("groups", ARRAY_INDEX);

function makeEditorStepFixture(
  id: string,
  writes: typeof PATH_GROUPS_FIXTURE[],
  inputs: typeof PATH_GROUPS_FIXTURE[],
): EditorStep {
  return {
    kind: "editor-step",
    id,
    title: id,
    spine: true,
    component: (() => null) as EditorStep["component"],
    inputs,
    writes,
  };
}

const UNLOCK_FIXTURE_MANIFEST: readonly Step[] = [
  makeEditorStepFixture(MECHANISMS_STEP_ID, [PATH_GROUPS_FIXTURE], []),
  makeEditorStepFixture("touch", [], [PATH_GROUPS_FIXTURE]),
];

describe("MechanismGallery — edit after Done (auto-unlock on first edit)", () => {
  beforeEach(() => {
    bindManifest(UNLOCK_FIXTURE_MANIFEST);
  });

  it("a locked gallery is immediately editable — no unlock click required — and the first edit unlocks it", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true }
      );
    });

    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });

    // No blocking gate: Apply/Mark controls are present and ENABLED while
    // locked (the old banner+button gate is gone).
    const markBtn = screen.getByRole("button", {
      name: /Mark U\+00E1 á for later review/i,
    });
    expect((markBtn as HTMLButtonElement).disabled).toBe(false);
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);

    // The first edit action (Mark for later) unlocks the desktop layout as a
    // side effect, in the same click — no throwaway first tap.
    fireEvent.click(markBtn);

    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
  });

  it("shows a non-blocking informational note (not a click gate) while the layout is locked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true }
      );
    });
    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });
    // The note explains the re-review consequence but is not a button/alert —
    // no "Unlock to edit" affordance exists any more.
    expect(
      screen.getByText(/editing it will flag your touch layout for re-review/i),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /unlock desktop layout to edit/i }),
    ).toBeNull();
  });

  it("auto-unlocking when a touch layout already exists marks the touch step stale (surfaces re-review)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true }
      );
    });
    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
      useWorkingCopyStore.getState().setTouchLayoutJson("{}");
    });

    expect(useWorkingCopyStore.getState().staleSteps.has(TOUCH_STEP_ID)).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );

    // handleUnlock marks "touch" directly (not "mechanisms") — production's
    // "touch" step has empty `inputs`, so there is no data edge for
    // markStale("mechanisms") to propagate across; marking "touch" itself
    // seeds it as a re-opened root regardless of the missing edge.
    expect(useWorkingCopyStore.getState().staleSteps.has(TOUCH_STEP_ID)).toBe(true);
    expect(useWorkingCopyStore.getState().staleSteps.has(MECHANISMS_STEP_ID)).toBe(false);
    // A brief, non-timer status note confirms the re-review flag fired.
    expect(
      screen.getByText(/touch layout has been flagged for re-review/i),
    ).toBeTruthy();
  });

  it("auto-unlocking when no touch layout exists does NOT mark anything stale", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true }
      );
    });
    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );

    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });
});

describe("MechanismGallery — Back after marking the only character", () => {
  it("Back still calls onBack after marking-then-completing the only (first=last) character — position never changed", async () => {
    const onBack = vi.fn();
    const onComplete = vi.fn();
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          onBack={onBack}
          onComplete={onComplete}
        />, { withStepNav: true }
      );
    });

    // Marking the only character enables Done at that same position (idx 0
    // is also the last position) — it does not move currentChar anywhere.
    // "á" was marked (never applied), so Done completes directly — no modal.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );
    const doneBtn = await screen.findByRole("button", { name: "Done" });
    await waitFor(() => expect((doneBtn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(doneBtn);
    expect(onComplete).toHaveBeenCalledOnce();

    // "á" is still the selected chip — positional nav never nulled
    // currentChar out from under the completed character.
    expectCurrentChar("á", { marked: true });

    // Back is still positional: idx 0 has no prior position, so it calls
    // onBack — not gated by the character having just been marked.
    const backBtn = screen.getByRole("button", { name: /← back/i });
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Forward button — forced visible/enabled once the whole inventory is
// covered, even when currentChar is outside lettersToAdd's walk (bug fix).
//
// This suite pins TWO independent, OR-ed reasons the Done button can be
// force-shown for a currentChar outside lettersToAdd's walk:
//   (a) `allCovered` — the producer-badge signal, exercised by the first two
//       tests below;
//   (b) `unaccountedChars.length === 0` — the mark-aware signal, added by
//       the mechanism-gallery-progression follow-up and exercised by the
//       third test below (a marked, still-unimplemented character elsewhere
//       in the walk, reached from an unrelated already-produced out-of-walk
//       character). See MechanismGallery.tsx's `forwardButton` top-priority
//       branch doc comment for the full reconciliation between the two.
// ---------------------------------------------------------------------------

describe("MechanismGallery — Done button forced visible when the whole inventory is covered", () => {
  it("shows an ENABLED Done button when every inventory character has count >= 1, even navigated to an already-produced character outside lettersToAdd (previously hidden)", async () => {
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    // "z" is directly produced by the base (badge count via signal (a)) —
    // stays OUT of lettersToAdd. "y" is in lettersToAdd; give it its own
    // session assignment so its badge count is also >= 1 — every inventory
    // character is now covered.
    seedInventory(["y", "z"]);
    const yAssignment: MechanismAssignment = {
      scope: "individual",
      target: "y",
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, slotValues: { kmnRules: "+ [K_Y] > 'y'" } }],
      source: "user",
    };
    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [yAssignment],
    });

    const onComplete = vi.fn();
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />, { withStepNav: true }
      );
    });

    // Navigate to "z" via the SHOW-ALL strip — outside lettersToAdd (["y"]
    // only), the scenario that previously hid the forward button entirely.
    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));
    await waitFor(() => {
      expectCurrentChar("z");
    });

    // The Done button is FORCED visible and enabled — the whole inventory
    // (both "y" and "z") is covered.
    const doneBtn = screen.getByTestId("mechanisms-continue");
    expect(doneBtn.textContent).toMatch(/Done/i);
    expect((doneBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(doneBtn);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does NOT force-show the Done button when at least one character is still count === 0, even when navigated to an already-produced character outside lettersToAdd", async () => {
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    // "z" is directly produced by the base; "y" stays in lettersToAdd with
    // NO session assignment at all — count 0, so the inventory is NOT fully
    // covered.
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />, { withStepNav: true });
    });

    // Navigate to "z" — outside lettersToAdd (["y"]).
    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));
    await waitFor(() => {
      expectCurrentChar("z");
    });

    // Not fully covered ("y" is still count 0) — the forward button stays
    // hidden entirely, exactly as before this fix.
    expect(screen.queryByTestId("mechanisms-continue")).toBeNull();
  });

  it("force-shows an ENABLED Done button via the mark-aware unaccountedChars signal when a DIFFERENT, unimplemented-but-MARKED character remains elsewhere in the walk (mechanism-gallery-progression follow-up)", async () => {
    // "z" is directly produced by the base (badge count via signal (a)) —
    // stays OUT of lettersToAdd, the SHOW-ALL-only character this test
    // navigates to. "á" has no base coverage, so it is the walk's sole
    // entry (lettersToAdd === ["á"]).
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    seedInventory(["á", "z"]);

    const onComplete = vi.fn();
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />, { withStepNav: true }
      );
    });

    expectCurrentChar("á");
    // Mark "á" instead of implementing it — its producer badge stays 0
    // forever (marks are authoring metadata, never a MechanismAssignment),
    // so `allCovered` over the whole inventory is FALSE for the rest of
    // this test — the property under test is that Done still force-shows
    // via `unaccountedChars` alone.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );

    // Navigate to "z" via the SHOW-ALL strip — outside lettersToAdd, and NOT
    // the marked character itself (a marked-but-unimplemented character is
    // never excluded from the walk, so it can never be "the out-of-walk
    // char" on its own).
    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));
    await waitFor(() => {
      expectCurrentChar("z");
    });

    // Every character is implemented ("z") or marked ("á") —
    // `unaccountedChars` is empty even though `allCovered` (badge) is
    // false — Done force-shows, ENABLED, from this out-of-walk character.
    const doneBtn = screen.getByTestId("mechanisms-continue");
    expect(doneBtn.textContent).toMatch(/Done/i);
    expect((doneBtn as HTMLButtonElement).disabled).toBe(false);

    // Unlike the badge-only test above, clicking here is expected to
    // actually complete: `unaccountedChars.length === 0` is the exact
    // condition `handleForwardComplete` itself checks, so "visible" and
    // "clicking works" agree on this path — no harness caveat needed.
    fireEvent.click(doneBtn);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// T008 (spec 034 MVP authoring walk, FR-006 / AS-5) — full-inventory
// assignment coverage + desktop auto-lock on completion.
//
// Drives the gallery through every character in a small declared inventory
// (S-02/S-03/S-01/S-08 are all available per character; the decomposable
// accented fixture chars here default to S-02 deadkey per §3c), asserting:
//   (a) every declared character ends up with at least one recorded
//       MechanismAssignment(scope: "individual") — the "every alphabet
//       character gets assigned to at least one key/mechanism" functional
//       path, and
//   (b) reaching the phase's completion (the final Done click) fires the
//       real applyStepCompletion(MECHANISMS_STEP_ID) reducer path (R1),
//       landing desktopLocked === true on the real store.
//
// NOTE: the explicit-gate UX affordance (a visible lock button) is
// deliberately deferred — this suite asserts only the functional auto-lock
// side effect via the reducer, never a lock-button UI element.
// ---------------------------------------------------------------------------

describe("MechanismGallery — full-inventory coverage + desktop auto-lock (T008)", () => {
  it("assigns every declared character to a mechanism (S-02 default) and locks the desktop on completion", async () => {
    const DECLARED_CHARS = ["á", "é", "í"];
    seedInventory(DECLARED_CHARS);

    let completionFired = false;
    const onComplete = () => {
      completionFired = true;
      // Mirror the production wiring (SurveyView -> applyStepCompletion): the
      // gallery's onComplete triggers the reducer's R1 lock gate. lockDesktop
      // is bound to the REAL store action so this exercises the actual
      // desktopLocked flip, not a mock.
      const deps: ReducerDeps = {
        lockDesktop: useWorkingCopyStore.getState().lockDesktop,
        clearStale: vi.fn(),
        setTouchLayoutJson: vi.fn(),
        instantiateFromBase: vi.fn(),
        instantiateFromExisting: vi.fn(),
        buildTouchLayoutJson: vi.fn().mockReturnValue({ json: "{}", warnings: [] }),
        resolveBaseTouchJson: vi.fn().mockReturnValue(undefined),
        instantiateFromBaseIfConfirmed: vi.fn().mockReturnValue(true),
      };
      applyStepCompletion(MECHANISMS_STEP_ID, undefined, deps);
    };

    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />, { withStepNav: true }
      );
    });

    // Every non-last character: Apply (the deadkey method is pre-selected by
    // default for a decomposable accented char, §3c default-fill — Apply is
    // enabled immediately without further input) then Next.
    for (const ch of DECLARED_CHARS.slice(0, -1)) {
      const applyBtn = screen.getByRole("button", {
        name: new RegExp(`Apply method for ${ch}`, "i"),
      });
      expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(applyBtn);
      await waitFor(() => {
        const nextBtn = screen.getByRole("button", { name: /Next character/i });
        expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(nextBtn);
      });
    }

    // The last character's forward button reads "Done" — Apply, then Done
    // fires onComplete (which runs the real R1 lock reducer above).
    const lastChar = DECLARED_CHARS[DECLARED_CHARS.length - 1]!;
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`Apply method for ${lastChar}`, "i"),
      }),
    );
    await waitFor(() => {
      const doneBtn = screen.getByRole("button", { name: "Done" });
      expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(doneBtn);
    });

    expect(completionFired).toBe(true);

    // FR-006/AS-5 coverage: every declared character has at least one
    // recorded individual-scope MechanismAssignment — the gallery does not
    // silently leave a declared character unassigned.
    const assignments = getPhaseCPhysicalAssignments();
    for (const ch of DECLARED_CHARS) {
      expect(
        assignments.some((a) => a.scope === "individual" && a.target === ch),
        `expected an individual-scope MechanismAssignment for declared character "${ch}"`,
      ).toBe(true);
    }

    // AS-5 auto-lock: reaching completion locks the desktop layout. This is
    // the FUNCTIONAL auto-lock only — no lock-button UI is asserted here (it
    // is deliberately deferred).
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });

  it("does NOT lock the desktop if completion is never reached (fewer than all declared characters assigned)", async () => {
    const DECLARED_CHARS = ["á", "é"];
    seedInventory(DECLARED_CHARS);
    const onComplete = vi.fn();

    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />, { withStepNav: true }
      );
    });

    // Apply only the first character; do not advance to / complete the last.
    fireEvent.click(
      screen.getByRole("button", { name: /Apply method for á/i }),
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Within-step walk binding (lib/stepWalk.ts, hooks/useCharWalkPosition.ts)
//
// Two defects these cover, both reported as "if I jump away from later
// questions in Mechanisms without completing all of them, I can't get back to
// the question I was on":
//
//   1. `currentChar` was plain component state, and a tab switch unmounts this
//      gallery — so the walk restarted at the first uncovered character.
//   2. The whole stage was ONE footer dot, so the row could not say which of a
//      dozen characters the author was on, and offered no way back into one.
// ---------------------------------------------------------------------------

describe("MechanismGallery — within-step walk position", () => {
  it("publishes one stop per walk character, with its code points in the label", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    const walk = useStepWalkStore.getState().walks[MECHANISMS_STEP_ID];
    expect(walk?.map((p) => p.id)).toEqual([charToPositionToken("á"), charToPositionToken("é")]);
    // A character has no question-registry entry, so the walk must carry its own
    // label — and it names the code points, since a bare glyph is ambiguous
    // between composed forms and useless to a screen reader.
    expect(walk?.[0]?.label).toBe("á (U+00E1)");
  });

  it("publishes the cursor as the author walks, so the footer marker tracks it", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    expect(useSurveyAnswerStore.getState().steps[MECHANISMS_STEP_ID]?.position).toBe(
      charToPositionToken("á"),
    );
    // "Skip this character" no longer exists (mechanism-gallery-progression
    // replaced it with the "Mark for later review" toggle — see that
    // describe block above); Next is gated on implemented-OR-marked, so
    // marking is how this walk-position test advances past an untouched
    // character without recording a MechanismAssignment.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    });
    expectCurrentChar("é");
    expect(useSurveyAnswerStore.getState().steps[MECHANISMS_STEP_ID]?.position).toBe(
      charToPositionToken("é"),
    );
  });

  it("resumes on the character the author was on after the unmount a tab switch causes", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    // Mark-then-Next twice — see the "Skip this character" note above.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Mark U\+00E9 é for later review/i }),
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    });
    expectCurrentChar("í");

    // The tab switch. NOT a store reset — the working copy survives; only this
    // component is destroyed and rebuilt.
    cleanup();
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    // Pre-fix: "á" — the first uncovered character, because nothing outlived the
    // component to say otherwise.
    expectCurrentChar("í");
  });

  it("honours a cursor written while mounted — activating a dot for this same stage", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    expectCurrentChar("á");
    // A footer dot inside the step the author is already on: no route change, no
    // step change, nothing remounts, so only the live cursor can carry it.
    await act(async () => {
      useSurveyAnswerStore.getState().setPosition(MECHANISMS_STEP_ID, charToPositionToken("í"));
    });
    expectCurrentChar("í");
  });

  it("ignores a cursor naming a character this walk does not hold", async () => {
    seedInventory(["á"]);
    await act(async () => {
      useSurveyAnswerStore.getState().setPosition(MECHANISMS_STEP_ID, charToPositionToken("ω"));
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    expectCurrentChar("á");
  });

  it("still prefers the first UNCOVERED character on a first-ever entry", async () => {
    // The arrival heuristic is unchanged where there is no cursor to honour —
    // only OUTRANKED by one, never replaced.
    useStepWalkStore.getState().reset();
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
    });
    expectCurrentChar("á");
  });
});
