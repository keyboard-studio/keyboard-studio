// Tests for PreviewScreen and OutputScreen — the two screens produced by the
// preview/output split.
//
// PreviewScreen ("try it"):
//   - Renders OSK (testid osk-frame) and DiagnosticsPanel.
//   - Does NOT render a "Download .zip" button.
//   - Does NOT render GitHubSignUpPanel.
//
// OutputScreen ("ship it"):
//   - Renders "Download .zip" button and GitHubSignUpPanel.
//   - Does NOT render an interactive OSK (no osk-frame testid).
//   - projection-warning surface (original PreviewShell.test coverage, re-homed here)
//   - identity-unset warning banner (AC2 + AC4)
//   - download filename

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
        | { bytes: Uint8Array; warnings: string[]; keyboardId: string; version: string }
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
  projectWorkingCopyForOutput: () => Promise.resolve(null),
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
  instantiateFromBaseIfConfirmed: vi.fn(),
}));

vi.mock("../hooks/useWorkingCopyTransform.ts", () => ({
  useWorkingCopyTransform: () => null,
}));

// GitHubSignUpPanel pulls heavy deps (useGitHubAuth, services); mock it to a
// recognisable testid so we can assert its presence/absence without importing
// the real module.
vi.mock("./GitHubSignUpPanel.tsx", () => ({
  GitHubSignUpPanel: () => (
    <section data-testid="github-signup-panel" aria-label="Submit your keyboard">
      GitHub sign-up panel
    </section>
  ),
}));

// ---------------------------------------------------------------------------
// Import components under test AFTER mocks are registered.
// ---------------------------------------------------------------------------

import { PreviewScreen } from "./PreviewScreen.tsx";
import { OutputScreen } from "./OutputScreen.tsx";

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
  compileResult: { success: true, artifacts: [], diagnostics: [], compileMs: 0, isWarmCompile: true },
  jsBlobUrl: "",
  vfs: createVirtualFS(),
  scaffoldWarnings: [],
  keyboardId: "basic_kbdus",
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
// Route-split assertions (AC)
// ---------------------------------------------------------------------------

describe("PreviewScreen — route-split AC", () => {
  it("renders the OSK frame (osk-frame testid)", () => {
    render(<PreviewScreen />);
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
  });

  it("renders DiagnosticsPanel (no-diagnostics message) after base is picked", () => {
    render(<PreviewScreen />);
    fireEvent.click(screen.getByTestId("base-picker"));
    // DiagnosticsPanel renders "No compiler diagnostics." when empty.
    expect(screen.getByText(/no compiler diagnostics/i)).toBeTruthy();
  });

  it("does NOT render a Download .zip button", () => {
    render(<PreviewScreen />);
    fireEvent.click(screen.getByTestId("base-picker"));
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
  });

  it("does NOT render GitHubSignUpPanel", () => {
    render(<PreviewScreen />);
    fireEvent.click(screen.getByTestId("base-picker"));
    expect(screen.queryByTestId("github-signup-panel")).toBeNull();
  });
});

describe("OutputScreen — route-split AC", () => {
  it("renders the Download .zip button after base is picked", () => {
    seedInstantiatedWorkingCopy();
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: [],
      keyboardId: "basic_kbdus",
      version: "1.0",
    };
    render(<OutputScreen />);
    fireEvent.click(screen.getByTestId("base-picker"));
    expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
  });

  it("renders GitHubSignUpPanel after base is picked", () => {
    render(<OutputScreen />);
    fireEvent.click(screen.getByTestId("base-picker"));
    expect(screen.getByTestId("github-signup-panel")).toBeTruthy();
  });

  it("does NOT render an interactive OSK (no osk-frame testid)", () => {
    render(<OutputScreen />);
    fireEvent.click(screen.getByTestId("base-picker"));
    expect(screen.queryByTestId("osk-frame")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — projection warning surface (re-homed from PreviewShell.test)
// ---------------------------------------------------------------------------

describe("OutputScreen — projection warnings", () => {
  it("does NOT render a warning region when serializeWorkingCopy returns no warnings", async () => {
    seedInstantiatedWorkingCopy();
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: [],
      keyboardId: "basic_kbdus",
      version: "1.0",
    };

    render(<OutputScreen />);

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
      version: "1.0",
    };

    render(<OutputScreen />);
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
      version: "1.0",
    };

    render(<OutputScreen />);
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
      version: "1.0",
    };

    render(<OutputScreen />);
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
      version: "1.0",
    };

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download/i }));
    });

    // Warning region should be gone.
    expect(screen.queryByRole("status", { name: /Download projection warnings/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — identity-unset warning banner (AC2 + AC4)
// ---------------------------------------------------------------------------

// Helper: render OutputScreen with the base-picker clicked so local
// baseKeyboard is set (the identity-warn banner is inside {baseKeyboard !== null}).
// seedInstantiatedWorkingCopy() seeds the store first so the idempotence guard
// in instantiateFromBase keeps identity = null → showIdentityWarn = true.
function renderOutputWithBasePicked() {
  seedInstantiatedWorkingCopy();
  render(<OutputScreen />);
  fireEvent.click(screen.getByTestId("base-picker"));
}

function getIdentityStatusRegion() {
  const regions = screen.getAllByRole("status");
  const el = regions.find((e) => e.textContent?.includes("base id"));
  expect(el).toBeTruthy();
  return el!;
}

describe("OutputScreen — identity-unset warning banner", () => {
  it("renders an actionable button with the identity-step aria-label when identity is unset (AC4)", () => {
    renderOutputWithBasePicked();

    // The banner must contain a button that directs the user to the id step.
    const btn = screen.getByRole("button", {
      name: /go to the keyboard name and id step/i,
    });
    expect(btn).toBeTruthy();
    // Clicking must not throw. TrackOneIdentityPanel is mocked in this suite,
    // so #identity-keyboard-id is absent — the handler's getElementById returns
    // null and the scroll/focus calls are guarded no-ops.
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it("actionable button is inside the role=status live region (AC4)", () => {
    renderOutputWithBasePicked();

    // Find the status region that contains the identity-warn text.
    const identityStatus = getIdentityStatusRegion();
    const innerBtn = identityStatus.querySelector(
      "[aria-label='Go to the keyboard name and id step']",
    );
    expect(innerBtn).toBeTruthy();
  });

  it("banner text references the download/zip path (AC2)", () => {
    renderOutputWithBasePicked();

    const identityStatus = getIdentityStatusRegion();
    // Must mention the ZIP download concern.
    expect(identityStatus.textContent).toMatch(/\.zip|download/i);
  });

  it("banner text also references the community repository (AC2)", () => {
    renderOutputWithBasePicked();

    const identityStatus = getIdentityStatusRegion();
    expect(identityStatus.textContent).toMatch(/community repository/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — download filename
// ---------------------------------------------------------------------------

describe("OutputScreen — download filename", () => {
  it("names the download <keyboardId>-<version>.zip", async () => {
    seedInstantiatedWorkingCopy();
    mockSerializeResult.current = {
      bytes: new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      warnings: [],
      keyboardId: "basic_kbdus",
      version: "2.5",
    };

    // Spy on createElement to capture the download anchor's filename. Override
    // the anchor's click() to a no-op so we read the download attr without
    // triggering jsdom's "navigation not implemented" noise.
    const realCreateElement = document.createElement.bind(document);
    let anchorDownload: string | null = null;
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation(((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === "a") {
          const a = el as HTMLAnchorElement;
          a.click = () => {
            anchorDownload = a.download;
          };
        }
        return el;
      }) as typeof document.createElement);

    try {
      render(<OutputScreen />);
      fireEvent.click(screen.getByTestId("base-picker"));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /download/i }));
      });

      expect(anchorDownload).toBe("basic_kbdus-2.5.zip");
    } finally {
      createElementSpy.mockRestore();
    }
  });
});
