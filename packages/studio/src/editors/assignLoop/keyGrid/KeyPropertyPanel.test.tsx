// KeyPropertyPanel — spec 061 T035 (FR-003, FR-015, FR-018, FR-019, FR-020).
//
// No @testing-library/jest-dom — raw DOM assertions, matching this package's
// convention (RemoveKeyDialog.test.tsx, Field.test.tsx).
//
// The composed `KeyInspector`'s own behaviour is NOT re-tested here — it keeps
// its own suite and its own `key-inspector-*` ids. What this file covers is the
// part that did not exist before: the eight fields, delete, and move.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import {
  KeyPropertyPanel,
  availableMoveDirections,
  type KeyGridPosition,
  type KeyPropertyPanelProps,
} from "./KeyPropertyPanel.tsx";
import type { KeyGridCellViewModel } from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

function makeCell(overrides: Partial<KeyGridCellViewModel> = {}): KeyGridCellViewModel {
  return {
    address: "phone:default:K_A",
    id: "K_A",
    keycap: "a",
    sp: 0,
    padPct: 15,
    widthPct: 100,
    producedChars: ["a"],
    annotations: { longpress: 0, multitap: 0, flick: 0 },
    findings: [],
    isLastInRow: false,
    ...overrides,
  };
}

/** A middle key of a middle row — every move is available. */
const MIDDLE: KeyGridPosition = { rowIndex: 1, keyIndex: 1, rowCount: 3, rowLength: 3 };

function renderPanel(overrides: Partial<KeyPropertyPanelProps> = {}) {
  const props: KeyPropertyPanelProps = {
    selectedCell: makeCell(),
    position: MIDDLE,
    onFieldChange: vi.fn(),
    onSpChange: vi.fn(),
    onApplyFix: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  };
  return { ...render(<KeyPropertyPanel {...props} />), props };
}

/** The `<input>` inside a field wrapper. */
function fieldInput(field: string): HTMLInputElement {
  const input = screen
    .getByTestId(`key-property-panel-field-${field}`)
    .querySelector("input");
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

describe("KeyPropertyPanel — one panel (FR-018)", () => {
  it("is a single named region, with the inspector composed inside rather than stacked beside", () => {
    renderPanel();
    const panel = screen.getByTestId("key-property-panel");
    expect(panel.getAttribute("role")).toBe("region");
    // The inspector is present but is no longer a region of its own.
    const inspector = screen.getByTestId("key-inspector");
    expect(panel.contains(inspector)).toBe(true);
    expect(inspector.getAttribute("role")).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("renders an input for each of the seven text/number fields", () => {
    renderPanel();
    for (const field of ["text", "hint", "id", "layer", "nextlayer", "width", "pad"]) {
      expect(fieldInput(field)).toBeTruthy();
    }
  });

  it("edits `sp` through the composed inspector's radio group, not a text box", () => {
    renderPanel();
    expect(screen.queryByTestId("key-property-panel-field-sp")).toBeNull();
    expect(screen.getByTestId("key-inspector-sp")).toBeTruthy();
  });

  it("shows the selected key's current values", () => {
    renderPanel({
      selectedCell: makeCell({
        keycap: "ɛ",
        id: "U_025B",
        hint: "eps",
        layerOverride: "shift",
        nextlayer: "numeric",
        widthPct: 150,
        padPct: 5,
      }),
    });
    expect(fieldInput("text").value).toBe("ɛ");
    expect(fieldInput("id").value).toBe("U_025B");
    expect(fieldInput("hint").value).toBe("eps");
    expect(fieldInput("layer").value).toBe("shift");
    expect(fieldInput("nextlayer").value).toBe("numeric");
    expect(fieldInput("width").value).toBe("150");
    expect(fieldInput("pad").value).toBe("5");
  });

  it("renders no fields at all with nothing selected", () => {
    renderPanel({ selectedCell: null, position: undefined });
    expect(screen.queryByTestId("key-property-panel-field-text")).toBeNull();
    expect(screen.queryByTestId("key-property-panel-delete")).toBeNull();
  });
});

describe("KeyPropertyPanel — committing a field edit", () => {
  it("commits on blur, not per keystroke", () => {
    const { props } = renderPanel();
    const input = fieldInput("text");
    fireEvent.change(input, { target: { value: "z" } });
    expect(props.onFieldChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(props.onFieldChange).toHaveBeenCalledWith({ field: "text", value: "z" });
  });

  it("commits on Enter", () => {
    const { props } = renderPanel();
    const input = fieldInput("hint");
    fireEvent.change(input, { target: { value: "h" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onFieldChange).toHaveBeenCalledWith({ field: "hint", value: "h" });
  });

  it("does not commit when the value is unchanged", () => {
    const { props } = renderPanel();
    fireEvent.blur(fieldInput("text"));
    expect(props.onFieldChange).not.toHaveBeenCalled();
  });

  it("commits width and pad as numbers, not strings", () => {
    const { props } = renderPanel();
    const width = fieldInput("width");
    fireEvent.change(width, { target: { value: "175" } });
    fireEvent.blur(width);
    expect(props.onFieldChange).toHaveBeenCalledWith({ field: "width", value: 175 });
  });

  it("refuses a non-integer, a zero and a negative width rather than committing an unrenderable key", () => {
    const { props } = renderPanel();
    for (const bad of ["12.5", "0", "-4", "abc", ""]) {
      const width = fieldInput("width");
      fireEvent.change(width, { target: { value: bad } });
      fireEvent.blur(width);
    }
    expect(props.onFieldChange).not.toHaveBeenCalled();
  });

  it("accepts a zero pad but refuses a negative one", () => {
    const { props } = renderPanel();
    const pad = fieldInput("pad");
    fireEvent.change(pad, { target: { value: "0" } });
    fireEvent.blur(pad);
    expect(props.onFieldChange).toHaveBeenCalledWith({ field: "pad", value: 0 });

    (props.onFieldChange as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.change(pad, { target: { value: "-1" } });
    fireEvent.blur(pad);
    expect(props.onFieldChange).not.toHaveBeenCalled();
  });

  it("resets the draft when the selection changes, never carrying one key's text onto another", () => {
    const { rerender, props } = renderPanel();
    const input = fieldInput("text");
    fireEvent.change(input, { target: { value: "typed but not committed" } });
    rerender(
      <KeyPropertyPanel
        {...props}
        selectedCell={makeCell({ address: "phone:default:K_B", id: "K_B", keycap: "b" })}
      />,
    );
    expect(fieldInput("text").value).toBe("b");
  });
});

describe("KeyPropertyPanel — the width minimum note (FR-015)", () => {
  it("states that the declared width is a minimum and that the last key is drawn wider", () => {
    renderPanel();
    const note = screen.getByTestId("key-property-panel-width-minimum-note").textContent ?? "";
    expect(note).toContain("minimum");
    expect(note).toContain("stretching");
  });
});

describe("KeyPropertyPanel — move (FR-020, FR-003)", () => {
  it("renders all four buttons for a key with room in every direction", () => {
    renderPanel();
    for (const direction of ["left", "right", "up", "down"]) {
      expect(screen.getByTestId(`key-property-panel-move-${direction}`)).toBeTruthy();
    }
  });

  it("omits `left` for the first key in a row — ABSENT, never disabled", () => {
    renderPanel({ position: { rowIndex: 1, keyIndex: 0, rowCount: 3, rowLength: 3 } });
    expect(screen.queryByTestId("key-property-panel-move-left")).toBeNull();
    expect(screen.getByTestId("key-property-panel-move-right")).toBeTruthy();
  });

  it("omits `right` for the last key in a row", () => {
    renderPanel({ position: { rowIndex: 1, keyIndex: 2, rowCount: 3, rowLength: 3 } });
    expect(screen.queryByTestId("key-property-panel-move-right")).toBeNull();
  });

  it("omits `up` in the first row and `down` in the last", () => {
    renderPanel({ position: { rowIndex: 0, keyIndex: 1, rowCount: 3, rowLength: 3 } });
    expect(screen.queryByTestId("key-property-panel-move-up")).toBeNull();
    expect(screen.getByTestId("key-property-panel-move-down")).toBeTruthy();

    cleanup();
    renderPanel({ position: { rowIndex: 2, keyIndex: 1, rowCount: 3, rowLength: 3 } });
    expect(screen.queryByTestId("key-property-panel-move-down")).toBeNull();
    expect(screen.getByTestId("key-property-panel-move-up")).toBeTruthy();
  });

  it("renders no move section at all for a lone key in a lone row", () => {
    renderPanel({ position: { rowIndex: 0, keyIndex: 0, rowCount: 1, rowLength: 1 } });
    expect(screen.queryByTestId("key-property-panel-move")).toBeNull();
  });

  it("renders no move section when position is unknown", () => {
    renderPanel({ position: undefined });
    expect(screen.queryByTestId("key-property-panel-move")).toBeNull();
  });

  it("reports the direction pressed", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId("key-property-panel-move-up"));
    expect(props.onMove).toHaveBeenCalledWith("up");
  });

  it("never renders a disabled move button — the whole point of absent-not-inert", () => {
    renderPanel({ position: { rowIndex: 0, keyIndex: 0, rowCount: 2, rowLength: 2 } });
    for (const direction of ["left", "right", "up", "down"]) {
      const button = screen.queryByTestId(`key-property-panel-move-${direction}`);
      if (button !== null) expect((button as HTMLButtonElement).disabled).toBe(false);
    }
  });
});

describe("availableMoveDirections — the boundary table, without rendering", () => {
  it("matches both appliers' no-wrap rules", () => {
    expect(availableMoveDirections({ rowIndex: 1, keyIndex: 1, rowCount: 3, rowLength: 3 })).toEqual(
      ["left", "right", "up", "down"],
    );
    expect(availableMoveDirections({ rowIndex: 0, keyIndex: 0, rowCount: 1, rowLength: 1 })).toEqual(
      [],
    );
    expect(availableMoveDirections(undefined)).toEqual([]);
  });
});

describe("KeyPropertyPanel — delete (FR-019)", () => {
  it("offers delete and hands off to the caller's three-outcome dialog", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId("key-property-panel-delete"));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("says the author will be asked what happens to the space", () => {
    renderPanel();
    const panel = screen.getByTestId("key-property-panel").textContent ?? "";
    expect(panel).toContain("what should happen to the space");
  });
});

describe("KeyPropertyPanel — the assign disclosure", () => {
  it("keeps the character-assignment surface closed until asked", () => {
    renderPanel({ assignSlot: <div data-testid="assign-slot-marker" /> });
    expect(screen.queryByTestId("assign-slot-marker")).toBeNull();
    const disclosure = screen.getByTestId("key-property-panel-assign-disclosure");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  });

  it("reveals it on click, reporting the state through aria-expanded", () => {
    renderPanel({ assignSlot: <div data-testid="assign-slot-marker" /> });
    fireEvent.click(screen.getByTestId("key-property-panel-assign-disclosure"));
    expect(screen.getByTestId("assign-slot-marker")).toBeTruthy();
    expect(
      screen.getByTestId("key-property-panel-assign-disclosure").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("renders no disclosure at all when no assign surface was supplied", () => {
    renderPanel();
    expect(screen.queryByTestId("key-property-panel-assign-disclosure")).toBeNull();
  });
});

describe("KeyPropertyPanel — Escape returns focus to the cell (FR-020b)", () => {
  it("reports Escape pressed anywhere in the panel", () => {
    const onEscape = vi.fn();
    renderPanel({ onEscape });
    fireEvent.keyDown(screen.getByTestId("key-property-panel"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
