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
import type { MechanismAssignment, IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";

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
  OSKFrame: ({
    stage,
    onKeyTap,
  }: {
    stage: Stage;
    onKeyTap?: (keyId: string) => void;
  }) => (
    <div data-testid="osk-frame" data-stage={stage.kind}>
      osk-frame-mock
      {onKeyTap !== undefined && (
        <button type="button" onClick={() => onKeyTap("K_E")}>
          tap-K_E
        </button>
      )}
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
    expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
  });

  it("renders the coverage status line with initial 0-of-N count", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Scoped by name: "á" is decomposable-accented, so the deadkey method's
    // pre-filled base-letter box also renders its own (unrelated) status
    // reflection — getByRole("status") alone would now match more than one.
    const status = screen.getByRole("status", { name: "0 of 2 added" });
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
      target: { value: "z" },
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
      target: { value: "z" },
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
      target: { value: "z" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    const assignment = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical")[0];
    expect(assignment?.mechanisms[0]?.slotValues).toMatchObject({
      firstLetterOut: "a",
      secondLetter: "z",
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
      target: { value: "z" },
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
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
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
      target: { value: "z" },
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
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });
  });

  it("skipping does not change the coverage count and does not mark the character resolved", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Coverage starts at 0 of 2. Scoped by name — see the note in "renders
    // the coverage status line with initial 0-of-N count" above.
    expect(
      screen.getByRole("status", { name: "0 of 2 added" }).getAttribute("aria-label"),
    ).toBe("0 of 2 added");

    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E9 é$/)).toBeTruthy();
    });

    // Skipping recorded nothing, so coverage is unchanged.
    expect(
      screen.getByRole("status", { name: "0 of 2 added" }).getAttribute("aria-label"),
    ).toBe("0 of 2 added");

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

    // Gallery now visible; intro gone. "á" is decomposable-accented, so more
    // than one status region can legitimately be present (the coverage line
    // plus the deadkey method's pre-filled base-letter reflection) — assert
    // at least one rather than exactly one.
    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).toBeNull();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("does NOT show the intro on a return visit (intro already marked seen)", async () => {
    seedInventory(["á"]); // default: marks the intro seen

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).toBeNull();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
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
// RAlt layer targeting (S-08) — Base/Shift plane choice
// ---------------------------------------------------------------------------

describe("MechanismGallery — RAlt layer targeting (S-08)", () => {
  it("emits a [ALT K_X] rule by default (unshifted plane, generic alt until chirality is in use)", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("ε");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[ALT K_E]",
    );
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrOutputList"]).toBe(
      "ε",
    );
  });

  it("emits a [SHIFT ALT K_X] rule when a second SHIFT layer is added", async () => {
    // The user is adding Ε (capital epsilon) via the shifted Alt plane of
    // K_E — Shift+Alt+E should produce Ε, not the unshifted Alt character.
    // Base slot defaults to generic ALT (no chiral alt in use); a second
    // dropdown is added and set to SHIFT.
    instantiateWorkingCopy();
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "SHIFT" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("Ε");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT ALT K_E]",
    );
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrOutputList"]).toBe(
      "Ε",
    );
  });

  it("unifies an author's Ctrl + (chiral) Alt pick to the generic [CTRL ALT K_E] (#defect: AltGr not working)", async () => {
    // The author picks slot 1 = Ctrl, slot 2 = an alt-family token — the
    // exact "Ctrl+Alt" selection reported as not working. A mixed
    // generic-ctrl + chiral-alt rule is kmcmplib-invalid
    // (KM_WARNING_KMCMP_4202659) and can never be delivered by a real
    // keypress either. The picker must emit the all-generic, functional
    // [CTRL ALT K_X] rule instead.
    // LALT must already be "in use" for the pool to offer it under the new
    // gating rule (computeModifierPool).
    instantiateWithModifiersInUse("K_W", ["LALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.change(screen.getByLabelText(/Layer 1 for layer-switch combo/i), {
      target: { value: "CTRL" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "LALT" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe("[CTRL ALT K_E]");
  });

  it("unifies a Ctrl + RAlt + Caps pick to the generic [CTRL ALT CAPS K_E] (chirality unification — mixed generic+chiral is kmcmplib-invalid)", async () => {
    // Slot 1 must default to RALT for this scenario to actually exercise
    // chirality unification — under the new gating rule (computeModifierPool)
    // generic ALT is the default until a chiral alt token is already in use,
    // so seed RALT as already in use to get the RALT default here.
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "CTRL" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 3 for layer-switch combo/i), {
      target: { value: "CAPS" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[CTRL ALT CAPS K_E]",
    );
  });

  it("is not gated by mnemonic layout (unlike the S-01 Shift toggle)", async () => {
    // Adding SHIFT to the layer combo is orthogonal to &MNEMONICLAYOUT, which
    // only gates the S-01 Shift radio (shiftLayerAllowed) — the layer-combo
    // SHIFT option must stay selectable regardless.
    instantiateWorkingCopy({ mnemonic: true });
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLSelectElement;
    expect(secondLayerSelect.disabled).toBe(false);
    fireEvent.change(secondLayerSelect, { target: { value: "SHIFT" } });
    expect(secondLayerSelect.value).toBe("SHIFT");
  });

  it("excludes LALT from the next dropdown once RALT is chosen in an earlier slot", async () => {
    // LALT must already be "in use" for the pool to offer it at all under the
    // new gating rule (computeModifierPool) — seed it so this test still
    // exercises the exclusion (not just the gating) behavior.
    instantiateWithModifiersInUse("K_W", ["LALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    // Slot 1 defaults to RALT; adding a second slot must not offer LALT
    // (or RALT again) — MODIFIER_EXCLUSIONS is self-inclusive + chiral.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLSelectElement;
    const optionValues = Array.from(secondLayerSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain("LALT");
    expect(optionValues).not.toContain("RALT");
  });

  it("excludes CAPS from the next dropdown once CAPS is chosen in an earlier slot, and never offers NCAPS at all", async () => {
    // NCAPS is not a distinct selectable S-08 layer (computeModifierPool
    // never includes it) — a rule with no caps token already matches
    // caps-off, so it must not appear in ANY slot's options, regardless of
    // what an earlier slot holds.
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLSelectElement;
    const firstOptionValues = Array.from(firstLayerSelect.options).map((o) => o.value);
    expect(firstOptionValues).not.toContain("NCAPS");

    fireEvent.change(firstLayerSelect, { target: { value: "CAPS" } });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLSelectElement;
    const optionValues = Array.from(secondLayerSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain("CAPS");
    expect(optionValues).not.toContain("NCAPS");
  });

  it("caps the layer combo at 4 dropdowns", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "CTRL" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 3 for layer-switch combo/i), {
      target: { value: "SHIFT" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 4 for layer-switch combo/i), {
      target: { value: "CAPS" },
    });

    expect(screen.queryByLabelText(/Layer 5 for layer-switch combo/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Add another layer/i })).toBeNull();
  });

  it("handleRemoveRaltSlot: removing a middle layer slot shifts later slots down and keeps their values", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    // Slot 1 defaults to generic ALT (no chiral alt in use). Add slot 2
    // (CTRL) and slot 3 (SHIFT).
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "CTRL" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 3 for layer-switch combo/i), {
      target: { value: "SHIFT" },
    });

    // Remove the middle slot (CTRL, index 1).
    fireEvent.click(screen.getByRole("button", { name: /Remove layer 2/i }));

    // Slot 3 is gone; slot 2 now holds what was slot 3's value (SHIFT) —
    // values are re-indexed by the removal, not reset to blank.
    expect(screen.queryByLabelText(/Layer 3 for layer-switch combo/i)).toBeNull();
    const layer2 = screen.getByLabelText(/Layer 2 for layer-switch combo/i) as HTMLSelectElement;
    expect(layer2.value).toBe("SHIFT");

    // Applying still produces a valid, canonically-ordered combo from the
    // remaining (ALT, SHIFT) slots — the removed CTRL is gone entirely.
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT ALT K_E]",
    );
  });

  it("hides the Add-layer button until every rendered dropdown has a selection", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    // Default state (slot 1 pre-filled with generic ALT) already shows the
    // button.
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 2 starts unselected — the Add button must hide until it is filled.
    expect(screen.queryByRole("button", { name: /Add another layer/i })).toBeNull();

    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "SHIFT" },
    });
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();
  });

  it('shows "(in use)" on a modifier token already used elsewhere in the working IR', async () => {
    // A `main` group with a rule under [RALT K_W] puts RALT "in use".
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "r-ralt-w",
          context: [{ kind: "vkey", name: "K_W", modifiers: ["RALT"] }],
          output: [{ kind: "char", value: "w" }],
        },
      ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    const ir = makeTestIR([group], []);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: seedVfs, ir });
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLSelectElement;
    const raltOption = Array.from(firstLayerSelect.options).find((o) => o.value === "RALT");
    expect(raltOption?.textContent).toBe("RALT (in use)");
  });

  it("shows a desktop-only note when the combo includes CAPS", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLSelectElement;
    fireEvent.change(firstLayerSelect, { target: { value: "CAPS" } });

    expect(screen.getByText(/desktop only/i)).toBeTruthy();
  });

  it("drops a now-invalid later pick when an earlier dropdown changes", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    // Slot 1 starts at ALT (default); add slot 2 and pick CAPS (valid — CAPS
    // isn't excluded by ALT). Slot 1's own options are never constrained by
    // a LATER slot (options only cascade downward), so slot 1 can freely
    // switch to CAPS too — which then excludes slot 2's CAPS pick and must
    // drop it back to unselected.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLSelectElement;
    fireEvent.change(secondLayerSelect, { target: { value: "CAPS" } });
    expect(secondLayerSelect.value).toBe("CAPS");

    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLSelectElement;
    fireEvent.change(firstLayerSelect, { target: { value: "CAPS" } });

    expect(secondLayerSelect.value).toBe("");
  });

  it("falls back to the default modifier pool (no crash) when workingIr is null but a base keyboard is selected", async () => {
    // No instantiateWorkingCopy() call — store.ir and store.baseIr both stay
    // null, so MechanismGallery's workingIr resolves to null even though
    // selectedBaseKeyboard is set. collectModifierTokensInUse must not be
    // called on a null IR; the pool must fall back to the documented
    // defaults (SHIFT/CTRL/ALT/CAPS — no RALT/LALT/LCTRL/RCTRL since nothing
    // is "in use" and neither family has surfaced its chiral options yet,
    // NCAPS is never offered) rather than crashing.
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLSelectElement;

    // Pre-filled with the default alt-family token (generic ALT).
    expect(firstLayerSelect.value).toBe("ALT");

    const optionValues = Array.from(firstLayerSelect.options)
      .map((o) => o.value)
      .filter((v) => v !== "");
    expect(new Set(optionValues)).toEqual(
      new Set(["SHIFT", "CTRL", "ALT", "CAPS"]),
    );

    // Applying still works end to end against the fallback pool.
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe("[ALT K_E]");
  });
});

// ---------------------------------------------------------------------------
// computeModifierPool — pool-gating scenarios (product rule: default to
// GENERIC ONLY for a family until the keyboard already uses a chiral L/R
// token for that family — at which point BOTH chiral options are offered
// and the generic is dropped. No always-on exception for AltGr (RALT);
// applies symmetrically to Alt and Ctrl.)
// ---------------------------------------------------------------------------

/** Build a `main` group with a single rule under the given vkey/modifiers. */
function groupWithModifiers(vkey: string, modifiers: string[]): IRGroup {
  return {
    nodeId: "g-main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        nodeId: `r-${vkey}-${modifiers.join("-")}`,
        context: [{ kind: "vkey", name: vkey, modifiers }],
        output: [{ kind: "char", value: "x" }],
      },
    ],
  };
}

function instantiateWithModifiersInUse(vkey: string, modifiers: string[]): void {
  const seedVfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = makeTestIR([groupWithModifiers(vkey, modifiers)], []);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: seedVfs, ir });
}

async function firstLayerOptionValues(): Promise<Set<string>> {
  fireEvent.click(screen.getByText(/Layer \+ key/i));
  const firstLayerSelect = screen.getByLabelText(
    /Layer 1 for layer-switch combo/i,
  ) as HTMLSelectElement;
  return new Set(
    Array.from(firstLayerSelect.options)
      .map((o) => o.value)
      .filter((v) => v !== ""),
  );
}

describe("MechanismGallery — computeModifierPool gating", () => {
  it("(i) no alt/ctrl in use: alt pool is [ALT] only (no RALT/LALT), ctrl pool is [CTRL] only (no LCTRL/RCTRL)", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "ALT", "CAPS"]));
  });

  it("(ii) RALT in use: alt pool becomes both chiral options [RALT,LALT] — generic ALT drops (CHANGE: RALT-in-use now also surfaces LALT)", async () => {
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "RALT", "LALT", "CAPS"]));
  });

  it("(iii) LALT in use: alt pool becomes both chiral options [RALT,LALT] — generic ALT drops", async () => {
    instantiateWithModifiersInUse("K_W", ["LALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "RALT", "LALT", "CAPS"]));
  });

  it("(iv) RCTRL in use: ctrl pool becomes both chiral options [LCTRL,RCTRL] — generic CTRL drops", async () => {
    instantiateWithModifiersInUse("K_W", ["RCTRL"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(
      new Set(["SHIFT", "LCTRL", "RCTRL", "ALT", "CAPS"]),
    );
  });

  it("(v) LCTRL in use: ctrl pool becomes both chiral options [LCTRL,RCTRL] — generic CTRL drops", async () => {
    instantiateWithModifiersInUse("K_W", ["LCTRL"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(
      new Set(["SHIFT", "LCTRL", "RCTRL", "ALT", "CAPS"]),
    );
  });

  it("(vi) generic ALT already in use (no chiral alt): alt pool stays generic-only [ALT] — a bare generic token in use does not trigger chiral options", async () => {
    instantiateWithModifiersInUse("K_W", ["ALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "ALT", "CAPS"]));
  });
});

// ---------------------------------------------------------------------------
// Covered-chip badge text — methodLabel render-level assertions (S-08 layers)
// ---------------------------------------------------------------------------

describe("MechanismGallery — covered-chip badge text for RAlt/Shift+RAlt (methodLabel)", () => {
  it('shows "RAlt: K_E" on the badge for an unshifted RAlt assignment', async () => {
    // RALT must already be "in use" for the pool (and therefore the slot-1
    // default) to lead with RALT rather than generic ALT — see
    // computeModifierPool's new generic-until-chiral-then-both gating rule.
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Remove method RAlt: K_E for ε/i }),
      ).toBeTruthy();
    });
  });

  it('shows "Shift+RAlt: K_E" on the badge for a shifted RAlt assignment', async () => {
    // Seed RALT in use so slot 1 defaults to RALT rather than generic ALT
    // (computeModifierPool).
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_E" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "SHIFT" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Remove method Shift\+RAlt: K_E for Ε/i }),
      ).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// OSK key-tap → base key selection while RAlt method + Shift+RAlt layer is
// active (handleKeyTap wiring, covers the keycap-mislabel fix's companion
// authoring path: picking the base key via the OSK rather than the dropdown).
// ---------------------------------------------------------------------------

describe("MechanismGallery — OSK key-tap selects the RAlt base key", () => {
  it("tapping the OSK sets the base key and Apply emits [SHIFT RALT <tappedKey>] when Shift+RAlt is selected", async () => {
    // Seed a chiral alt token as already in use (on a different key) so the
    // slot-1 default leads with RALT rather than generic ALT
    // (computeModifierPool's generic-until-chiral-then-both gating rule).
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      // Flush the patterns-loading microtasks so GalleryPreviewWithPatterns
      // (and the mocked OSKFrame's tap button) mounts.
      await new Promise((r) => setTimeout(r, 0));
    });

    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.change(screen.getByLabelText(/Layer 2 for layer-switch combo/i), {
      target: { value: "SHIFT" },
    });

    // Tap the OSK mock (always taps "K_E") to pick the base key instead of
    // using the dropdown.
    fireEvent.click(screen.getByRole("button", { name: "tap-K_E" }));

    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT RALT K_E]",
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
// P1/P2 regression — companion proposal tracked by assignment identity, not
// by re-matching target/scope, and invalidated when the base assignment it
// refers to is removed. Reproduces: swap-assign a caps-handling key (banner
// up) -> apply a SECOND, unrelated mechanism for the same char -> confirm
// must replace the ORIGINAL base swap, not the second mechanism, and must
// not leave two assignments emitting conflicting [CAPS K_Q] lines.
//
// NOTE: reads Phase C assignments directly (mirrors the component's own
// `sessionAssignments`, see the comment at its definition) rather than the
// store's merged `session.assignments` view — the merge is last-wins per
// (modality, scope, target) and would collapse the two coexisting θ
// mechanisms these tests need to distinguish.
// ---------------------------------------------------------------------------

function getPhaseCPhysicalAssignments(): MechanismAssignment[] {
  const phaseResults = useWorkingCopyStore.getState().phaseResults;
  return (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
    (a) => a.modality === "physical",
  );
}

describe("MechanismGallery — companion proposal identity tracking (P1/P2 regression)", () => {
  it("confirming the companion after a second mechanism was applied replaces only the original base swap", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // 1. Apply the base swap on the CAPS-handling key K_Q — raises the
    //    companion banner and records the NCAPS/CAPS base pair.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: "K_Q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // 2. Apply a SECOND, unrelated mechanism for the same char (θ) while the
    //    banner is still up — a layer-combo (default generic Alt, no chiral
    //    alt in use) assignment on a different key.
    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: "K_W" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // Banner must still be up — applying an unrelated mechanism does not
    // touch the pending companion proposal.
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // 3. Confirm the companion.
    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of K_Q/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();

    // Exactly two assignments survive: the RAlt mechanism (untouched) and the
    // combined CAPS-as-case-inverter quad (replacing the original base swap).
    // If Finding 1 regressed, the RAlt assignment would be the one replaced
    // (or a third, extra assignment would appear).
    expect(assignments).toHaveLength(2);

    const raltAssignment = assignments.find(
      (a) => a.mechanisms[0]?.patternId === "modifier_as_layer_switch",
    );
    expect(raltAssignment).toBeDefined();
    expect(raltAssignment?.target).toBe("θ");
    expect(raltAssignment?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[ALT K_W]",
    );

    const quadAssignment = assignments.find(
      (a) => a.mechanisms[0]?.patternId === "simple_swap",
    );
    expect(quadAssignment).toBeDefined();
    expect(quadAssignment?.target).toBe("θ");
    expect(quadAssignment?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      [
        "+ [NCAPS K_Q] > U+03B8",
        "+ [NCAPS SHIFT K_Q] > U+0398",
        "+ [CAPS K_Q] > U+0398",
        "+ [CAPS SHIFT K_Q] > U+03B8",
      ].join("\n"),
    );

    // No two recorded assignments emit conflicting [CAPS K_Q] lines — exactly
    // one assignment's kmnRules mentions "[CAPS K_Q]" at all (the quad).
    const withConflictingCapsLine = assignments.filter((a) =>
      (a.mechanisms[0]?.slotValues?.["kmnRules"] ?? "").includes("[CAPS K_Q]"),
    );
    expect(withConflictingCapsLine).toHaveLength(1);
  });

  it("removing the base swap while the banner is up dismisses the companion proposal", async () => {
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
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // Remove the just-applied base swap via its per-method badge.
    const removeBadge = screen.getByRole("button", { name: /^Remove method/i });
    fireEvent.click(removeBadge);

    // The companion banner must be gone — a dead proposal is not offered.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Map Θ to the shift layer/i }),
    ).toBeNull();

    expect(getPhaseCPhysicalAssignments()).toHaveLength(0);
  });

  it("stale-guard: confirming a companion whose base assignment vanished via an unaudited mutation path records nothing", async () => {
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
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // Simulate a hypothetical future mutation path that touches
    // sessionAssignments WITHOUT going through handleRemoveCovered /
    // handleRemoveMechanism (which proactively dismiss the banner) — direct
    // store mutation bypassing the component's own handlers entirely. The
    // component's pendingCompanion state is untouched by this, so the banner
    // remains visible in the DOM, exercising the confirm-time staleness
    // re-check (handleCompanionConfirm) rather than the removal-time
    // dismissal.
    await act(async () => {
      useWorkingCopyStore.getState().recordAssignments([]);
    });
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of K_Q/i }),
    );

    // Nothing was recorded — the stale proposal was dismissed, not applied.
    expect(getPhaseCPhysicalAssignments()).toHaveLength(0);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
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

// ---------------------------------------------------------------------------
// "Enter my own character..." custom key option + U+ notation in character
// boxes — feature coverage for the key-picker dropdowns (S-01 swap, S-08
// ralt, S-02 deadkey trigger) and the seqFirst/seqSecond/deadkeyBaseLetter
// character boxes.
// ---------------------------------------------------------------------------

describe("MechanismGallery — custom key option (S-01 swap)", () => {
  it("selecting 'Enter my own character...' reveals a custom text input", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    expect(
      screen.getByLabelText(/Custom character for simple swap key/i),
    ).toBeTruthy();
  });

  it("a custom literal character resolves to a vkey and Apply records the mapped key", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "z" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_Z] > U+1E91",
    );
  });

  it("custom U+ notation resolves through to the mapped key and shows the resolved character", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "U+007A" },
    });
    // Feedback line shows the raw notation, the resolved char, and the vkey.
    expect(screen.getByText("U+007A → z → K_Z")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ẑ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_Z] > U+1E91",
    );
  });

  it("an unmappable custom character shows an error and blocks Apply", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "é" },
    });
    expect(
      screen.getByText(/Cannot map 'é' to a physical key — pick a key from the list instead\./i),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("invalid U+ notation blocks Apply", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "U+ZZZZ" },
    });
    expect(screen.getByText(/Not a valid Unicode value/i)).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("tapping a key in the OSK preview while custom mode is active exits custom mode and clears the stale custom text", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      // Flush the patterns-loading microtasks so GalleryPreviewWithPatterns
      // (and the mocked OSKFrame's tap button) mounts.
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    expect(
      screen.getByLabelText(/Custom character for simple swap key/i),
    ).toBeTruthy();

    // Type some (possibly-invalid) custom text before the tap — this is the
    // stale state that must NOT survive a tap-to-select.
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "zz" },
    });

    // The OSKFrame mock's "tap-K_E" button simulates an OSK key tap.
    fireEvent.click(screen.getByRole("button", { name: "tap-K_E" }));

    // Custom mode is exited — the select now shows K_E and the custom input
    // is gone.
    expect(
      screen.queryByLabelText(/Custom character for simple swap key/i),
    ).toBeNull();
    expect(
      (screen.getByLabelText(/Physical key for simple swap/i) as HTMLSelectElement).value,
    ).toBe("K_E");

    // Re-opening "Enter my own character..." starts clean — the paired
    // custom-char state was cleared by the tap, not left stale from before.
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    expect(
      (screen.getByLabelText(/Custom character for simple swap key/i) as HTMLInputElement).value,
    ).toBe("");
  });
});

describe("MechanismGallery — custom key option (S-02 deadkey trigger)", () => {
  it("a custom trigger character maps to its vkey, and deadkeyName/accentChar never fall back to 'dead0'", async () => {
    // "a" is not one of the 4 built-in DEADKEY_OPTIONS trigger keys, so this
    // exercises the custom-trigger path exclusively — deadkeyNameFor(triggerKey)
    // would otherwise return the "dead0" fallback for an unrecognised key id.
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Trigger key for deadkey/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ā/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    const slotValues = assignments[0]?.mechanisms[0]?.slotValues;
    expect(slotValues?.["triggerKey"]).toBe("K_A");
    expect(slotValues?.["deadkeyName"]).toBe("0061");
    expect(slotValues?.["accentChar"]).toBe("a");
    expect(slotValues?.["deadkeyName"]).not.toBe("dead0");
  });
});

describe("MechanismGallery — U+ notation in character boxes (S-03 sequence)", () => {
  it("U+ notation typed into a sequence key box resolves to the actual character on Apply", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "U+0041" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for x/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues).toMatchObject({
      firstLetterOut: "A",
      secondLetter: "b",
    });
  });

  it("invalid U+ notation in a sequence key box blocks Apply", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "U+ZZZZ" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Delimiter guard (P0) — ASCII straight quotes can't be resolved output
// characters in seqFirst/seqSecond/deadkeyBaseLetter or the deadkey-trigger
// custom character (all substitute into an unescaped KMN string literal or
// JSON block). The SWAP/RALT custom-character key pickers are unaffected —
// they resolve only to a K_ vkey id.
// ---------------------------------------------------------------------------

describe("MechanismGallery — delimiter guard (straight quotes)", () => {
  it("blocks Apply and shows the steer-to-U+02BC message when a sequence box resolves to a straight apostrophe", async () => {
    seedInventory(["x"]);
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
    expect(
      screen.getByText(/Straight quotes \(' or "\) can't be typed here\. For a glottal stop or saltillo, use U\+02BC or U\+2019\./i),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks Apply when a sequence box resolves to a straight double quote", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: '"' },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not block a glottal stop written as U+02BC", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "U+02BC" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks Apply when the deadkey base-letter box resolves to a straight apostrophe", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "'" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks Apply and shows the steer-to-U+02BC message when the deadkey CUSTOM TRIGGER character resolves to a straight quote", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Trigger key for deadkey/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: '"' },
    });
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a" },
    });
    expect(
      screen.getByText(/Straight quotes \(' or "\) can't be typed here\. For a glottal stop or saltillo, use U\+02BC or U\+2019\./i),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("a straight apostrophe in the SWAP custom-character picker still maps to K_QUOTE and is NOT blocked", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "'" },
    });
    // Bidirectional reflection (Fix 2): a literal custom key char now also
    // shows its U+ value, ahead of the resolved vkey.
    expect(screen.getByText("' → U+0027 → K_QUOTE")).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_QUOTE] > U+1E91",
    );
  });
});

// ---------------------------------------------------------------------------
// NFC normalization (P1) — a decomposed paste collapses to its precomposed
// form before it lands in slotValues, matching the deadkey patterns' NFC
// convention.
// ---------------------------------------------------------------------------

describe("MechanismGallery — NFC normalization of character boxes", () => {
  it("normalizes a decomposed sequence-box paste to its precomposed stored value", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    // "e" + U+0301 COMBINING ACUTE ACCENT — decomposed input.
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "é" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for x/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["firstLetterOut"]).toBe("é");
  });
});

// ---------------------------------------------------------------------------
// Single-grapheme guard (P1) — seqSecond/deadkeyBaseLetter accept exactly
// one grapheme cluster; seqFirst (the sequence's left-context box) was
// RELAXED to accept multiple graphemes (a digraph/trigraph left context is
// valid .kmn) — see the "relaxed multi-character context" describe block
// below for seqFirst's acceptance and the multi-token compose cases.
// ---------------------------------------------------------------------------

describe("MechanismGallery — single-grapheme guard on character boxes", () => {
  it("accepts a single astral (SMP) character in a sequence box", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "\u{1D400}" }, // MATHEMATICAL BOLD CAPITAL A — one code point
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("rejects a two-grapheme literal paste in the SECOND sequence box (the keystroke side)", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "bc" },
    });
    expect(
      screen.getByText(
        "A single keystroke produces one character — enter one character (you can compose it from U+ parts).",
      ),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("rejects a two-character literal paste in the deadkey base-letter box with the 'coming later' reason", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "ab" },
    });
    expect(
      screen.getByText(
        "Enter one base character. (Covering several base letters with one dead key is coming later.)",
      ),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("accepts a base+combining sequence with a precomposed NFC form (n + U+0303 -> ñ) in the deadkey base-letter box", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    // "n" + U+0303 COMBINING TILDE precomposes under NFC to the single code
    // point U+00F1 (ñ) — one grapheme either way.
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "ñ" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Relaxed multi-character context (the headline feature) — seqFirst accepts
// several graphemes (a digraph/trigraph left context, e.g. "ng", "gb"), and
// all three character boxes accept space-separated multi-token compose (each
// token independently resolved, then concatenated + NFC-normalized).
// ---------------------------------------------------------------------------

describe("MechanismGallery — relaxed multi-character context (seqFirst) and multi-token compose", () => {
  it("accepts a two-character context in seqFirst and records it verbatim in firstLetterOut", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "ng" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues).toMatchObject({
      firstLetterOut: "ng",
      secondLetter: "b",
    });
  });

  it("resolves a space-separated multi-token compose in seqFirst (context box)", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "U+006E U+0303" }, // "n" + combining tilde -> NFC -> "n with tilde"
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for x/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["firstLetterOut"]).toBe("ñ");
  });

  it("accepts a U+-composed single grapheme in the seqSecond box (keystroke side)", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "U+006E U+0303" }, // composes to one grapheme: "n with tilde"
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["secondLetter"]).toBe("ñ");
  });

  it("accepts a U+-composed single grapheme in the deadkey base-letter box", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "U+006E U+0303" }, // composes to one grapheme: "n with tilde"
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("rejects a two-token compose that does NOT collapse to one grapheme in the deadkey base-letter box", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a b" }, // two independent tokens, two graphemes
    });
    expect(
      screen.getByText(
        "Enter one base character. (Covering several base letters with one dead key is coming later.)",
      ),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lone-combining-mark caution (P1) — warns but does not block.
// ---------------------------------------------------------------------------

describe("MechanismGallery — lone combining mark caution on the deadkey base-letter box", () => {
  it("shows a caution (does not block Apply) when the base letter is a bare combining mark", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "́" }, // bare COMBINING ACUTE ACCENT
    });
    expect(
      screen.getByText(
        /That looks like a combining mark on its own — the base letter is usually a plain letter\./i,
      ),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not show the caution for a plain base letter", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a" },
    });
    expect(
      screen.queryByText(/That looks like a combining mark on its own/i),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lone-combining-mark caution on the SEQUENCE boxes (P2 QC finding — the
// caution was previously wired only to deadkeyBaseLetter; seqFirst/seqSecond
// are equally single-character boxes).
// ---------------------------------------------------------------------------

describe("MechanismGallery — lone combining mark caution on the sequence boxes", () => {
  it("shows a caution (does not block Apply) when the first sequence key resolves to a bare combining mark", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "́" }, // bare COMBINING ACUTE ACCENT
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    expect(
      screen.getByText(/That looks like a combining mark on its own\./i),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a caution (does not block Apply) when the second sequence key resolves to a bare combining mark", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "́" }, // bare COMBINING ACUTE ACCENT
    });
    expect(
      screen.getByText(/That looks like a combining mark on its own\./i),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for x/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not show the caution for a plain sequence key", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "b" },
    });
    expect(
      screen.queryByText(/That looks like a combining mark on its own/i),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sentinel leak in preview text (P1 QC finding) — the raw "__custom__"
// sentinel must never be interpolated into "Press X, then Y" when the
// deadkey trigger picker is in custom mode but not yet resolved.
// ---------------------------------------------------------------------------

describe("MechanismGallery — no sentinel leak in the deadkey preview line", () => {
  it("shows a neutral placeholder instead of the raw '__custom__' sentinel when custom trigger mode is unresolved", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Trigger key for deadkey/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    // No custom character typed yet — customChar is empty, so
    // resolveKeyPickerSelection resolves to customError, not customOk.
    expect(screen.queryByText(/__custom__/)).toBeNull();
    expect(screen.getByText(/Press \[trigger key\], then/i)).toBeTruthy();
  });

  it("shows a neutral placeholder when the custom trigger character is unmappable (customError)", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Trigger key for deadkey/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: "é" },
    });
    expect(screen.queryByText(/__custom__/)).toBeNull();
    expect(screen.getByText(/Press \[trigger key\], then/i)).toBeTruthy();
  });

  it("shows the resolved character (not the sentinel or placeholder) once the custom trigger resolves", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Trigger key for deadkey/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: "a" },
    });
    expect(screen.queryByText(/__custom__/)).toBeNull();
    expect(screen.queryByText(/\[trigger key\]/)).toBeNull();
    expect(screen.getByText(/Press a, then/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Accessible feedback — live-region roles on custom-input validation
// feedback (P1 QC finding). Screen-reader users must hear an error/success
// hint when it appears while focus stays in the input.
// ---------------------------------------------------------------------------

describe("MechanismGallery — accessible live-region roles on validation feedback", () => {
  it("marks a resolved U+ notation reflection as a polite status region (sequence box)", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByLabelText(/First key in sequence/i), {
      target: { value: "U+0041" },
    });
    const hint = screen.getByText("U+0041 → A");
    expect(hint.getAttribute("role")).toBe("status");
    expect(hint.getAttribute("aria-live")).toBe("polite");
  });

  it("marks an invalid-input error as an alert region (sequence box)", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    // seqFirst (context) now accepts more than one grapheme — exercise the
    // still-single-grapheme seqSecond (keystroke) box instead.
    fireEvent.change(screen.getByLabelText(/Second key in sequence/i), {
      target: { value: "ab" },
    });
    const error = screen.getByText(
      "A single keystroke produces one character — enter one character (you can compose it from U+ parts).",
    );
    expect(error.getAttribute("role")).toBe("alert");
  });

  it("marks the lone-combining-mark caution as a polite status region (deadkey base-letter box)", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "́" }, // bare COMBINING ACUTE ACCENT
    });
    const caution = screen.getByText(
      /That looks like a combining mark on its own — the base letter is usually a plain letter\./i,
    );
    expect(caution.getAttribute("role")).toBe("status");
    expect(caution.getAttribute("aria-live")).toBe("polite");
  });

  it("marks the KeyPickerField custom-resolution reflection as a polite status region (SWAP custom key)", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "z" },
    });
    // Bidirectional reflection (Fix 2): a literal custom key char now also
    // shows its U+ value, ahead of the resolved vkey.
    const hint = screen.getByText("z → U+007A → K_Z");
    expect(hint.getAttribute("role")).toBe("status");
    expect(hint.getAttribute("aria-live")).toBe("polite");
  });

  it("marks the KeyPickerField custom-resolution error as an alert region (SWAP custom key)", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    fireEvent.change(screen.getByLabelText(/Custom character for simple swap key/i), {
      target: { value: "é" },
    });
    const error = screen.getByText(
      /Cannot map 'é' to a physical key — pick a key from the list instead\./i,
    );
    expect(error.getAttribute("role")).toBe("alert");
  });
});

// ---------------------------------------------------------------------------
// No in-box placeholders (Fix 1) — placeholder text was distracting inside
// the character boxes and the KeyPickerField custom-character inputs.
// Guidance now lives OUTSIDE the box: one caption near the method chooser
// (character boxes) and one line inside KeyPickerField shown only while its
// custom-input mode is active.
// ---------------------------------------------------------------------------

describe("MechanismGallery — no in-box placeholders (Fix 1)", () => {
  it("the sequence boxes carry no placeholder attribute", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    expect(screen.getByLabelText(/First key in sequence/i).getAttribute("placeholder")).toBeNull();
    expect(screen.getByLabelText(/Second key in sequence/i).getAttribute("placeholder")).toBeNull();
  });

  it("the deadkey base-letter box carries no placeholder attribute", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    expect(screen.getByLabelText(/Base letter for deadkey/i).getAttribute("placeholder")).toBeNull();
  });

  it("the SWAP custom key input carries no placeholder attribute", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    const input = screen.getByLabelText(/Custom character for simple swap key/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("the RALT custom key input carries no placeholder attribute", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Layer \+ key/i));
    fireEvent.change(screen.getByLabelText(/Base key for layer-switch combo/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    const input = screen.getByLabelText(/Custom character for layer-switch combo base key/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("the deadkey trigger custom input carries no placeholder attribute", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Trigger key for deadkey/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    const input = screen.getByLabelText(/Custom trigger character for deadkey/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("shows a single character-box help caption near the method chooser, not repeated per box", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Type a sequence/i));
    expect(
      screen.getAllByText(
        "Type a character, or a Unicode value like U+00E9. The first (context) box accepts more than one character; combine parts with spaces, e.g. U+006E U+0303.",
      ),
    ).toHaveLength(1);
  });

  it("shows the unrelated KeyPickerField custom-input help line only once custom mode is active (SWAP key)", async () => {
    // Fix 1's method-chooser caption (CHAR_BOX_HELP_TEXT) and KeyPickerField's
    // own custom-input help line (CUSTOM_INPUT_HELP_TEXT) are two DIFFERENT
    // constants with different copy since the sequence/deadkey character
    // boxes were relaxed to multi-token/multi-character — only the
    // KeyPickerField line (unaffected: the key-picker custom-char path stays
    // single-character) should appear once custom mode activates.
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    expect(
      screen.queryByText("Type a character directly, or a Unicode value like U+00E9."),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText(/Physical key for simple swap/i), {
      target: { value: CUSTOM_KEY_OPTION_VALUE },
    });
    expect(
      screen.getAllByText("Type a character directly, or a Unicode value like U+00E9."),
    ).toHaveLength(1);
  });
});
