// Unit tests for MechanismGallery — Phase C "add a key" assignment loop.
// Rendering style follows lint.test.tsx (React Testing Library, jsdom).
// Services, useKeyboardArtifact, and OSKFrame are mocked so tests never touch
// WASM, VFS side-effects, or a real pattern catalog.
//
// Component contract under test:
//   - One character at a time from lettersToAdd (inventory when baseIr is null).
//   - "Apply method for <char>" button records a MechanismAssignment(scope:"individual").
//   - "Skip this character" advances without recording.
//   - Done button appears when every char is covered or skipped (after clicking Next).
//   - Coverage status line: "<N> of <M> added".
//   - Method chooser: "Type a sequence" always present; "Tap a trigger key, then a letter"
//     always present (S-02 deadkey is always offered, regardless of char type).
//   - Sequence Apply button disabled until both key inputs are non-empty.
//   - Added chip row appears; chips invoke remove (filters assignment from store).
//   - Already-produced section collapsed by default; toggle expands it.
//   - Guards: null base → no-base prompt; empty inventory → survey prompt.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY } from "./MechanismGallery";
import { useWorkingCopyStore } from "../stores/workingCopyStore";
import type { PatternLibraryService, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { PatternMatch } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact";
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

vi.mock("../lib/services.ts", () => ({
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

vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
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

vi.mock("./OSKFrame.tsx", () => ({
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
 *  useInventoryDiff returns lettersToAdd === inventory (no diff). */
function seedInventory(chars: string[]) {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: chars,
  });
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
// Skip — advances without recording
// ---------------------------------------------------------------------------

describe("MechanismGallery — skip character", () => {
  it("skipping advances to the next char without recording an assignment", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip á/i }));

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

  it("all-skipped state shows Done button", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip á/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Done/i })).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Done state
// ---------------------------------------------------------------------------

describe("MechanismGallery — Done state", () => {
  it("Done button appears when every character is covered and Next is clicked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    // After Apply: á is covered, isDone=true, currentChar still="á".
    // The Next button aria-label is "All methods applied, finish"; click it to
    // reach currentChar===null, which renders the Done button.
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /All methods applied, finish/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Done/i })).toBeTruthy();
    });
  });

  it("clicking Done invokes the onComplete callback", async () => {
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

    // Advance to currentChar===null so the Done button appears.
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /All methods applied, finish/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /Done/i }));
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("empty lettersToAdd shows Done immediately", async () => {
    // Seed an inventory whose only char is already on the base keyboard.
    // Since baseIr is null here, lettersToAdd === inventory. Use empty inventory.
    // (Empty inventory => survey prompt path, not this path. Instead: skip all.)
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip á/i }));
    await waitFor(() => {
      expect(screen.getByText(/All keys added|No new characters/i)).toBeTruthy();
    });
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
