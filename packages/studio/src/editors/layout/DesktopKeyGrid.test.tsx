// DesktopKeyGrid — the grid's accessible model (spec 113 FR-040): role="grid", roving tabindex,
// arrow-key navigation, and a name on every cell that carries key, layer, output, and class.
//
// The "axe" check follows KeyGrid.test.tsx: the structural invariant axe enforces (every child
// of the grid is a row; every child of a row is a gridcell or decorative), asserted directly so
// no browser is needed in the unit lane.

import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { attributeLayer, parseKmn } from "@keyboard-studio/engine";
import type { LayerCombo } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { DESKTOP_VKEYS } from "./useLayoutAttribution.ts";
import { buildDesktopGridViewModel } from "./desktopGridViewModel.ts";
import { DesktopKeyGrid, buildDesktopNavModel } from "./DesktopKeyGrid.tsx";

afterEach(cleanup);

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'x'
+ [K_B] > dk(acute)
+ [K_C] > nul
`;

const ir = parseKmn(KMN, "t").ir;

function cellsFor(layer: LayerCombo = [], state: "ready" | "stale" | "not-compiled" = "ready") {
  return buildDesktopGridViewModel({
    layer,
    cells: attributeLayer(ir, layer, DESKTOP_VKEYS),
    state,
  }).cells;
}

function Harness({ layer = [], initial = null }: { layer?: LayerCombo; initial?: string | null }) {
  const [selected, setSelected] = useState<string | null>(initial);
  return (
    <DesktopKeyGrid
      cells={cellsFor(layer)}
      selectedVkey={selected}
      onSelectVkey={setSelected}
      label="Desktop layout, Default layer"
    />
  );
}

const cell = (vkey: string): HTMLElement => screen.getByTestId(`layout-cell-${vkey}`);

describe("DesktopKeyGrid structure", () => {
  it("is a role=grid of rows of gridcells, every one carrying 1-based row and column indexes", () => {
    render(<Harness />);
    const grid = screen.getByRole("grid", { name: "Desktop layout, Default layer" });
    const rows = within(grid).getAllByRole("row");
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const [r, row] of rows.entries()) {
      expect(row.getAttribute("aria-rowindex")).toBe(String(r + 1));
      const cells = within(row).getAllByRole("gridcell");
      for (const [c, el] of cells.entries()) {
        expect(el.getAttribute("aria-rowindex")).toBe(String(r + 1));
        expect(el.getAttribute("aria-colindex")).toBe(String(c + 1));
      }
    }
  });

  it("every child of the grid is a row and every child of a row is a gridcell or decorative (the invariant axe enforces)", () => {
    const { container } = render(<Harness />);
    const grid = container.querySelector('[role="grid"]');
    expect(grid).toBeTruthy();
    const decorative = (el: Element) => el.getAttribute("aria-hidden") === "true";
    for (const child of Array.from(grid!.children)) {
      expect(child.getAttribute("role") === "row" || decorative(child)).toBe(true);
    }
    const rows = grid!.querySelectorAll('[role="row"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of Array.from(rows)) {
      for (const child of Array.from(row.children)) {
        expect(child.getAttribute("role") === "gridcell" || decorative(child)).toBe(true);
      }
    }
  });

  it("renders every key of the geometry, frame keys included", () => {
    render(<Harness />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(cellsFor().length);
    expect(cell("K_ENTER")).toBeTruthy();
  });
});

describe("DesktopKeyGrid roving tabindex", () => {
  it("is a single Tab stop: the first cell before any selection", () => {
    render(<Harness />);
    const tabbable = screen.getAllByRole("gridcell").filter((el) => el.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(screen.getAllByRole("gridcell")[0]);
  });

  it("moves the single Tab stop to the selected cell", () => {
    render(<Harness initial="K_A" />);
    const tabbable = screen.getAllByRole("gridcell").filter((el) => el.tabIndex === 0);
    expect(tabbable).toEqual([cell("K_A")]);
    expect(cell("K_A").getAttribute("aria-selected")).toBe("true");
    expect(cell("K_B").getAttribute("aria-selected")).toBe("false");
  });

  it("selects on click", () => {
    render(<Harness />);
    fireEvent.click(cell("K_B"));
    expect(cell("K_B").getAttribute("aria-selected")).toBe("true");
    expect(cell("K_B").tabIndex).toBe(0);
  });
});

describe("DesktopKeyGrid arrow navigation", () => {
  const navModel = buildDesktopNavModel(cellsFor());
  const row1 = navModel.rows[1]!.keys.map((k) => k.address);

  it("moves one cell per ArrowRight, twice in a row, with focus following", () => {
    render(<Harness initial={row1[0]!} />);
    cell(row1[0]!).focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(row1[1]!));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(row1[2]!));
    expect(cell(row1[2]!).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell(row1[1]!));
  });

  it("moves between rows with ArrowDown and ArrowUp, and stops at the edges", () => {
    render(<Harness initial={row1[0]!} />);
    cell(row1[0]!).focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    const below = document.activeElement as HTMLElement;
    expect(below.getAttribute("aria-rowindex")).toBe("3");
    fireEvent.keyDown(below, { key: "ArrowUp" });
    expect((document.activeElement as HTMLElement).getAttribute("aria-rowindex")).toBe("2");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect((document.activeElement as HTMLElement).getAttribute("aria-rowindex")).toBe("1");
  });

  it("Home and End go to the ends of the row", () => {
    render(<Harness initial={row1[2]!} />);
    cell(row1[2]!).focus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(cell(row1[row1.length - 1]!));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(cell(row1[0]!));
  });

  it("walks through a frame key without losing its place", () => {
    // Row 1 starts with a frame key (Tab); the next ArrowRight lands on a layout key.
    const first = navModel.rows[1]!.keys[0]!;
    expect(first.cell.frame).toBe(true);
    render(<Harness initial={first.address} />);
    cell(first.address).focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(row1[1]!));
    expect((document.activeElement as HTMLElement).getAttribute("aria-colindex")).toBe("2");
  });
});

describe("DesktopKeyGrid cell names (FR-040)", () => {
  it("names key, layer, output, class, provenance, and editability", () => {
    render(<Harness />);
    const name = cell("K_A").getAttribute("aria-label")!;
    expect(name).toContain("Key A");
    expect(name).toContain("layer Default");
    expect(name).toContain("types x");
    expect(name).toContain("U+0078");
    expect(name).toContain("Text");
    expect(name).toContain("From the starting point");
    expect(name).toContain("editable");
  });

  it("names the layer from the combination", () => {
    const shifted = buildDesktopGridViewModel({
      layer: ["SHIFT", "RALT"],
      cells: attributeLayer(ir, ["SHIFT", "RALT"], DESKTOP_VKEYS),
      state: "ready",
    }).cells;
    render(<DesktopKeyGrid cells={shifted} selectedVkey={null} onSelectVkey={() => {}} label="g" />);
    expect(cell("K_A").getAttribute("aria-label")).toContain("layer Shift+AltGr");
  });

  it("names a deadkey with its id and combination count", () => {
    render(<Harness />);
    const name = cell("K_B").getAttribute("aria-label")!;
    expect(name).toContain("deadkey acute");
    expect(name).toContain("Deadkey");
  });

  it("names a key that types nothing", () => {
    render(<Harness />);
    expect(cell("K_C").getAttribute("aria-label")).toContain("types nothing");
  });

  it("marks a frame key as a frame key with no provenance, and inert", () => {
    render(<Harness />);
    const enter = cell("K_ENTER");
    const name = enter.getAttribute("aria-label")!;
    expect(name).toContain("Frame key");
    expect(name).not.toContain("From the starting point");
    expect(name).not.toContain("Base keyboard fallback");
    expect(enter.getAttribute("aria-readonly")).toBe("true");
    expect(screen.queryByTestId("layout-cell-K_ENTER-provenance")).toBeNull();
  });

  it("labels K_oE2 and explains it", () => {
    render(<Harness />);
    expect(screen.getByTestId("layout-cell-K_oE2-key").textContent).toBe("K_oE2");
    expect(cell("K_oE2").getAttribute("aria-label")).toContain("extra key beside left Shift");
  });

  it("shows a provenance marker and a read-only marker on cells that have them", () => {
    render(<Harness />);
    expect(screen.getByTestId("layout-cell-K_A-provenance").textContent).toBe("Start");
    expect(screen.queryByTestId("layout-cell-K_A-readonly")).toBeNull();
    // K_D has no rule: base fallback, with no base keyboard picked its output is unknown
    expect(screen.getByTestId("layout-cell-K_D-provenance").textContent).toBe("Base");
  });

  it("shows stale and not-compiled states on the cells", () => {
    const { rerender } = render(
      <DesktopKeyGrid cells={cellsFor([], "not-compiled")} selectedVkey={null} onSelectVkey={() => {}} label="g" />,
    );
    expect(cell("K_A").getAttribute("aria-label")).toContain("not compiled yet");
    expect(cell("K_A").getAttribute("aria-readonly")).toBe("true");
    expect(screen.getByTestId("layout-cell-K_A-readonly")).toBeTruthy();
    rerender(<DesktopKeyGrid cells={cellsFor([], "stale")} selectedVkey={null} onSelectVkey={() => {}} label="g" />);
    expect(cell("K_A").getAttribute("aria-label")).toContain("types x");
    expect(cell("K_A").style.opacity).toBe("0.75");
  });
});

describe("provisional cells (FR-030)", () => {
  it("are visibly distinct and announced as provisional; an assigned key is neither", () => {
    render(<Harness />);
    const provisional = cell("K_D");
    expect(provisional.getAttribute("data-provisional")).toBe("true");
    expect(provisional.getAttribute("aria-label")).toContain("provisional");
    expect(provisional.style.border).toContain("dotted");
    const assigned = cell("K_A");
    expect(assigned.getAttribute("data-provisional")).toBe("false");
    expect(assigned.getAttribute("aria-label")).not.toContain("provisional");
    expect(assigned.style.border).not.toContain("dotted");
    expect(cell("K_ENTER").getAttribute("aria-label")).not.toContain("provisional");
  });
});
