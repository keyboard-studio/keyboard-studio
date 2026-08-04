// Unit tests for KeyInspector (spec 058 T070; FR-020b, FR-030).
//
// Grouped:
//   1. Selection-vs-editing focus contract: Enter/F2 into the inspector,
//      Escape back to the cell it came from, and arrow/click updating the
//      DISPLAY without moving focus (useKeyInspectorFocusBridge).
//   2. The "Sends:" derivation (FR-030): key.layer superseding the
//      containing layer — the discriminating case is a key where the two
//      differ.
//   3. Display fields: produced characters, provenance, annotations,
//      findings, the empty state.

import { describe, it, expect, afterEach } from "vitest";
import { useRef } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchKeyAddress } from "@keyboard-studio/engine";
import {
  KeyInspector,
  resolveSendsLayer,
  useKeyInspectorFocusBridge,
} from "./KeyInspector.tsx";
import type { KeyGridAnnotationCounts, KeyGridCellViewModel, TouchKeyFinding } from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };

function makeCell(overrides: Partial<KeyGridCellViewModel> & { id: string }): KeyGridCellViewModel {
  const address = overrides.address ?? touchKeyAddress("phone", "default", overrides.id);
  return {
    address,
    id: overrides.id,
    keycap: overrides.keycap ?? overrides.id,
    sp: overrides.sp,
    padPct: overrides.padPct ?? 15,
    widthPct: overrides.widthPct ?? 100,
    producedChars: overrides.producedChars ?? [],
    annotations: overrides.annotations ?? EMPTY_ANNOTATIONS,
    findings: overrides.findings ?? [],
    ...(overrides.nextlayer !== undefined ? { nextlayer: overrides.nextlayer } : {}),
    ...(overrides.provenance !== undefined ? { provenance: overrides.provenance } : {}),
  };
}

// ---------------------------------------------------------------------------
// 1. The focus contract
// ---------------------------------------------------------------------------

/**
 * Minimal harness standing in for the future TouchGallery composition: a
 * fake grid cell (real `role="gridcell"`/`aria-selected` — the same
 * attributes KeyGridCell.tsx renders) plus `KeyInspector`, wired through
 * `useKeyInspectorFocusBridge` exactly as a real composing caller would.
 */
function FocusHarness({ cell }: { cell: KeyGridCellViewModel }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bridge = useKeyInspectorFocusBridge({
    selectedAddress: cell.address,
    containerRef,
  });

  return (
    <div ref={containerRef} data-testid="container">
      <button
        type="button"
        role="gridcell"
        aria-selected="true"
        data-testid="fake-cell"
        onKeyDown={bridge.handleGridKeyDown}
      >
        {cell.keycap}
      </button>
      <KeyInspector
        panelRef={bridge.inspectorRef}
        selectedCell={cell}
        onEscape={bridge.handleEscape}
      />
    </div>
  );
}

describe("KeyInspector — selection is separate from editing (FR-020b)", () => {
  it("Enter on a focused gridcell moves DOM focus into the inspector panel", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();
    expect(document.activeElement).toBe(cellBtn);

    fireEvent.keyDown(cellBtn, { key: "Enter" });

    expect(document.activeElement).toBe(screen.getByTestId("key-inspector"));
  });

  it("F2 on a focused gridcell moves DOM focus into the inspector panel", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();

    fireEvent.keyDown(cellBtn, { key: "F2" });

    expect(document.activeElement).toBe(screen.getByTestId("key-inspector"));
  });

  it("does not move focus for an ordinary key (e.g. a letter) pressed on the gridcell", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();

    fireEvent.keyDown(cellBtn, { key: "a" });

    expect(document.activeElement).toBe(cellBtn);
  });

  it("Escape from the focused inspector returns focus to the cell it came from", () => {
    render(<FocusHarness cell={makeCell({ id: "T_A" })} />);
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();
    fireEvent.keyDown(cellBtn, { key: "Enter" });
    const inspector = screen.getByTestId("key-inspector");
    expect(document.activeElement).toBe(inspector);

    fireEvent.keyDown(inspector, { key: "Escape" });

    expect(document.activeElement).toBe(cellBtn);
  });

  it("arrow/click-driven selection changes update the panel's DISPLAY without moving focus out of the grid", () => {
    const { rerender } = render(
      <FocusHarness cell={makeCell({ id: "T_A", keycap: "a" })} />,
    );
    const cellBtn = screen.getByTestId("fake-cell");
    cellBtn.focus();
    expect(document.activeElement).toBe(cellBtn);
    expect(screen.getByTestId("key-inspector-header").textContent).toContain("a");

    // Simulate an arrow-key-driven selection change: the SAME focus stays on
    // the (conceptually different, in a real grid) cell button while the
    // inspector's props update to reflect the newly-selected cell.
    rerender(<FocusHarness cell={makeCell({ id: "T_B", keycap: "b" })} />);

    expect(document.activeElement).toBe(screen.getByTestId("fake-cell"));
    expect(screen.getByTestId("key-inspector-header").textContent).toContain("b");
  });

  it("Escape is a no-op when nothing is selected", () => {
    render(<NoSelectionHarness />);
    const inspector = screen.getByTestId("key-inspector");
    inspector.focus();

    expect(() => fireEvent.keyDown(inspector, { key: "Escape" })).not.toThrow();
  });
});

/** Dedicated top-level harness (not a nested closure) so `useKeyInspectorFocusBridge`'s hook calls run inside a properly-named component, matching react-hooks lint's own component-name recognition. */
function NoSelectionHarness() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bridge = useKeyInspectorFocusBridge({ selectedAddress: null, containerRef });
  return (
    <div ref={containerRef}>
      <KeyInspector panelRef={bridge.inspectorRef} selectedCell={null} onEscape={bridge.handleEscape} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. "Sends:" derivation (FR-030) — key.layer supersedes the containing layer
// ---------------------------------------------------------------------------

/** A tiny, purpose-built layout — NOT the shared touch-join fixture, because
 * that fixture's own `layer`-disambiguated pair (`T_LAYERDUP`) is a
 * DUPLICATE id within its layer, and `resolveKeyAddress` resolves to the
 * FIRST match by design (see touchKeyAddress.ts's own doc comment on
 * addressing limits) — the first `T_LAYERDUP` in that fixture has NO
 * `layer` override, so it cannot exercise the supersede case cleanly. This
 * fixture's single, unambiguous key is built specifically so the
 * discriminating case (a key where `layer` differs from the containing
 * layer) is unambiguous to resolve. */
function makeSendsLayout(keyOverrides: { id: string; layer?: string }): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  {
                    nodeId: "n1",
                    id: keyOverrides.id,
                    text: "x",
                    ...(keyOverrides.layer !== undefined ? { layer: keyOverrides.layer } : {}),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("resolveSendsLayer — key.layer supersedes the containing layer (FR-030)", () => {
  it("uses the containing layer when the key carries no layer override", () => {
    const layout = makeSendsLayout({ id: "T_PLAIN" });
    const cell = makeCell({ id: "T_PLAIN" });

    const info = resolveSendsLayer(cell, layout);

    expect(info?.effectiveLayerId).toBe("default");
    expect(info?.containingLayerId).toBe("default");
    expect(info?.superseded).toBe(false);
  });

  it("lets key.layer supersede the containing layer when the two differ — the discriminating case", () => {
    const layout = makeSendsLayout({ id: "T_OVERRIDE", layer: "shift" });
    const cell = makeCell({ id: "T_OVERRIDE" });

    const info = resolveSendsLayer(cell, layout);

    expect(info?.effectiveLayerId).toBe("shift");
    expect(info?.containingLayerId).toBe("default");
    expect(info?.superseded).toBe(true);
  });

  it("degrades to the containing layer alone (no supersede) when layout is omitted", () => {
    const cell = makeCell({ id: "T_OVERRIDE" });

    const info = resolveSendsLayer(cell);

    expect(info?.effectiveLayerId).toBe("default");
    expect(info?.superseded).toBe(false);
  });

  it("renders the override note in the panel only for the superseding key", () => {
    const layout = makeSendsLayout({ id: "T_OVERRIDE", layer: "shift" });
    render(
      <KeyInspector selectedCell={makeCell({ id: "T_OVERRIDE" })} layout={layout} />,
    );

    expect(screen.getByTestId("key-inspector-sends").textContent).toContain("shift");
    expect(screen.getByTestId("key-inspector-sends-override-note")).toBeTruthy();
  });

  it("renders no override note for a key with no layer override", () => {
    const layout = makeSendsLayout({ id: "T_PLAIN" });
    render(<KeyInspector selectedCell={makeCell({ id: "T_PLAIN" })} layout={layout} />);

    expect(screen.getByTestId("key-inspector-sends").textContent).toContain("default");
    expect(screen.queryByTestId("key-inspector-sends-override-note")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Display fields
// ---------------------------------------------------------------------------

describe("KeyInspector — display fields", () => {
  it("shows the empty state when nothing is selected", () => {
    render(<KeyInspector selectedCell={null} />);
    expect(screen.getByTestId("key-inspector-empty")).toBeTruthy();
  });

  it("shows 'no output' when producedChars is empty", () => {
    render(<KeyInspector selectedCell={makeCell({ id: "T_A", producedChars: [] })} />);
    expect(screen.getByTestId("key-inspector-produces").textContent?.toLowerCase()).toContain(
      "no output",
    );
  });

  it("lists every produced character with its codepoint label", () => {
    render(
      <KeyInspector selectedCell={makeCell({ id: "T_A", producedChars: ["ɛ"] })} />,
    );
    const produces = screen.getByTestId("key-inspector-produces");
    expect(produces.textContent).toContain("ɛ");
    expect(produces.textContent).toContain("U+025B");
  });

  it("shows a provenance note for an auto-placed key, and none for a hand-set one", () => {
    const { rerender } = render(
      <KeyInspector
        selectedCell={makeCell({ id: "T_A", provenance: "base-derived" })}
      />,
    );
    expect(screen.getByTestId("key-inspector-provenance")).toBeTruthy();

    rerender(<KeyInspector selectedCell={makeCell({ id: "T_A", provenance: "hand-set" })} />);
    expect(screen.queryByTestId("key-inspector-provenance")).toBeNull();
  });

  it("shows sub-key annotation counts only when at least one is non-zero", () => {
    render(
      <KeyInspector
        selectedCell={makeCell({
          id: "T_A",
          annotations: { longpress: 2, multitap: 0, flick: 1 },
        })}
      />,
    );
    const annotations = screen.getByTestId("key-inspector-annotations");
    expect(annotations.textContent).toContain("2");
    expect(annotations.textContent).toContain("1");
  });

  it("renders every finding with its severity badge", () => {
    const findings: TouchKeyFinding[] = [
      { code: "dead-key", severity: "error", address: "phone:default:T_A", fields: {}, fixes: [] },
      { code: "layer-mismatch", severity: "warning", address: "phone:default:T_A", fields: {}, fixes: [] },
    ];
    render(<KeyInspector selectedCell={makeCell({ id: "T_A", findings })} />);

    expect(screen.getByTestId("key-inspector-finding-0").textContent).toContain("dead-key");
    expect(screen.getByTestId("key-inspector-finding-1").textContent).toContain("layer-mismatch");
  });
});
