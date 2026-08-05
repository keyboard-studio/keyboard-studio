// CompareShell.test — spec 057 US2 (T030), FR-021 / FR-022 / FR-023 / FR-025.
//
// Replaces the PreviewScreen half of the old PreviewShell.test.tsx (FR-072:
// updated to the new contract, not deleted). The assertions look nothing like
// the ones they replace, because the contract inverted: PreviewScreen was
// tested for what it RENDERED, and CompareScreen is defined by what it CANNOT
// DO.
//
// The isolation is structural, so these tests are written to fail if the
// structure is reintroduced — not merely if a particular click sequence
// misbehaves. Each names the write path it forbids.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useViewStateStore } from "../stores/viewStateStore.ts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";

const { mockStage, keyboardArtifactCalls } = vi.hoisted(() => ({
  mockStage: { current: { kind: "idle" } as Stage },
  // Every argument list `useKeyboardArtifact` is called with, so the tests can
  // assert on the CALL rather than on a downstream symptom of it.
  keyboardArtifactCalls: [] as unknown[][],
}));

vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (...args: unknown[]) => {
    keyboardArtifactCalls.push(args);
    return { stage: mockStage.current, retry: vi.fn(), recompile: vi.fn() };
  },
}));

vi.mock("./BaseKeyboardPicker.tsx", () => ({
  BaseKeyboardPicker: ({ onChange }: { onChange: (kb: unknown) => void }) => (
    <button data-testid="base-picker" onClick={() => onChange(basicKbdus)}>
      pick base
    </button>
  ),
}));

vi.mock("./OSKFrame.tsx", () => ({ OSKFrame: () => <div data-testid="osk-frame">osk</div> }));
vi.mock("./OskModeToggle.tsx", () => ({ OskModeToggle: () => <div data-testid="osk-toggle" /> }));

const useWorkingCopyTransformSpy = vi.fn(() => null);
vi.mock("../hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => useWorkingCopyTransformSpy(),
}));

const instantiateSpy = vi.fn();
vi.mock("../lib/confirmRebase.ts", () => ({
  confirmRebaseIfEdited: () => true,
  instantiateFromBaseIfConfirmed: (...a: unknown[]) => instantiateSpy(...a),
  needsRebaseConfirm: () => false,
  confirmRebaseTo: () => true,
  REBASE_CONFIRM_MESSAGE: "",
}));

import { CompareScreen } from "./CompareScreen.tsx";

/** A working copy with recorded edits — the thing that must not be touched. */
function seedWorkingCopy() {
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs: createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }]),
    ir: makeTestIR([]),
  });
}

function snapshotProject() {
  const s = useWorkingCopyStore.getState();
  return {
    baseId: s.baseKeyboard?.id ?? null,
    identity: s.identity,
    instantiationMode: s.instantiationMode,
    phaseResultsCount: s.phaseResults.length,
    deletedNodeIds: [...s.deletedNodeIds],
  };
}

beforeEach(() => {
  keyboardArtifactCalls.length = 0;
  instantiateSpy.mockClear();
  useWorkingCopyTransformSpy.mockClear();
  useWorkingCopyStore.getState().reset();
  useViewStateStore.getState().reset();
  mockStage.current = {
    kind: "ready",
    compileResult: { success: true, artifacts: [], diagnostics: [], compileMs: 0, isWarmCompile: true },
    jsBlobUrl: "",
    vfs: createVirtualFS([{ path: "source/foreign.kmn", content: "c foreign\n", isBinary: false }]),
    scaffoldWarnings: [],
    keyboardId: "foreign",
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("no write path exists (FR-021, FR-022, FR-025)", () => {
  it("passes NO onInstantiate to the artifact pipeline — the guarantee, stated directly", () => {
    render(<CompareScreen />);

    expect(keyboardArtifactCalls.length).toBeGreaterThan(0);
    for (const args of keyboardArtifactCalls) {
      // Signature: (baseKeyboard, scaffoldSpec, vfsTransform, onInstantiate).
      // A non-null 4th argument is the rebase path, whatever it does.
      expect(args[3] ?? null).toBeNull();
    }
  });

  it("passes NO scaffold spec — scaffolding creates a project, which belongs to the wizard", () => {
    render(<CompareScreen />);
    for (const args of keyboardArtifactCalls) {
      expect(args[1] ?? null).toBeNull();
    }
  });

  it("does NOT apply the author's working-copy transform to a foreign keyboard", () => {
    seedWorkingCopy();
    render(<CompareScreen />);

    expect(useWorkingCopyTransformSpy).not.toHaveBeenCalled();
    for (const args of keyboardArtifactCalls) {
      expect(args[2] ?? null).toBeNull();
    }
  });

  it("never reaches instantiateFromBaseIfConfirmed, so no rebase dialog can be raised", () => {
    seedWorkingCopy();
    render(<CompareScreen />);
    screen.getByTestId("base-picker").click();

    expect(instantiateSpy).not.toHaveBeenCalled();
  });

  it("leaves the working copy byte-identical across a full load-and-inspect session", () => {
    seedWorkingCopy();
    const before = snapshotProject();

    render(<CompareScreen />);
    // Exercise every control the tab offers: load a keyboard, and let the
    // pipeline settle into the ready stage the mock is already in.
    screen.getByTestId("base-picker").click();

    expect(snapshotProject()).toEqual(before);
  });
});

describe("no editing controls at all (FR-023)", () => {
  it("renders no identity panel", () => {
    seedWorkingCopy();
    render(<CompareScreen />);
    // TrackOneIdentityPanel's landmark. It was mounted unconditionally by
    // PreviewScreen's identityPanelSlot and wrote to the shared store on every
    // valid keystroke (D-6).
    expect(screen.queryByRole("region", { name: /Name your keyboard/i })).toBeNull();
  });

  it("renders no scaffold form and no open/scaffold mode toggle", () => {
    render(<CompareScreen />);
    expect(screen.queryByTestId("scaffold-form")).toBeNull();
    expect(screen.queryByRole("group", { name: /keyboard source mode/i })).toBeNull();
  });

  it("renders no editable source field — source is shown read-only", () => {
    render(<CompareScreen />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("compare-source")).toBeTruthy();
  });

  it("renders no download affordance — shipping is Output's job", () => {
    render(<CompareScreen />);
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
    expect(screen.queryByTestId("emit-download")).toBeNull();
  });
});

describe("what the tab IS for (FR-024)", () => {
  it("loads and runs a keyboard, and shows its source", () => {
    render(<CompareScreen />);
    screen.getByTestId("base-picker").click();

    expect(screen.getByTestId("osk-frame")).toBeTruthy();
    expect(screen.getByTestId("compare-source").textContent).toContain("c foreign");
  });

  it("holds the selection in session view state, so it survives a tab switch (Q5)", () => {
    const { unmount } = render(<CompareScreen />);
    screen.getByTestId("base-picker").click();
    expect(useViewStateStore.getState().compareSelection?.baseKeyboard.id).toBe(basicKbdus.id);

    // A route change unmounts the screen; the module-level view store spans it.
    unmount();
    expect(useViewStateStore.getState().compareSelection?.baseKeyboard.id).toBe(basicKbdus.id);
  });

  it("keeps the selection out of every authoring store", () => {
    render(<CompareScreen />);
    screen.getByTestId("base-picker").click();

    // The foreign keyboard is loaded, but the project still has none.
    expect(useViewStateStore.getState().compareSelection).not.toBeNull();
    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();
    expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
  });
});
