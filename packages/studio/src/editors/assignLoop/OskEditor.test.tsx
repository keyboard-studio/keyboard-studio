// OskEditor.test.tsx — minimal OSK editor tests.
//
// Covers: rendering from generated KvksIR, key selection, label editing,
// blank-key validation (empty label + output = error, blocked), undo,
// and the display-underlying / 102nd-key toggles.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import type { KvksIR, KeyboardIR } from "@keyboard-studio/contracts";
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
}));

function renderEditor(props: { onComplete?: (r: unknown) => void; onBack?: () => void } = {}) {
  const onComplete = props.onComplete ?? vi.fn();
  const onBack = props.onBack ?? vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <OskEditor onComplete={onComplete} onBack={onBack} />
    </I18nProvider>,
  );
  return { onComplete, onBack };
}

describe("OskEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the OSK with layer switcher", () => {
    renderEditor();
    expect(screen.getByText("On-Screen Keyboard")).toBeInTheDocument();
    // Layer tabs: Default and Shift.
    expect(screen.getByRole("tab", { name: "Default" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Shift" })).toBeInTheDocument();
  });

  it("selects a key and shows the edit panel", () => {
    renderEditor();
    const keyA = screen.getByRole("button", { name: /Key K_A/ });
    fireEvent.click(keyA);
    expect(screen.getByText("Key K_A")).toBeInTheDocument();
    expect(screen.getByLabelText("Display label")).toHaveValue("a");
  });

  it("applies a label change", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Key K_A/ }));
    const input = screen.getByLabelText("Display label");
    fireEvent.change(input, { target: { value: "α" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply label" }));
    // The key now shows the new label.
    expect(
      screen.getByRole("button", { name: /Key K_A, label α/ }),
    ).toBeInTheDocument();
  });

  it("blocks blanking a key with output", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Key K_A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Blank key" }));
    // Error shown, label unchanged.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Key K_A, label a/ }),
    ).toBeInTheDocument();
  });

  it("allows blanking a key with no output", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Key K_C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Blank key" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Blank keys render as ○.
    expect(
      screen.getByRole("button", { name: /Key K_C, blank/ }),
    ).toBeInTheDocument();
  });

  it("blocks empty label via the text field when key has output", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Key K_A/ }));
    const input = screen.getByLabelText("Display label");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Apply is disabled.
    expect(
      screen.getByRole("button", { name: "Apply label" }),
    ).toBeDisabled();
  });

  it("undoes a label change", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Key K_A/ }));
    fireEvent.change(screen.getByLabelText("Display label"), {
      target: { value: "α" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply label" }));
    expect(
      screen.getByRole("button", { name: /Key K_A, label α/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByRole("button", { name: /Key K_A, label a/ }),
    ).toBeInTheDocument();
  });

  it("toggles display-underlying and 102nd key", () => {
    renderEditor();
    const underlying = screen.getByLabelText("Display underlying characters");
    const key102 = screen.getByLabelText("Include 102nd key (ISO)");
    expect(underlying).not.toBeChecked();
    expect(key102).not.toBeChecked();
    fireEvent.click(underlying);
    expect(underlying).toBeChecked();
    fireEvent.click(key102);
    expect(key102).toBeChecked();
  });

  it("calls onComplete on Continue", () => {
    const { onComplete } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onComplete).toHaveBeenCalled();
  });

  it("calls onBack on Back", () => {
    const { onBack } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });
});
