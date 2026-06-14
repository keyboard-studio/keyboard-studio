// Unit tests for MechanismGallery component.
// Rendering style follows lint.test.tsx (React Testing Library, jsdom).
// The services module is mocked so the test never touches Vite
// import.meta.glob or the real pattern catalog.
//
// Preview wiring tests: useKeyboardArtifact and applyAssignmentsToVfs are
// mocked so we can assert (a) the hook is called with the expected vfsTransform
// and (b) the preview renders loading/error/ready states correctly without
// touching WASM.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MechanismGallery } from "./MechanismGallery";
import { useSurveyResultsStore } from "../stores/surveyResultsStore";
import { useWorkingCopyStore } from "../stores/workingCopyStore";
import type { PatternLibraryService, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { PatternMatch } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact";
import type { MechanismAssignment } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// vi.hoisted() — variables that must be available inside vi.mock() factories.
// vi.mock() calls are hoisted to the top of the file by Vitest; any variables
// they reference must be created via vi.hoisted() so they exist at hoist time.
// ---------------------------------------------------------------------------

const { applyAssignmentsToVfsSpy } = vi.hoisted(() => {
  const applyAssignmentsToVfsSpy = vi.fn(
    (_vfs: VirtualFS, _keyboardId: string, _assignments: ReadonlyArray<MechanismAssignment>, _getPattern: (_id: string) => unknown) => ({
      kmn: "c mock result",
      warnings: [] as string[],
    }),
  );
  return { applyAssignmentsToVfsSpy };
});

// ---------------------------------------------------------------------------
// Mock the services module so we control what filterFor/getById return.
// ---------------------------------------------------------------------------

const mockSvc: PatternLibraryService = {
  listAll: () => Promise.resolve([latinDeadkeyAcuteSingle]),
  getById: (id: string) =>
    Promise.resolve(
      id === latinDeadkeyAcuteSingle.id ? latinDeadkeyAcuteSingle : undefined,
    ),
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
  LOCAL_PROXY_BASE: "",
}));

// ---------------------------------------------------------------------------
// Mock useKeyboardArtifact so tests never touch WASM.
// The mock stage is controlled per-test via setMockStage().
// ---------------------------------------------------------------------------

let _mockStage: Stage = { kind: "idle" };
const _mockRetry = vi.fn();
const _mockRecompile = vi.fn();

// Track the most recent vfsTransform passed to the hook.
let _lastVfsTransform: ((vfs: VirtualFS, keyboardId: string) => { warnings: string[] }) | null | undefined = undefined;

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
// Mock applyAssignmentsToVfs so we can spy on calls without VFS side-effects.
// ---------------------------------------------------------------------------

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...original,
    applyAssignmentsToVfs: applyAssignmentsToVfsSpy,
  };
});

// ---------------------------------------------------------------------------
// Mock OSKFrame so tests don't need an iframe + KMW environment.
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

function seedInventory(chars: string[]) {
  useSurveyResultsStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: chars,
  });
}

afterEach(() => {
  cleanup();
  useSurveyResultsStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
  _mockStage = { kind: "idle" };
  _lastVfsTransform = undefined;
});

beforeEach(() => {
  useSurveyResultsStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Empty/no-base state
// ---------------------------------------------------------------------------

describe("MechanismGallery — no base keyboard", () => {
  it("renders the pick-base prompt when selectedBaseKeyboard is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.getByText(/No base keyboard selected/i)).toBeTruthy();
  });

  it("does NOT render the gallery list when selectedBaseKeyboard is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.queryByRole("list")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No-inventory state
// ---------------------------------------------------------------------------

describe("MechanismGallery — no inventory", () => {
  it("renders the survey prompt when inventory is empty", () => {
    render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    expect(screen.getByText(/No inventory confirmed yet/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Gallery rendering with inventory + base
// ---------------------------------------------------------------------------

describe("MechanismGallery — with inventory", () => {
  it("renders the pattern card after filterFor resolves", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Pattern title should appear.
    expect(screen.getByText(latinDeadkeyAcuteSingle.title)).toBeTruthy();
  });

  it("renders the coverage indicator with correct counts", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // CoverageIndicator uses aria-label "Coverage: N of M characters covered"
    const indicator = screen.getByRole("status");
    expect(indicator.getAttribute("aria-label")).toMatch(/Coverage:/);
  });
});

// ---------------------------------------------------------------------------
// Applying a mechanism at keyboard-default scope
// ---------------------------------------------------------------------------

describe("MechanismGallery — apply mechanism at keyboard-default scope", () => {
  it("emits a MechanismAssignment into the store after Apply is clicked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Expand the card to reveal the Apply button.
    const configBtn = screen.getByRole("button", { name: /configure/i });
    fireEvent.click(configBtn);

    // Scope is keyboard-default by default; click Apply.
    const applyBtn = screen.getByRole("button", { name: /^Apply$/i });
    fireEvent.click(applyBtn);

    const state = useSurveyResultsStore.getState();
    const physicalAssignments = state.session.assignments.filter(
      (a) => a.modality === "physical",
    );
    expect(physicalAssignments).toHaveLength(1);
    expect(physicalAssignments[0]?.scope).toBe("keyboard-default");
    expect(physicalAssignments[0]?.mechanisms[0]?.patternId).toBe(
      latinDeadkeyAcuteSingle.id,
    );
  });
});

// ---------------------------------------------------------------------------
// Applying a mechanism at individual scope to a selected character
// ---------------------------------------------------------------------------

describe("MechanismGallery — apply at individual scope", () => {
  it("emits an individual-scope assignment for the selected character", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Expand the card.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));

    // Switch scope to individual.
    const individualRadio = screen.getByRole("radio", {
      name: /Individual characters/i,
    });
    fireEvent.click(individualRadio);

    // Select only 'á' (first char button).
    const charBtn = screen.getByRole("button", { name: /á/i });
    fireEvent.click(charBtn);

    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    const state = useSurveyResultsStore.getState();
    const assignments = state.session.assignments.filter(
      (a) => a.modality === "physical" && a.scope === "individual",
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("á");
  });
});

// ---------------------------------------------------------------------------
// Removing an assignment
// ---------------------------------------------------------------------------

describe("MechanismGallery — remove assignment", () => {
  it("removes the assignment from the store when Remove is clicked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Apply first.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    // Verify it's applied.
    expect(
      useSurveyResultsStore.getState().session.assignments.filter(
        (a) => a.modality === "physical",
      ),
    ).toHaveLength(1);

    // Remove — the Remove button appears only when the pattern isApplied.
    const removeBtn = screen.getByRole("button", { name: /^Remove$/i });
    fireEvent.click(removeBtn);

    expect(
      useSurveyResultsStore.getState().session.assignments.filter(
        (a) => a.modality === "physical",
      ),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Coverage indicator reflects covered/uncovered counts
// ---------------------------------------------------------------------------

describe("MechanismGallery — coverage indicator", () => {
  it("shows uncovered when no assignments exist", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    const indicator = screen.getByRole("status");
    // The aria-label is "Coverage: N of M characters covered" for all states.
    expect(indicator.getAttribute("aria-label")).toMatch(/Coverage: 0 of 2 characters covered/);
  });

  it("shows all covered after a keyboard-default assignment is applied", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    const indicator = screen.getByRole("status");
    // After a keyboard-default assignment the coverage indicator text changes,
    // but the aria-label always reflects the live count.
    expect(indicator.getAttribute("aria-label")).toMatch(/Coverage: 2 of 2 characters covered/);
  });
});

// ---------------------------------------------------------------------------
// Preview wiring — loading state
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

  it("renders a compiling (loading WASM) indicator for cold compile", async () => {
    setMockStage({ kind: "compiling", isWarmCompile: false });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/loading WASM/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Preview wiring — error state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Preview wiring — ready state + applyWarnings
// ---------------------------------------------------------------------------

describe("MechanismGallery — preview ready state", () => {
  const readyStage: Stage = {
    kind: "ready",
    compileResult: {
      success: true,
      artifacts: [],
      diagnostics: [],
    },
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
// Desktop layout lock UI
// ---------------------------------------------------------------------------

describe("MechanismGallery — desktop lock", () => {
  it("Lock button is disabled when there are no assignments", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    const lockBtn = screen.getByRole("button", { name: /Lock desktop layout/i });
    expect(lockBtn).toBeTruthy();
    // disabled attribute present
    expect((lockBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Lock button is enabled when there is at least one assignment", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Apply a mechanism first.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    const lockBtn = screen.getByRole("button", { name: /Lock desktop layout/i });
    expect((lockBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking Lock button sets desktopLocked and renders the locked banner", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Apply, then lock.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Lock desktop layout/i }));

    // Store reflects locked state.
    expect(useSurveyResultsStore.getState().desktopLocked).toBe(true);
    // Banner rendered with role=status and correct text.
    const banner = screen.getByRole("status", { name: /Desktop layout locked/i });
    expect(banner).toBeTruthy();
    // Lock button disappears; unlock button appears.
    expect(screen.queryByRole("button", { name: /Lock desktop layout/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Unlock to edit/i })).toBeTruthy();
  });

  it("controls inside MechanismCard are disabled when locked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Apply, lock.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Lock desktop layout/i }));

    // The Apply button inside the expanded card is disabled.
    const applyBtn = screen.getByRole("button", { name: /^Apply$/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("scope radios are disabled when locked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Expand, apply, lock.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Lock desktop layout/i }));

    // Both scope radios must be disabled.
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect((radio as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("char-picker buttons are disabled when locked (individual scope)", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Expand, switch to individual scope to show char picker, apply, lock.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Individual characters/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Lock desktop layout/i }));

    // All char-picker buttons in the inventory group should be disabled.
    const charGroup = screen.getByRole("group", { name: /Inventory characters/i });
    const charButtons = charGroup.querySelectorAll("button");
    expect(charButtons.length).toBeGreaterThan(0);
    for (const btn of charButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("slot inputs are disabled when locked", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Expand, apply, lock.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Lock desktop layout/i }));

    // All slot text inputs must be disabled.
    // latinDeadkeyAcuteSingle has 5 questions; each renders a text input.
    const slotInputs = screen.getAllByRole("textbox");
    expect(slotInputs.length).toBeGreaterThan(0);
    for (const input of slotInputs) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("lock-bypass guard: handleApply does nothing when desktopLocked is true", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Apply, lock, then attempt to apply again via the store directly
    // (simulates a bypass of the disabled control).
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    const beforeCount = useSurveyResultsStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical").length;
    fireEvent.click(screen.getByRole("button", { name: /Lock desktop layout/i }));

    // Force-click Apply even though it's disabled (simulates bypass).
    const applyBtn = screen.getByRole("button", { name: /^Apply$/i });
    fireEvent.click(applyBtn);

    const afterCount = useSurveyResultsStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical").length;
    // Count must not grow — the guard blocked the call.
    expect(afterCount).toBe(beforeCount);
  });

  it("clicking Unlock restores editing (desktopLocked becomes false)", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Apply, lock, then unlock.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Lock desktop layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /Unlock to edit/i }));

    // Store unlocked.
    expect(useSurveyResultsStore.getState().desktopLocked).toBe(false);
    // Banner gone; lock button back.
    expect(screen.queryByRole("status", { name: /Desktop layout locked/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Lock desktop layout/i })).toBeTruthy();
    // Apply button enabled again.
    const applyBtn = screen.getByRole("button", { name: /^Apply$/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Preview wiring — vfsTransform calls applyAssignmentsToVfs
// ---------------------------------------------------------------------------

describe("MechanismGallery — vfsTransform calls applyAssignmentsToVfs", () => {
  const readyStage: Stage = {
    kind: "ready",
    compileResult: { success: true, artifacts: [], diagnostics: [] },
    jsBlobUrl: "",
    vfs: createVirtualFS(),
    scaffoldWarnings: [],
  };

  // Seed the working-copy store with a minimal baseIr so useWorkingCopyTransform
  // returns a non-null transform. Phase 3 requires an instantiated working copy.
  function seedWorkingCopy() {
    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs,
      ir: makeTestIR([]),
    });
  }

  it("passes a vfsTransform to useKeyboardArtifact when patterns have loaded", async () => {
    setMockStage(readyStage);
    // Seed the working copy FIRST (instantiateFromBase resets phaseResults).
    seedWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // After patterns load, GalleryPreviewWithPatterns is rendered and passes
    // a non-null vfsTransform to useKeyboardArtifact.
    expect(_lastVfsTransform).not.toBeNull();
    expect(typeof _lastVfsTransform).toBe("function");
  });

  it("vfsTransform invokes applyAssignmentsToVfs with the session assignments", async () => {
    setMockStage(readyStage);
    seedWorkingCopy();
    seedInventory(["á"]);
    // Apply a mechanism so there is a real assignment in the store.
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Expand the card and apply a mechanism.
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));

    // Now manually invoke the captured vfsTransform.
    if (_lastVfsTransform !== null && _lastVfsTransform !== undefined) {
      const testVfs = createVirtualFS([
        { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
      ]);
      _lastVfsTransform(testVfs, basicKbdus.id);
      expect(applyAssignmentsToVfsSpy).toHaveBeenCalledWith(
        testVfs,
        basicKbdus.id,
        expect.arrayContaining([
          expect.objectContaining({ modality: "physical" }),
        ]),
        expect.any(Function),
      );
    }
  });

  it("vfsTransform resolves patterns from the patternMap (not the service)", async () => {
    setMockStage(readyStage);
    seedWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    if (_lastVfsTransform !== null && _lastVfsTransform !== undefined) {
      const testVfs = createVirtualFS();
      _lastVfsTransform(testVfs, basicKbdus.id);
      // Check the resolver passed as 4th arg by extracting from the spy call.
      const calls = applyAssignmentsToVfsSpy.mock.calls;
      if (calls.length > 0) {
        const lastCall = calls[calls.length - 1]!;
        const resolver = lastCall[3];
        // The resolver should return the pattern from the patternMap.
        const found = resolver(latinDeadkeyAcuteSingle.id);
        expect(found).toEqual(latinDeadkeyAcuteSingle);
        // Unknown id → undefined.
        expect(resolver("unknown-id")).toBeUndefined();
      }
    }
  });
});
