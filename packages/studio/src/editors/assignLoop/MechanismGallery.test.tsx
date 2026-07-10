// Unit tests for MechanismGallery — Phase C "add a key" assignment loop.
// Rendering style follows lint.test.tsx (React Testing Library, jsdom).
// Services, useKeyboardArtifact, and OSKFrame are mocked so tests never touch
// WASM, VFS side-effects, or a real pattern catalog.
//
// Component contract under test:
//   - One character at a time from lettersToAdd (inventory when baseIr is null).
//   - "Apply method for <char>" button records a MechanismAssignment(scope:"individual").
//   - "Skip this character" is pure forward navigation — it records nothing;
//     a skipped-over character is never treated as covered/resolved.
//   - The last character's forward button always reads "Done", disabled
//     until that character is actually covered.
//   - Coverage status line: "<N> of <M> added".
//   - Method chooser: "Type a sequence" always present; "Tap a trigger key, then a letter"
//     always present (S-02 deadkey is always offered, regardless of char type).
//   - Sequence Apply button disabled until both key inputs are non-empty.
//   - Added chip row appears; chips invoke remove (filters assignment from store).
//   - Already-produced section collapsed by default; toggle expands it.
//   - Guards: null base → no-base prompt; empty inventory → survey prompt.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY } from "./MechanismGallery.tsx";
import { useWorkingCopyStore, bindManifest } from "../../stores/workingCopyStore.ts";
import { MECHANISMS_STEP_ID, TOUCH_STEP_ID } from "../../steps/reducer.ts";
import type { EditorStep, Step } from "../../steps/types.ts";
import type { PatternLibraryService, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS, irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import { corpusBackedQwerty } from "@keyboard-studio/contracts/fixtures";
import type { PatternMatch } from "@keyboard-studio/contracts";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// vi.hoisted() — variables referenced inside vi.mock() factory closures.
// ---------------------------------------------------------------------------

const { applyAssignmentsToVfsSpy } = vi.hoisted(() => {
  const applyAssignmentsToVfsSpy = vi.fn(
    (
      _vfs: VirtualFS,
      _keyboardId: string,
      _assignments: ReadonlyArray<MechanismAssignment>,
      _getPattern: (_id: string) => unknown,
    ) => ({
      kmn: "c mock result",
      warnings: [] as string[],
    }),
  );
  return { applyAssignmentsToVfsSpy };
});

// ---------------------------------------------------------------------------
// Mock services — controls what filterFor / getById return.
// The mock always resolves PATTERN_SEQUENCE and PATTERN_DEADKEY explicitly so
// the component never gets undefined from getById().
// ---------------------------------------------------------------------------

const mockSvc: PatternLibraryService = {
  listAll: () => Promise.resolve([latinDeadkeyAcuteSingle]),
  getById: (id: string) => {
    if (id === latinDeadkeyAcuteSingle.id) return Promise.resolve(latinDeadkeyAcuteSingle);
    // Return a minimal stub for the two well-known IDs the component always loads.
    if (id === PATTERN_SEQUENCE || id === PATTERN_DEADKEY) {
      return Promise.resolve({
        ...latinDeadkeyAcuteSingle,
        id,
        title: id === PATTERN_SEQUENCE ? "Multi-char sequence" : "Deadkey single tap",
      });
    }
    return Promise.resolve(undefined);
  },
  filterFor: () => {
    const match: PatternMatch = {
      patternId: latinDeadkeyAcuteSingle.id,
      rank: 1,
      reason: "primary-strategy",
      strategyId: "S-02",
    };
    return Promise.resolve([match]);
  },
};

vi.mock("../../lib/services.ts", () => ({
  getPatternLibraryService: () => mockSvc,
  USE_REAL: false,
}));

// ---------------------------------------------------------------------------
// Mock useKeyboardArtifact — tests never touch WASM.
// ---------------------------------------------------------------------------

let _mockStage: Stage = { kind: "idle" };
const _mockRetry = vi.fn();
const _mockRecompile = vi.fn();
let _lastVfsTransform:
  | ((vfs: VirtualFS, keyboardId: string) => { warnings: string[] })
  | null
  | undefined = undefined;

vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    _baseKeyboard: unknown,
    _scaffoldSpec: unknown,
    vfsTransform: ((vfs: VirtualFS, keyboardId: string) => { warnings: string[] }) | null | undefined,
  ) => {
    _lastVfsTransform = vfsTransform;
    return { stage: _mockStage, retry: _mockRetry, recompile: _mockRecompile };
  },
}));

// ---------------------------------------------------------------------------
// Mock applyAssignmentsToVfs.
// ---------------------------------------------------------------------------

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return { ...original, applyAssignmentsToVfs: applyAssignmentsToVfsSpy };
});

// ---------------------------------------------------------------------------
// Mock OSKFrame — no iframe / KMW environment needed.
// ---------------------------------------------------------------------------

vi.mock("../../components/OSKFrame.tsx", () => ({
  OSKFrame: ({ stage }: { stage: Stage }) => (
    <div data-testid="osk-frame" data-stage={stage.kind}>
      osk-frame-mock
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setMockStage(s: Stage) {
  _mockStage = s;
}

/** Seed confirmedInventory via Phase B result. baseIr stays null so
 *  useInventoryDiff returns lettersToAdd === inventory (no diff).
 *
 *  The first-entry intro splash shows until the mechanism gallery intro is
 *  marked seen. Mark it by default so tests land directly on the gallery; pass
 *  { intro: true } to leave it unseen and exercise the intro itself. */
function seedInventory(chars: string[], opts: { intro?: boolean } = {}) {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: chars,
  });
  if (!opts.intro) {
    useWorkingCopyStore.getState().markGalleryIntroSeen("mechanism");
  }
}

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
  _mockStage = { kind: "idle" };
  _lastVfsTransform = undefined;
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Guard: no base keyboard
// ---------------------------------------------------------------------------

describe("MechanismGallery — no base keyboard", () => {
  it("renders the no-base-selected prompt when selectedBaseKeyboard is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.getByText(/No base keyboard selected/i)).toBeTruthy();
  });

  it("does NOT render a status line or Add key button when base is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add key for/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Guard: empty inventory
// ---------------------------------------------------------------------------

describe("MechanismGallery — no inventory", () => {
  it("renders the survey prompt when inventory is empty and base is set", () => {
    render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    expect(screen.getByText(/No inventory confirmed yet/i)).toBeTruthy();
  });

  it("renders a Back button inside the no-inventory guard when onBack is provided", () => {
    const onBack = vi.fn();
    render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />);
    // The guard path renders a Back button when onBack is given.
    const btn = screen.getByRole("button", { name: /← back/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Assignment loop — current character display
// ---------------------------------------------------------------------------

describe("MechanismGallery — current character display", () => {
  it("shows the first character from lettersToAdd as the current target", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // The character heading renders "Add a key" label above the char glyph.
    expect(screen.getByText("Add a key")).toBeTruthy();
    // The char glyph has aria-label "U+00E1 á".
    expect(screen.getByLabelText(/U\+00E1/i)).toBeTruthy();
  });

  it("renders the coverage status line with initial 0-of-N count", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("0 of 2 added");
  });
});

// ---------------------------------------------------------------------------
// Method chooser — sequence (always visible)
// ---------------------------------------------------------------------------

describe("MechanismGallery — sequence method chooser", () => {
  it("shows the 'Type a sequence' option for any character", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Type a sequence/i)).toBeTruthy();
  });

  it("Add key button is disabled when sequence inputs are empty", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // "á" decomposes to a + U+0301, so the §3c default method is deadkey
    // (with the base letter pre-filled). Switch to the sequence method to
    // assert its empty-input disabled state.
    fireEvent.click(screen.getByText(/Type a sequence/i));
    const addBtn = screen.getByRole("button", { name: /Apply method for á/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
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

  it("Add key button is disabled when only first key is filled", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Select sequence method (it's the default; click to expand inputs).
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for á/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Add key button is enabled after both sequence keys are filled", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "'" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for á/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
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
  it("clicking Apply method records an individual-scope assignment for the current char", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "'" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.scope).toBe("individual");
    expect(assignments[0]?.target).toBe("á");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(PATTERN_SEQUENCE);
  });

  it("sequence slotValues contain firstLetterOut and secondLetter from inputs", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "'" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    const assignment = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical")[0];
    expect(assignment?.mechanisms[0]?.slotValues).toMatchObject({
      firstLetterOut: "a",
      secondLetter: "'",
      collapsedChar: "á",
    });
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
// Apply + Next — the component does NOT auto-advance after Apply.
// The user must click "Next character →" (or "All done →") to move forward.
// ---------------------------------------------------------------------------

describe("MechanismGallery — advance after apply", () => {
  it("advances to the next character after Apply and then Next are clicked", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "'" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    // Apply records but stays on á; click Next to advance.
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });

    // Now the current char should be "é".
    await waitFor(() => {
      expect(screen.getByLabelText(/U\+00E9/i)).toBeTruthy();
    });
  });

  it("updates the coverage status after adding a character", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "'" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Coverage updates immediately after Apply (á is now covered).
    await waitFor(() => {
      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-label")).toBe("1 of 2 added");
    });
  });
});

// ---------------------------------------------------------------------------
// Skip — pure forward navigation; records nothing.
// ---------------------------------------------------------------------------

describe("MechanismGallery — skip character", () => {
  it("skipping advances to the next char without recording an assignment", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));

    // No assignment recorded.
    expect(
      useWorkingCopyStore
        .getState()
        .session.assignments.filter((a) => a.modality === "physical"),
    ).toHaveLength(0);

    // Current char is now é.
    await waitFor(() => {
      expect(screen.getByLabelText(/U\+00E9/i)).toBeTruthy();
    });
  });

  it("skipping does not change the coverage count and does not mark the character resolved", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Coverage starts at 0 of 2.
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("0 of 2 added");

    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/U\+00E9/i)).toBeTruthy();
    });

    // Skipping recorded nothing, so coverage is unchanged.
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("0 of 2 added");

    // Navigating back to the skipped-over "á": it is NOT treated as resolved —
    // Next stays disabled until it is actually applied.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
    });
    const nextBtn = screen.getByRole("button", { name: /Next character/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Done state
// ---------------------------------------------------------------------------

describe("MechanismGallery — Done state (positional: last char's forward button)", () => {
  it("the only (and therefore last) character's forward button already reads Done, disabled until Apply/Skip", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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
        />,
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

  it("skipping the only (last) character completes the phase via onComplete", async () => {
    // Skip on the last position is itself the phase completion — positional
    // Skip advances by one position, or finishes if there is no next
    // position, exactly like Next/Done.
    const onComplete = vi.fn();
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          onComplete={onComplete}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Added chip row
// ---------------------------------------------------------------------------

describe("MechanismGallery — added chip row", () => {
  it("shows a chip for each covered character", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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
// Already-produced section
// ---------------------------------------------------------------------------

describe("MechanismGallery — already-produced section", () => {
  it("does not render the already-produced toggle when alreadyProduced is empty", async () => {
    // baseIr is null => alreadyProduced === [].
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(
      screen.queryByRole("button", { name: /characters already covered/i }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

describe("MechanismGallery — Back button", () => {
  it("does not render a Back button when onBack is not provided", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.queryByRole("button", { name: /← back/i })).toBeNull();
  });

  it("renders a Back button when onBack is provided (before done)", async () => {
    const onBack = vi.fn();
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />,
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
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />,
      );
    });

    // --- Implement "á" (idx 0), then Next → "é" (idx 1). ---
    expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });

    // --- Implement "é" (idx 1), then Next → "í" (idx 2, the LAST character). ---
    fireEvent.click(screen.getByRole("button", { name: /Apply method for é/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00ED í$/)).toBeTruthy();
    });

    // The last character's forward button already reads "Done" (not yet
    // applied for "í", so it starts disabled).
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);

    // --- Back from "í" (idx 2) lands on "é" (idx 1) — covered, not skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
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
      expect(screen.getByLabelText(/^U\+00ED í$/)).toBeTruthy();
    });

    // --- Back twice more: "í" → "é" → "á" (idx 0), both covered, neither skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
    });
    expect(onBack).not.toHaveBeenCalled();

    // --- Back from "á" (idx 0) — first position, nowhere further back — calls onBack. ---
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("MechanismGallery — previous-character navigation", () => {
  it("clicking '« Previous character' from an interior character moves to the immediately preceding character, ungated by intermediate implementation status", async () => {
    const onBack = vi.fn();
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />,
      );
    });

    // Advance to "é" (idx 1) via Apply + Next — "í" stays untouched.
    expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });

    const prevBtn = screen.getByTestId("mechanisms-prev-char");
    expect(prevBtn.getAttribute("aria-label")).toBe("Previous character");
    expect((prevBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(prevBtn);

    // Landed back on "á" (idx 0) — the phase was NOT exited.
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
    });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("renders the previous-character button DISABLED on the first character", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Starting on "á" (idx 0) — nowhere further back to step.
    const prevBtn = screen.getByTestId("mechanisms-prev-char");
    expect(prevBtn).toBeTruthy();
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);

    // Clicking a disabled button is a no-op — still on "á", onBack untouched.
    fireEvent.click(prevBtn);
    expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
  });

  it("the previous-character button is enabled on later (non-first) characters", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Advance to "é" (idx 1) via Skip (records nothing).
    fireEvent.click(
      screen.getByRole("button", { name: /Skip this character/i }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });
    expect((screen.getByTestId("mechanisms-prev-char") as HTMLButtonElement).disabled).toBe(false);

    // Advance to "í" (idx 2, the last character) — still enabled there too.
    fireEvent.click(
      screen.getByRole("button", { name: /Skip this character/i }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00ED í$/)).toBeTruthy();
    });
    expect((screen.getByTestId("mechanisms-prev-char") as HTMLButtonElement).disabled).toBe(false);
  });

  it("does NOT render the previous-character button when the desktop layout is locked", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />,
      );
    });
    expect(screen.getByTestId("mechanisms-prev-char")).toBeTruthy();

    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });

    expect(screen.queryByTestId("mechanisms-prev-char")).toBeNull();
    // The locked-forward-escape button takes over the primary slot instead.
    expect(screen.getByTestId("mechanisms-continue")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Edit after Done — "Unlock to edit" affordance in the locked banner.
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

describe("MechanismGallery — edit after Done (unlock affordance)", () => {
  beforeEach(() => {
    bindManifest(UNLOCK_FIXTURE_MANIFEST);
  });

  it("renders 'Unlock to edit' in the locked banner and clicking it unlocks the gallery", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />,
      );
    });

    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });

    expect(screen.getByText(/Desktop layout locked/i)).toBeTruthy();
    const unlockBtn = screen.getByRole("button", { name: /unlock desktop layout to edit/i });
    expect(unlockBtn).toBeTruthy();

    fireEvent.click(unlockBtn);

    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
    // The gallery becomes editable again — Apply/Skip controls return.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Apply method for á/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Skip this character/i })).toBeTruthy();
    });
  });

  it("shows a caution line about re-reviewing the touch layout in the locked banner", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />,
      );
    });
    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });
    expect(
      screen.getByText(/re-reviewing your touch layout/i),
    ).toBeTruthy();
  });

  it("unlocking when a touch layout already exists marks the touch step stale (surfaces re-review)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />,
      );
    });
    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
      useWorkingCopyStore.getState().setTouchLayoutJson("{}");
    });

    expect(useWorkingCopyStore.getState().staleSteps.has(TOUCH_STEP_ID)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /unlock desktop layout to edit/i }));

    // handleUnlock marks "touch" directly (not "mechanisms") — production's
    // "touch" step has empty `inputs`, so there is no data edge for
    // markStale("mechanisms") to propagate across; marking "touch" itself
    // seeds it as a re-opened root regardless of the missing edge.
    expect(useWorkingCopyStore.getState().staleSteps.has(TOUCH_STEP_ID)).toBe(true);
    expect(useWorkingCopyStore.getState().staleSteps.has(MECHANISMS_STEP_ID)).toBe(false);
  });

  it("unlocking when no touch layout exists does NOT mark anything stale", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />,
      );
    });
    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /unlock desktop layout to edit/i }));

    expect(useWorkingCopyStore.getState().staleSteps.size).toBe(0);
  });
});

describe("MechanismGallery — Back after skipping the only character", () => {
  it("Back still calls onBack after skipping the only (first=last) character — position never changed", async () => {
    const onBack = vi.fn();
    const onComplete = vi.fn();
    seedInventory(["á"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          onBack={onBack}
          onComplete={onComplete}
        />,
      );
    });

    // Skipping the only character is itself the phase completion (idx 0 is
    // also the last position) — it does not move currentChar anywhere.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(onComplete).toHaveBeenCalledOnce();

    // The heading for "á" is still present — positional nav never nulled
    // currentChar out from under the completed character.
    expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();

    // Back is still positional: idx 0 has no prior position, so it calls
    // onBack — not gated by the character having just been skipped.
    const backBtn = screen.getByRole("button", { name: /← back/i });
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// kbgen suggestion row — persistence across Back navigation
// ---------------------------------------------------------------------------

describe("MechanismGallery — kbgen suggestion persistence across Back navigation", () => {
  it("an accepted suggestion row does not reappear after navigating forward and back", async () => {
    // corpusBackedQwerty proposes RALT+K_E for U+00E9 (é) and RALT+K_A for
    // U+00E0 (à) — both S-08 (modifier_as_layer_switch) candidates.
    const onBack = vi.fn();
    seedInventory(["é", "à"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          onBack={onBack}
          placementMap={corpusBackedQwerty}
        />,
      );
    });

    // Suggestion row shows for "é".
    expect(screen.getByText(/Suggested: Right Alt \+ E for é/i)).toBeTruthy();

    // Accept it — records the S-08 assignment and dismisses the row (the
    // dismissal is also implied by coveredChars once accepted).
    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ K_E for é/i }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/Suggested: Right Alt \+ E for é/i)).toBeNull();
    });

    // Advance to "à" — its own (not-yet-resolved) suggestion row shows.
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByText(/Suggested: Right Alt \+ A for à/i)).toBeTruthy();
    });

    // Navigate back to "é" without resolving à's suggestion. Anchored regex:
    // "é" is covered (accepted above), so an "Added" chip ("Remove U+00E9 é")
    // also carries "U+00E9" in its aria-label — match only the
    // character-heading span's exact label.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(onBack).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });

    // The already-accepted suggestion for "é" must NOT re-render its card.
    expect(screen.queryByText(/Suggested: Right Alt \+ E for é/i)).toBeNull();
  });

  it("a suggestion row REAPPEARS after Skip (unlike Accept/Deny) — Skip resolves nothing", async () => {
    // Same fixture as the accepted-suggestion test above, but this time the
    // character is SKIPPED rather than accepted/denied. Skip is pure
    // positional navigation and must not add the character to
    // suggestionResolved, so returning to it must show the suggestion again.
    seedInventory(["é", "à"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={corpusBackedQwerty}
        />,
      );
    });

    // Suggestion row shows for "é".
    expect(screen.getByText(/Suggested: Right Alt \+ E for é/i)).toBeTruthy();

    // Skip it — no accept/deny, no assignment recorded.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E0 à$/)).toBeTruthy();
    });

    // Navigate back to "é" without ever resolving its suggestion.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });

    // Unlike the accept/deny case above, the suggestion row for "é" MUST
    // reappear — Skip resolved nothing. (If `skippedChars` were reintroduced
    // to suppress the row, this assertion would fail.)
    expect(screen.getByText(/Suggested: Right Alt \+ E for é/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Preview wiring — loading / error / ready states (right pane)
// ---------------------------------------------------------------------------

describe("MechanismGallery — preview loading state", () => {
  it("renders a loading indicator when stage is fetching", async () => {
    setMockStage({ kind: "fetching" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Fetching keyboard source/i)).toBeTruthy();
  });

  it("renders a compiling indicator when stage is compiling (warm)", async () => {
    setMockStage({ kind: "compiling", isWarmCompile: true });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Compiling/i)).toBeTruthy();
  });

  it("renders a cold-compile indicator for isWarmCompile false", async () => {
    setMockStage({ kind: "compiling", isWarmCompile: false });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/loading WASM/i)).toBeTruthy();
  });
});

describe("MechanismGallery — preview error state", () => {
  it("renders the error message when stage is error", async () => {
    setMockStage({ kind: "error", step: "fetch", message: "Network timeout" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Network timeout/i)).toBeTruthy();
    expect(screen.getByText(/Preview failed/i)).toBeTruthy();
  });

  it("renders a Retry button on error", async () => {
    setMockStage({ kind: "error", step: "compile", message: "WASM crash" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});

describe("MechanismGallery — preview ready state", () => {
  const readyStage: Stage = {
    kind: "ready",
    compileResult: { success: true, artifacts: [], diagnostics: [] },
    jsBlobUrl: "",
    vfs: createVirtualFS(),
    scaffoldWarnings: [],
  };

  it("renders the OSKFrame mock when stage is ready", async () => {
    setMockStage(readyStage);
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
    expect(screen.getByTestId("osk-frame").getAttribute("data-stage")).toBe("ready");
  });

  it("shows apply warnings from scaffoldWarnings on ready stage", async () => {
    const stageWithWarnings: Stage = {
      ...readyStage,
      scaffoldWarnings: ['[pattern-apply] unknown patternId "foo" — fragment skipped'],
    };
    setMockStage(stageWithWarnings);
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Apply warnings/i)).toBeTruthy();
    expect(screen.getByText(/unknown patternId "foo"/i)).toBeTruthy();
  });

  it("does NOT show apply warnings when scaffoldWarnings is empty", async () => {
    setMockStage(readyStage);
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.queryByText(/Apply warnings/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Heading and subheading — gallery-QoL rename
// ---------------------------------------------------------------------------

describe("MechanismGallery — heading", () => {
  it("renders 'Mechanism Gallery' as the main heading", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByRole("heading", { level: 1, name: /Mechanism Gallery/i })).toBeTruthy();
  });

  it("renders 'Desktop' as a subheading label in the header area", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // "Desktop" is rendered as a <span> sibling to the <h1> (not inside it).
    expect(screen.getByText(/^Desktop$/i)).toBeTruthy();
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

    // --- Apply second method: sequence ---
    // Expand the sequence card.
    fireEvent.click(screen.getByText(/Type a sequence/i));

    // Fill in the two sequence inputs.
    const seqInputs = screen.queryAllByRole("textbox");
    const firstInput = seqInputs.find(
      (el) => el.getAttribute("aria-label")?.toLowerCase().includes("first"),
    );
    const secondInput = seqInputs.find(
      (el) => el.getAttribute("aria-label")?.toLowerCase().includes("second"),
    );
    expect(firstInput).toBeDefined();
    expect(secondInput).toBeDefined();
    await act(async () => {
      fireEvent.change(firstInput!, { target: { value: "e" } });
      fireEvent.change(secondInput!, { target: { value: "a" } });
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Two per-method badges should now be visible (deadkey + sequence).
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

    // Apply sequence method.
    fireEvent.click(screen.getByText(/Type a sequence/i));
    const seqInputs = screen.queryAllByRole("textbox");
    const firstInput = seqInputs.find(
      (el) => el.getAttribute("aria-label")?.toLowerCase().includes("first"),
    );
    const secondInput = seqInputs.find(
      (el) => el.getAttribute("aria-label")?.toLowerCase().includes("second"),
    );
    await act(async () => {
      fireEvent.change(firstInput!, { target: { value: "e" } });
      fireEvent.change(secondInput!, { target: { value: "a" } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // Wait for both badges.
    let deadkeyBadge: HTMLElement | null = null;
    let seqBadge: HTMLElement | null = null;
    await waitFor(() => {
      const badges = screen.queryAllByRole("button", { name: /^Remove method/i });
      expect(badges.length).toBe(2);
      deadkeyBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("Deadkey")) ?? null;
      seqBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("Sequence")) ?? null;
      expect(deadkeyBadge).not.toBeNull();
      expect(seqBadge).not.toBeNull();
    });

    // Click the deadkey badge to remove only that method.
    await act(async () => {
      fireEvent.click(deadkeyBadge!);
    });

    // Sequence badge must still be visible; deadkey badge must be gone.
    await waitFor(() => {
      const remaining = screen.queryAllByRole("button", { name: /^Remove method/i });
      expect(remaining.length).toBe(1);
      const remainingLabel = remaining[0]!.getAttribute("aria-label") ?? "";
      expect(remainingLabel).not.toMatch(/Deadkey/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Preview wiring — vfsTransform passes through to useKeyboardArtifact
// ---------------------------------------------------------------------------

describe("MechanismGallery — vfsTransform passed to useKeyboardArtifact", () => {
  it("passes a non-null vfsTransform after patterns have loaded and working copy is instantiated", async () => {
    // Use a ready stage so OSKFrame renders (confirms GalleryPreviewWithPatterns
    // mounted) and useKeyboardArtifact receives the transform callback.
    setMockStage({
      kind: "ready",
      compileResult: { success: true, artifacts: [], diagnostics: [] },
      jsBlobUrl: "",
      vfs: createVirtualFS(),
      scaffoldWarnings: [],
    });
    // Seed a working copy: useWorkingCopyTransform returns null when baseIr is null,
    // so instantiateFromBase must be called before patterns load.
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs: seedVfs,
      ir: makeTestIR([]),
    });
    seedInventory(["á"]);
    // Let patterns load fully inside act so the async filterFor + getById chain
    // completes and patternMap is populated before assertions run.
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      // Flush remaining microtasks (filterFor / getById promises).
      await new Promise((r) => setTimeout(r, 0));
    });
    // GalleryPreviewWithPatterns mounted → useKeyboardArtifact called → transform captured.
    expect(_lastVfsTransform).not.toBeNull();
    expect(typeof _lastVfsTransform).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Intro splash — first-entry orientation
// ---------------------------------------------------------------------------

describe("MechanismGallery — intro splash", () => {
  it("shows the intro on first entry and reveals the gallery after 'Get started'", async () => {
    seedInventory(["á"], { intro: true });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      await new Promise((r) => setTimeout(r, 0));
    });

    // Intro visible; the gallery's coverage status line is not yet shown.
    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    const startBtn = screen.getByRole("button", { name: /start the mechanism gallery/i });
    await act(async () => {
      fireEvent.click(startBtn);
      await new Promise((r) => setTimeout(r, 0));
    });

    // Gallery now visible; intro gone.
    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).toBeNull();
    expect(screen.queryByRole("status")).not.toBeNull();
  });

  it("does NOT show the intro on a return visit (intro already marked seen)", async () => {
    seedInventory(["á"]); // default: marks the intro seen

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).toBeNull();
    expect(screen.queryByRole("status")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Import-derived A3a provenance on the Flow Map (spec §7.2 rule 3a, #926)
// ---------------------------------------------------------------------------

describe("MechanismGallery — import-derived markInputOrder provenance", () => {
  it("publishes the import-derived provenance fill when the base seeded A3a=postfix", async () => {
    // seedIrAxesFromBaseIr seeds markInputOrder="postfix" onto irAxes at
    // instantiation. defaultFillAxes correctly omits an already-present axis
    // from its own axisFills, so MechanismGallery reconstructs the
    // import-derived provenance (postfix can only be base-derived) and
    // publishes it so the Flow Map's DefaultFillProvenance panel shows it.
    useWorkingCopyStore.getState().setIrAxes({ markInputOrder: "postfix" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    await waitFor(() => {
      expect(useWorkingCopyStore.getState().axisFills).toContainEqual({
        axis: "markInputOrder",
        value: "postfix",
        source: "import-derived",
      });
    });
  });

  it("publishes no import-derived fill when markInputOrder is absent", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    await waitFor(() => {
      expect(
        useWorkingCopyStore
          .getState()
          .axisFills.some((f) => f.source === "import-derived"),
      ).toBe(false);
    });
  });
});
