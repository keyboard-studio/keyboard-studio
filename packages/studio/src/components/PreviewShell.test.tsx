// Tests for PreviewShell — projection-warning surface (Task 2).
//
// Coverage:
//   1. No warning region when serializeWorkingCopy returns no warnings.
//   2. Warning region renders with all warning strings when non-empty.
//   3. Warning region has role="status" and aria-live="polite" (non-blocking).
//   4. Warning region is cleared on a fresh download attempt.
//
// The heavy pipeline (useKeyboardArtifact, serializeWorkingCopy, BaseKeyboardPicker,
// OSKFrame, etc.) is mocked so we can exercise the UI state machine without WASM.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useWorkingCopyStore } from "../stores/workingCopyStore";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../hooks/useKeyboardArtifact";

// ---------------------------------------------------------------------------
// vi.hoisted — variables referenced inside vi.mock factories.
// ---------------------------------------------------------------------------

const { mockSerializeResult, mockStage } = vi.hoisted(() => {
  return {
    mockSerializeResult: {
      current: null as
        | { bytes: Uint8Array; warnings: string[]; keyboardId: string }
        | null,
    },
    mockStage: {
      current: { kind: "idle" } as Stage,
    },
  };
});

// ---------------------------------------------------------------------------
// Mock heavy dependencies.
// ---------------------------------------------------------------------------

vi.mock("../lib/serializeWorkingCopy.ts", () => ({
  serializeWorkingCopy: () => Promise.resolve(mockSerializeResult.current),
}));

vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({
    stage: mockStage.current,
    retry: vi.fn(),
    recompile: vi.fn(),
  }),
}));

vi.mock("./BaseKeyboardPicker.tsx", () => ({
  BaseKeyboardPicker: ({ onChange }: { onChange: (kb: unknown) => void }) => (
    <button
      data-testid="base-picker"
      onClick={() => onChange(basicKbdus)}
    >
      pick base
    </button>
  ),
}));

vi.mock("./OSKFrame.tsx", () => ({
  OSKFrame: () => <div data-testid="osk-frame">osk</div>,
}));

vi.mock("./KmnEditor.tsx", () => ({
  KmnEditor: () => <div data-testid="kmn-editor">editor</div>,
}));

vi.mock("./ScaffoldForm.tsx", () => ({
  ScaffoldForm: () => <div data-testid="scaffold-form">scaffold</div>,
}));

vi.mock("./TrackOneIdentityPanel.tsx", () => ({
  TrackOneIdentityPanel: () => <div data-testid="identity-panel">identity</div>,
}));

vi.mock("./OskModeToggle.tsx", () => ({
  OskModeToggle: () => <div data-testid="osk-toggle">toggle</div>,
}));

vi.mock("../lib/confirmRebase.ts", () => ({
  confirmRebaseIfEdited: () => true,
}));

// ---------------------------------------------------------------------------
// Import the component under test AFTER mocks are registered.
// ---------------------------------------------------------------------------

import { PreviewShell } from "./PreviewShell.tsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedInstantiatedWorkingCopy() {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs,
    ir: makeTestIR([]),
  });
}

const readyStage: Stage = {
  kind: "ready",
  compileResult: { success: true, artifacts: [], diagnostics: [] },
  jsBlobUrl: "",
  vfs: createVirtualFS(),
  scaffoldWarnings: [],
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  mockStage.current = readyStage;
  mockSerializeResult.current = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — projection warning surface
// ---------------------------------------------------------------------------

describe("PreviewShell — projection warnings", () => {
  it("does NOT render a warning region when serializeWorkingCopy returns no warnings", async () => {
    seedInstantiatedWorkingCopy();
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: [],
      keyboardId: "basic_kbdus",
    };

    render(<PreviewShell />);

    // Click the base picker to set the base keyboard (renders the Download button).
    fireEvent.click(screen.getByTestId("base-picker"));

    // Click Download.
    await act(async () => {
      const btn = screen.getByRole("button", { name: /download/i });
      fireEvent.click(btn);
    });

    // No warning region should exist.
    expect(screen.queryByRole("status", { name: /Download projection warnings/i })).toBeNull();
  });

  it("renders the warning region with each warning string when warnings are returned", async () => {
    seedInstantiatedWorkingCopy();
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: [
        "[serialize] zip named ha_sil.zip but internal source paths still reference basic_kbdus",
        "[carve] opaque IR skipped",
      ],
      keyboardId: "ha_sil",
    };

    render(<PreviewShell />);
    fireEvent.click(screen.getByTestId("base-picker"));

    await act(async () => {
      const btn = screen.getByRole("button", { name: /download/i });
      fireEvent.click(btn);
    });

    const region = screen.getByRole("status", { name: /Download projection warnings/i });
    expect(region).toBeTruthy();
    expect(region.textContent).toMatch(/zip named ha_sil\.zip/);
    expect(region.textContent).toMatch(/opaque IR skipped/);
  });

  it("warning region has aria-live='polite' (non-blocking)", async () => {
    seedInstantiatedWorkingCopy();
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: ["[serialize] something"],
      keyboardId: "basic_kbdus",
    };

    render(<PreviewShell />);
    fireEvent.click(screen.getByTestId("base-picker"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    const region = screen.getByRole("status", { name: /Download projection warnings/i });
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  it("warning region is cleared on a subsequent clean download", async () => {
    seedInstantiatedWorkingCopy();

    // First download — with warnings.
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: ["[serialize] first warning"],
      keyboardId: "basic_kbdus",
    };

    render(<PreviewShell />);
    fireEvent.click(screen.getByTestId("base-picker"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    expect(screen.getByRole("status", { name: /Download projection warnings/i })).toBeTruthy();

    // Second download — no warnings.
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: [],
      keyboardId: "basic_kbdus",
    };

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    // Warning region should be gone.
    expect(screen.queryByRole("status", { name: /Download projection warnings/i })).toBeNull();
  });
});
