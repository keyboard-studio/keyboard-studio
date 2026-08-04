// Unit tests for KeyGrid + KeyGridCell (spec 058 T064; FR-020, FR-020a,
// FR-022). Builds `KeyGridViewModel` fixtures directly (rather than going
// through `buildKeyGridViewModel`) so these tests exercise the RENDERING
// contract in isolation from the T063 projection — a regression in the
// builder should not need to also break these.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import {
  KeyGrid,
  logicalRowStart,
  logicalRowEnd,
  MAX_VISIBLE_KEY_COUNT,
} from "./KeyGrid.tsx";
import type {
  KeyGridAnnotationCounts,
  KeyGridCellViewModel,
  KeyGridRowViewModel,
  KeyGridViewModel,
} from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = {
  longpress: 0,
  multitap: 0,
  flick: 0,
};

/** Build a minimal, fully-typed cell view model, overriding only what a test cares about. */
function makeCell(
  overrides: Partial<KeyGridCellViewModel> & { id: string },
): KeyGridCellViewModel {
  const address = overrides.address ?? `phone:default:${overrides.id}`;
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
    ...(overrides.nextlayer !== undefined
      ? { nextlayer: overrides.nextlayer }
      : {}),
    ...(overrides.provenance !== undefined
      ? { provenance: overrides.provenance }
      : {}),
  };
}

function makeRow(
  keys: readonly KeyGridCellViewModel[],
  slackPct = 0,
): KeyGridRowViewModel {
  return { slackPct, keys };
}

function makeViewModel(
  rows: readonly KeyGridRowViewModel[],
  overrides: Partial<
    Pick<KeyGridViewModel, "platform" | "layerId" | "direction">
  > = {},
): KeyGridViewModel {
  return {
    platform: overrides.platform ?? "phone",
    layerId: overrides.layerId ?? "default",
    direction: overrides.direction ?? "ltr",
    rows,
  };
}

/** `count` distinct single-key rows, each with a distinct id/address — for the many-Tab-stop regression check. */
function manyKeyViewModel(count: number): KeyGridViewModel {
  const keys = Array.from({ length: count }, (_, i) =>
    makeCell({ id: `T_${i}`, keycap: String(i) }),
  );
  // Spread across multiple rows of 10 so this also exercises multi-row aria-rowindex.
  const rows: KeyGridRowViewModel[] = [];
  for (let i = 0; i < keys.length; i += 10) {
    const rowKeys = keys.slice(i, i + 10);
    rows.push(makeRow(rowKeys));
  }
  return makeViewModel(rows);
}

describe("KeyGrid — ARIA grid structure", () => {
  it("renders role=grid on the container, role=row per row, role=gridcell per key", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })]),
      makeRow([makeCell({ id: "K3" })]),
    ]);

    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getAllByRole("gridcell")).toHaveLength(3);
  });

  it("sets aria-rowindex per row (1-based) and aria-colindex per key within its row (1-based, counting only actual keys)", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })]),
      makeRow([makeCell({ id: "K3" })]),
    ]);

    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const rows = screen.getAllByRole("row");
    expect(rows[0]?.getAttribute("aria-rowindex")).toBe("1");
    expect(rows[1]?.getAttribute("aria-rowindex")).toBe("2");

    const k1 = screen.getByTestId("key-grid-cell-phone:default:K1");
    const k2 = screen.getByTestId("key-grid-cell-phone:default:K2");
    const k3 = screen.getByTestId("key-grid-cell-phone:default:K3");
    expect(k1.getAttribute("aria-rowindex")).toBe("1");
    expect(k1.getAttribute("aria-colindex")).toBe("1");
    expect(k2.getAttribute("aria-rowindex")).toBe("1");
    expect(k2.getAttribute("aria-colindex")).toBe("2");
    expect(k3.getAttribute("aria-rowindex")).toBe("2");
    expect(k3.getAttribute("aria-colindex")).toBe("1");
  });

  it("gives the grid container an accessible name (aria-label)", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-label")).toBeTruthy();
  });

  it("uses an explicit `label` prop for the grid's accessible name when supplied", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        label="Phone key grid, shift layer"
      />,
    );

    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe(
      "Phone key grid, shift layer",
    );
  });
});

describe("KeyGrid — single Tab stop (FR-020a)", () => {
  it("marks exactly one cell tabbable across a many-key layout (several hundred keys must not produce several hundred Tab stops)", () => {
    const vm = manyKeyViewModel(300);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress="phone:default:T_150"
        onSelectCell={vi.fn()}
      />,
    );

    const gridcells = screen.getAllByRole("gridcell");
    expect(gridcells).toHaveLength(300);
    const tabbable = gridcells.filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(
      screen.getByTestId("key-grid-cell-phone:default:T_150"),
    );
  });

  it("gives every other cell tabIndex -1 when one cell is selected", () => {
    const vm = makeViewModel([
      makeRow([
        makeCell({ id: "K1" }),
        makeCell({ id: "K2" }),
        makeCell({ id: "K3" }),
      ]),
    ]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress="phone:default:K2"
        onSelectCell={vi.fn()}
      />,
    );

    expect(
      screen
        .getByTestId("key-grid-cell-phone:default:K1")
        .getAttribute("tabindex"),
    ).toBe("-1");
    expect(
      screen
        .getByTestId("key-grid-cell-phone:default:K2")
        .getAttribute("tabindex"),
    ).toBe("0");
    expect(
      screen
        .getByTestId("key-grid-cell-phone:default:K3")
        .getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("falls back to tabIndex 0 on the FIRST cell when nothing is selected (hasSelectedVisible fallback) — the grid must stay Tab-reachable with no selection", () => {
    const vm = manyKeyViewModel(300);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const gridcells = screen.getAllByRole("gridcell");
    const tabbable = gridcells.filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(
      screen.getByTestId("key-grid-cell-phone:default:T_0"),
    );
  });

  it("falls back to tabIndex 0 on the FIRST cell when selectedAddress is stale/unresolvable (not present in the layout) — same guarantee as the null case", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })]),
    ]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress="phone:default:NOT_A_REAL_KEY"
        onSelectCell={vi.fn()}
      />,
    );

    expect(
      screen
        .getByTestId("key-grid-cell-phone:default:K1")
        .getAttribute("tabindex"),
    ).toBe("0");
    expect(
      screen
        .getByTestId("key-grid-cell-phone:default:K2")
        .getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("gives the grid container and every row div tabIndex=-1 (T068, FR-020k's row/container focus-restoration tiers) WITHOUT adding a second Tab stop — tabIndex=-1 is programmatically focusable, never part of the Tab sequence", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })]),
      makeRow([makeCell({ id: "K3" })]),
    ]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress="phone:default:K2"
        onSelectCell={vi.fn()}
      />,
    );

    expect(screen.getByRole("grid").getAttribute("tabindex")).toBe("-1");
    for (const rowEl of screen.getAllByRole("row")) {
      expect(rowEl.getAttribute("tabindex")).toBe("-1");
    }

    const gridcells = screen.getAllByRole("gridcell");
    const tabbable = gridcells.filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(
      screen.getByTestId("key-grid-cell-phone:default:K2"),
    );
  });
});

describe("KeyGrid — click selection", () => {
  it("clicking a cell calls onSelectCell with that exact cell view model", () => {
    const onSelectCell = vi.fn();
    const cellK2 = makeCell({ id: "K2" });
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" }), cellK2])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={onSelectCell}
      />,
    );

    fireEvent.click(screen.getByTestId("key-grid-cell-phone:default:K2"));

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell).toHaveBeenCalledWith(cellK2);
  });
});

describe("KeyGrid — proportional geometry from padPct/widthPct (FR-022)", () => {
  it("renders each cell's width as a percentage of the layer's widest-row total, and a pad spacer sized the same way", () => {
    // Row units: (15+100) + (0+50) = 165 total (this is also the layer max —
    // only one row). Key 1: pad 15/165≈9.09%, width 100/165≈60.61%.
    // Key 2: pad 0 (no spacer rendered), width 50/165≈30.30%.
    const key1 = makeCell({ id: "K1", padPct: 15, widthPct: 100 });
    const key2 = makeCell({ id: "K2", padPct: 0, widthPct: 50 });
    const vm = makeViewModel([makeRow([key1, key2])]);

    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const pad1 = screen.getByTestId("key-grid-pad-phone:default:K1");
    expect(parseFloat(pad1.style.flexBasis)).toBeCloseTo((15 / 165) * 100, 5);

    const cell1 = screen.getByTestId("key-grid-cell-phone:default:K1");
    expect(parseFloat(cell1.style.flexBasis)).toBeCloseTo((100 / 165) * 100, 5);

    // Key 2 has zero pad — no spacer element should be rendered for it.
    expect(screen.queryByTestId("key-grid-pad-phone:default:K2")).toBeNull();

    const cell2 = screen.getByTestId("key-grid-cell-phone:default:K2");
    expect(parseFloat(cell2.style.flexBasis)).toBeCloseTo((50 / 165) * 100, 5);
  });

  it("renders a row's slack as a visible trailing spacer sized relative to the layer's widest row (FR-039)", () => {
    // Row A: (15+100) = 115 total. Row B: (15+35) = 50 total -> slack 65.
    // Layer max = 115 (row A, which has slackPct 0 itself).
    const rowA = makeRow(
      [makeCell({ id: "A1", padPct: 15, widthPct: 100 })],
      0,
    );
    const rowB = makeRow(
      [makeCell({ id: "B1", padPct: 15, widthPct: 35 })],
      65,
    );
    const vm = makeViewModel([rowA, rowB]);

    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    // Row A has no slack — no slack spacer rendered.
    expect(screen.queryByTestId("key-grid-row-slack-0")).toBeNull();

    const slackB = screen.getByTestId("key-grid-row-slack-1");
    expect(parseFloat(slackB.style.flexBasis)).toBeCloseTo((65 / 115) * 100, 5);
  });

  it("treats geometry as read-only — no interactive resize/drag affordance is rendered on a cell or spacer", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    // The only interactive element per key is the gridcell itself (a native
    // <button> whose explicit role="gridcell" overrides its implicit
    // "button" role for the accessibility tree, per APG) — no separate
    // resize-handle control exists this increment. The pad spacer must
    // never itself be a button/input.
    expect(screen.getAllByRole("gridcell")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("key-grid-pad-phone:default:K1").tagName).toBe(
      "SPAN",
    );
  });
});

describe("KeyGrid — codepoint-derived accessible names (docs/accessibility.md rule 10)", () => {
  it("names a glyph keycap by its U+ notation, not the bare glyph alone", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "U_0253", keycap: "ɓ" })]),
    ]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const label = screen
      .getByTestId("key-grid-cell-phone:default:U_0253")
      .getAttribute("aria-label");
    expect(label).toContain("ɓ");
    expect(label).toContain("U+0253");
  });

  it("describes a blank (spacer) key distinctly, without a codepoint claim", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "sp1", keycap: "", sp: 10 })]),
    ]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const label = screen
      .getByTestId("key-grid-cell-phone:default:sp1")
      .getAttribute("aria-label");
    expect(label).toContain("Blank key");
    expect(label).toContain("sp1");
  });

  it("names what the key actually PRODUCES (via producedChars), not just its visible keycap label", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "T_0301", keycap: "´", producedChars: ["́"] })]),
    ]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const label = screen
      .getByTestId("key-grid-cell-phone:default:T_0301")
      .getAttribute("aria-label");
    expect(label).toContain("produces");
    expect(label).toContain("U+0301");
  });

  it("names a key with no reachable output as producing nothing, distinctly from a key that does produce", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "T_empty", keycap: "?", producedChars: [] })]),
    ]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const label = screen
      .getByTestId("key-grid-cell-phone:default:T_empty")
      .getAttribute("aria-label");
    expect(label).toContain("no output");
  });
});

describe("KeyGrid — annotations, provenance, and findings surfaced (FR-020)", () => {
  it("names non-hand-set provenance in the accessible name", () => {
    const vm = makeViewModel([
      makeRow([
        makeCell({ id: "K1", keycap: "a", provenance: "base-derived" }),
      ]),
    ]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const label = screen
      .getByTestId("key-grid-cell-phone:default:K1")
      .getAttribute("aria-label");
    expect(label).toContain("auto-placed from base keyboard");
  });

  it("does not mention provenance at all for a hand-set (or unset) key", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1", keycap: "a", provenance: "hand-set" })]),
    ]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const label = screen
      .getByTestId("key-grid-cell-phone:default:K1")
      .getAttribute("aria-label");
    expect(label).not.toContain("auto-placed");
    expect(label).not.toContain("auto-suggested");
  });

  it("names a nonzero findings count in the accessible name", () => {
    const vm = makeViewModel([
      makeRow([
        makeCell({
          id: "K1",
          keycap: "a",
          findings: [
            {
              code: "some-code",
              severity: "warning",
              address: "phone:default:K1",
              fields: {},
              fixes: [],
            },
          ],
        }),
      ]),
    ]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const label = screen
      .getByTestId("key-grid-cell-phone:default:K1")
      .getAttribute("aria-label");
    expect(label).toContain("1 diagnostic");
  });
});

describe("KeyGrid — RTL direction (seam for T066)", () => {
  it("sets dir on the grid container from viewModel.direction", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])], {
      direction: "rtl",
    });
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.getByRole("grid").getAttribute("dir")).toBe("rtl");
  });

  it("defaults to ltr when the view model omits direction (buildKeyGridViewModel's own default)", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.getByRole("grid").getAttribute("dir")).toBe("ltr");
  });
});

describe("KeyGrid — onKeyDown seam (for T065's useGridNav)", () => {
  it("forwards onKeyDown verbatim onto the grid container", () => {
    const onKeyDown = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        onKeyDown={onKeyDown}
      />,
    );

    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight" });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onKeyDown is omitted", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(() =>
      fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight" }),
    ).not.toThrow();
  });
});

describe("KeyGrid — per-layer direction resolution + logical Home/End (T066, FR-020i)", () => {
  it("renders an RTL layer's dir independently of a separately-rendered LTR layer's — direction is resolved per (platform, layer), never once for the whole keyboard (a Latin-numeral layer inside an Arabic keyboard is legitimate)", () => {
    const rtlLayer = makeViewModel([makeRow([makeCell({ id: "alef" })])], {
      direction: "rtl",
      layerId: "default",
    });
    const ltrLayer = makeViewModel([makeRow([makeCell({ id: "one" })])], {
      direction: "ltr",
      layerId: "numeric",
    });

    const { unmount } = render(
      <KeyGrid
        viewModel={rtlLayer}
        selectedAddress={null}
        onSelectCell={vi.fn()}
      />,
    );
    expect(screen.getByRole("grid").getAttribute("dir")).toBe("rtl");
    unmount();

    render(
      <KeyGrid
        viewModel={ltrLayer}
        selectedAddress={null}
        onSelectCell={vi.fn()}
      />,
    );
    expect(screen.getByRole("grid").getAttribute("dir")).toBe("ltr");
  });

  it("preserves DOCUMENT order for an RTL row exactly as for an LTR row — the pad spacer still precedes its key, and key1 still precedes key2, in the DOM; mirroring is CSS `dir` only, never a DOM reorder", () => {
    const key1 = makeCell({ id: "K1", padPct: 15 });
    const key2 = makeCell({ id: "K2", padPct: 0 });
    const vm = makeViewModel([makeRow([key1, key2])], { direction: "rtl" });
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const grid = screen.getByRole("grid");
    const testIds = Array.from(grid.querySelectorAll("[data-testid]")).map(
      (el) => el.getAttribute("data-testid"),
    );
    const padIndex = testIds.indexOf("key-grid-pad-phone:default:K1");
    const cell1Index = testIds.indexOf("key-grid-cell-phone:default:K1");
    const cell2Index = testIds.indexOf("key-grid-cell-phone:default:K2");
    expect(padIndex).toBeGreaterThanOrEqual(0);
    expect(padIndex).toBeLessThan(cell1Index);
    expect(cell1Index).toBeLessThan(cell2Index);
  });

  it("logicalRowStart/logicalRowEnd return the row array's first/last key — 'Home' in an RTL row is the array's first key (which renders at the visual RIGHT via the CSS mirror), never whichever key happens to sit at screen-left", () => {
    const row = makeRow([
      makeCell({ id: "A" }),
      makeCell({ id: "B" }),
      makeCell({ id: "C" }),
    ]);
    expect(logicalRowStart(row)?.id).toBe("A");
    expect(logicalRowEnd(row)?.id).toBe("C");
  });

  it("logicalRowStart/logicalRowEnd handle a single-key row (start and end are the same key)", () => {
    const row = makeRow([makeCell({ id: "solo" })]);
    expect(logicalRowStart(row)?.id).toBe("solo");
    expect(logicalRowEnd(row)?.id).toBe("solo");
  });
});

describe("KeyGrid — windowing (T067, FR-020j)", () => {
  it("mounts far fewer DOM gridcells than the layer actually has for a layout beyond the visible-key budget, while still including the selected cell", () => {
    const vm = manyKeyViewModel(1000);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress="phone:default:T_500"
        onSelectCell={vi.fn()}
      />,
    );

    const gridcells = screen.getAllByRole("gridcell");
    // Real, meaningful bound: comfortably under the full 1000 keys, and no
    // more than the budget plus one row's worth of rounding slack (rows are
    // mounted whole, never split).
    expect(gridcells.length).toBeLessThan(400);
    expect(gridcells.length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("key-grid-cell-phone:default:T_500"),
    ).toBeTruthy();
  });

  it("keeps exactly one Tab stop — the selected cell — even once the layer is windowed", () => {
    const vm = manyKeyViewModel(1000);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress="phone:default:T_500"
        onSelectCell={vi.fn()}
      />,
    );

    const gridcells = screen.getAllByRole("gridcell");
    const tabbable = gridcells.filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(
      screen.getByTestId("key-grid-cell-phone:default:T_500"),
    );
  });

  it("falls back to the first MOUNTED cell (not the layer's absolute first key, which may be off-window) when nothing is selected", () => {
    const vm = manyKeyViewModel(1000);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const gridcells = screen.getAllByRole("gridcell");
    const tabbable = gridcells.filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(tabbable).toHaveLength(1);
    // With no selection the window centers on row 0, so the layer's actual
    // first key IS the first mounted cell here too.
    expect(tabbable[0]).toBe(
      screen.getByTestId("key-grid-cell-phone:default:T_0"),
    );
  });

  it("reports the layer's TRUE row count via aria-rowcount even though fewer rows are mounted", () => {
    const vm = manyKeyViewModel(1000);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress="phone:default:T_500"
        onSelectCell={vi.fn()}
      />,
    );

    const grid = screen.getByRole("grid");
    expect(Number(grid.getAttribute("aria-rowcount"))).toBe(vm.rows.length);
    expect(screen.getAllByRole("row").length).toBeLessThan(vm.rows.length);
  });

  it("does not window a layout at or under the visible-key budget — every row still mounts (regression guard against over-eager windowing)", () => {
    const vm = manyKeyViewModel(MAX_VISIBLE_KEY_COUNT);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.getAllByRole("gridcell")).toHaveLength(MAX_VISIBLE_KEY_COUNT);
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe(
      String(vm.rows.length),
    );
  });
});

describe("KeyGrid — platform tabs (T077, FR-034)", () => {
  it("renders no tablist when only a single platform exists (the common case must never show a choice that isn't real)", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        platforms={[{ id: "phone", label: "Phone" }]}
        activePlatformId="phone"
      />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders no tablist when the platforms prop is omitted entirely", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders one tab per platform, with the active one aria-selected and Tab-reachable, when more than one platform exists", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        platforms={[
          { id: "phone", label: "Phone" },
          { id: "tablet", label: "Tablet" },
        ]}
        activePlatformId="phone"
      />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    const phoneTab = screen.getByTestId("key-grid-platform-tab-phone");
    const tabletTab = screen.getByTestId("key-grid-platform-tab-tablet");
    expect(phoneTab.getAttribute("aria-selected")).toBe("true");
    expect(phoneTab.getAttribute("tabindex")).toBe("0");
    expect(tabletTab.getAttribute("aria-selected")).toBe("false");
    expect(tabletTab.getAttribute("tabindex")).toBe("-1");
  });

  it("calls onPlatformChange with the clicked platform's id", () => {
    const onPlatformChange = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        platforms={[
          { id: "phone", label: "Phone" },
          { id: "tablet", label: "Tablet" },
        ]}
        activePlatformId="phone"
        onPlatformChange={onPlatformChange}
      />,
    );

    fireEvent.click(screen.getByTestId("key-grid-platform-tab-tablet"));

    expect(onPlatformChange).toHaveBeenCalledTimes(1);
    expect(onPlatformChange).toHaveBeenCalledWith("tablet");
  });

  it("moves focus and selection to the next tab on ArrowRight, wrapping from the last tab back to the first", () => {
    const onPlatformChange = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        platforms={[
          { id: "phone", label: "Phone" },
          { id: "tablet", label: "Tablet" },
        ]}
        activePlatformId="tablet"
        onPlatformChange={onPlatformChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(onPlatformChange).toHaveBeenCalledWith("phone");
  });
});

describe("KeyGrid — provenance statement (T077, FR-034)", () => {
  it("states honestly that the layout was generated from the physical layout, without naming Case A/Case B", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        provenance="derived-from-base"
      />,
    );

    const statement =
      screen.getByTestId("key-grid-provenance").textContent ?? "";
    expect(statement.length).toBeGreaterThan(0);
    expect(statement).not.toContain("Case A");
    expect(statement).not.toContain("Case B");
  });

  it("states honestly that the layout is based on an existing shipped layout, without naming Case A/Case B", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        provenance="imported-existing"
      />,
    );

    const statement =
      screen.getByTestId("key-grid-provenance").textContent ?? "";
    expect(statement.length).toBeGreaterThan(0);
    expect(statement).not.toContain("Case A");
    expect(statement).not.toContain("Case B");
  });

  it("renders no provenance statement when the prop is omitted (a caller not yet wired for it)", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.queryByTestId("key-grid-provenance")).toBeNull();
  });

  it("gives the two provenance values distinct text, so an author can never confuse one case's honest statement for the other's", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);

    const { unmount } = render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        provenance="derived-from-base"
      />,
    );
    const derivedText = screen.getByTestId("key-grid-provenance").textContent;
    unmount();

    render(
      <KeyGrid
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        provenance="imported-existing"
      />,
    );
    const importedText = screen.getByTestId("key-grid-provenance").textContent;

    expect(derivedText).not.toBe(importedText);
  });
});
