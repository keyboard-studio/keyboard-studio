// OutputScreen — narrow-viewport layout (mobile adaptation).
//
// On narrow viewports the two-pane row becomes ONE column: the Output pane
// (downloads / submit) comes first with the page h1, no drag handle, and the
// keyboard details sit behind a native disclosure that starts collapsed once a
// working copy exists. Desktop keeps the two-pane row.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { seedInstantiatedWorkingCopy } from "../test/workingCopy.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";
import { setViewport } from "../test/viewport.ts";

const READY_STAGE: Stage = {
  kind: "ready",
  compileResult: { diagnostics: [] },
  jsBlobUrl: "blob:test",
  vfs: createVirtualFS([]),
  scaffoldWarnings: [],
  keyboardId: "test",
} as unknown as Stage;

vi.mock("../hooks/useKeyboardArtifact.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useKeyboardArtifact.ts")>()),
  useKeyboardArtifact: () => ({
    stage: READY_STAGE,
    retry: vi.fn(),
    recompile: vi.fn(),
  }),
}));

vi.mock("./BaseKeyboardPicker.tsx", () => ({
  BaseKeyboardPicker: () => <div data-testid="base-picker-stub" />,
}));
vi.mock("./KmnEditor.tsx", () => ({ KmnEditor: () => <div data-testid="kmn-editor-stub" /> }));
vi.mock("./SignUpPanel.tsx", () => ({ SignUpPanel: () => null }));
vi.mock("./ManagedPRSubmitPanel.tsx", () => ({ ManagedPRSubmitPanel: () => null }));

beforeEach(() => setViewport(390));
afterEach(() => {
  cleanup();
  setViewport(1280);
  vi.clearAllMocks();
});

describe("OutputScreen — narrow", () => {
  it("stacks one column: Output first, no drag handle, details collapsed", async () => {
    seedInstantiatedWorkingCopy(undefined, { attributed: true });
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    const root = screen.getByTestId("output-screen-root");
    expect(root.style.flexDirection).toBe("column");
    expect(screen.queryByRole("separator")).toBeNull();

    const output = screen.getByRole("region", { name: "Output pane" });
    const details = screen.getByRole("region", { name: "Keyboard details pane" });
    expect(
      output.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Output" })).toBeTruthy();
    expect(screen.getByTestId("emit-download-kmp")).toBeTruthy();

    const disclosure = screen.getByTestId("picker-details-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.getByText("Keyboard details").tagName).toBe("SUMMARY");
  });

  it("cold arrival: the picker disclosure starts open", async () => {
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);
    const disclosure = screen.getByTestId("picker-details-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(true);
  });

  it("desktop is unchanged: row layout, details pane first", async () => {
    setViewport(1280);
    seedInstantiatedWorkingCopy(undefined, { attributed: true });
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);
    expect(screen.getByTestId("output-screen-root").style.flexDirection).toBe("row");
    expect(screen.queryByTestId("picker-details-disclosure")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Your keyboard" })).toBeTruthy();
  });
});
