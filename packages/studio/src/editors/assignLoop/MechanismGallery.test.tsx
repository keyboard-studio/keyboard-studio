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
//   - Default method per character is "swap" (S-01), except a decomposable
//     accented char defaults to "deadkey" (S-02) — see §3c propose-then-
//     confirm. Selecting "Type a sequence" (S-03) swaps the RIGHT pane's live
//     preview for SequenceBuilderPanel; that panel's own Apply records a real
//     multi_char_sequence MechanismAssignment and hands control back
//     (method -> "swap"), never counted as "added"/covered (a distinct
//     "Sequences" dimension — see excludeSequenceMechanisms in the component).
//   - Added chip row appears; chips invoke remove (filters assignment from store).
//   - Already-produced section collapsed by default; toggle expands it.
//   - Guards: null base → no-base prompt; empty inventory → survey prompt.

import { describe, it, expect, afterEach, vi, beforeEach, beforeAll } from "vitest";
import { screen, fireEvent, act, cleanup, waitFor, within, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../../test/renderWithI18n.tsx";
import {
  MechanismGallery,
  PATTERN_SEQUENCE,
  PATTERN_DEADKEY,
  PATTERN_SWAP,
} from "./MechanismGallery.tsx";
import { usePositionalCharNav } from "./usePositionalCharNav.ts";
import { useWorkingCopyStore, bindManifest } from "../../stores/workingCopyStore.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
import { charToPositionToken } from "../../lib/stepWalk.ts";
import {
  MECHANISMS_STEP_ID,
  TOUCH_STEP_ID,
  applyStepCompletion,
  type ReducerDeps,
} from "../../steps/reducer.ts";
import type { EditorStep, Step } from "../../steps/types.ts";
import type { Pattern, PatternLibraryService, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS, irPath, ARRAY_INDEX, makePlacementMap } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import { corpusBackedQwerty } from "@keyboard-studio/contracts/fixtures";
import type { PatternMatch } from "@keyboard-studio/contracts";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import type { MechanismAssignment, IRGroup, IRRule, IRStore, PlacementMap } from "@keyboard-studio/contracts";
import type { CharContributors } from "@keyboard-studio/engine";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { changeSelectMenu, selectMenuValue, selectMenuOptionValues } from "../../test/selectMenuTestUtils.ts";
import { installDialogShim } from "../../test/dialogShim.ts";

// ---------------------------------------------------------------------------
// vi.hoisted() — variables referenced inside vi.mock() factory closures.
// ---------------------------------------------------------------------------

const { applyAssignmentsToVfsSpy, collectCharContributorsSpy } = vi.hoisted(() => {
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
  // Wraps the REAL collectCharContributors by default (set in the vi.mock
  // factory below, which has `original` in scope) — every existing test is
  // unaffected. The SHOW-ALL floor-row test overrides this for one call only
  // to simulate an unrecognized-shape producer collectCharContributors can't
  // attribute at all, without needing to construct a real IR edge case for it.
  const collectCharContributorsSpy = vi.fn();
  return { applyAssignmentsToVfsSpy, collectCharContributorsSpy };
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

// Synchronous counterpart of mockSvc.getById (same three well-known ids) —
// needed by useInventoryDiff's buildSessionProducedSet call, which resolves
// patterns synchronously inside a useMemo, not via the async service.
function mockGetPatternByIdSync(id: string): Pattern | undefined {
  if (id === latinDeadkeyAcuteSingle.id) return latinDeadkeyAcuteSingle;
  if (id === PATTERN_SEQUENCE || id === PATTERN_DEADKEY) {
    return {
      ...latinDeadkeyAcuteSingle,
      id,
      title: id === PATTERN_SEQUENCE ? "Multi-char sequence" : "Deadkey single tap",
    };
  }
  return undefined;
}

vi.mock("../../lib/services.ts", () => ({
  getPatternLibraryService: () => mockSvc,
  getPatternByIdSync: mockGetPatternByIdSync,
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
  collectCharContributorsSpy.mockImplementation(
    (ir: Parameters<typeof original.collectCharContributors>[0], ch: string) =>
      original.collectCharContributors(ir, ch),
  );
  return {
    ...original,
    applyAssignmentsToVfs: applyAssignmentsToVfsSpy,
    collectCharContributors: collectCharContributorsSpy,
  };
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

// jsdom does not implement HTMLDialogElement.showModal()/close() — shared
// shim (test/dialogShim.ts); see that module for rationale. Needed here
// because the leave-warning modal (ConfirmDialog) now mounts whenever the
// whole-inventory unimplemented-characters check finds a gap.
beforeAll(installDialogShim);

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
    // The "Add a key" eyebrow still renders above the CharScrollStrip.
    expect(screen.getByText("Add a key")).toBeTruthy();
    // The CharScrollStrip's selected chip is "á" (aria-pressed + "Go to U+00E1 á").
    expectCurrentChar("á");
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
      const status = screen.getByRole("status");
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

    // The coverage line excludes it: 0 of 2, not 1 of 2.
    await waitFor(() => {
      const status = screen.getByRole("status");
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
// Apply + Next — the component does NOT auto-advance after Apply.
// The user must click "Next character →" (or "All done →") to move forward.
// ---------------------------------------------------------------------------

describe("MechanismGallery — advance after apply", () => {
  it("advances to the next character after Apply and then Next are clicked", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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
      expectCurrentChar("é");
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
      expectCurrentChar("é");
    });

    // Skipping recorded nothing, so coverage is unchanged.
    expect(
      screen.getByRole("status", { name: "0 of 2 added" }).getAttribute("aria-label"),
    ).toBe("0 of 2 added");

    // Navigating back to the skipped-over "á": it is NOT treated as resolved —
    // Next stays disabled until it is actually applied.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("á");
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

  it("skipping the only (last) character opens the leave-warning modal, then completes via \"Come back later\"", async () => {
    // Skip on the last position is itself the phase completion attempt —
    // positional Skip advances by one position, or finishes if there is no
    // next position, exactly like Next/Done. "á" was skipped (never applied),
    // so it is unimplemented — the whole-inventory leave-warning modal opens
    // instead of completing immediately; "Come back later" defers and
    // completes anyway.
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
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Come back later/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Leave-warning modal — open/closed state + the "Go back and finish" (stay)
// path, and the Back-button-does-not-trigger-it guard. The "Come back later"
// (defer) path is covered above; this suite closes the gap on the modal's
// OTHER outcomes and on the dialog's actual open/closed state (queried via
// the native <dialog> element's `open` attribute, not just button presence —
// ConfirmDialog always renders both buttons regardless of `open`, so a bare
// button-exists query cannot distinguish "modal is showing" from "modal is
// mounted but closed").
// ---------------------------------------------------------------------------

describe("MechanismGallery — leave-warning modal open/closed state", () => {
  it("does NOT open the dialog when Done completes with every character implemented", async () => {
    const onComplete = vi.fn();
    seedInventory(["á"]);
    const { container } = await act(async () =>
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />,
      ),
    );
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    await waitFor(() => {
      const doneBtn = screen.getByRole("button", { name: "Done" });
      expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(doneBtn);
    });
    // Completed directly — the dialog never opened.
    expect(onComplete).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);
  });

  it("opens the dialog (native <dialog open> attribute) when forward-completing with an unimplemented character", async () => {
    seedInventory(["á"]);
    const { container } = await act(async () =>
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  });

  it('"Go back and finish" (primary) closes the dialog and does NOT complete — the author stays in the gallery able to finish "á"', async () => {
    const onComplete = vi.fn();
    seedInventory(["á"]);
    const { container } = await act(async () =>
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Go back and finish/i }));

    // No advance — onComplete never fires, and the dialog is closed again.
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);
    // Still on "á", with the Apply control still available to actually finish it.
    expectCurrentChar("á");
    expect(screen.getByRole("button", { name: /Apply method for á/i })).toBeTruthy();
  });

  it("Escape (the native <dialog> cancel event) does NOT proceed — it stays in the gallery, same as \"Go back and finish\" (P1(a))", async () => {
    const onComplete = vi.fn();
    seedInventory(["á"]);
    const { container } = await act(async () =>
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    const dialog = container.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);

    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    // Escape must map to the STAY action, not the "Come back later" defer —
    // onComplete must never fire from a dismissal.
    expect(onComplete).not.toHaveBeenCalled();
    expect(dialog.hasAttribute("open")).not.toBe(true);
    expectCurrentChar("á");
  });

  it("the ← back button never opens the leave-warning modal, even while characters remain unimplemented", async () => {
    const onBack = vi.fn();
    seedInventory(["á", "é"]);
    const { container } = await act(async () =>
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} onComplete={vi.fn()} />,
      ),
    );
    // Advance to "é" (idx 1) without implementing "á" — Skip is pure forward nav.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);

    // Navigate backward through both (still-unimplemented) characters via
    // the Back control — this is a DIFFERENT control from the forward
    // Done/Skip-on-last path that triggers the modal, and must never open it.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("á");
    });
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);
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
// "Existing methods" SHOW-ALL — composition row + unattributed floor
// (spec follow-up: every green-badged character must render >= 1 row).
// ---------------------------------------------------------------------------

describe("MechanismGallery — Existing methods SHOW-ALL (composition + floor)", () => {
  it("a composable-but-not-directly-produced char (base + combining mark both produced) shows a GREEN, static composition row — it PRODUCES the char, it just has no single rule to delete", async () => {
    // 'U' and combining circumflex accent (U+0302) are each directly produced
    // by their own rule; precomposed 'Û' (U+00DB) is produced by neither —
    // only reachable via NFD composition of the two.
    const ruleU: IRRule = {
      nodeId: "r-U",
      context: [{ kind: "vkey", name: "K_U", modifiers: [] }],
      output: [{ kind: "char", value: "U" }],
    };
    const ruleCircumflex: IRRule = {
      nodeId: "r-circumflex",
      context: [{ kind: "vkey", name: "K_6", modifiers: ["SHIFT"] }],
      output: [{ kind: "char", value: "̂" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleU, ruleCircumflex],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    // "z" stays in lettersToAdd (not produced at all); "Û" is composable, so
    // useInventoryDiff folds it into alreadyProduced (green badge) even
    // though the base never literally produces it.
    seedInventory(["z", "Û"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Jump to "Û" via its char-scroll-strip chip (U+00DB) — reachable even
    // though it's outside lettersToAdd's positional walk (handleSelectDisplayChar
    // jumps to any confirmedInventory member for inspection).
    fireEvent.click(screen.getByTestId("char-scroll-chip-00DB"));

    let compositionRow: HTMLElement;
    await waitFor(() => {
      compositionRow = screen.getByText("U + ◌̂ → Û - NOT DELETABLE");
      expect(compositionRow).toBeTruthy();
    });
    // GREEN (produced), not blue — composition rows produce the character;
    // color tracks produced-vs-used, not deletability.
    expect(compositionRow!.style.color).toBe("rgb(86, 211, 100)"); // #56d364
    expect(compositionRow!.style.backgroundColor).toBe("rgb(13, 34, 24)"); // #0d2218
    // Static: a <span>, not a <button> — no delete affordance at all.
    expect(compositionRow!.tagName).toBe("SPAN");
    expect(compositionRow!.textContent).toBe("U + ◌̂ → Û - NOT DELETABLE"); // real path + suffix, no "×"
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
    ).toBeNull();
  });

  it("a blocked (opaque/multi-char) row is GREEN and static — it PRODUCES the char, it just can't be surgically removed", async () => {
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
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() => ({
      targetChar: "z",
      ruleNodeIds: [],
      storeSlotIds: [],
      storeSlots: [],
      locations: [],
      blocked: [{ reason: "multi-char literal output", label: "g-main / r-z" }],
      descriptors: [
        {
          kind: "blocked",
          producedChar: "z",
          producedRole: "produced",
          blockedReasonCode: "multi-char-output",
        },
      ],
    }));

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let blockedRow: HTMLElement;
    await waitFor(() => {
      blockedRow = screen.getByText("Bundled with other output — can't remove z alone - NOT DELETABLE");
      expect(blockedRow).toBeTruthy();
    });
    expect(blockedRow!.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — GREEN, not blue
    expect(blockedRow!.style.backgroundColor).toBe("rgb(13, 34, 24)"); // #0d2218
    expect(blockedRow!.tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
    ).toBeNull();
  });

  it("a green char (directly produced) with zero enumerable methods shows the unattributed floor row, GREEN and static", async () => {
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

    // "y" stays in lettersToAdd (starting currentChar); "z" is directly
    // produced (green) via ruleZ above.
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Override collectCharContributors for exactly the NEXT call (currentChar
    // switching to "z" below) — simulates an unrecognized-shape producer that
    // genuinely can't be attributed, while "z" stays green (buildProducedSet,
    // unmocked, still finds it via ruleZ).
    collectCharContributorsSpy.mockImplementationOnce(() => ({
      targetChar: "z",
      ruleNodeIds: [],
      storeSlotIds: [],
      storeSlots: [],
      locations: [],
      blocked: [],
      descriptors: [],
    }));

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let floorRow: HTMLElement;
    await waitFor(() => {
      floorRow = screen.getByText(
        "Your keyboard already produces this character. - NOT DELETABLE",
      );
      expect(floorRow).toBeTruthy();
    });
    expect(floorRow!.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — GREEN, not blue
    expect(floorRow!.style.backgroundColor).toBe("rgb(13, 34, 24)"); // #0d2218
    expect(floorRow!.tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// "Existing methods" curation — Rule 1 (keystroke rows dropped when a
// PRODUCED store-slot row already covers the char) and Rule 2 (a
// producedRole "used" contributor renders blue and static — the ONE row kind
// that is never deletable AND never green, since it never produces the
// char at all; see the color-model describe block further below for the
// full three-state matrix).
// ---------------------------------------------------------------------------

describe("MechanismGallery — Existing methods curation (producedRole + keystroke-drop)", () => {
  function baseContributors(
    overrides: Partial<CharContributors>,
  ): CharContributors {
    return {
      targetChar: "z",
      ruleNodeIds: [],
      storeSlotIds: [],
      storeSlots: [],
      locations: [],
      blocked: [],
      descriptors: [],
      ...overrides,
    };
  }

  it("a char with a keystroke producer AND a produced store-slot: the keystroke row is dropped, the store-slot row is kept", async () => {
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
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() =>
      baseContributors({
        ruleNodeIds: ["r-z"],
        storeSlotIds: ["sid-alpha#25"],
        storeSlots: [{ slotId: "sid-alpha#25", role: "output" }],
        descriptors: [
          { kind: "keystroke", producedChar: "z", producedRole: "produced", keystrokeDisplay: "Z" },
          {
            kind: "store-slot",
            producedChar: "z",
            producedRole: "produced",
            storeDisplayName: "Alphabet",
          },
        ],
      }),
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    await waitFor(() => {
      expect(screen.getByText("One of your Alphabet keys → z")).toBeTruthy();
    });
    expect(screen.queryByText("Press Z → z")).toBeNull();
  });

  it("a char whose ONLY producer is a keystroke (no produced store-slot): the keystroke row is kept, GREEN, with a working delete affordance (× + click-to-remove)", async () => {
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
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() =>
      baseContributors({
        ruleNodeIds: ["r-z"],
        descriptors: [
          { kind: "keystroke", producedChar: "z", producedRole: "produced", keystrokeDisplay: "Z" },
        ],
      }),
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let deleteButton: HTMLElement;
    await waitFor(() => {
      deleteButton = screen.getByRole("button", {
        name: /Remove existing method Press Z → z for z/i,
      });
      expect(deleteButton).toBeTruthy();
    });
    // GREEN, and it genuinely carries the delete affordance — the "×" glyph
    // plus a working onClick, not just the right color.
    expect(deleteButton!.style.color).toBe("rgb(86, 211, 100)"); // #56d364
    expect(deleteButton!.style.backgroundColor).toBe("rgb(13, 34, 24)"); // #0d2218
    expect(deleteButton!.textContent).toContain("×");
    fireEvent.click(deleteButton!);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: /Remove existing method Press Z → z for z/i,
        }),
      ).toBeNull();
    });
  });

  it('a producedRole "used" contributor renders BLUE and static — informational only, never a delete target', async () => {
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
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() =>
      baseContributors({
        storeSlotIds: ["sid-dkf#0"],
        storeSlots: [{ slotId: "sid-dkf#0", role: "input" }],
        descriptors: [{ kind: "deadkey", producedChar: "z", producedRole: "used" }],
      }),
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let usedRow: HTMLElement;
    await waitFor(() => {
      usedRow = screen.getByText("Part of a two-step combination → z - NOT DELETABLE");
      expect(usedRow).toBeTruthy();
    });
    // BLUE — this row only USES "z" as input (a deadkey base), it never
    // produces it, so it gets the one color reserved for "used" rows.
    expect(usedRow!.style.color).toBe("rgb(88, 166, 255)"); // #58a6ff
    expect(usedRow!.style.backgroundColor).toBe("rgb(28, 42, 58)"); // #1c2a3a
    expect(usedRow!.tagName).toBe("SPAN");
    // A "used" contributor is never a removal target for this char — no
    // delete button, same treatment as composition/unattributed/blocked.
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
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

// The old "« Previous character" button (data-testid "mechanisms-prev-char")
// only ever stepped back exactly one position; it was replaced by
// CharScrollStrip (data-testid "char-scroll-strip"), which offers ONE chip
// per lettersToAdd character (data-testid "char-scroll-chip-<HEX>", where
// <HEX> is every codepoint of the grapheme, 4+-digit uppercase hex,
// hyphen-joined — see CharScrollStrip.tsx's file header) and lets the author
// jump to ANY of them, forward or backward, via handleSelectChar. These
// tests exercise that replacement contract directly rather than deleting the
// navigation coverage.
describe("MechanismGallery — character-scroll-strip navigation", () => {
  it("renders the char-scroll-strip with one chip per lettersToAdd character", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-00E1")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-00E9")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-00ED")).toBeTruthy();
  });

  it("orders a lowercase letter immediately before its uppercase counterpart, not in first-appearance order (spec 047 collateCompare reuse)", async () => {
    // Seeded UPPERCASE-first (the old first-appearance order the gallery
    // used to render in) — the collated display/walk order must not follow
    // it: "a" must render before "A", and "e" before "E".
    seedInventory(["A", "a", "E", "e"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const chipOrder = within(strip)
      .getAllByRole("button")
      .map((btn) => btn.getAttribute("data-testid"));

    const lowerAIdx = chipOrder.indexOf("char-scroll-chip-0061"); // "a"
    const upperAIdx = chipOrder.indexOf("char-scroll-chip-0041"); // "A"
    const lowerEIdx = chipOrder.indexOf("char-scroll-chip-0065"); // "e"
    const upperEIdx = chipOrder.indexOf("char-scroll-chip-0045"); // "E"
    expect(lowerAIdx).toBeGreaterThanOrEqual(0);
    expect(upperAIdx).toBeGreaterThanOrEqual(0);
    expect(lowerEIdx).toBeGreaterThanOrEqual(0);
    expect(upperEIdx).toBeGreaterThanOrEqual(0);
    expect(lowerAIdx).toBeLessThan(upperAIdx);
    expect(lowerEIdx).toBeLessThan(upperEIdx);

    // The Back/Next walk (usePositionalCharNav) reflects the same collated
    // order: mount lands on the first character in that order, "a".
    expectCurrentChar("a");
  });

  it("clicking an earlier character's chip moves back to it, ungated by intermediate implementation status", async () => {
    const onBack = vi.fn();
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />,
      );
    });

    // Advance to "é" (idx 1) via Apply + Next — "í" stays untouched.
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

    // Click the chip for "á" (the earlier, already-implemented character)
    // while sitting on "é" — must jump straight back to it.
    fireEvent.click(screen.getByTestId("char-scroll-chip-00E1"));

    // Landed back on "á" (idx 0) — the phase was NOT exited.
    await waitFor(() => {
      expectCurrentChar("á");
    });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("clicking a later character's chip moves forward to it too — the old prev-only button could never do this", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Starting on "á" (idx 0) — jump straight to "í" (idx 2, the last
    // character), skipping over "é" entirely without visiting it.
    expectCurrentChar("á");
    fireEvent.click(screen.getByTestId("char-scroll-chip-00ED"));

    await waitFor(() => {
      expectCurrentChar("í");
    });
  });

  it("the char-scroll-strip stays rendered — and its chips stay clickable — when the desktop layout is locked", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />,
      );
    });
    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();

    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });

    // Unlike the removed prev-char button (which disappeared entirely once
    // locked), the scroll strip is navigation, not editing — it must survive
    // the lock, and the locked-forward-escape button takes over the primary
    // forward slot alongside it (not in place of it).
    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();
    expect(screen.getByTestId("mechanisms-continue")).toBeTruthy();

    fireEvent.click(screen.getByTestId("char-scroll-chip-00ED"));
    await waitFor(() => {
      expectCurrentChar("í");
    });
  });
});

// ---------------------------------------------------------------------------
// usePositionalCharNav.handleSelectChar — not-found no-op (the branch the
// UI-level chip-click tests above can never reach, since CharScrollStrip
// only ever offers chips drawn from the SAME `list` handleSelectChar checks
// against). Exercised directly against the hook rather than through
// MechanismGallery/TouchGallery — there is no dedicated
// usePositionalCharNav.test.ts(x) file, so this lands beside the gallery
// suite that most directly depends on handleSelectChar's contract (the
// character-scroll-strip navigation tests immediately above).
// ---------------------------------------------------------------------------

describe("usePositionalCharNav — handleSelectChar not-found no-op", () => {
  it("leaves currentChar/currentIdx genuinely unchanged when called with a character not in `list`", () => {
    const list = ["á", "é", "í"] as const;
    let currentChar: string | null = "é";
    const setCurrentChar = vi.fn((c: string | null) => {
      currentChar = c;
    });

    const { result } = renderHook(() =>
      usePositionalCharNav({
        list,
        currentChar,
        setCurrentChar,
      }),
    );

    // Sitting on "é" (idx 1) before the no-op call.
    expect(result.current.currentIdx).toBe(1);

    act(() => {
      result.current.handleSelectChar("z"); // not present in `list`
    });

    // The guard (`if (!list.includes(char)) return;`) must fire BEFORE
    // setCurrentChar is invoked — asserting the setter was never called
    // (rather than merely re-checking currentIdx, which could stay 1 by
    // coincidence if setCurrentChar were called with the same value) is what
    // makes this fail if the not-found guard is ever removed or the
    // `!list.includes` check is inverted.
    expect(setCurrentChar).not.toHaveBeenCalled();
    // The external state this test's setter closure would have mutated is
    // still exactly what it started as — the selection genuinely did not move.
    expect(currentChar).toBe("é");
    expect(result.current.currentIdx).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Producer-count badge (CharScrollStrip Part 2) — integration coverage.
//
// CharScrollStrip.test.tsx already unit-tests the badge in isolation (a
// hand-built `assignments` prop). This closes the gap that isolation leaves:
// it proves the badge MechanismGallery actually renders is wired to THIS
// gallery's real store-backed `session.assignments` (via the same
// `sessionAssignments` prop the "apply (deadkey)" describe block above
// asserts against) and the "physical" modality — not a stray/constant array.
// A swapped `assignments` array or wrong `modality` at the
// MechanismGallery -> CharScrollStrip call site would slip past
// CharScrollStrip.test.tsx alone but must fail here.
// ---------------------------------------------------------------------------

describe("MechanismGallery — character-scroll-strip producer badge (integration)", () => {
  it("the current char's badge starts RED at 0, then GREEN at 1 after a real Apply records the assignment", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const badgeBefore = within(strip).getByTestId("char-scroll-badge-00E1");
    expect(badgeBefore.textContent).toBe("0");
    expect(badgeBefore.style.color).toBe("rgb(248, 81, 73)"); // #f85149 — badge-bad color

    // "á" defaults to the pre-enabled deadkey method (§3c) — apply directly,
    // the same real Apply flow the "apply (deadkey)" describe block above
    // drives, so this test exercises the actual store write
    // (session.assignments), not a hand-built MechanismAssignment.
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    await waitFor(() => {
      const badgeAfter = within(screen.getByTestId("char-scroll-strip")).getByTestId(
        "char-scroll-badge-00E1",
      );
      expect(badgeAfter.textContent).toBe("1");
      expect(badgeAfter.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — badge-good color
    });
  });

  // Regression pin for the reported gap: the badge must reflect SESSION-
  // AWARE composability (useInventoryDiff's `producedSet`, augmented via
  // augmentWithComposable), not just the static base-only diff. Mirrors the
  // deadkey-byproduct fixture shape proven in
  // packages/studio/src/hooks/useInventoryDiff.test.ts's "session-aware
  // composability (symptom-2 fix)" suite and
  // packages/engine/src/pattern-apply/sessionProducedSet.test.ts, adapted to
  // the exact user-reported scenario: ezh U+0292 "ʒ" (this assignment's own
  // accented-form output) and combining caron U+030C "̌" (this SAME deadkey's
  // double-tap byproduct — never this assignment's own `target`) are each
  // produced by ONE session assignment, and the precomposed ezh-with-caron
  // "ǯ" U+01EF (whose canonical NFD is exactly ʒ + U+030C) has NO assignment
  // of its own — neither is in the base .kmn.
  //
  // A single assignment (rather than sessionProducedSet.test.ts's two-
  // assignment byproduct fixture) is deliberate here: this file's mocked
  // `getPatternByIdSync` (see the mock near the top of this file) resolves
  // PATTERN_DEADKEY to the `latinDeadkeyAcuteSingle` fixture, whose
  // kmnFragment hardcodes a single fixed deadkey-state name ("accent") with
  // no `{{deadkeyName}}` placeholder — unlike the real `deadkey_single_tap`
  // content pattern, two instances of it would collide on the same
  // `group(deadkeys)`/`deadkey(accent)` name. One assignment's own
  // baseLetters/accentedForms/accentChar list is enough to exercise the
  // byproduct path without that collision.
  it("a precomposed char composable from THIS SESSION's own assignments (ǯ from a session-produced ezh + that SAME deadkey's session-produced bare caron byproduct, neither in the base) shows a GREEN 1 badge — not a stale RED 0 — while staying in the walk", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    // The base produces none of ʒ/̌/ǯ — every one of these is session-
    // introduced (or, for ǯ, only reachable by composing two that are).
    seedInventory(["ʒ", "̌", "ǯ"]);

    // One real deadkey assignment: its own accented-form output is "ʒ"
    // (base letter "z" + trigger), and its double-tap byproduct — the SAME
    // deadkey's `accentChar` — is the bare combining caron U+030C, never
    // this (or any) assignment's own `target`.
    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌", // U+030C combining caron — this deadkey's double-tap byproduct
          },
        },
      ],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");

    // The bug: ǯ has no assignment of its own, so before this fix its badge
    // read straight from the STATIC base-only diff and stayed red 0 even
    // though ʒ + ̌ were both produced this session. After the fix it reads
    // from the session-aware, composable-augmented set and is green 1.
    const ezhCaronBadge = within(strip).getByTestId("char-scroll-badge-01EF");
    expect(ezhCaronBadge.textContent).toBe("1");
    expect(ezhCaronBadge.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — badge-good color

    // Walk MEMBERSHIP is untouched: ǯ carries no MechanismAssignment of its
    // own, so it must still be a real chip an author can navigate to — the
    // fix only recolors the badge, it never removes a composable char from
    // the strip/walk (the hard constraint this fix must not regress).
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-01EF"));
    expectCurrentChar("ǯ");

    // Directly-produced ʒ badges green too (ordinary direct-assignment path,
    // unaffected by this fix) — sanity check the fixture actually wired a
    // real session assignment, not just inventory noise.
    const ezhBadge = within(strip).getByTestId("char-scroll-badge-0292");
    expect(ezhBadge.textContent).toBe("1");
  });

  // ---------------------------------------------------------------------------
  // Part 1 (3-signal count model) — case-table pins. Each reuses the same
  // deadkey-byproduct fixture shape as the test above (one PATTERN_DEADKEY
  // assignment whose accentedForms output is "ʒ" and whose double-tap
  // byproduct is the bare combining caron "̌") — the exact shape verified not
  // to collide inside applyAssignments' merge-by-group-name injection (see
  // that test's own doc comment for why a SECOND PATTERN_DEADKEY assignment
  // would collide on `group(deadkeys)`/`deadkey(accent)`; the own-key
  // assignment below deliberately uses PATTERN_SWAP instead so it can coexist
  // with the deadkey assignment in the same session).
  // ---------------------------------------------------------------------------

  it("a char reachable BOTH by its own key AND by composition (ǯ own-key + ʒ/caron session-composable) badges GREEN 2, with the compose marker present", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    seedInventory(["ʒ", "̌", "ǯ"]);

    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌",
          },
        },
      ],
      source: "user",
    };
    // ǯ's OWN key — deliberately PATTERN_SWAP (not a second PATTERN_DEADKEY,
    // which would collide with the assignment above inside applyAssignments'
    // merge-by-group-name injection — see this block's own header comment).
    // `getById`/`getPatternByIdSync` don't resolve PATTERN_SWAP in this
    // file's mocks, so it contributes a session-DIRECT mechanism (counted by
    // `directProducesCount`, which never resolves patterns) without being
    // baked into the re-parsed preview .kmn buildSessionProducedSet reads —
    // exactly what this test needs: ǯ's own-key count and its composability
    // (from the OTHER assignment) come from two independent signals.
    const ownKeyForZhCaron: MechanismAssignment = {
      scope: "individual",
      target: "ǯ",
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, slotValues: { kmnRules: "+ [K_9] > 'ǯ'" } }],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct, ownKeyForZhCaron],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const ezhCaronBadge = within(strip).getByTestId("char-scroll-badge-01EF");
    expect(ezhCaronBadge.textContent).toBe("2");
    expect(ezhCaronBadge.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — badge-good color

    // Compose marker present — ǯ IS composable (in addition to its own key).
    expect(
      within(strip).getByTestId("char-scroll-badge-compose-01EF"),
    ).toBeTruthy();
  });

  it("a character assigned to TWO independent keys (two individual-scope mechanisms, no composability) badges GREEN 2 with no compose marker", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    // "ʒ" alone (no caron, no ǯ) — not NFD-decomposable, so composition can
    // never fire for it; this pins the "own-key-only" side of the case table
    // (a two-key char must read 2, not double-count into 3 or collapse to 1).
    seedInventory(["ʒ"]);

    const firstKey: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: { triggerKey: "K_QUOTE", baseLetters: "z", accentedForms: "ʒ" },
        },
      ],
      source: "user",
    };
    const secondKey: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, slotValues: { kmnRules: "+ [K_9] > 'ʒ'" } }],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [firstKey, secondKey],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const ezhBadge = within(strip).getByTestId("char-scroll-badge-0292");
    expect(ezhBadge.textContent).toBe("2");
    expect(ezhBadge.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — badge-good color
    expect(
      screen.queryByTestId("char-scroll-badge-compose-0292"),
    ).toBeNull();
  });

  it("the compose marker is present for a composable-only character (ǯ) and ABSENT for a plain own-key character (ʒ) in the SAME strip", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    seedInventory(["ʒ", "̌", "ǯ"]);

    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌",
          },
        },
      ],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");

    // ǯ: composable-only (no own-key assignment) — marker PRESENT.
    expect(
      within(strip).getByTestId("char-scroll-badge-compose-01EF"),
    ).toBeTruthy();
    expect(within(strip).getByTestId("char-scroll-badge-01EF").textContent).toBe("1");

    // ʒ: own-key only, not NFD-decomposable — marker ABSENT.
    expect(
      within(strip).queryByTestId("char-scroll-badge-compose-0292"),
    ).toBeNull();
    expect(within(strip).getByTestId("char-scroll-badge-0292").textContent).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// UsesSequencesCard (Part 3) — integration coverage.
//
// UsesSequencesCard.tsx (packages/studio/src/editors/assignLoop/parts/) has
// its own render-level unit test exercising pure props in isolation. This
// closes the gap that leaves: it proves the card MechanismGallery actually
// renders is wired to THIS gallery's real store-backed `sessionAssignments`
// (recorded via the same `recordAssignments` store call the P1 coexistence
// suite above uses to simulate a Sequence-Gallery-recorded assignment) — not
// a hand-built prop or a constant. A swapped/empty assignments source at the
// MechanismGallery -> UsesSequencesCard call site would slip past a
// UsesSequencesCard-only unit test but must fail here.
//
// PRODUCES vs USES: the seeded assignment's own `target` ("ŋ", what the
// sequence PRODUCES) is deliberately a DIFFERENT character from currentChar
// ("n", the char under test) — "n" only appears as the sequence's
// `firstLetterOut` (an INPUT slot), never as the char it produces. This is
// exactly the produces-vs-uses distinction the card exists to surface.
// ---------------------------------------------------------------------------

describe("MechanismGallery — UsesSequencesCard (integration)", () => {
  it("renders the card with a row for a real recorded sequence that USES the current character as an input slot (not its produced char)", async () => {
    seedInventory(["n"]);
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

    expectCurrentChar("n");
    const card = await screen.findByTestId("uses-sequences-card");
    const row = within(card).getByTestId("uses-sequences-row-0");
    // The row names the sequence's own input pair and its produced char —
    // proving this is the REAL recorded sequence surfaced from real store
    // state, not a placeholder or a hardcoded row.
    expect(row.textContent).toContain("n");
    expect(row.textContent).toContain("g");
    expect(row.textContent).toContain("ŋ");
  });

  it("control: renders no uses-sequences-card for a character with no recorded using-sequence anywhere in the assignments", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expectCurrentChar("x");
    expect(screen.queryByTestId("uses-sequences-card")).toBeNull();
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

    // Skipping the only character is itself the phase completion attempt
    // (idx 0 is also the last position) — it does not move currentChar
    // anywhere. "á" was skipped (never applied), so the leave-warning modal
    // opens instead of completing immediately; defer via "Come back later".
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Come back later/i }));
    expect(onComplete).toHaveBeenCalledOnce();

    // "á" is still the selected chip — positional nav never nulled
    // currentChar out from under the completed character.
    expectCurrentChar("á");

    // Back is still positional: idx 0 has no prior position, so it calls
    // onBack — not gated by the character having just been skipped.
    const backBtn = screen.getByRole("button", { name: /← back/i });
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// kbgen suggestion row — gated on the current character's producer badge
// (bug fix: a char already green via composition must not ALSO show a
// stale "suggested" proposal — there's no single key left for it to propose).
// ---------------------------------------------------------------------------

describe("MechanismGallery — kbgen suggestion gated on the current char's producer badge", () => {
  it("hides the suggestion for a composition-covered character (ǯ, badge count >= 1) and shows it for a plain uncovered character (count === 0) in the same session", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    // "ǯ" is composable from a session-produced ezh + that SAME deadkey's
    // session-produced bare caron byproduct (identical fixture shape to the
    // badge-count pins above) — no assignment of its own, badge count 1.
    // "à" stays completely uncovered (badge count 0).
    seedInventory(["ʒ", "̌", "ǯ", "à"]);

    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌",
          },
        },
      ],
      source: "user",
    };
    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct],
    });

    // A placement map offering a (would-be) suggestion for BOTH "ǯ" (should
    // be suppressed by the badge) and "à" (should still show — count 0).
    const placementMap = makePlacementMap({
      bcp47Context: "test",
      baseLayoutFamily: "QWERTY",
      entries: [
        {
          codepoint: "U+01EF", // ǯ
          candidates: [
            {
              vkey: "K_9",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 3,
              confidence: 0.8,
            },
          ],
        },
        {
          codepoint: "U+00E0", // à
          candidates: [
            {
              vkey: "K_A",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 4,
              confidence: 0.88,
            },
          ],
        },
      ],
    });

    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} placementMap={placementMap} />,
      );
    });

    const strip = screen.getByTestId("char-scroll-strip");

    // "ǯ" — composable (badge green 1, no own assignment): the placement map
    // has a candidate for it, but the suggestion row must NOT render.
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-01EF"));
    await waitFor(() => {
      expectCurrentChar("ǯ");
    });
    expect(screen.queryByText(/Suggested: RAlt \+ 9 for ǯ/i)).toBeNull();

    // "à" — plain uncovered (badge count 0): the SAME placement map's
    // suggestion for it DOES render.
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-00E0"));
    await waitFor(() => {
      expectCurrentChar("à");
    });
    // Wrapped in waitFor (not a bare synchronous getByText) — the suggestion
    // row's gate (suggestion/currentCharBadge/suggestionDismissed) recomputes
    // in the same render as the chip's aria-pressed flip, but under
    // full-suite load a second, effect-driven re-render (the per-char
    // method-state reset effect a few lines above in the component) can
    // still be settling when a bare synchronous query runs immediately after
    // the first waitFor resolves — this only asserts the chip's selection,
    // not the suggestion row's presence. waitFor retries until both have
    // caught up, without weakening what's asserted.
    await waitFor(() => {
      expect(screen.getByText(/Suggested: RAlt \+ A for à/i)).toBeTruthy();
    });
  });

  it("hides the suggestion for a character already produced by the BASE keyboard (ɛ, badge count >= 1 via signal (a) BASE-DIRECT, no session assignment, not composable, no sequence) — the case the old hasSequenceForChar||isComposable gate missed", async () => {
    // "ɛ" (U+025B) is produced directly by a base-layer rule (K_Q) — no
    // session MechanismAssignment, no composition, no recorded sequence. The
    // OLD gate (`!(hasSequenceForChar || isComposable)`) evaluates to
    // `!(false || false) === true` for this character, so it would WRONGLY
    // show the suggestion despite the badge already reading count >= 1 —
    // exactly the reported bug (ɛ already worked via an existing method, yet
    // "Suggested: Replace Q with ɛ" still appeared).
    const ruleQ: IRRule = {
      nodeId: "r-q",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "ɛ" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleQ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    // Base-produced characters stay OUT of lettersToAdd (same as the "z" case
    // in the Done-button tests below) — reach it via the SHOW-ALL strip.
    seedInventory(["ɛ"]);

    const placementMap = makePlacementMap({
      bcp47Context: "test",
      baseLayoutFamily: "QWERTY",
      entries: [
        {
          codepoint: "U+025B", // ɛ
          candidates: [
            {
              vkey: "K_Q",
              modifiers: [],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 5,
              confidence: 0.9,
            },
          ],
        },
      ],
    });

    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} placementMap={placementMap} />,
      );
    });

    fireEvent.click(screen.getByTestId("char-scroll-chip-025B"));
    await waitFor(() => {
      expectCurrentChar("ɛ");
    });

    // Badge already reads count >= 1 (base-direct) — no suggestion may show.
    expect(screen.queryByText(/Suggested: Replace Q with ɛ/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Forward button — forced visible/enabled once the whole inventory is
// covered, even when currentChar is outside lettersToAdd's walk (bug fix).
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
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />,
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
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />);
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
});

// ---------------------------------------------------------------------------
// kbgen suggestion row — persistence across Back navigation
// ---------------------------------------------------------------------------

describe("MechanismGallery — kbgen suggestion persistence across Back navigation", () => {
  it("an accepted suggestion row does not reappear after navigating forward and back", async () => {
    // corpusBackedQwerty proposes RALT+K_E for U+00E9 (é) and RALT+K_A for
    // U+00E0 (à) — both S-08 (modifier_as_layer_switch) candidates. The
    // gallery's walk is collated (spec 047's collateCompare): "à" sorts
    // before "é" (a < e), so "à" is the first character regardless of the
    // seed array's own order.
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

    // Suggestion row shows for "à". Wrapped in waitFor — same fragile
    // synchronous-getByText-after-render pattern hardened elsewhere in this
    // describe block (see the kbgen-suggestion-gated describe above).
    await waitFor(() => {
      expect(screen.getByText(/Suggested: RAlt \+ A for à/i)).toBeTruthy();
    });

    // Accept it — records the S-08 assignment and dismisses the row (the
    // dismissal is also implied by coveredChars once accepted).
    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ K_A for à/i }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/Suggested: RAlt \+ A for à/i)).toBeNull();
    });

    // Advance to "é" — its own (not-yet-resolved) suggestion row shows.
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByText(/Suggested: RAlt \+ E for é/i)).toBeTruthy();
    });

    // Navigate back to "à" without resolving é's suggestion. Scoped via
    // expectCurrentChar to the CharScrollStrip's selected chip: "à" is
    // covered (accepted above), so an "Added" chip ("Remove U+00E0 à") also
    // carries "U+00E0" in its own aria-label — an unscoped query would be
    // ambiguous.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    expect(onBack).not.toHaveBeenCalled();
    await waitFor(() => {
      expectCurrentChar("à");
    });

    // The already-accepted suggestion for "à" must NOT re-render its card.
    expect(screen.queryByText(/Suggested: RAlt \+ A for à/i)).toBeNull();
  });

  it("a suggestion row REAPPEARS after Skip (unlike Accept/Deny) — Skip resolves nothing", async () => {
    // Same fixture as the accepted-suggestion test above, but this time the
    // character is SKIPPED rather than accepted/denied. Skip is pure
    // positional navigation and must not add the character to
    // suggestionResolved, so returning to it must show the suggestion again.
    // "à" is the first character in the collated walk (a < e).
    seedInventory(["é", "à"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={corpusBackedQwerty}
        />,
      );
    });

    // Suggestion row shows for "à". Wrapped in waitFor — same fragile
    // synchronous-getByText-after-render pattern hardened elsewhere in this
    // describe block.
    await waitFor(() => {
      expect(screen.getByText(/Suggested: RAlt \+ A for à/i)).toBeTruthy();
    });

    // Skip it — no accept/deny, no assignment recorded.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expectCurrentChar("é");
    });

    // Navigate back to "à" without ever resolving its suggestion.
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => {
      expectCurrentChar("à");
    });

    // Unlike the accept/deny case above, the suggestion row for "à" MUST
    // reappear — Skip resolved nothing. (If `skippedChars` were reintroduced
    // to suppress the row, this assertion would fail.)
    await waitFor(() => {
      expect(screen.getByText(/Suggested: RAlt \+ A for à/i)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// kbgen suggestion row — uppercase case-pair fallback
//
// The placement map only carries an entry for ƒ (U+0192), the LOWERCASE
// letter — Ƒ (U+0191) has no map entry of its own. Without the case-pair
// fallback (getRankedSuggestionsForChar's case-pair inheritance), Ƒ would get
// no suggestion at all. With it, Ƒ gets a synthesized S-08 suggestion on the
// SAME vkey (K_F) at the RAlt+Shift layer — the shifted counterpart of ƒ's
// RAlt layer.
// ---------------------------------------------------------------------------

const ffHookPlacementMap: PlacementMap = {
  entries: [
    {
      codepoint: "U+0192",
      candidates: [
        {
          vkey: "K_F",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "phonetic",
          priorCount: 0,
          confidence: 0.6,
        },
      ],
    },
  ],
};

describe("MechanismGallery — kbgen suggestion row — uppercase case-pair fallback", () => {
  it("navigating to the uppercase sibling shows a RAlt+Shift suggestion row", async () => {
    seedInventory(["Ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("Ƒ");
    expect(
      screen.getByText(/Suggested: Shift\+RAlt \+ F for Ƒ/i),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Accept suggestion: Shift\+RAlt \+ K_F for Ƒ/i,
      }),
    ).toBeTruthy();
  });

  it("accepting it records a modifier_as_layer_switch mechanism with altgrKeyList \"[SHIFT RALT K_F]\"", async () => {
    seedInventory(["Ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: Shift\+RAlt \+ K_F for Ƒ/i,
      }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(
      "modifier_as_layer_switch",
    );
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-08");
    // The exact emitted string — textually distinct from the lowercase ƒ's
    // own "[RALT K_F]" (no collision on the same key/layer).
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT RALT K_F]",
    );
    expect(
      assignments[0]?.mechanisms[0]?.slotValues?.["altgrOutputList"],
    ).toBe("Ƒ");
  });

  it("the lowercase ƒ itself still gets its own direct RALT suggestion (unaffected by the fallback)", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(screen.getByText(/Suggested: RAlt \+ F for ƒ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ K_F for ƒ/i }),
    );
    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[RALT K_F]",
    );
  });

  it("suppresses the suggestion row when the top placement candidate is CAPS-based", async () => {
    // CAPS is a case/state modifier, not a layer an author reaches for, so a
    // "Caps + key" recommendation must not be surfaced as a suggestion. The
    // candidate below would otherwise render an S-08 suggestion row (same
    // shape as ffHookPlacementMap's RALT candidate); the CAPS token must
    // suppress it entirely. CAPS remains selectable as a manual layer pick —
    // that path is covered by the layer-picker tests above and is untouched.
    const capsPlacementMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+03B5",
          candidates: [
            {
              vkey: "K_E",
              modifiers: ["RALT", "CAPS"],
              mechanism: "direct",
              priorSource: "phonetic",
              priorCount: 0,
              confidence: 0.9,
            },
          ],
        },
      ],
    };
    seedInventory(["ε"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={capsPlacementMap}
        />,
      );
    });

    expectCurrentChar("ε");
    // No suggestion row at all for a CAPS-carrying candidate.
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ranked suggestion row — up to 2 distinct-strategy chips for one codepoint
// (getRankedSuggestionsForChar). ƒ U+0192 attested by BOTH a corpus deadkey
// (S-02, baseLetter "f") and a corpus RALT candidate (S-08) — the gallery
// must render both chips, each independently acceptable, with one shared
// Deny dismissing the whole row.
// ---------------------------------------------------------------------------

const ffRankedPlacementMap: PlacementMap = {
  entries: [
    {
      codepoint: "U+0192",
      candidates: [
        {
          vkey: "K_QUOTE",
          modifiers: [],
          mechanism: "deadkey",
          priorSource: "corpus",
          priorCount: 6,
          confidence: 0.7,
          baseLetter: "f",
        },
        {
          vkey: "K_F",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 4,
          confidence: 0.6,
        },
      ],
    },
  ],
};

describe("MechanismGallery — ranked suggestion row (S-02 deadkey + S-08 RAlt, same codepoint)", () => {
  it("renders both chips, each with its own Accept button", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(screen.getByText(/Suggested: Deadkey → f for ƒ/i)).toBeTruthy();
    expect(screen.getByText(/Suggested: RAlt \+ F for ƒ/i)).toBeTruthy();

    // One shared Deny for the whole row, two independent Accept buttons
    // (each named by its own aria-label, per mechanism).
    expect(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter f for ƒ/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ K_F for ƒ/i }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("button")
        .filter((b) => b.textContent?.trim() === "Accept"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Deny suggestion/i }),
    ).toBeTruthy();
  });

  it("accepting the S-02 (deadkey) chip records a deadkey_single_tap mechanism using the corpus baseLetter and the studio's default trigger key", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter f for ƒ/i,
      }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    const mech = assignments[0]?.mechanisms[0];
    expect(mech?.patternId).toBe(PATTERN_DEADKEY);
    expect(mech?.strategyId).toBe("S-02");
    expect(mech?.slotValues?.["baseLetters"]).toBe("f");
    expect(mech?.slotValues?.["accentedForms"]).toBe("ƒ");
    // Corpus triggers are deliberately not imposed — the studio's own
    // default trigger key (K_COLON) is used, not the corpus candidate's vkey
    // (K_QUOTE, which is only ever a display-only host label for THIS
    // candidate's own placement, not a trigger-key attestation).
    expect(mech?.slotValues?.["triggerKey"]).toBe("K_COLON");
  });

  it("accepting the S-08 (RAlt) chip still works independently of the S-02 chip", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ K_F for ƒ/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe(
      "modifier_as_layer_switch",
    );
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-08");
  });

  it("Deny dismisses the whole row — both chips disappear, revisiting the char doesn't reshow it", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Deny suggestion/i }));
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Bug fix: accepts are INDEPENDENT — accepting one chip must not hide the
  // other. Previously, accepting EITHER chip recorded a mechanism, which
  // flipped the character's producer badge to count >= 1 and hid the WHOLE
  // row (suggestionDismissed's old coveredChars check + the row's old
  // `(currentCharBadge?.count ?? 0) === 0` gate) — so accepting the deadkey
  // chip silently made the RAlt chip vanish before the author ever saw it.
  // -------------------------------------------------------------------------

  it("accepting the S-02 chip leaves the S-08 chip visible and independently acceptable; accepting both records both assignments and removes the row", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    // Accept the deadkey (S-02) chip first.
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter f for ƒ/i,
      }),
    );

    // The deadkey chip's own text is gone, but the RAlt (S-08) chip's text
    // AND its Accept button are STILL rendered — the bug this fixes.
    await waitFor(() => {
      expect(screen.queryByText(/Suggested: Deadkey → f for ƒ/i)).toBeNull();
      expect(screen.getByText(/Suggested: RAlt \+ F for ƒ/i)).toBeTruthy();
    });
    const raltAccept = screen.getByRole("button", {
      name: /Accept suggestion: RAlt \+ K_F for ƒ/i,
    });
    expect((raltAccept as HTMLButtonElement).disabled).toBe(false);

    // Accept the remaining RAlt chip too.
    fireEvent.click(raltAccept);

    // Both mechanisms are now recorded — accepting one never overwrote or
    // dropped the other. Read straight off Phase C's own assignments array
    // (what recordAssignments writes and the component itself reads via
    // sessionAssignments/mechanismAssignments), NOT the derived
    // `session.assignments` view — mergeAssignments there is last-wins per
    // (modality, scope, target) across PHASES, a cross-phase reconciliation
    // rule that isn't this row's concern; two independent per-mechanism
    // entries for the SAME character within the SAME phase C are exactly
    // what this gallery (and this fix) intentionally allows.
    await waitFor(() => {
      const assignments = (
        useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")
          ?.assignments ?? []
      ).filter((a) => a.modality === "physical");
      expect(assignments).toHaveLength(2);
      const strategyIds = assignments
        .flatMap((a) => a.mechanisms.map((m) => m.strategyId))
        .sort();
      expect(strategyIds).toEqual(["S-02", "S-08"]);
    });

    // With every chip accepted, the row itself disappears entirely.
    await waitFor(() => {
      expect(screen.queryByText(/Suggested:/i)).toBeNull();
    });
  });

  it("revisit: an accepted chip does not reappear after navigating away and back, while its unaccepted sibling's suggestion persists", async () => {
    seedInventory(["ƒ", "z"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    const strip = screen.getByTestId("char-scroll-strip");
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-0192"));
    await waitFor(() => {
      expectCurrentChar("ƒ");
    });

    // Accept only the deadkey (S-02) chip; leave the RAlt (S-08) chip alone.
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter f for ƒ/i,
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/Suggested: Deadkey → f for ƒ/i)).toBeNull();
    });

    // Navigate away to "z" and back to "ƒ".
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-007A"));
    await waitFor(() => {
      expectCurrentChar("z");
    });
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-0192"));
    await waitFor(() => {
      expectCurrentChar("ƒ");
    });

    // The already-accepted deadkey chip must NOT reappear (revisit
    // semantics — its mechanism is still on record); the never-touched RAlt
    // chip must still be offered.
    expect(screen.queryByText(/Suggested: Deadkey → f for ƒ/i)).toBeNull();
    expect(screen.getByText(/Suggested: RAlt \+ F for ƒ/i)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Defect 2 evidence — per-mechanism removal already exists
  // (handleRemoveMechanism / the "Applied methods" chip row) and works
  // identically regardless of whether the mechanism was recorded via a
  // manual Apply or via accepting a suggestion chip: each accepted
  // suggestion becomes its own MechanismAssignment object, so each gets its
  // own independent "Remove method" chip.
  // -------------------------------------------------------------------------

  it("each suggestion-accepted mechanism gets its own independent remove control — removing one leaves the other intact", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: deadkey via base letter f for ƒ/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Accept suggestion: RAlt \+ K_F for ƒ/i }),
    );

    let deadkeyBadge: HTMLElement | null = null;
    let raltBadge: HTMLElement | null = null;
    await waitFor(() => {
      const badges = screen.queryAllByRole("button", { name: /^Remove method/i });
      expect(badges.length).toBe(2);
      deadkeyBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("Deadkey")) ?? null;
      raltBadge = badges.find((b) => b.getAttribute("aria-label")?.includes("RAlt")) ?? null;
      expect(deadkeyBadge).not.toBeNull();
      expect(raltBadge).not.toBeNull();
    });

    // Remove only the deadkey mechanism.
    await act(async () => {
      fireEvent.click(deadkeyBadge!);
    });

    await waitFor(() => {
      // See the note in the accept-independence test above re: reading
      // phaseResults' own Phase C assignments rather than the merged
      // `session.assignments` view.
      const assignments = (
        useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C")
          ?.assignments ?? []
      ).filter((a) => a.modality === "physical");
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-08");
    });
    const remaining = screen.queryAllByRole("button", { name: /^Remove method/i });
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.getAttribute("aria-label") ?? "").toMatch(/RAlt/i);
  });

  // -------------------------------------------------------------------------
  // Style — the suggestion row is GREEN, not red (product decision). It's a
  // proposal/affordance the author can accept or deny, not an error state.
  // -------------------------------------------------------------------------

  it("renders the suggestion row in the green family, not ERROR_RED/ERROR_BG", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    const row = screen.getByRole("note", {
      name: /Placement suggestion from kbgen seeder/i,
    });
    // #0d2218 / #238636 — the SAME green pair CharScrollStrip's badgeGood
    // treatment and the "Applied methods" chips already use elsewhere in
    // this gallery. Never the old ERROR_RED (#f85149) / ERROR_BG (#2a0a0a).
    expect(row.style.backgroundColor).toBe("rgb(13, 34, 24)"); // #0d2218
    expect(row.style.borderColor).toBe("rgb(35, 134, 54)"); // #238636
    expect(row.style.backgroundColor).not.toBe("rgb(42, 10, 10)"); // #2a0a0a
    expect(row.style.borderColor).not.toBe("rgb(248, 81, 73)"); // #f85149

    const suggestionText = screen.getByText(/Suggested: Deadkey → f for ƒ/i);
    expect(suggestionText.style.color).toBe("rgb(86, 211, 100)"); // #56d364
    expect(suggestionText.style.color).not.toBe("rgb(248, 81, 73)"); // #f85149
  });
});

// ---------------------------------------------------------------------------
// Suggestion row suppression — coverage by means OTHER than one of THIS
// row's own offered chips. Two signals beyond baseOnlyProducedSet/
// isComposable: (d) SEQUENCE (hasSequenceForChar) and (e) UNRELATED MANUAL
// (a recorded non-sequence mechanism whose strategyId isn't among the
// offered chips). Both must suppress the WHOLE row even though neither one
// ever populates recordedSuggestionStrategyIds for an OFFERED strategyId —
// see the render-gate comment in MechanismGallery.tsx.
// ---------------------------------------------------------------------------

describe("MechanismGallery — suggestion row suppressed by non-chip coverage", () => {
  it("a char already covered by a recorded PATTERN_SEQUENCE assignment shows no suggestion row", async () => {
    seedInventory(["ƒ"]);
    // Mirrors the "coexistence with a separately-recorded sequence
    // assignment" fixture shape above — a sequence assignment recorded
    // BEFORE render, for the SAME char the corpus placement map offers
    // suggestions for.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ƒ",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: { firstLetterOut: "f", secondLetter: "f", collapsedChar: "ƒ" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
    expect(
      screen.queryByRole("note", {
        name: /Placement suggestion from kbgen seeder/i,
      }),
    ).toBeNull();
  });

  it("a char already covered by a manually-applied mechanism whose strategyId is NOT among the offered chips shows no suggestion row", async () => {
    seedInventory(["ƒ"]);
    // "S-01" is not one of ffRankedPlacementMap's offered strategyIds
    // (S-02 deadkey, S-08 RAlt) — an unrelated manual method.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ƒ",
        modality: "physical",
        mechanisms: [
          { patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_QUOTE] > U+0192" } },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffRankedPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
    expect(
      screen.queryByRole("note", {
        name: /Placement suggestion from kbgen seeder/i,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case-pair companion — ralt-layer proposal, raised right after ACCEPTING
// the lowercase S-08 RAlt suggestion (not on a separate navigation to the
// uppercase sibling — see handleSuggestionAccept).
// ---------------------------------------------------------------------------

describe("MechanismGallery — case-pair companion (ralt-layer, from suggestion accept)", () => {
  it("accepting the lowercase ƒ RAlt suggestion raises the companion banner for Ƒ", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("ƒ");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: RAlt \+ K_F for ƒ/i,
      }),
    );

    expect(screen.getByText(/has an uppercase form, Ƒ/i)).toBeTruthy();
  });

  it("confirming records a modifier_as_layer_switch mechanism for Ƒ with altgrKeyList \"[SHIFT RALT K_F]\"", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: RAlt \+ K_F for ƒ/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Map Ƒ to the Shift\+RAlt layer of K_F/i,
      }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    const companion = assignments.find((a) => a.target === "Ƒ");
    expect(companion).toBeDefined();
    expect(companion?.mechanisms[0]?.patternId).toBe(
      "modifier_as_layer_switch",
    );
    expect(companion?.mechanisms[0]?.strategyId).toBe("S-08");
    expect(companion?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT RALT K_F]",
    );
    expect(companion?.mechanisms[0]?.slotValues?.["altgrOutputList"]).toBe(
      "Ƒ",
    );

    // Prompt is dismissed after confirm.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("does NOT raise the companion banner when accepting a suggestion for an already-uppercase char", async () => {
    seedInventory(["Ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    expectCurrentChar("Ƒ");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: Shift\+RAlt \+ K_F for Ƒ/i,
      }),
    );

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("stale-guard: confirming a ralt-layer companion whose base assignment vanished via an unaudited mutation path records nothing", async () => {
    seedInventory(["ƒ"]);
    await act(async () => {
      render(
        <MechanismGallery
          selectedBaseKeyboard={basicKbdus}
          placementMap={ffHookPlacementMap}
        />,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Accept suggestion: RAlt \+ K_F for ƒ/i,
      }),
    );
    expect(screen.getByText(/has an uppercase form, Ƒ/i)).toBeTruthy();

    // Simulate a hypothetical future mutation path that touches
    // sessionAssignments WITHOUT going through handleRemoveCovered /
    // handleRemoveMechanism (which proactively dismiss the banner) — direct
    // store mutation bypassing the component's own handlers entirely, the
    // same technique the physical and combo stale-guard tests above use. The
    // component's pendingCompanion state is untouched by this, so the banner
    // remains visible in the DOM, exercising the confirm-time staleness
    // re-check in handleCompanionConfirm's "ralt-layer" branch
    // (`sessionAssignments.includes(pendingCompanion.baseAssignment)`) rather
    // than any removal-time dismissal.
    await act(async () => {
      useWorkingCopyStore.getState().recordAssignments([]);
    });
    expect(screen.getByText(/has an uppercase form, Ƒ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Map Ƒ to the Shift\+RAlt layer of K_F/i,
      }),
    );

    // Nothing was recorded for the counterpart — the stale proposal was
    // dismissed, not applied.
    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments.find((a) => a.target === "Ƒ")).toBeUndefined();
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
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
// RAlt layer targeting (S-08) — Base/Shift plane choice
// ---------------------------------------------------------------------------

describe("MechanismGallery — RAlt layer targeting (S-08)", () => {
  it("emits a [ALT K_X] rule by default (unshifted plane, generic alt until chirality is in use)", async () => {
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Fallback path: with nothing in use, the second slot starts unselected
    // ("") — the author must pick before Apply. Locks in the else-branch of
    // handleAddRaltSlot's in-use default.
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    expect(selectMenuValue(secondLayerSelect)).toBe("");
    await changeSelectMenu(secondLayerSelect, "SHIFT");
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

  it("defaults the SECOND layer slot to SHIFT when Shift is already in use elsewhere in the working IR", async () => {
    // Slot 1 still defaults to the alt-family token (raltDefaultToken is
    // untouched by this change). The SECOND slot is what should now auto-fill
    // instead of starting unselected: seed SHIFT as already "in use" via an
    // unrelated K_W rule, then confirm the author never has to touch the
    // Layer 2 dropdown themselves for it to read SHIFT.
    instantiateWithModifiersInUse("K_W", ["SHIFT"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));

    // Pre-filled with SHIFT — no explicit changeSelectMenu call for slot 2.
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    expect(selectMenuValue(secondLayerSelect)).toBe("SHIFT");

    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT ALT K_E]",
    );
  });

  it("never auto-fills the SECOND slot with CAPS, even when CAPS is the only in-use modifier", async () => {
    // CAPS is reported as "in use" by any keyboard with routine CAPS/NCAPS
    // case-handling rules, but it is a case/state modifier rather than a layer
    // — it must NOT auto-fill the second slot (that would surprise). It stays
    // selectable in the dropdown; the author picks it explicitly if they want.
    instantiateWithModifiersInUse("K_W", ["CAPS"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));

    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    // Not auto-filled with CAPS — stays unselected until the author picks.
    expect(selectMenuValue(secondLayerSelect)).toBe("");
    // ...but CAPS is still offered as an explicit choice.
    const optionValues = await selectMenuOptionValues(secondLayerSelect);
    expect(optionValues).toContain("CAPS");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "LALT");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 3 for layer-switch combo/i), "CAPS");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLButtonElement;
    expect(secondLayerSelect.disabled).toBe(false);
    await changeSelectMenu(secondLayerSelect, "SHIFT");
    expect(selectMenuValue(secondLayerSelect)).toBe("SHIFT");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 defaults to RALT; adding a second slot must not offer LALT
    // (or RALT again) — MODIFIER_EXCLUSIONS is self-inclusive + chiral.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    const optionValues = await selectMenuOptionValues(secondLayerSelect);
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    const firstOptionValues = await selectMenuOptionValues(firstLayerSelect);
    expect(firstOptionValues).not.toContain("NCAPS");

    await changeSelectMenu(firstLayerSelect, "CAPS");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    const optionValues = await selectMenuOptionValues(secondLayerSelect);
    expect(optionValues).not.toContain("CAPS");
    expect(optionValues).not.toContain("NCAPS");
  });

  it("caps the layer combo at 4 dropdowns", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 3 for layer-switch combo/i), "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 4 for layer-switch combo/i), "CAPS");

    expect(screen.queryByLabelText(/Layer 5 for layer-switch combo/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Add another layer/i })).toBeNull();
  });

  it("handleRemoveRaltSlot: removing a middle layer slot shifts later slots down and keeps their values", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 defaults to generic ALT (no chiral alt in use). Add slot 2
    // (CTRL) and slot 3 (SHIFT).
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 3 for layer-switch combo/i), "SHIFT");

    // Remove the middle slot (CTRL, index 1).
    fireEvent.click(screen.getByRole("button", { name: /Remove layer 2/i }));

    // Slot 3 is gone; slot 2 now holds what was slot 3's value (SHIFT) —
    // values are re-indexed by the removal, not reset to blank.
    expect(screen.queryByLabelText(/Layer 3 for layer-switch combo/i)).toBeNull();
    const layer2 = screen.getByLabelText(/Layer 2 for layer-switch combo/i) as HTMLElement;
    expect(selectMenuValue(layer2)).toBe("SHIFT");

    // Applying still produces a valid, canonically-ordered combo from the
    // remaining (ALT, SHIFT) slots — the removed CTRL is gone entirely.
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    // Zero-layer starting state already shows the button (an empty combo is
    // vacuously "all filled").
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 is pre-filled with the default alt-family token — the button
    // stays visible.
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 2 starts unselected — the Add button must hide until it is filled.
    expect(screen.queryByRole("button", { name: /Add another layer/i })).toBeNull();

    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "SHIFT");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    fireEvent.click(firstLayerSelect);
    await waitFor(() => expect(firstLayerSelect.getAttribute("aria-expanded")).toBe("true"));
    // The open option list is portalled to document.body (SelectMenu), so it is
    // no longer a DOM descendant of the trigger's parent — query it via the open
    // listbox rather than the trigger's subtree.
    const raltOption = screen
      .getByRole("listbox")
      .querySelector('li[data-value="RALT"]');
    expect(raltOption?.textContent).toBe("RALT (in use)");
  });

  it("shows a desktop-only note when the combo includes CAPS", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    await changeSelectMenu(firstLayerSelect, "CAPS");

    expect(screen.getByText(/desktop only/i)).toBeTruthy();
  });

  it("drops a now-invalid later pick when an earlier dropdown changes", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 starts at ALT (default); add slot 2 and pick CAPS (valid — CAPS
    // isn't excluded by ALT). Slot 1's own options are never constrained by
    // a LATER slot (options only cascade downward), so slot 1 can freely
    // switch to CAPS too — which then excludes slot 2's CAPS pick and must
    // drop it back to unselected.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    await changeSelectMenu(secondLayerSelect, "CAPS");
    expect(selectMenuValue(secondLayerSelect)).toBe("CAPS");

    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    await changeSelectMenu(firstLayerSelect, "CAPS");

    expect(selectMenuValue(secondLayerSelect)).toBe("");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;

    // Pre-filled with the default alt-family token (generic ALT).
    expect(selectMenuValue(firstLayerSelect)).toBe("ALT");

    const optionValues = (await selectMenuOptionValues(firstLayerSelect))
      .filter((v) => v !== "");
    expect(new Set(optionValues)).toEqual(
      new Set(["SHIFT", "CTRL", "ALT", "CAPS"]),
    );

    // Applying still works end to end against the fallback pool.
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
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
  fireEvent.click(screen.getByText(/Assign to a key/i));
  fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
  const firstLayerSelect = screen.getByLabelText(
    /Layer 1 for layer-switch combo/i,
  ) as HTMLElement;
  return new Set(
    (await selectMenuOptionValues(firstLayerSelect)).filter((v) => v !== ""),
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "SHIFT");
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

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "SHIFT");

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
// Physical-key type-to-select while a KeyPickerField dropdown is open
// (SelectMenu's opt-in resolveKeyToValue, wired by KeyPickerField via
// keyOptions.ts's charToVkey) — the physical-keyboard companion to the OSK
// tap-to-select coverage above.
// ---------------------------------------------------------------------------

describe("MechanismGallery — physical-key type-to-select in an open key picker", () => {
  it("pressing M while the Assign-to-a-key picker is open selects K_M and Apply uses it", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    // Physical keydown on the open listbox — not a click on an <li> option.
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m" });

    expect(selectMenuValue(trigger)).toBe("K_M");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_M] > U+00E1",
    );
  });

  it("a modifier-held keydown (Ctrl+M) is ignored — does not select K_M", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m", ctrlKey: true });

    // Still open, still unselected — the keydown was ignored, not consumed.
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(selectMenuValue(trigger)).toBe("");
  });

  it("a modifier-held keydown (Alt+M) is ignored — does not select K_M", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m", altKey: true });

    // Still open, still unselected — the keydown was ignored, not consumed.
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(selectMenuValue(trigger)).toBe("");
  });

  it("a modifier-held keydown (Meta+M) is ignored — does not select K_M", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m", metaKey: true });

    // Still open, still unselected — the keydown was ignored, not consumed.
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(selectMenuValue(trigger)).toBe("");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
// Bare-SHIFT layer combo (spec §10 Check #10 regression) — a combo whose
// ONLY modifier is SHIFT is the merged card's sole remaining route to the
// shift plane (the old Base/Shift radio is gone). Apply must route it
// through the SAME CAPS-aware builder (planShiftAssignment +
// buildShiftRuleLines) the 0-layer base path and the pre-merge Shift radio
// used — never the store-based S-08 write path, which never consults
// keyHasCapsHandling.
// ---------------------------------------------------------------------------

describe("MechanismGallery — bare-SHIFT layer combo is CAPS-aware (spec §10 Check #10)", () => {
  it("bare SHIFT layer on a plain key emits a simple_swap [SHIFT K_X] rule", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("θ");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-01");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_Q] > U+03B8",
    );

    // Bare-SHIFT apply proposes no case-pair companion — mirrors the old
    // Shift radio, which only proposed a companion from the base-layer apply.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("bare SHIFT layer on a CAPS-handling key emits the NCAPS+CAPS sibling pair, not a bare rule", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [NCAPS SHIFT K_Q] > U+03B8\n+ [CAPS SHIFT K_Q] > U+03B8",
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // 2. Apply a SECOND, unrelated mechanism for the same char (θ) while the
    //    banner is still up — a layer-combo (default generic Alt, no chiral
    //    alt in use) assignment on a different key. The card is already
    //    selected/reset to "swap" with zero layers (resetMethodState ran
    //    after step 1's Apply) — adding a layer is what turns THIS Apply
    //    into the S-08 write path instead of a second simple_swap.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_W");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    }).not.toThrow();

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();
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
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />,
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
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />,
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
// "Enter my own character..." custom key option + U+ notation in character
// boxes — feature coverage for the key-picker dropdowns (S-01 swap, S-08
// ralt, S-02 deadkey trigger) and the deadkeyBaseLetter character box.
// ---------------------------------------------------------------------------

describe("MechanismGallery — custom key option (S-01 swap)", () => {
  it("selecting 'Enter my own character...' reveals a custom text input", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getByLabelText(/Custom character for the assigned key/i),
    ).toBeTruthy();
  });

  it("a custom literal character resolves to a vkey and Apply records the mapped key", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getByLabelText(/Custom character for the assigned key/i),
    ).toBeTruthy();

    // Type some (possibly-invalid) custom text before the tap — this is the
    // stale state that must NOT survive a tap-to-select.
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "zz" },
    });

    // The OSKFrame mock's "tap-K_E" button simulates an OSK key tap.
    fireEvent.click(screen.getByRole("button", { name: "tap-K_E" }));

    // Custom mode is exited — the select now shows K_E and the custom input
    // is gone.
    expect(
      screen.queryByLabelText(/Custom character for the assigned key/i),
    ).toBeNull();
    expect(
      selectMenuValue(screen.getByLabelText(/Physical key for Assign to a key/i)),
    ).toBe("K_E");

    // Re-opening "Enter my own character..." starts clean — the paired
    // custom-char state was cleared by the tap, not left stale from before.
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      (screen.getByLabelText(/Custom character for the assigned key/i) as HTMLInputElement).value,
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
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
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

describe("MechanismGallery — custom key option (S-08 ralt)", () => {
  it("a custom base character resolves to its vkey and Apply records the resolved key, never the '__custom__' sentinel", async () => {
    // RALT must already be a chosen family option in the modifier pool for
    // "Layer 1 for layer-switch combo" to offer it as a <select> value — see
    // computeModifierPool. Seed a distinct vkey (K_Q) so it never collides
    // with the K_W the custom character below resolves to.
    instantiateWithModifiersInUse("K_Q", ["RALT"]);
    seedInventory(["ŵ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(
      screen.getByLabelText(/Custom character for the assigned key/i),
      { target: { value: "w" } },
    );
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "RALT");

    const addBtn = screen.getByRole("button", { name: /Apply method for ŵ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    const altgrKeyList = assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"];
    // Non-vacuity: the resolved vkey for custom char "w" must appear (proving
    // the assertion actually depends on resolution, not just that Apply
    // fired), and the raw "__custom__" sentinel must never leak through —
    // that leak is exactly the bug this regression test guards against.
    expect(altgrKeyList).toBe("[RALT K_W]");
    expect(altgrKeyList).not.toContain(CUSTOM_KEY_OPTION_VALUE);
  });
});

// ---------------------------------------------------------------------------
// Delimiter guard (P0) — ASCII straight quotes can't be resolved output
// characters in deadkeyBaseLetter or the deadkey-trigger custom character
// (both substitute into an unescaped KMN string literal or JSON block). The
// SWAP/RALT custom-character key pickers are unaffected — they resolve only
// to a K_ vkey id. (The sequence method's own Content/Indicator boxes carry
// the SAME delimiter guard — see SequenceBuilderPanel.tsx's
// SEQ_CONTENT_RESOLVE_OPTIONS/buildSeqIndicatorResolveOptions — but live in
// the right pane now, not this gallery's own MethodChooser; see "apply
// (sequence)" above for their coverage.)
// ---------------------------------------------------------------------------

describe("MechanismGallery — delimiter guard (straight quotes)", () => {
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
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
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

// ---------------------------------------------------------------------------
// Single-grapheme guard (P1) -- deadkeyBaseLetter accepts exactly one
// grapheme cluster. (The sequence builder's own Content/Indicator boxes have
// their own resolve-options coverage in SequenceBuilderPanel's own module —
// this section is scoped to the deadkey base-letter box only.)
// ---------------------------------------------------------------------------

describe("MechanismGallery — single-grapheme guard on character boxes", () => {
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
// Multi-token compose (deadkeyBaseLetter) -- space-separated tokens are each
// independently resolved, then concatenated + NFC-normalized. This section is
// scoped to the deadkey base-letter box only; the sequence builder's own
// Content box has its own resolve-options coverage in
// SequenceBuilderPanel.tsx.
// ---------------------------------------------------------------------------

describe("MechanismGallery — multi-token compose (deadkey base-letter box)", () => {
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
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
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
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
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
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    const input = screen.getByLabelText(/Custom character for the assigned key/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("the RALT custom key input carries no placeholder attribute", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    const input = screen.getByLabelText(/Custom character for the assigned key/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("the deadkey trigger custom input carries no placeholder attribute", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
    const input = screen.getByLabelText(/Custom trigger character for deadkey/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("shows a single character-box help caption near the method chooser, not repeated per box", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(
      screen.getAllByText(
        "Type a character, or a Unicode value like U+00E9. Combine composed parts with spaces, e.g. U+006E U+0303.",
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
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getAllByText("Type a character directly, or a Unicode value like U+00E9."),
    ).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// Spec 051 — the case-pair proposal now comes from the SHARED hook + banner
// (useCasePairCompanion / CasePairProposalBanner). The existing companion
// cases above are the behaviour-preservation gate (SC-005); these two pin the
// contract's identity surface that the extraction makes load-bearing.
// ---------------------------------------------------------------------------

describe("MechanismGallery — shared case-pair affordance (spec 051)", () => {
  it("renders the proposal through the shared banner's role/aria-label contract (FR-011)", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const banner = screen.getByRole("note", {
      name: /Case-pair companion proposal/i,
    });
    expect(banner).toBeTruthy();
    // Exactly two controls, Confirm and Dismiss — no third button, no
    // "apply to all" (bulk actions are out of scope).
    expect(within(banner).getAllByRole("button")).toHaveLength(2);
  });

  it("confirming applies to the RAISING swap when the same character carries two swap assignments (FR-008)", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // 1. First swap on K_Q — raises a proposal for K_Q.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    expect(
      screen.getByRole("button", { name: /Map Θ to the shift layer of K_Q/i }),
    ).toBeTruthy();

    // 2. Second swap for the SAME character on K_W — at most one proposal is
    //    pending, so this replaces the first.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_W");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // 3. Confirm — must pair with K_W (the raising placement), not K_Q. An
    //    index/target scan would grab the first θ assignment and emit K_Q.
    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of K_W/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();
    const companion = assignments.find((a) => a.target === "Θ");
    expect(companion?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_W] > U+0398",
    );
    // Both base swaps survive untouched (non-CAPS key → append, not replace).
    expect(assignments.filter((a) => a.target === "θ")).toHaveLength(2);
  });

  // "Stale base removed before confirm records nothing" is already pinned by
  // the two shipping cases above — "removing the base swap while the banner is
  // up dismisses the companion proposal" (the gallery's own removal paths
  // dismiss proactively) and "stale-guard: confirming a companion whose base
  // assignment vanished via an unaudited mutation path records nothing" (the
  // confirm-time backstop). Both still pass unedited after the extraction, so
  // they are not restated here.
});

// ---------------------------------------------------------------------------
// Spec 051 US2 — S-02 parallel combo (uppercase base letter -> uppercase output)
//
// The case-shifted elements are the BASE LETTER and the OUTPUT. The trigger
// key, its deadkey name, and the accent character are carried across
// unchanged: a dead key is an accent selector, not a letter.
// ---------------------------------------------------------------------------

describe("MechanismGallery — S-02 parallel-combo proposal (spec 051 US2)", () => {
  it("a dead-key apply producing a lowercase accented letter raises a proposal", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // "á" defaults to the pre-enabled deadkey method (§3c).
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();
  });

  it("confirming records a parallel deadkey ref: trigger unchanged, base letter and output case-shifted", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    const source = getPhaseCPhysicalAssignments().find((a) => a.target === "á");
    const sourceSlots = source?.mechanisms[0]?.slotValues ?? {};

    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    const companion = getPhaseCPhysicalAssignments().find(
      (a) => a.target === "Á",
    );
    expect(companion?.mechanisms[0]?.patternId).toBe(PATTERN_DEADKEY);
    expect(companion?.mechanisms[0]?.strategyId).toBe("S-02");

    const slots = companion?.mechanisms[0]?.slotValues ?? {};
    // Unchanged across the pair.
    expect(slots["triggerKey"]).toBe(sourceSlots["triggerKey"]);
    expect(slots["deadkeyName"]).toBe(sourceSlots["deadkeyName"]);
    expect(slots["accentChar"]).toBe(sourceSlots["accentChar"]);
    // Case-shifted.
    expect(sourceSlots["baseLetters"]).toBe("a");
    expect(slots["baseLetters"]).toBe("A");
    expect(slots["accentedForms"]).toBe("Á");

    // The source combo survives untouched.
    expect(
      getPhaseCPhysicalAssignments().find((a) => a.target === "á"),
    ).toBeDefined();
  });

  it("dismissing the S-02 proposal records nothing", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Do not map Á to the shift layer/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("á");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("a caseless output raises no S-02 proposal", async () => {
    instantiateWorkingCopy();
    // Arabic alef with hamza below — caseless, so no confident capital.
    seedInventory(["إ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for إ/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("stale-guard: confirming a parallel-combo proposal whose raising deadkey assignment vanished via an unaudited mutation path records nothing", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // "á" defaults to the pre-enabled deadkey method (§3c) — apply directly.
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();

    // Simulate a hypothetical future mutation path that removes the raising
    // deadkey assignment WITHOUT going through the gallery's own removal
    // handlers (which proactively dismiss the banner) — direct store
    // mutation bypassing the component's handlers entirely, the same
    // technique the physical stale-guard test above uses. The component's
    // pendingCompanion state is untouched by this, so the banner remains
    // visible in the DOM, exercising confirmComboCompanion's confirm-time
    // staleness re-check (`sessionAssignments.includes(proposal.baseAssignment)`)
    // rather than any removal-time dismissal.
    await act(async () => {
      useWorkingCopyStore.getState().recordAssignments([]);
    });
    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    // Nothing was recorded for the counterpart — the stale proposal was
    // dismissed, not applied.
    expect(
      getPhaseCPhysicalAssignments().find((a) => a.target === "Á"),
    ).toBeUndefined();
    expect(getPhaseCPhysicalAssignments()).toHaveLength(0);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spec 051 US2 — S-03 parallel combo. The proposal is raised in the gallery
// (which owns the one hook and the one banner) from the sequence panel's
// onApplied seam; the panel renders no banner of its own.
// ---------------------------------------------------------------------------

describe("MechanismGallery — S-03 parallel-combo proposal (spec 051 US2)", () => {
  async function applySequence(content: string, indicator: string) {
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), {
      target: { value: content },
    });
    fireEvent.change(screen.getByTestId("sequences-indicator"), {
      target: { value: indicator },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("sequences-apply"));
    });
  }

  it("a sequence whose content is a single cased character raises a proposal", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("a", "s");

    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();
  });

  it("confirming records a parallel sequence: indicator unchanged, content and collapse target case-shifted", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("a", "s");
    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();

    const source = assignments.find((a) => a.target === "á");
    expect(source?.mechanisms[0]?.slotValues).toMatchObject({
      firstLetterOut: "a",
      secondLetter: "s",
      collapsedChar: "á",
    });

    const companion = assignments.find((a) => a.target === "Á");
    expect(companion?.mechanisms[0]?.patternId).toBe(PATTERN_SEQUENCE);
    expect(companion?.mechanisms[0]?.strategyId).toBe("S-03");
    expect(companion?.mechanisms[0]?.slotValues).toMatchObject({
      // Case-shifted.
      firstLetterOut: "A",
      collapsedChar: "Á",
      // Unchanged — the indicator is a physical key by construction.
      secondLetter: "s",
    });
  });

  it("multi-character content ('ng') raises no proposal", async () => {
    instantiateWorkingCopy();
    seedInventory(["ŋ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("ng", "y");

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(getPhaseCPhysicalAssignments()).toHaveLength(1);
  });

  it("confirming twice is a no-op under the existing (firstLetterOut, secondLetter) dedup", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("a", "s");
    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    // Re-apply the identical source sequence: the panel's own dedup makes it a
    // no-op and hands back no payload, so no second proposal is raised.
    await applySequence("a", "s");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const companion = getPhaseCPhysicalAssignments().find(
      (a) => a.target === "Á",
    );
    expect(companion?.mechanisms).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Spec 051 P1 fix — "counterpart already placed" (spec §Edge Cases), wired to
// the physical (S-01) and combo (S-02/S-03) mechanisms. The touch mechanism
// already had this wired (TouchGallery.tsx); these lock the other two.
// ---------------------------------------------------------------------------

describe("MechanismGallery — 'counterpart already placed' suppression (spec 051 P1 fix)", () => {
  it("physical (S-01): no companion prompt when the counterpart is already on the shift layer of the same key", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    // Θ already recorded on the shift layer of K_Q — the exact slot a
    // base-layer θ swap on K_Q would otherwise propose.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "Θ",
        modality: "physical",
        mechanisms: [
          {
            patternId: "simple_swap",
            strategyId: "S-01",
            slotValues: { kmnRules: "+ [SHIFT K_Q] > U+0398" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // No proposal — the parallel slot already produces the counterpart.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const assignments = getPhaseCPhysicalAssignments();
    // Only the pre-seeded Θ assignment plus the new θ swap — nothing added
    // for a redundant companion.
    expect(assignments).toHaveLength(2);
    expect(assignments.filter((a) => a.target === "Θ")).toHaveLength(1);
  });

  it("combo S-02: no parallel-combo prompt when the counterpart already has a PATTERN_DEADKEY mechanism on the same trigger key", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    // Á already has a deadkey mechanism on the default trigger key (K_COLON,
    // MechanismGallery's initial triggerKey state) — the parallel combo this
    // apply would otherwise propose.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "Á",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_DEADKEY,
            strategyId: "S-02",
            slotValues: {
              triggerKey: "K_COLON",
              deadkeyName: "dead0",
              baseLetters: "A",
              accentedForms: "Á",
              accentChar: ";",
            },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // "á" defaults to the pre-enabled deadkey method (§3c) on K_COLON.
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const assignments = getPhaseCPhysicalAssignments();
    expect(assignments.filter((a) => a.target === "Á")).toHaveLength(1);
  });

  it("combo S-03: no parallel-combo prompt when the counterpart already has a PATTERN_SEQUENCE mechanism on the same indicator key", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    // Á already has a sequence mechanism keyed on the same indicator ("s")
    // the new á sequence below will use.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "Á",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: { firstLetterOut: "A", secondLetter: "s", collapsedChar: "Á" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByTestId("sequences-indicator"), {
      target: { value: "s" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("sequences-apply"));
    });

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const assignments = getPhaseCPhysicalAssignments();
    expect(assignments.filter((a) => a.target === "Á")).toHaveLength(1);
    expect(assignments.find((a) => a.target === "á")).toBeDefined();
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
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(useStepWalkStore.getState().cursors[MECHANISMS_STEP_ID]).toBe(
      charToPositionToken("á"),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /skip this character/i }));
    });
    expectCurrentChar("é");
    expect(useStepWalkStore.getState().cursors[MECHANISMS_STEP_ID]).toBe(
      charToPositionToken("é"),
    );
  });

  it("resumes on the character the author was on after the unmount a tab switch causes", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /skip this character/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /skip this character/i }));
    });
    expectCurrentChar("í");

    // The tab switch. NOT a store reset — the working copy survives; only this
    // component is destroyed and rebuilt.
    cleanup();
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Pre-fix: "á" — the first uncovered character, because nothing outlived the
    // component to say otherwise.
    expectCurrentChar("í");
  });

  it("honours a cursor written while mounted — activating a dot for this same stage", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expectCurrentChar("á");
    // A footer dot inside the step the author is already on: no route change, no
    // step change, nothing remounts, so only the live cursor can carry it.
    await act(async () => {
      useStepWalkStore.getState().setStepCursor(MECHANISMS_STEP_ID, charToPositionToken("í"));
    });
    expectCurrentChar("í");
  });

  it("ignores a cursor naming a character this walk does not hold", async () => {
    seedInventory(["á"]);
    await act(async () => {
      useStepWalkStore.getState().setStepCursor(MECHANISMS_STEP_ID, charToPositionToken("ω"));
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expectCurrentChar("á");
  });

  it("still prefers the first UNCOVERED character on a first-ever entry", async () => {
    // The arrival heuristic is unchanged where there is no cursor to honour —
    // only OUTRANKED by one, never replaced.
    useStepWalkStore.getState().reset();
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expectCurrentChar("á");
  });
});
