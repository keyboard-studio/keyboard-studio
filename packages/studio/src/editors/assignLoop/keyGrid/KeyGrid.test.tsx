// Unit tests for KeyGrid + KeyGridCell (spec 058 T064; FR-020, FR-020a,
// FR-022). Builds `KeyGridViewModel` fixtures directly (rather than going
// through `buildKeyGridViewModel`) so these tests exercise the RENDERING
// contract in isolation from the T063 projection — a regression in the
// builder should not need to also break these.

import { describe, it, expect, vi, afterEach } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { computeRowMetrics } from "@keyboard-studio/engine";
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

/**
 * Every `on*` callback `KeyGridProps` requires (spec 061 T002/D1) — supplied
 * as `vi.fn()` stand-ins so a test that only cares about one or two handlers
 * doesn't have to restate the rest just to satisfy `tsc`. Spread FIRST in a
 * render call: a test's own explicit prop, written after this spread, wins
 * per ordinary JSX prop-merge order (later attributes override earlier ones).
 */
function requiredKeyGridHandlers() {
  return {
    onKeyDown: vi.fn(),
    onPlatformChange: vi.fn(),
    onAddKeyAfter: vi.fn(),
    onOpenCommandMenu: vi.fn(),
    onFollowNextLayer: vi.fn(),
  };
}

/**
 * The grid's LAYOUT rows and KEY cells, as distinct from the per-row
 * row-actions strip, which also carries `role="row"` + `role="gridcell"`
 * (T123/SC-009: `role="grid"` admits only `row`/`rowgroup` children, so a
 * plain `<div>` there failed axe's `aria-required-children` at critical
 * impact — see KeyGrid.tsx's own comment on that strip).
 *
 * Layout rows are exactly the rows carrying `aria-rowindex`, and key cells
 * exactly the cells carrying `aria-colindex`; the control strip deliberately
 * carries neither, because those indices describe LAYOUT positions and a
 * control strip has none. Every assertion below that counts rows or cells means
 * the layout's, so it goes through these two helpers rather than the raw role
 * query.
 */
function layoutRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((r) => r.hasAttribute("aria-rowindex"));
}

function keyCells(): HTMLElement[] {
  return screen
    .getAllByRole("gridcell")
    .filter((c) => c.hasAttribute("aria-colindex"));
}

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
    // Defaults to the address, matching what `buildKeyGridViewModel` produces
    // for the FIRST key with a given address. A fixture that deliberately
    // repeats an address (the duplicate-id tests below) supplies its own, the
    // way the real builder's occurrence counter would.
    cellKey: overrides.cellKey ?? address,
    id: overrides.id,
    keycap: overrides.keycap ?? overrides.id,
    sp: overrides.sp,
    padPct: overrides.padPct ?? 15,
    widthPct: overrides.widthPct ?? 100,
    producedChars: overrides.producedChars ?? [],
    annotations: overrides.annotations ?? EMPTY_ANNOTATIONS,
    findings: overrides.findings ?? [],
    // Defaults false; `makeRow` stamps the real value on the row's last cell,
    // so a test never has to hand-maintain it (spec 061 T024).
    isLastInRow: overrides.isLastInRow ?? false,
    ...(overrides.nextlayer !== undefined
      ? { nextlayer: overrides.nextlayer }
      : {}),
    ...(overrides.provenance !== undefined
      ? { provenance: overrides.provenance }
      : {}),
  };
}

/**
 * A row view model, with `isLastInRow` and `metrics` derived rather than passed
 * (spec 061 T024) — so every existing call site keeps its two-argument shape and
 * the derived fields cannot go stale against the cells they describe.
 */
function makeRow(
  keys: readonly KeyGridCellViewModel[],
  slackPct = 0,
  platform = "phone",
): KeyGridRowViewModel {
  // Stamped IN PLACE rather than onto copies: several tests assert that a
  // callback received *the same cell object* they built (`toHaveBeenCalledWith`
  // is a deep compare, but `onOpenCommandMenu`'s case is an identity one), and
  // copying here would hand KeyGrid a different object than the test holds.
  // These are freshly-built local fixtures, so mutating them is safe.
  keys.forEach((key, i) => {
    (key as { isLastInRow: boolean }).isLastInRow = i === keys.length - 1;
  });
  return {
    slackPct,
    metrics: computeRowMetrics(
      keys.map((k) => ({ sp: k.sp, width: k.widthPct, pad: k.padPct })),
      platform,
    ),
    keys,
  };
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
  // Regression guard for the T123/SC-009 finding: the per-row row-actions
  // strip was a plain <div> child of role="grid", which axe rates a
  // CRITICAL `aria-required-children` violation (role="grid" admits only
  // row/rowgroup children; role="row" only gridcell/columnheader/rowheader).
  //
  // The axe scan that found it lives in `e2e/touch-key-grid-a11y.spec.ts`, and
  // e2e is deliberately OUT of the unit CI lane — so without this test the
  // invariant is only checked by a suite nobody runs on a PR. Asserted
  // structurally here (children carry an allowed role, or are decorative and
  // aria-hidden) rather than by re-running axe, which would drag a browser into
  // the fast lane.
  it("every child of the grid is a row, and every child of a row is a cell or decorative — the invariant axe enforces", () => {
    const vm = makeViewModel([
      // Slack on one row and two keys on it — not load-bearing for what this
      // test asserts (the row-actions strip renders unconditionally now,
      // spec 061 T012), but keeps the fixture exercising the decorative
      // pad/slack spacers too.
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })], 40),
      makeRow([makeCell({ id: "K3" })]),
    ]);

    const { container } = render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const grid = container.querySelector('[role="grid"]');
    expect(grid).toBeTruthy();

    const decorative = (el: Element) => el.getAttribute("aria-hidden") === "true";

    for (const child of Array.from(grid!.children)) {
      expect(
        child.getAttribute("role") === "row" || decorative(child),
        `grid child <${child.tagName.toLowerCase()} role=${child.getAttribute("role")}> is neither a row nor decorative`,
      ).toBe(true);
    }

    const allRows = grid!.querySelectorAll('[role="row"]');
    expect(allRows.length).toBeGreaterThan(0);
    for (const row of Array.from(allRows)) {
      for (const child of Array.from(row.children)) {
        expect(
          child.getAttribute("role") === "gridcell" || decorative(child),
          `row child <${child.tagName.toLowerCase()} role=${child.getAttribute("role")}> is neither a gridcell nor decorative`,
        ).toBe(true);
      }
    }

    // And the control strip really was in this fixture — otherwise the loops
    // above pass by not encountering the case they exist for.
    expect(container.querySelector('[data-testid="key-grid-row-actions-0"]')).toBeTruthy();
  });

  it("renders role=grid on the container, role=row per row, role=gridcell per key", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })]),
      makeRow([makeCell({ id: "K3" })]),
    ]);

    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.getByRole("grid")).toBeTruthy();
    expect(layoutRows()).toHaveLength(2);
    expect(keyCells()).toHaveLength(3);
  });

  it("sets aria-rowindex per row (1-based) and aria-colindex per key within its row (1-based, counting only actual keys)", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })]),
      makeRow([makeCell({ id: "K3" })]),
    ]);

    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const rows = layoutRows();
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-label")).toBeTruthy();
  });

  it("uses an explicit `label` prop for the grid's accessible name when supplied", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
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
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress="phone:default:T_150"
        onSelectCell={vi.fn()}
      />,
    );

    const gridcells = keyCells();
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
        {...requiredKeyGridHandlers()}
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const gridcells = keyCells();
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
        {...requiredKeyGridHandlers()}
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
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress="phone:default:K2"
        onSelectCell={vi.fn()}
      />,
    );

    expect(screen.getByRole("grid").getAttribute("tabindex")).toBe("-1");
    for (const rowEl of layoutRows()) {
      expect(rowEl.getAttribute("tabindex")).toBe("-1");
    }

    const gridcells = keyCells();
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
        {...requiredKeyGridHandlers()}
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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

  it("stretches the LAST key of an under-full row to the layer maximum, and renders no slack spacer at all (spec 061 T026, FR-012)", () => {
    // Row A: (15+100) = 115 total. Row B: (15+35) = 50 total -> slack 65.
    // Layer max = 115 (row A, which has slackPct 0 itself).
    const rowA = makeRow([makeCell({ id: "A1", padPct: 15, widthPct: 100 })], 0);
    const rowB = makeRow([makeCell({ id: "B1", padPct: 15, widthPct: 35 })], 65);
    const vm = makeViewModel([rowA, rowB]);

    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    // The hatch is gone in both directions — ADR 0002 withdrew it outright.
    expect(screen.queryByTestId("key-grid-row-slack-0")).toBeNull();
    expect(screen.queryByTestId("key-grid-row-slack-1")).toBeNull();

    // B1 is its row's last key, so it renders at its own width PLUS the row's
    // slack: (35 + 65) / 115. That is exactly what KeymanWeb draws.
    const cells = keyCells();
    expect(parseFloat(cells[1]!.style.flexBasis)).toBeCloseTo((100 / 115) * 100, 5);
    // A1 is already at the layer maximum, so it is unchanged by the rule.
    expect(parseFloat(cells[0]!.style.flexBasis)).toBeCloseTo((100 / 115) * 100, 5);
  });

  it("stretches only the last key, leaving earlier keys at their declared width (FR-012, FR-015)", () => {
    const row = makeRow(
      [
        makeCell({ id: "K1", padPct: 0, widthPct: 40 }),
        makeCell({ id: "K2", padPct: 0, widthPct: 40 }),
      ],
      20,
    );
    const vm = makeViewModel([row]);

    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    // Layer max = 40 + 40 + 20 slack = 100.
    const cells = keyCells();
    expect(parseFloat(cells[0]!.style.flexBasis)).toBeCloseTo(40, 5);
    expect(parseFloat(cells[1]!.style.flexBasis)).toBeCloseTo(60, 5);
    // Together with the (zero) padding, the row now fills the layer exactly —
    // "nothing clipped", the rendering half of FR-017.
    expect(
      parseFloat(cells[0]!.style.flexBasis) + parseFloat(cells[1]!.style.flexBasis),
    ).toBeCloseTo(100, 5);
  });

  it("treats geometry as read-only — no interactive resize/drag affordance is rendered on a cell or spacer", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    // The only interactive element per key is the gridcell itself (a native
    // <button> whose explicit role="gridcell" overrides its implicit
    // "button" role for the accessibility tree, per APG) — no separate
    // resize-handle control exists this increment. The pad spacer must
    // never itself be a button/input.
    expect(keyCells()).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("key-grid-pad-phone:default:K1").tagName).toBe(
      "SPAN",
    );
  });
});

describe("KeyGrid — row slack (FR-039) and the retained row-actions strip (spec 061 T012, FR-007, FR-038, ADR 0002)", () => {
  it("prints the row's measurements plainly, where the hatch used to gesture at them (spec 061 T026, FR-013)", () => {
    const rowA = makeRow([makeCell({ id: "A1", padPct: 15, widthPct: 100 })], 0);
    const rowB = makeRow([makeCell({ id: "B1", padPct: 15, widthPct: 35 })], 65);
    const vm = makeViewModel([rowA, rowB]);

    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    // The hatch carried no digits, deliberately. Its replacement is all digits.
    const readoutB = screen.getByTestId("key-grid-row-metrics-1");
    expect(readoutB.textContent ?? "").toContain("1 keys");
    expect(readoutB.textContent ?? "").toContain("35 declared width");
    expect(readoutB.textContent ?? "").toContain("15 padding");
    expect(readoutB.textContent ?? "").toContain("50 total");
    // One readout per layout row, no more.
    expect(screen.getByTestId("key-grid-row-metrics-0")).toBeTruthy();
    expect(screen.queryByTestId("key-grid-row-metrics-2")).toBeNull();
  });

  // "Fill row" / "Even out row" were withdrawn by FR-007/ADR 0002 — once the
  // last key of an under-full row stretches to fill it (US2/T026, out of this
  // task's scope), there is no slack left for either control to act on. The
  // container that held them stays (FR-038 forbids regressing spec 058
  // SC-009's accessibility fix), now rendering unconditionally for every row
  // with an empty gridcell — spec 061 T026 mounts a metrics readout there.
  it("renders the row-actions container for every row, unconditionally, regardless of slack or key count", () => {
    const noSlackSingleKey = makeRow(
      [makeCell({ id: "R0K1", padPct: 15, widthPct: 100 })],
      0,
    );
    const slackTwoKeys = makeRow(
      [
        makeCell({ id: "R1K1", padPct: 15, widthPct: 30 }),
        makeCell({ id: "R1K2", padPct: 15, widthPct: 30 }),
      ],
      40,
    );
    const vm = makeViewModel([noSlackSingleKey, slackTwoKeys]);

    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.getByTestId("key-grid-row-actions-0")).toBeTruthy();
    expect(screen.getByTestId("key-grid-row-actions-1")).toBeTruthy();
  });

  it("renders the row-actions container as a sibling of role=row, never inside it — the ARIA grid's owned elements stay gridcells-only", () => {
    const row = makeRow(
      [
        makeCell({ id: "K1", padPct: 15, widthPct: 30 }),
        makeCell({ id: "K2", padPct: 15, widthPct: 30 }),
      ],
      40,
    );
    const vm = makeViewModel([row]);

    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const rowEl = layoutRows()[0];
    expect(
      rowEl?.querySelector('[data-testid="key-grid-row-actions-0"]'),
    ).toBeNull();
    expect(screen.getByTestId("key-grid-row-actions-0")).toBeTruthy();
  });
});

describe("KeyGrid — codepoint-derived accessible names (docs/accessibility.md rule 10)", () => {
  it("names a glyph keycap by its U+ notation, not the bare glyph alone", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "U_0253", keycap: "ɓ" })]),
    ]);
    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.getByRole("grid").getAttribute("dir")).toBe("rtl");
  });

  it("defaults to ltr when the view model omits direction (buildKeyGridViewModel's own default)", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        onKeyDown={onKeyDown}
      />,
    );

    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight" });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
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
        {...requiredKeyGridHandlers()}
        viewModel={rtlLayer}
        selectedAddress={null}
        onSelectCell={vi.fn()}
      />,
    );
    expect(screen.getByRole("grid").getAttribute("dir")).toBe("rtl");
    unmount();

    render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
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
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress="phone:default:T_500"
        onSelectCell={vi.fn()}
      />,
    );

    const gridcells = keyCells();
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
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress="phone:default:T_500"
        onSelectCell={vi.fn()}
      />,
    );

    const gridcells = keyCells();
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    const gridcells = keyCells();
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
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress="phone:default:T_500"
        onSelectCell={vi.fn()}
      />,
    );

    const grid = screen.getByRole("grid");
    expect(Number(grid.getAttribute("aria-rowcount"))).toBe(vm.rows.length);
    expect(layoutRows().length).toBeLessThan(vm.rows.length);
  });

  it("does not window a layout at or under the visible-key budget — every row still mounts (regression guard against over-eager windowing)", () => {
    const vm = manyKeyViewModel(MAX_VISIBLE_KEY_COUNT);
    render(
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(keyCells()).toHaveLength(MAX_VISIBLE_KEY_COUNT);
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
        {...requiredKeyGridHandlers()}
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders one tab per platform, with the active one aria-selected and Tab-reachable, when more than one platform exists", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
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
        {...requiredKeyGridHandlers()}
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
        {...requiredKeyGridHandlers()}
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
        {...requiredKeyGridHandlers()}
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
        {...requiredKeyGridHandlers()}
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
      <KeyGrid {...requiredKeyGridHandlers()} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />,
    );

    expect(screen.queryByTestId("key-grid-provenance")).toBeNull();
  });

  it("gives the two provenance values distinct text, so an author can never confuse one case's honest statement for the other's", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);

    const { unmount } = render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
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
        {...requiredKeyGridHandlers()}
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

describe("KeyGridCell — the pointer paths (T111, FR-021)", () => {
  const ADD_WEDGE = "key-grid-cell-phone:default:K1-add-wedge";
  const MENU_WEDGE = "key-grid-cell-phone:default:K1-menu-wedge";

  function renderOneKey(
    props: Partial<ComponentProps<typeof KeyGrid>> = {},
    cellOverrides: Partial<KeyGridCellViewModel> = {},
  ) {
    const cell = makeCell({ id: "K1", ...cellOverrides });
    const vm = makeViewModel([makeRow([cell])]);
    render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={vi.fn()}
        {...props}
      />,
    );
    return { cell, el: screen.getByTestId("key-grid-cell-phone:default:K1") };
  }

  it("reveals the (+) and ⋯ wedges on hover and hides them again on leave — 'hover reveals' means mounted, not merely made visible", () => {
    const { el } = renderOneKey({
      onAddKeyAfter: vi.fn(),
      onOpenCommandMenu: vi.fn(),
    });

    // At rest: no wedge in the DOM at all.
    expect(screen.queryByTestId(ADD_WEDGE)).toBeNull();
    expect(screen.queryByTestId(MENU_WEDGE)).toBeNull();

    fireEvent.mouseEnter(el);
    expect(screen.getByTestId(ADD_WEDGE)).not.toBeNull();
    expect(screen.getByTestId(MENU_WEDGE)).not.toBeNull();

    fireEvent.mouseLeave(el);
    expect(screen.queryByTestId(ADD_WEDGE)).toBeNull();
    expect(screen.queryByTestId(MENU_WEDGE)).toBeNull();
  });

  it("renders no wedges on a blank/spacer key — it is not an authorable key", () => {
    // sp 10 is the spacer class (isSpacerKeyClass).
    const { el } = renderOneKey(
      { onAddKeyAfter: vi.fn(), onOpenCommandMenu: vi.fn() },
      { sp: 10 },
    );
    fireEvent.mouseEnter(el);

    expect(screen.queryByTestId(ADD_WEDGE)).toBeNull();
    expect(screen.queryByTestId(MENU_WEDGE)).toBeNull();
  });

  it("keeps the wedges OUT of the accessibility tree and adds no second Tab stop (FR-020a) — they are aria-hidden spans, never nested buttons", () => {
    const { el } = renderOneKey({
      onAddKeyAfter: vi.fn(),
      onOpenCommandMenu: vi.fn(),
    });
    fireEvent.mouseEnter(el);

    for (const testId of [ADD_WEDGE, MENU_WEDGE]) {
      const wedge = screen.getByTestId(testId);
      expect(wedge.tagName).toBe("SPAN");
      expect(wedge.getAttribute("aria-hidden")).toBe("true");
    }
    // Still exactly one gridcell and zero exposed buttons: the explicit
    // role="gridcell" on the cell <button> is the only interactive node.
    expect(keyCells()).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      keyCells().filter((c) => c.getAttribute("tabindex") === "0"),
    ).toHaveLength(1);
  });

  it("routes a click on the (+) wedge to onAddKeyAfter and NOT to selection", () => {
    const onAddKeyAfter = vi.fn();
    const onSelectCell = vi.fn();
    const { cell, el } = renderOneKey({ onAddKeyAfter, onSelectCell });
    fireEvent.mouseEnter(el);

    fireEvent.click(screen.getByTestId(ADD_WEDGE));

    expect(onAddKeyAfter).toHaveBeenCalledTimes(1);
    expect(onAddKeyAfter).toHaveBeenCalledWith(cell);
    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it("routes a click on the ⋯ wedge to onOpenCommandMenu and NOT to selection", () => {
    const onOpenCommandMenu = vi.fn();
    const onSelectCell = vi.fn();
    const { cell, el } = renderOneKey({ onOpenCommandMenu, onSelectCell });
    fireEvent.mouseEnter(el);

    fireEvent.click(screen.getByTestId(MENU_WEDGE));

    expect(onOpenCommandMenu).toHaveBeenCalledTimes(1);
    expect(onOpenCommandMenu.mock.calls[0]?.[0]).toBe(cell);
    expect(onOpenCommandMenu.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it("still selects when the click lands on the key itself rather than a wedge — the primary action is unchanged by T111", () => {
    const onSelectCell = vi.fn();
    const onAddKeyAfter = vi.fn();
    const { cell, el } = renderOneKey({ onSelectCell, onAddKeyAfter });
    fireEvent.mouseEnter(el);

    fireEvent.click(el);

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell).toHaveBeenCalledWith(cell);
    expect(onAddKeyAfter).not.toHaveBeenCalled();
  });

  it("opens the command menu on right-click, anchored at the POINTER, and suppresses the browser's own menu", () => {
    const onOpenCommandMenu = vi.fn();
    const { cell, el } = renderOneKey({ onOpenCommandMenu });

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 123,
      clientY: 456,
    });
    const notCancelled = el.dispatchEvent(event);

    expect(onOpenCommandMenu).toHaveBeenCalledWith(cell, { x: 123, y: 456 });
    // preventDefault() was called — otherwise the native context menu would
    // appear on top of ours.
    expect(notCancelled).toBe(false);
  });

  it("always opens the command menu on right-click, even on a cell whose test only supplied the default handlers — there is always a menu to put in the browser's place now that the handler is required", () => {
    const { el } = renderOneKey();

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    // `false` (event was cancelled) is the assertion: `preventDefault()` ran
    // unconditionally, so the browser's own menu never appears.
    expect(el.dispatchEvent(event)).toBe(false);
  });

  it("follows the key's 'Goes to' layer on double-click, reporting the resolved nextlayer", () => {
    const onFollowNextLayer = vi.fn();
    const { cell, el } = renderOneKey(
      { onFollowNextLayer },
      { nextlayer: "shift" },
    );

    fireEvent.doubleClick(el);

    expect(onFollowNextLayer).toHaveBeenCalledTimes(1);
    expect(onFollowNextLayer).toHaveBeenCalledWith(cell, "shift");
  });

  it("does not fire the follow on double-click for a key that switches nowhere", () => {
    const onFollowNextLayer = vi.fn();
    const { el } = renderOneKey({ onFollowNextLayer });

    fireEvent.doubleClick(el);

    expect(onFollowNextLayer).not.toHaveBeenCalled();
  });

  it("advertises the double-click route by title ONLY on a key that has a layer to follow", () => {
    const { el: withLayer } = renderOneKey(
      { onFollowNextLayer: vi.fn() },
      { nextlayer: "shift" },
    );
    expect(withLayer.getAttribute("title")).toContain("Ctrl+Enter");
    cleanup();

    const { el: withoutLayer } = renderOneKey({ onFollowNextLayer: vi.fn() });
    expect(withoutLayer.getAttribute("title")).toBeNull();
  });

  it("adds NO drag-and-drop or resize affordance (FR-021: drag stays an enhancement over commands that do not exist yet)", () => {
    const { el } = renderOneKey({
      onAddKeyAfter: vi.fn(),
      onOpenCommandMenu: vi.fn(),
      onFollowNextLayer: vi.fn(),
    });
    fireEvent.mouseEnter(el);

    // Neither the cell nor either revealed wedge is draggable, and no
    // separate resize handle exists — geometry is read-only this increment.
    expect(el.getAttribute("draggable")).toBeNull();
    for (const testId of [ADD_WEDGE, MENU_WEDGE]) {
      expect(screen.getByTestId(testId).getAttribute("draggable")).toBeNull();
    }
    expect(screen.getByTestId("key-grid").querySelectorAll("[draggable='true']")).toHaveLength(0);
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
  });
});

describe("KeyGrid — cells stay unique when key ids repeat within a layer", () => {
  // A layer whose key ids REPEAT is not an edge case: the shipped
  // `sil_cameroon_azerty.keyman-touch-layout` has `T_BLANK` twenty-five times
  // and `K_SHIFT` twice inside a single tablet layer, and every scaffolded
  // layout uses one blank id for every filler slot. Because
  // `touchKeyAddress(platform, layerId, key.id)` is derived from the id alone,
  // all of those cells share ONE address.
  //
  // That made the address unusable as this grid's React key. React's keyed
  // reconciliation builds a map of the previous children keyed by key, so
  // duplicates overwrite each other and only the last fiber per key is
  // reachable; the shadowed ones are never matched by a subsequent render and
  // never enter the deletion set either, so they stay mounted. Switching
  // layers therefore ADDED a set of orphaned blanks and front-of-row keys to
  // the DOM on every switch, which is exactly what an author sees: "switch to
  // shift and back to default a few times, the spacing and keys at the front
  // of the columns multiply".
  //
  // The fix is `KeyGridCellViewModel.cellKey` (keyGridViewModel.ts) — an
  // address disambiguated by its occurrence within the layer. The ADDRESS is
  // deliberately unchanged: it is the overlay's contract with the engine, and
  // this is a rendering-identity problem, not an addressing one.
  function duplicateIdLayer(layerId: string, blanks: number): KeyGridViewModel {
    // Addresses repeat exactly as the shipped layout's do; `cellKey` carries
    // the occurrence disambiguator the real builder computes.
    const shiftAddr = `tablet:${layerId}:K_SHIFT`;
    const blankAddr = `tablet:${layerId}:T_BLANK`;
    const cells = [
      makeCell({ id: "K_SHIFT", address: shiftAddr, cellKey: shiftAddr }),
      ...Array.from({ length: blanks }, (_, i) =>
        makeCell({
          id: "T_BLANK",
          address: blankAddr,
          cellKey: i === 0 ? blankAddr : `${blankAddr}#${i}`,
        }),
      ),
      makeCell({ id: "K_SHIFT", address: shiftAddr, cellKey: `${shiftAddr}#1` }),
    ];
    return makeViewModel([makeRow(cells, 0, "tablet")], {
      platform: "tablet",
      layerId,
    });
  }

  it("renders one cell per key no matter how many times the layer is switched", () => {
    const def = duplicateIdLayer("default", 3);
    const shift = duplicateIdLayer("shift", 5);
    const expectedDefault = def.rows[0]!.keys.length;
    const expectedShift = shift.rows[0]!.keys.length;

    const { rerender } = render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
        viewModel={def}
        selectedAddress={null}
        onSelectCell={vi.fn()}
      />,
    );
    expect(keyCells()).toHaveLength(expectedDefault);

    // Three round trips — the author's "a few times".
    for (let i = 0; i < 3; i++) {
      rerender(
        <KeyGrid
          {...requiredKeyGridHandlers()}
          viewModel={shift}
          selectedAddress={null}
          onSelectCell={vi.fn()}
        />,
      );
      expect(keyCells(), `shift pass ${i + 1}`).toHaveLength(expectedShift);

      rerender(
        <KeyGrid
          {...requiredKeyGridHandlers()}
          viewModel={def}
          selectedAddress={null}
          onSelectCell={vi.fn()}
        />,
      );
      expect(keyCells(), `default pass ${i + 1}`).toHaveLength(expectedDefault);
    }
  });

  it("renders one decorative pad spacer per key, not an accumulating pile", () => {
    const def = duplicateIdLayer("default", 3);
    const shift = duplicateIdLayer("shift", 5);

    const { container, rerender } = render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
        viewModel={def}
        selectedAddress={null}
        onSelectCell={vi.fn()}
      />,
    );
    const pads = () => container.querySelectorAll('[data-testid^="key-grid-pad-"]');

    for (let i = 0; i < 3; i++) {
      rerender(
        <KeyGrid
          {...requiredKeyGridHandlers()}
          viewModel={shift}
          selectedAddress={null}
          onSelectCell={vi.fn()}
        />,
      );
      rerender(
        <KeyGrid
          {...requiredKeyGridHandlers()}
          viewModel={def}
          selectedAddress={null}
          onSelectCell={vi.fn()}
        />,
      );
    }
    expect(pads()).toHaveLength(def.rows[0]!.keys.length);
  });
});
