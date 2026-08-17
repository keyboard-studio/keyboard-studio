// OutputScreen — the .kmp download (spec §12).
//
// The behaviour that matters to an ordinary author: the primary button hands
// them a file they can install by double-clicking, and when that fails they are
// told why and can still get the source .zip. A failed package must never be a
// dead end, and it must never silently fall back to handing over a .zip the user
// did not ask for.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../hooks/useKeyboardArtifact";

// Everything referenced inside a vi.mock factory must live in vi.hoisted —
// including the error class, since the factories are hoisted above any
// top-level class declaration.
const { mockKmp, mockZip, mockStage, capturedDownloads, FakeOutputBundleError } = vi.hoisted(
  () => ({
    mockKmp: {
      current: null as
        | { ok: true; bytes: Uint8Array; filename: string; warnings: string[] }
        | { ok: false; message: string; diagnostics: { code: string; message: string }[] }
        | null,
    },
    mockZip: {
      current: {
        bytes: new Uint8Array([80, 75, 5, 6]),
        filename: "basic_kbdus-1.0.zip",
        warnings: [] as string[],
      },
    },
    mockStage: { current: { kind: "idle" } as Stage },
    capturedDownloads: { current: [] as { filename: string; type: string }[] },
    FakeOutputBundleError: class extends Error {
      diagnostics: { code: string; message: string }[];
      constructor(message: string, diagnostics: { code: string; message: string }[] = []) {
        super(message);
        this.name = "OutputBundleError";
        this.diagnostics = diagnostics;
      }
    },
  }),
);

vi.mock("../lib/buildOutputBundle.ts", () => ({
  buildKmpForDownload: () => {
    const m = mockKmp.current;
    if (m === null) return Promise.resolve(null);
    if (!m.ok) return Promise.reject(new FakeOutputBundleError(m.message, m.diagnostics));
    return Promise.resolve({ bytes: m.bytes, filename: m.filename, warnings: m.warnings });
  },
  buildSourceZipForDownload: () => Promise.resolve(mockZip.current),
  OutputBundleError: FakeOutputBundleError,
}));

vi.mock("../lib/serializeWorkingCopy.ts", () => ({
  serializeWorkingCopy: () => Promise.resolve(null),
  projectWorkingCopyForOutput: () => Promise.resolve(null),
  zipProjectedVfs: () => Promise.resolve(new Uint8Array(0)),
}));

vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: mockStage.current, retry: vi.fn(), recompile: vi.fn() }),
}));

vi.mock("./BaseKeyboardPicker.tsx", () => ({
  BaseKeyboardPicker: ({ onChange }: { onChange: (kb: unknown) => void }) => (
    <button data-testid="base-picker" onClick={() => onChange(basicKbdus)}>pick</button>
  ),
}));
vi.mock("./OSKFrame.tsx", () => ({ OSKFrame: () => <div /> }));
vi.mock("./KmnEditor.tsx", () => ({ KmnEditor: () => <div /> }));
vi.mock("../editors/panels/ScaffoldForm.tsx", () => ({ ScaffoldForm: () => <div /> }));
vi.mock("../editors/panels/TrackOneIdentityPanel.tsx", () => ({
  TrackOneIdentityPanel: () => <div />,
}));
vi.mock("../lib/confirmRebase.ts", () => ({
  confirmRebaseIfEdited: () => true,
  instantiateFromBaseIfConfirmed: vi.fn(),
}));
vi.mock("../hooks/useWorkingCopyTransform.ts", () => ({ useWorkingCopyTransform: () => null }));
vi.mock("./SignUpPanel.tsx", () => ({ SignUpPanel: () => <section data-testid="signup-panel" /> }));

import { OutputScreen } from "./OutputScreen.tsx";

function seed() {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
  // spec 064: the attribution gates block BOTH downloads — the .kmp is the
  // primary artifact, not a shortcut past them. This suite is about the package
  // build, so give it an author; the gate itself is asserted in
  // OutputScreen.test.tsx.
  useWorkingCopyStore.getState().setAttribution({
    authorName: "Alice Example",
    copyrightHolder: "Alice Example",
  });
}

function renderReady() {
  // Seeding an instantiated working copy is enough: since spec 058 the left pane
  // switches to its "shipping" variant, which has NO base picker to click
  // (re-basing from the ship-it screen was the defect that change removed). The
  // download buttons render directly off the seeded working copy — mirrors
  // OutputScreen.test.tsx's seedInstantiatedWorkingCopy() pattern after the
  // route-split merge.
  seed();
  render(<OutputScreen />);
}

let originalCreateObjectURL: typeof URL.createObjectURL;
let originalRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  capturedDownloads.current = [];
  mockKmp.current = {
    ok: true,
    bytes: new Uint8Array([80, 75, 5, 6]),
    filename: "basic_kbdus.kmp",
    warnings: [],
  };
  mockStage.current = {
    kind: "ready",
    compileResult: { success: true, artifacts: [], diagnostics: [], compileMs: 0, isWarmCompile: true },
    jsBlobUrl: "",
    vfs: createVirtualFS(),
    scaffoldWarnings: [],
    keyboardId: "basic_kbdus",
  };

  // Capture what the browser was actually asked to download.
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = ((blob: Blob) => {
    capturedDownloads.current.push({ filename: "", type: blob.type });
    return "blob:fake";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  cleanup();
  vi.clearAllMocks();
});

describe("OutputScreen — .kmp is the primary download", () => {
  it("offers the .kmp above the source .zip, and says how to install it", () => {
    renderReady();

    const kmp = screen.getByTestId("emit-download-kmp");
    const zip = screen.getByTestId("emit-download");
    expect(kmp.textContent).toMatch(/\.kmp/);
    expect(zip.textContent).toMatch(/source \.zip/i);

    // The primary action comes first in document order.
    expect(kmp.compareDocumentPosition(zip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // An ordinary author is told what to do with the file.
    expect(screen.getByText(/double-clicking/i)).toBeTruthy();
  });

  it("downloads the package on click", async () => {
    renderReady();

    await act(async () => {
      fireEvent.click(screen.getByTestId("emit-download-kmp"));
    });

    expect(capturedDownloads.current.length).toBe(1);
  });

  it("shows why the package failed AND keeps the source .zip available", async () => {
    mockKmp.current = {
      ok: false,
      message: "Could not build the installable package.",
      diagnostics: [
        { code: "KM_ERROR_KMP_FILE_MISSING", message: 'Package member "build/x.kvk" is not present.' },
      ],
    };
    renderReady();

    await act(async () => {
      fireEvent.click(screen.getByTestId("emit-download-kmp"));
    });

    const alert = screen.getByTestId("emit-download-kmp-error");
    expect(alert.textContent).toMatch(/could not build the installable package/i);
    // The actual cause, not just "failed".
    expect(alert.textContent).toMatch(/KM_ERROR_KMP_FILE_MISSING/);
    expect(alert.textContent).toMatch(/build\/x\.kvk/);
    // Never a dead end.
    expect(alert.textContent).toMatch(/still download the source \.zip/i);
    expect((screen.getByTestId("emit-download") as HTMLButtonElement).disabled).toBe(false);

    // And no silent fallback: nothing was handed to the browser.
    expect(capturedDownloads.current.length).toBe(0);
  });

  it("does not fall back to the .zip when the package fails", async () => {
    mockKmp.current = { ok: false, message: "nope", diagnostics: [] };
    renderReady();

    await act(async () => {
      fireEvent.click(screen.getByTestId("emit-download-kmp"));
    });

    // The author asked for a package; handing them an archive instead would be
    // a different artifact than the one they requested.
    expect(capturedDownloads.current.length).toBe(0);
    expect(screen.getByTestId("emit-download-kmp-error")).toBeTruthy();
  });

  it("clears a previous failure on a subsequent successful build", async () => {
    mockKmp.current = { ok: false, message: "nope", diagnostics: [] };
    renderReady();
    await act(async () => {
      fireEvent.click(screen.getByTestId("emit-download-kmp"));
    });
    expect(screen.queryByTestId("emit-download-kmp-error")).toBeTruthy();

    mockKmp.current = {
      ok: true,
      bytes: new Uint8Array([80, 75, 5, 6]),
      filename: "basic_kbdus.kmp",
      warnings: [],
    };
    await act(async () => {
      fireEvent.click(screen.getByTestId("emit-download-kmp"));
    });
    expect(screen.queryByTestId("emit-download-kmp-error")).toBeNull();
  });

  it("reports 'nothing to download' rather than failing silently", async () => {
    mockKmp.current = null;
    renderReady();

    await act(async () => {
      fireEvent.click(screen.getByTestId("emit-download-kmp"));
    });

    expect(screen.getByTestId("emit-download-kmp-error").textContent).toMatch(
      /select a keyboard first/i,
    );
  });
});
