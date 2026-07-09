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
import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { PatternLibraryService, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { PatternMatch } from "@keyboard-studio/contracts";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import type { MechanismAssignment, IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";
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

/** A minimal `group(main)` block — enough for planShiftAssignment/isMnemonicLayout. */
function mainGroup(): IRGroup {
  return { nodeId: "g-main", name: "main", usingKeys: true, rules: [], readonly: false };
}

/**
 * A `group(main)` block that already carries an explicit CAPS/NCAPS pair for
 * K_Q — exercises the caps-handling (Layer-A Check #10) branch of
 * planShiftAssignment/keyHasCapsHandling (P0 scenario C/D fixture).
 */
function mainGroupWithCaps(): IRGroup {
  const capsRule: IRRule = {
    nodeId: "r-K_Q-caps",
    context: [{ kind: "vkey", name: "K_Q", modifiers: ["CAPS"] }],
    output: [{ kind: "char", value: "Q" }],
  };
  const ncapsRule: IRRule = {
    nodeId: "r-K_Q-ncaps",
    context: [{ kind: "vkey", name: "K_Q", modifiers: ["NCAPS"] }],
    output: [{ kind: "char", value: "q" }],
  };
  return { nodeId: "g-main", name: "main", usingKeys: true, rules: [capsRule, ncapsRule], readonly: false };
}

/** The `&MNEMONICLAYOUT` system store, set to "1". */
function mnemonicStore(): IRStore {
  return {
    nodeId: "s-mnemonic",
    name: "MNEMONICLAYOUT",
    items: [{ kind: "char", value: "1" }],
    isSystem: true,
  };
}

/**
 * Instantiate the working copy with a `main` group so shift-layer targeting
 * (planShiftAssignment / isMnemonicLayout) has an IR to evaluate against —
 * without this, MechanismGallery's workingIr is null and Shift targeting is
 * disabled by design (see "shift toggle disabled" tests below for the
 * mnemonic case; this helper covers the "IR present" case).
 *
 * `opts.caps` swaps in {@link mainGroupWithCaps} — a main group where K_Q
 * already has an explicit CAPS/NCAPS pair, exercising the caps-handling
 * branch of planShiftAssignment.
 */
function instantiateWorkingCopy(opts: { mnemonic?: boolean; caps?: boolean } = {}) {
  const seedVfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const group = opts.caps === true ? mainGroupWithCaps() : mainGroup();
  const ir = makeTestIR([group], opts.mnemonic === true ? [mnemonicStore()] : []);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: seedVfs, ir });
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

// ---------------------------------------------------------------------------
// Shift-layer targeting (S-01) — Base/Shift toggle in the "Assign to a key" flow
// ---------------------------------------------------------------------------

describe("MechanismGallery — shift-layer targeting (S-01)", () => {
  it("emits a [SHIFT K_X] rule when the Shift layer is selected", async () => {
    // The user is adding Θ (uppercase) itself via the shift layer of K_Q —
    // shift+K_Q should produce Θ (U+0398), not the base-layer character.
    instantiateWorkingCopy();
    seedInventory(["Θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Shift" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for Θ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("Θ");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_Q] > U+0398",
    );

    // A Shift-layer apply is not a base-layer apply — the companion prompt
    // (base-layer only, per spec) must not appear.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("disables the Shift toggle for a mnemonic keyboard, with an explanatory title", async () => {
    instantiateWorkingCopy({ mnemonic: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const shiftToggle = screen.getByRole("radio", { name: "Shift" }) as HTMLButtonElement;
    expect(shiftToggle.disabled).toBe(true);
    expect(shiftToggle.getAttribute("title")).toMatch(/Mnemonic keyboard/i);

    // Clicking a disabled toggle must not change the layer — applying still
    // produces a base-layer rule.
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(shiftToggle);
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_Q] > U+03B8",
    );
  });
});

// ---------------------------------------------------------------------------
// Case-pair companion proposal (propose-then-confirm, spec v1.3.1 §3c)
// ---------------------------------------------------------------------------

describe("MechanismGallery — case-pair companion proposal", () => {
  it("shows the companion prompt for θ and records Θ on the shift layer on confirm", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of K_Q/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(2);
    const companion = assignments.find((a) => a.target === "Θ");
    expect(companion).toBeDefined();
    expect(companion?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(companion?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_Q] > U+0398",
    );

    // Prompt is dismissed after confirm.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("records nothing additional when the companion prompt is declined", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /Do not map Θ to the shift layer/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("θ");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("does not show the companion prompt for a caseless character", async () => {
    instantiateWorkingCopy();
    seedInventory(["ا"]); // Arabic alef — caseless (\p{Lo}), no case counterpart
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ا/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("does not show the companion prompt when the keyboard is mnemonic (shift unavailable)", async () => {
    instantiateWorkingCopy({ mnemonic: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P0 — base-layer swap on a CAPS-handling key (scenario C/D)
// ---------------------------------------------------------------------------

describe("MechanismGallery — CAPS-aware base-layer swap (P0)", () => {
  it("scenario C: base swap only on a CAPS-handling key emits the NCAPS+CAPS pair", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // Decline the companion so only the base swap is recorded.
    fireEvent.click(
      screen.getByRole("button", { name: /Do not map Θ to the shift layer/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [NCAPS K_Q] > U+03B8\n+ [CAPS K_Q] > U+03B8",
    );
  });

  it("scenario D: base swap + confirmed companion on a CAPS-handling key replaces the base assignment with the full quad", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of K_Q/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    // The companion REPLACES the base assignment (one combined rule set) —
    // no separate second assignment, and no conflicting duplicate [CAPS K_Q].
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("θ");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      [
        "+ [NCAPS K_Q] > U+03B8",
        "+ [NCAPS SHIFT K_Q] > U+0398",
        "+ [CAPS K_Q] > U+0398",
        "+ [CAPS SHIFT K_Q] > U+03B8",
      ].join("\n"),
    );
  });
});

// ---------------------------------------------------------------------------
// P1.5 — bcp47 plumbing for the case-pair companion proposal
// ---------------------------------------------------------------------------

describe("MechanismGallery — companion proposal bcp47 plumbing", () => {
  it("proposes İ (U+0130) for 'i' under the 'tr' identity bcp47 tag", async () => {
    instantiateWorkingCopy();
    // instantiateFromBase resets identity to null — set it explicitly.
    useWorkingCopyStore.getState().setIdentity({ bcp47: "tr" });
    seedInventory(["i"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for i/i }));

    expect(screen.getByText(/has an uppercase form, İ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map İ to the shift layer of K_Q/i }),
    );

    const companion = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical")
      .find((a) => a.target === "İ");
    expect(companion?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_Q] > U+0130",
    );
  });

  it("does not crash on a malformed identity bcp47 tag — the companion still proposes via the locale-insensitive fallback", async () => {
    instantiateWorkingCopy();
    useWorkingCopyStore.getState().setIdentity({ bcp47: "not a tag!!" });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    }).not.toThrow();

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();
  });
});
