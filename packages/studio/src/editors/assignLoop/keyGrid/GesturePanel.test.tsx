// GesturePanel — spec 061 T041 (FR-026, FR-027).
//
// No @testing-library/jest-dom — raw DOM assertions, matching this package's
// convention.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import {
  GesturePanel,
  FLICK_DIRECTIONS,
  mintGestureId,
  readGestures,
  type GesturePanelProps,
} from "./GesturePanel.tsx";

afterEach(() => {
  cleanup();
});

function sub(id: string, text: string, output?: string): TouchKeyIR {
  return { nodeId: `n-${id}`, id, text, ...(output !== undefined ? { output } : {}) };
}

const RICH_KEY: TouchKeyIR = {
  nodeId: "n-main",
  id: "K_A",
  text: "a",
  sk: [sub("U_00E1", "á", "á"), sub("U_00E0", "à", "à")],
  multitap: [sub("U_00E4", "ä", "ä")],
  flick: { n: sub("U_00C1", "Á", "Á") },
};

function renderPanel(overrides: Partial<GesturePanelProps> = {}) {
  const props: GesturePanelProps = {
    selectedKey: RICH_KEY,
    selection: null,
    onSelectGesture: vi.fn(),
    onAddGesture: vi.fn(),
    onEditGesture: vi.fn(),
    onRemoveGesture: vi.fn(),
    ...overrides,
  };
  return { ...render(<GesturePanel {...props} />), props };
}

describe("readGestures", () => {
  it("flattens longpresses, multitaps and flicks, in that order", () => {
    expect(readGestures(RICH_KEY).map((g) => `${g.kind}:${g.id}`)).toEqual([
      "longpress:U_00E1",
      "longpress:U_00E0",
      "multitap:U_00E4",
      "flick:U_00C1".replace("U_00C1", "n"),
    ]);
  });

  it("addresses a flick by its DIRECTION, not by the sub-key's own id", () => {
    const flick = readGestures(RICH_KEY).find((g) => g.kind === "flick");
    expect(flick?.id).toBe("n");
  });

  it("returns nothing for a key with no gestures, and for no key at all", () => {
    expect(readGestures({ nodeId: "n", id: "K_B", text: "b" })).toEqual([]);
    expect(readGestures(null)).toEqual([]);
  });
});

describe("mintGestureId", () => {
  it("uses the T_NEW_ prefix, which the dead-key detector exempts", () => {
    expect(mintGestureId("longpress", 0)).toBe("T_NEW_LONGPRESS_1");
    expect(mintGestureId("multitap", 2)).toBe("T_NEW_MULTITAP_3");
  });
});

describe("GesturePanel — the three collections (FR-026)", () => {
  it("renders nothing at all with no key selected", () => {
    renderPanel({ selectedKey: null });
    expect(screen.queryByTestId("gesture-panel")).toBeNull();
  });

  it("renders a section per collection", () => {
    renderPanel();
    expect(screen.getByTestId("gesture-panel-longpress")).toBeTruthy();
    expect(screen.getByTestId("gesture-panel-multitap")).toBeTruthy();
    expect(screen.getByTestId("gesture-panel-flick")).toBeTruthy();
  });

  it("lists every existing entry", () => {
    renderPanel();
    expect(screen.getByTestId("gesture-panel-entry-longpress-U_00E1")).toBeTruthy();
    expect(screen.getByTestId("gesture-panel-entry-longpress-U_00E0")).toBeTruthy();
    expect(screen.getByTestId("gesture-panel-entry-multitap-U_00E4")).toBeTruthy();
    expect(screen.getByTestId("gesture-panel-entry-flick-n")).toBeTruthy();
  });

  it("lists ALL EIGHT flick directions, present or not", () => {
    renderPanel();
    for (const direction of FLICK_DIRECTIONS) {
      expect(screen.getByTestId(`gesture-panel-flick-${direction}`)).toBeTruthy();
    }
    expect(FLICK_DIRECTIONS).toHaveLength(8);
  });

  it("offers an add control on each empty direction, and none on a taken one", () => {
    renderPanel();
    // `n` is taken by RICH_KEY.
    expect(screen.queryByTestId("gesture-panel-add-flick-n")).toBeNull();
    expect(screen.getByTestId("gesture-panel-add-flick-ne")).toBeTruthy();
  });
});

describe("GesturePanel — adding (FR-026)", () => {
  it("adds a longpress with a minted placeholder id", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId("gesture-panel-add-longpress"));
    expect(props.onAddGesture).toHaveBeenCalledWith("longpress", "T_NEW_LONGPRESS_3");
  });

  it("adds a multitap", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId("gesture-panel-add-multitap"));
    expect(props.onAddGesture).toHaveBeenCalledWith("multitap", "T_NEW_MULTITAP_2");
  });

  it("adds a flick at the direction whose control was pressed", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId("gesture-panel-add-flick-ne"));
    expect(props.onAddGesture).toHaveBeenCalledWith("flick", "ne");
  });

  it("the generic add-a-flick control picks the first free direction", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId("gesture-panel-add-flick"));
    // `n` is taken, so the first free compass direction is `ne`.
    expect(props.onAddGesture).toHaveBeenCalledWith("flick", "ne");
  });

  it("hides the generic add-a-flick control once all eight are taken — absent, not disabled", () => {
    const allEight: TouchKeyIR = {
      ...RICH_KEY,
      flick: Object.fromEntries(
        FLICK_DIRECTIONS.map((d) => [d, sub(`U_${d}`, d)]),
      ) as NonNullable<TouchKeyIR["flick"]>,
    };
    renderPanel({ selectedKey: allEight });
    expect(screen.queryByTestId("gesture-panel-add-flick")).toBeNull();
  });
});

describe("GesturePanel — the sub-key panel (FR-027)", () => {
  it("is absent until a gesture is selected", () => {
    renderPanel();
    expect(screen.queryByTestId("gesture-panel-subkey-panel")).toBeNull();
  });

  it("names the gesture TYPE, and exposes keycap and text for editing", () => {
    renderPanel({ selection: { kind: "longpress", id: "U_00E1" } });
    const panel = screen.getByTestId("gesture-panel-subkey-panel");
    expect(panel.textContent ?? "").toContain("Long press");
    expect(
      screen.getByTestId("gesture-panel-subkey-field-text").querySelector("input"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("gesture-panel-subkey-field-output").querySelector("input"),
    ).toBeTruthy();
  });

  it("names the direction for a flick, since that is its identity", () => {
    renderPanel({ selection: { kind: "flick", id: "n" } });
    expect(screen.getByTestId("gesture-panel-subkey-panel").textContent ?? "").toContain("(n)");
  });

  it("shows the selected gesture's own values", () => {
    renderPanel({ selection: { kind: "multitap", id: "U_00E4" } });
    const keycap = screen
      .getByTestId("gesture-panel-subkey-field-text")
      .querySelector("input") as HTMLInputElement;
    expect(keycap.value).toBe("ä");
  });

  it("commits a keycap edit on blur, not per keystroke", () => {
    const selection = { kind: "longpress", id: "U_00E1" } as const;
    const { props } = renderPanel({ selection });
    const input = screen
      .getByTestId("gesture-panel-subkey-field-text")
      .querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Á" } });
    expect(props.onEditGesture).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(props.onEditGesture).toHaveBeenCalledWith(selection, { text: "Á" });
  });

  it("commits an output edit on Enter", () => {
    const selection = { kind: "flick", id: "n" } as const;
    const { props } = renderPanel({ selection });
    const input = screen
      .getByTestId("gesture-panel-subkey-field-output")
      .querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Ǎ" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onEditGesture).toHaveBeenCalledWith(selection, { output: "Ǎ" });
  });

  it("removes the selected gesture", () => {
    const selection = { kind: "longpress", id: "U_00E0" } as const;
    const { props } = renderPanel({ selection });
    fireEvent.click(screen.getByTestId("gesture-panel-subkey-remove"));
    expect(props.onRemoveGesture).toHaveBeenCalledWith(selection);
  });

  it("closes rather than showing a stale panel when the selection no longer exists", () => {
    renderPanel({ selection: { kind: "longpress", id: "GONE" } });
    expect(screen.queryByTestId("gesture-panel-subkey-panel")).toBeNull();
  });

  it("reports a click on an entry chip as a selection", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId("gesture-panel-entry-flick-n"));
    expect(props.onSelectGesture).toHaveBeenCalledWith({ kind: "flick", id: "n" });
  });

  it("marks the selected chip with aria-pressed, not colour alone", () => {
    renderPanel({ selection: { kind: "longpress", id: "U_00E1" } });
    expect(
      screen.getByTestId("gesture-panel-entry-longpress-U_00E1").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("gesture-panel-entry-longpress-U_00E0").getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
