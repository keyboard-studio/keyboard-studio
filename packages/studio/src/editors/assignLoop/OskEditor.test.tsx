// OskEditor.test.tsx — minimal OSK editor tests.
//
// Covers: rendering from generated KvksIR, key selection, label editing,
// blank-key validation (empty label + output = error, blocked), undo,
// and the display-underlying / 102nd-key toggles.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { OskEditor } from "./OskEditor.tsx";

// Mock the working copy store.
const mockIR = {
  header: { name: "TestKeyboard" },
  rules: [],
  stores: [],
  groups: [],
} as unknown as KeyboardIR;

vi.mock("../../stores/workingCopyStore.ts", () => ({
  useWorkingCopyStore: (sel: (s: { ir: KeyboardIR | null }) => unknown) =>
    sel({ ir: mockIR }),
}));

// The footer's Undo reaches the whole apply seam, which this test's engine mock cannot serve.
vi.mock("../../components/OpenUndoButton.tsx", () => ({ OpenUndoButton: () => null }));

// Mock the engine module — only the functions OskEditor uses.
vi.mock("@keyboard-studio/engine", () => ({
  generateKvksFromIR: () => ({
    kbdname: "TestKeyboard",
    layers: [
      {
        shift: "",
        keys: [
          { vkey: "K_A", label: "a", chars: "a" },
          { vkey: "K_B", label: "b", chars: "b" },
          { vkey: "K_C", label: "" }, // no output — blankable
        ],
      },
      {
        shift: "S",
        keys: [{ vkey: "K_A", label: "A", chars: "A" }],
      },
    ],
    usealtgr: false,
    nodeIds: [],
  }),
  DESKTOP_GEOMETRY: [
    { id: "K_A", row: 2, x: 1.75, width: 1 },
    { id: "K_B", row: 3, x: 6.25, width: 1 },
    { id: "K_C", row: 3, x: 4.25, width: 1 },
  ],
  DESKTOP_GEOMETRY_ISO: [
    { id: "K_A", row: 2, x: 1.75, width: 1 },
    { id: "K_B", row: 3, x: 6.25, width: 1 },
    { id: "K_C", row: 3, x: 4.25, width: 1 },
    { id: "K_oE2", row: 3, x: 1.25, width: 1 },
  ],
  oskContinueResult: (kvks: { kbdname?: string } | null) =>
    kvks === null ? undefined : { kvksXml: "<visualkeyboard/>" },
}));

function renderEditor(props: { onComplete?: (r: unknown) => void; onBack?: () => void } = {}) {
  const onComplete = props.onComplete ?? vi.fn();
  const onBack = props.onBack ?? vi.fn();
  // Nav lives in the footer (spec 081, #2527): render the cluster so the
  // footer Back / Undo / Continue are on screen under their test ids.
  render(<OskEditor onComplete={onComplete} onBack={onBack} />, { withStepNav: true });
  return { onComplete, onBack };
}

describe("OskEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the OSK with layer switcher", () => {
    renderEditor();
    expect(screen.getByText("OnScreen Keyboard Label Editors")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Default" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Shift" })).toBeTruthy();
  });

  it("selects a key and shows the edit panel", () => {
    renderEditor();
    const keyA = screen.getAllByRole("button", { name: /^Key K_A/ })[0]!;
    fireEvent.click(keyA);
    expect(screen.getByText("Key K_A")).toBeTruthy();
    expect((screen.getByLabelText("Display label") as HTMLInputElement).value).toBe("a");
  });

  it("applies a label change", () => {
    renderEditor();
    fireEvent.click(screen.getAllByRole("button", { name: /^Key K_A/ })[0]!);
    const input = screen.getByLabelText("Display label");
    fireEvent.change(input, { target: { value: "α" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply label" }));
    expect(screen.getByRole("button", { name: /Key K_A, label α/ })).toBeTruthy();
  });

  it("blocks blanking a key with output", () => {
    renderEditor();
    fireEvent.click(screen.getAllByRole("button", { name: /^Key K_A/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Blank key" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Key K_A, label a/ })).toBeTruthy();
  });

  it("allows blanking a key with no output", () => {
    renderEditor();
    fireEvent.click(screen.getAllByRole("button", { name: /^Key K_C/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Blank key" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /Key K_C, blank/ })).toBeTruthy();
  });

  it("blocks empty label via the text field when key has output", () => {
    renderEditor();
    fireEvent.click(screen.getAllByRole("button", { name: /^Key K_A/ })[0]!);
    const input = screen.getByLabelText("Display label");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Apply label" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("undoes a label change", () => {
    renderEditor();
    fireEvent.click(screen.getAllByRole("button", { name: /^Key K_A/ })[0]!);
    fireEvent.change(screen.getByLabelText("Display label"), {
      target: { value: "α" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply label" }));
    expect(screen.getByRole("button", { name: /Key K_A, label α/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: /Key K_A, label a/ })).toBeTruthy();
  });

  it("toggles display-underlying and 102nd key", () => {
    renderEditor();
    const underlying = screen.getByRole("checkbox", {
      name: "Display underlying characters",
    }) as HTMLInputElement;
    const key102 = screen.getByRole("checkbox", {
      name: "Include 102nd key (ISO)",
    }) as HTMLInputElement;
    expect(underlying.checked).toBe(false);
    expect(key102.checked).toBe(false);
    fireEvent.click(underlying);
    expect(underlying.checked).toBe(true);
    fireEvent.click(key102);
    expect(key102.checked).toBe(true);
  });

  it("display-underlying draws the base-keyboard character on each cap, and undo removes it", () => {
    renderEditor();
    expect(screen.queryByTestId("osk-underlying-K_A")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Display underlying characters" }));
    expect(screen.getByTestId("osk-underlying-K_A").textContent).toBe("a");
    expect(screen.getByTestId("osk-underlying-K_B").textContent).toBe("b");
    // Shift layer reads the base keyboard's shift layer.
    fireEvent.click(screen.getByRole("tab", { name: "Shift" }));
    expect(screen.getByTestId("osk-underlying-K_A").textContent).toBe("A");
    fireEvent.click(screen.getByRole("tab", { name: "Default" }));
    fireEvent.click(screen.getByTestId("osk-undo"));
    expect(screen.queryByTestId("osk-underlying-K_A")).toBeNull();
  });

  it("include-102nd-key adds an ISO K_oE2 cap, unticking and undo remove it", () => {
    renderEditor();
    const capCount = () => screen.getAllByRole("button", { pressed: false }).filter(
      (b) => (b.getAttribute("aria-label") ?? "").includes("K_oE2"),
    ).length;
    expect(capCount()).toBe(0);
    const key102 = screen.getByRole("checkbox", { name: "Include 102nd key (ISO)" });
    fireEvent.click(key102);
    expect(capCount()).toBe(1);
    fireEvent.click(key102);
    expect(capCount()).toBe(0);
    fireEvent.click(key102);
    expect(capCount()).toBe(1);
    fireEvent.click(screen.getByTestId("osk-undo"));
    expect(capCount()).toBe(0);
  });

  it("calls onComplete on Continue", () => {
    const { onComplete } = renderEditor();
    fireEvent.click(screen.getByTestId("osk-continue"));
    expect(onComplete).toHaveBeenCalled();
  });

  it("calls onBack on Back", () => {
    const { onBack } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });
});
