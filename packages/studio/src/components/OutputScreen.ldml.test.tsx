// OutputScreen: the LDML download panel (spec 108 FR-002, FR-027, SC-012).
//
// The panel is a third download behind the SAME gate as the .kmp and the .zip. These tests
// cover the picker, the shared blocker reason, the ANSI-only refusal, the base-keyboard
// choice, the two-interaction profile switch, and the first assertion that each download's
// aria-label carries the same keyboard id as the file it produces.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore";
import { useDecisionStore } from "../stores/decisionStore";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../hooks/useKeyboardArtifact";

const { mockStage, mockGate, ldmlCalls, downloaded } = vi.hoisted(() => ({
  mockStage: { current: { kind: "idle" } as Stage },
  mockGate: {
    current: {
      unimplementedDesktop: [] as string[],
      unimplementedTouch: [] as string[],
      blockedOnDesktop: false,
      blockedOnTouch: false,
      touchLayoutCorrupted: false,
      blocked: false,
    },
  },
  ldmlCalls: { current: [] as string[] },
  downloaded: { current: [] as string[] },
}));

vi.mock("../lib/buildOutputBundle.ts", () => ({
  buildKmpForDownload: () =>
    Promise.resolve({ bytes: new Uint8Array([80, 75]), filename: "basic_kbdus.kmp", warnings: [] }),
  buildSourceZipForDownload: () =>
    Promise.resolve({ bytes: new Uint8Array([80, 75]), filename: "basic_kbdus-1.0.zip", warnings: [] }),
  buildLdmlExportForDownload: (profileId: string) => {
    ldmlCalls.current.push(profileId);
    return Promise.resolve({
      bytes: new Uint8Array([80, 75]),
      filename: "basic_kbdus_ldml-1.0.0.zip",
      warnings: [],
    });
  },
  OutputBundleError: class extends Error {},
}));
vi.mock("../hooks/useInventoryCoverageGate.ts", () => ({ useInventoryCoverageGate: () => mockGate.current }));
vi.mock("../lib/serializeWorkingCopy.ts", () => ({
  serializeWorkingCopy: () => Promise.resolve(null),
  projectWorkingCopyForOutput: () => Promise.resolve(null),
  zipProjectedVfs: () => Promise.resolve(new Uint8Array(0)),
}));
vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: mockStage.current, retry: vi.fn(), recompile: vi.fn() }),
}));
vi.mock("./StartKeyboardPicker.tsx", () => ({ StartKeyboardPicker: () => <div /> }));
vi.mock("./OSKFrame.tsx", () => ({ OSKFrame: () => <div /> }));
vi.mock("./KmnEditor.tsx", () => ({ KmnEditor: () => <div /> }));
vi.mock("../editors/panels/ScaffoldForm.tsx", () => ({ ScaffoldForm: () => <div /> }));
vi.mock("../editors/panels/TrackOneIdentityPanel.tsx", () => ({ TrackOneIdentityPanel: () => <div /> }));
vi.mock("../lib/confirmRebase.ts", () => ({
  confirmRebaseIfEdited: () => true,
  instantiateFromStartIfConfirmed: vi.fn(),
}));
vi.mock("../hooks/useWorkingCopyTransform.ts", () => ({ useWorkingCopyTransform: () => null }));
vi.mock("./SignUpPanel.tsx", () => ({ SignUpPanel: () => <section data-testid="signup-panel" /> }));

import { OutputScreen } from "./OutputScreen.tsx";

function seed() {
  const vfs = createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }]);
  useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([]) });
  useWorkingCopyStore.getState().setAttribution({ authorName: "Alice Example", copyrightHolder: "Alice Example" });
}

function pickWindowsLayout(layoutId: string) {
  useDecisionStore.setState({
    decisions: { "windows-layout": { id: "windows-layout", value: { layoutIds: [layoutId] } } as never },
  });
}

async function renderReady(): Promise<HTMLButtonElement> {
  seed();
  render(<OutputScreen />);
  return (await screen.findByTestId("emit-download-ldml")) as HTMLButtonElement;
}

const ldmlButton = () => screen.getByTestId("emit-download-ldml") as HTMLButtonElement;
const profileSelect = () => screen.getByTestId("ldml-profile-select") as HTMLSelectElement;
const baseSelect = () => screen.getByTestId("ldml-base-select") as HTMLSelectElement;
const optionText = (select: HTMLSelectElement, value: string) =>
  Array.from(select.options).find((o) => o.value === value)?.textContent ?? "";

let originalClick: typeof HTMLAnchorElement.prototype.click;
let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

beforeEach(() => {
  useDecisionStore.getState().reset();
  ldmlCalls.current = [];
  downloaded.current = [];
  mockGate.current = {
    unimplementedDesktop: [],
    unimplementedTouch: [],
    blockedOnDesktop: false,
    blockedOnTouch: false,
    touchLayoutCorrupted: false,
    blocked: false,
  };
  mockStage.current = {
    kind: "ready",
    compileResult: { success: true, artifacts: [], diagnostics: [], compileMs: 0, isWarmCompile: true },
    jsBlobUrl: "",
    vfs: createVirtualFS(),
    scaffoldWarnings: [],
    keyboardId: "basic_kbdus",
  };
  originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    downloaded.current.push(this.download);
  };
  originalCreate = URL.createObjectURL;
  originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (() => "blob:fake") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  HTMLAnchorElement.prototype.click = originalClick;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  cleanup();
  vi.clearAllMocks();
});

describe("OutputScreen: LDML download panel", () => {
  it("scenario 0: 46 is preselected and labelled compilable; 49 is labelled TR35-only", async () => {
    await renderReady();
    expect(profileSelect().value).toBe("46");
    expect(optionText(profileSelect(), "46")).toMatch(/Keyman compiles it/);
    expect(optionText(profileSelect(), "49")).toMatch(/TR35-only \(awaiting Keyman\)/);
    expect(screen.getByLabelText(/LDML version/i)).toBe(profileSelect());
    expect(screen.getByLabelText(/Base keyboard for the export/i)).toBe(baseSelect());
  });

  it("scenario 4: a coverage blocker disables the LDML button with the shared aria reason", async () => {
    mockGate.current = { ...mockGate.current, unimplementedDesktop: ["a"], blockedOnDesktop: true, blocked: true };
    await renderReady();
    expect(ldmlButton().disabled).toBe(true);
    const zipAria = screen.getByTestId("emit-download").getAttribute("aria-label");
    expect(zipAria).toMatch(/finish every inventory character/i);
    expect(ldmlButton().getAttribute("aria-label")).toBe(zipAria);
  });

  it("an ANSI-only keyboard disables the download and says why", async () => {
    seed();
    const ir = useWorkingCopyStore.getState().ir!;
    useWorkingCopyStore.setState({ ir: { ...ir, header: { ...ir.header, encoding: "ANSI" } } });
    render(<OutputScreen />);
    await screen.findByTestId("emit-download-ldml");
    expect(ldmlButton().disabled).toBe(true);
    expect(ldmlButton().getAttribute("aria-label")).toMatch(/ANSI-only/);
    expect(screen.getByTestId("ldml-ansi-only").textContent).toMatch(/ANSI-only/);
  });

  it("FR-027: the base picker defaults to the primary windows-layout pick with its source shown", async () => {
    pickWindowsLayout("basic_kbdfr");
    await renderReady();
    expect(baseSelect().value).toBe("azerty");
    expect(optionText(baseSelect(), "azerty")).toMatch(/default, your chosen layout/);
    expect(ldmlButton().disabled).toBe(false);
  });

  it("FR-027: an unavailable primary pick disables the download with its reason, and picking another enables it", async () => {
    pickWindowsLayout("basic_kbdru");
    await renderReady();
    expect(ldmlButton().disabled).toBe(true);
    expect(screen.getByTestId("ldml-base-unavailable").textContent).toMatch(/no reference data/);
    expect(ldmlButton().getAttribute("aria-label")).toMatch(/no reference data/);

    fireEvent.change(baseSelect(), { target: { value: "uk" } });
    await waitFor(() => expect(ldmlButton().disabled).toBe(false));
    expect(useWorkingCopyStore.getState().ldmlBaseLayout).toBe("uk");
    expect(screen.queryByTestId("ldml-base-unavailable")).toBeNull();
  });

  it("SC-012: switching profile and downloading is two interactions and passes the new profile id", async () => {
    await renderReady();
    fireEvent.change(profileSelect(), { target: { value: "49" } });
    expect(useWorkingCopyStore.getState().ldmlProfile).toBe("49");
    await act(async () => {
      fireEvent.click(ldmlButton());
    });
    expect(ldmlCalls.current).toEqual(["49"]);
    expect(downloaded.current).toEqual(["basic_kbdus_ldml-1.0.0.zip"]);
  });

  it("downloads profile 46 by default", async () => {
    await renderReady();
    await act(async () => {
      fireEvent.click(ldmlButton());
    });
    expect(ldmlCalls.current).toEqual(["46"]);
  });

  it("the aria-label id equals the filename id for .zip, .kmp and LDML", async () => {
    await renderReady();
    const idFromAria = (testId: string): string => {
      const label = screen.getByTestId(testId).getAttribute("aria-label") ?? "";
      const m = /keyboard (\S+)/.exec(label);
      expect(m, `aria-label "${label}"`).not.toBeNull();
      return m![1]!;
    };
    const zipId = idFromAria("emit-download");
    const kmpId = idFromAria("emit-download-kmp");
    const ldmlId = idFromAria("emit-download-ldml");

    for (const testId of ["emit-download", "emit-download-kmp", "emit-download-ldml"]) {
      await act(async () => {
        fireEvent.click(screen.getByTestId(testId));
      });
    }
    const [zipFile, kmpFile, ldmlFile] = downloaded.current as [string, string, string];
    expect(zipFile.replace(/-1\.0\.zip$/, "")).toBe(zipId);
    expect(kmpFile.replace(/\.kmp$/, "")).toBe(kmpId);
    expect(ldmlFile.replace(/_ldml-.*\.zip$/, "")).toBe(ldmlId);
  });
});
