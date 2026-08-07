// Unit tests for useGridNav (spec 058 T065, T068; FR-020b, FR-020c, FR-020d,
// FR-020k). Builds `KeyGridViewModel` fixtures directly (the same pattern
// KeyGrid.test.tsx uses) so these tests exercise the NAVIGATION contract in
// isolation from the T063 projection and the T064 rendering, except for the
// one end-to-end DOM-guarantee test at the bottom, which deliberately mounts
// the real `KeyGrid` to prove the "never document.body" guarantee holds in
// an actual (jsdom) DOM, not just as a pure-function assertion.
//
// The vertical-navigation fixtures below use DELIBERATELY unequal key counts
// and unequal widths across rows — the exact corpus reality FR-020c calls
// out — so a test that would pass under naive index-clamping (same column
// index in the row above/below) is expected to FAIL here, and does: see
// "geometry-based vertical navigation" below, which pins down centre-span
// landings an index-clamped implementation gets wrong.

import { describe, it, expect, vi, afterEach } from "vitest";
import { useLayoutEffect, useRef, useState } from "react";
import { cleanup, fireEvent, render as rtlRender, renderHook, screen } from "@testing-library/react";
import { render as renderWithI18n } from "../../../test/renderWithI18n.tsx";
import { computeRowMetrics } from "@keyboard-studio/engine";
import { KeyGrid } from "./KeyGrid.tsx";
import {
  applyFocusRestorationTarget,
  findCellPosition,
  firstCellOfLayer,
  lastCellOfLayer,
  resolveFocusAfterRemoval,
  resolveLayerSwitchCell,
  useGridNav,
  type GridFocusRestorationTarget,
} from "./useGridNav.ts";
import type {
  KeyGridAnnotationCounts,
  KeyGridCellViewModel,
  KeyGridRowViewModel,
  KeyGridViewModel,
} from "./keyGridViewModel.ts";

afterEach(() => {
  cleanup();
});

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };

/**
 * The editing callbacks `KeyGridProps` requires (spec 061 T002/FR-001), as
 * `vi.fn()` stubs. Mirrors `KeyGrid.test.tsx`'s own helper of the same name
 * rather than being imported from it — a test file exporting fixtures to
 * another test file couples two suites that are deliberately independent.
 *
 * Needed here even though these tests are about NAVIGATION, not editing: the
 * five props are required, so a mount that omits them is a type error. It is
 * only a *latent* one today, because `packages/studio/tsconfig.json` excludes
 * this package's test files from `pnpm typecheck` — which is precisely why
 * spec 061 T008 sweeps for mount sites by hand rather than trusting `tsc` to
 * have found them all. `tsc` is the real gate for PRODUCTION mounts, where the
 * defect of record actually lived; test mounts need the sweep.
 *
 * Shared at module scope rather than called per mount: no test here asserts on
 * these handlers, and one stable identity keeps the props referentially equal
 * across a harness's re-renders instead of minting five new functions each pass.
 */
const NAV_HANDLERS = {
  onKeyDown: vi.fn(),
  onPlatformChange: vi.fn(),
  onAddKeyAfter: vi.fn(),
  onOpenCommandMenu: vi.fn(),
  onFollowNextLayer: vi.fn(),
};

function makeCell(overrides: Partial<KeyGridCellViewModel> & { id: string }): KeyGridCellViewModel {
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
    // Defaults false; `makeRow` stamps the real value on the row's last cell
    // (spec 061 T024), so a test never hand-maintains it.
    isLastInRow: overrides.isLastInRow ?? false,
    ...(overrides.nextlayer !== undefined ? { nextlayer: overrides.nextlayer } : {}),
    ...(overrides.provenance !== undefined ? { provenance: overrides.provenance } : {}),
  };
}

/**
 * A row view model with `isLastInRow` and `metrics` derived rather than passed
 * (spec 061 T024). Stamped in place, matching KeyGrid.test.tsx's own helper —
 * these are freshly-built local fixtures, and copying would hand the component
 * a different object than the test holds.
 */
function makeRow(keys: readonly KeyGridCellViewModel[], slackPct = 0): KeyGridRowViewModel {
  keys.forEach((key, i) => {
    (key as { isLastInRow: boolean }).isLastInRow = i === keys.length - 1;
  });
  return {
    slackPct,
    metrics: computeRowMetrics(
      keys.map((k) => ({ sp: k.sp, width: k.widthPct, pad: k.padPct })),
      "phone",
    ),
    keys,
  };
}

function makeViewModel(
  rows: readonly KeyGridRowViewModel[],
  overrides: Partial<Pick<KeyGridViewModel, "platform" | "layerId" | "direction">> = {},
): KeyGridViewModel {
  return {
    platform: overrides.platform ?? "phone",
    layerId: overrides.layerId ?? "default",
    direction: overrides.direction ?? "ltr",
    rows,
  };
}

// ---------------------------------------------------------------------------
// A small host component to drive `useGridNav` through real keydown events,
// the same way KeyGrid's forwarded onKeyDown does — a plain gridcell markup
// (role="gridcell" + aria-rowindex/aria-colindex), no KeyGrid/KeyGridCell
// import, so these tests stay isolated from T064's rendering (and need no
// i18n provider, unlike KeyGridCell).
// ---------------------------------------------------------------------------

function GridNavHost({
  viewModel,
  onSelectCell,
}: {
  viewModel: KeyGridViewModel;
  onSelectCell: (cell: KeyGridCellViewModel) => void;
}) {
  const { handleKeyDown } = useGridNav({ viewModel, onSelectCell });
  return (
    <div role="grid" onKeyDown={handleKeyDown} data-testid="host-grid">
      {viewModel.rows.map((row, rowIndex) => (
        <div role="row" key={rowIndex}>
          {row.keys.map((cell, colIndex) => (
            <button
              key={cell.address}
              role="gridcell"
              aria-rowindex={rowIndex + 1}
              aria-colindex={colIndex + 1}
              data-testid={`host-cell-${cell.address}`}
            >
              {cell.id}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function pressKey(address: string, key: string, extra: Record<string, unknown> = {}): void {
  const el = screen.getByTestId(`host-cell-${address}`);
  el.focus();
  fireEvent.keyDown(el, { key, ...extra });
}

describe("useGridNav — Left/Right within the row (FR-020b)", () => {
  it("moves right to the next key in the same row", () => {
    const onSelectCell = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" }), makeCell({ id: "K3" })])]);
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:K1", "ArrowRight");

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("K2");
  });

  it("moves left to the previous key in the same row", () => {
    const onSelectCell = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" }), makeCell({ id: "K3" })])]);
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:K3", "ArrowLeft");

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("K2");
  });

  it("does not select ANYTHING (no wrap) when ArrowRight is pressed on the row's last key", () => {
    const onSelectCell = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })])]);
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:K2", "ArrowRight");

    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it("does not select ANYTHING (no wrap) when ArrowLeft is pressed on the row's first key", () => {
    const onSelectCell = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })])]);
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:K1", "ArrowLeft");

    expect(onSelectCell).not.toHaveBeenCalled();
  });
});

describe("useGridNav — geometry-based Up/Down on rows of unequal key counts and widths (FR-020c)", () => {
  // Row 0 (top): three keys of width 30 each, no pad — spans [0,30) [30,60)
  // [60,90). Row 1 (bottom): a single WIDE key spanning the whole row —
  // width 90, no pad — span [0,90). Both rows total 90 units, so neither has
  // slack, keeping the fixture's raw-unit centres directly comparable.
  //
  // Centre of row-0 key index 1 (middle key, span [30,60)) is 45. Under
  // INDEX-CLAMPING, Down from row-0 index 1 would land on row-1 index 1 —
  // which does not exist (row 1 has only one key). Geometry-based landing
  // must choose row-1's single key instead, because its span [0,90)
  // contains 45.
  function unequalRowsFixture(): KeyGridViewModel {
    const topRow = makeRow([
      makeCell({ id: "T0", padPct: 0, widthPct: 30 }),
      makeCell({ id: "T1", padPct: 0, widthPct: 30 }),
      makeCell({ id: "T2", padPct: 0, widthPct: 30 }),
    ]);
    const bottomRow = makeRow([makeCell({ id: "B0", padPct: 0, widthPct: 90 })]);
    return makeViewModel([topRow, bottomRow]);
  }

  it("lands Down from the middle of three narrow keys onto the one wide key spanning all three (not index-clamped, which would find nothing at index 1)", () => {
    const onSelectCell = vi.fn();
    const vm = unequalRowsFixture();
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:T1", "ArrowDown");

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("B0");
  });

  it("lands Up from the wide key back onto the narrow key whose span contains the wide key's own centre (45 -> T1, the middle key)", () => {
    const onSelectCell = vi.fn();
    const vm = unequalRowsFixture();
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:B0", "ArrowUp");

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("T1");
  });

  it("discriminates against a plain index-clamped implementation: Down from T2 (index 2, off the end of row 1's single-key array) must still resolve to B0, not no-op", () => {
    // An index-clamping implementation using Math.min(colIndex, row.length-1)
    // would clamp index 2 to index 0 in row 1 and ALSO land on B0 here,
    // producing the same observable result as the geometry-correct answer
    // in this particular case — which is exactly why the T1 case above (a
    // genuine MIDDLE index landing on a row with a different key layout,
    // not merely a shorter one) is the discriminating assertion. This test
    // additionally locks in that the off-the-end case still lands somewhere
    // sane rather than no-op'ing.
    const onSelectCell = vi.fn();
    const vm = unequalRowsFixture();
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:T2", "ArrowDown");

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("B0");
  });

  it("does not select anything (no wrap) when ArrowDown is pressed on the bottom row", () => {
    const onSelectCell = vi.fn();
    const vm = unequalRowsFixture();
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:B0", "ArrowDown");

    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it("does not select anything (no wrap) when ArrowUp is pressed on the top row", () => {
    const onSelectCell = vi.fn();
    const vm = unequalRowsFixture();
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:T0", "ArrowUp");

    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it("accounts for left padding when computing centre, not just width: a padded key's centre shifts right by its own pad", () => {
    // Row 0: one key, pad 20, width 40 -> span [20, 60), centre 40.
    // Row 1: two keys of width 40 each, no pad -> spans [0,40) [40,80).
    // Centre 40 sits exactly on the boundary; the second span's own
    // `centre >= start` check (>=, not >) means the boundary belongs to the
    // SECOND key, not the first — pinning that convention down explicitly.
    const topRow = makeRow([makeCell({ id: "P0", padPct: 20, widthPct: 40 })]);
    const bottomRow = makeRow([
      makeCell({ id: "P1", padPct: 0, widthPct: 40 }),
      makeCell({ id: "P2", padPct: 0, widthPct: 40 }),
    ]);
    const vm = makeViewModel([topRow, bottomRow]);
    const onSelectCell = vi.fn();
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:P0", "ArrowDown");

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("P2");
  });
});

describe("useGridNav — Home/End and Ctrl+Home/Ctrl+End", () => {
  function threeRowFixture(): KeyGridViewModel {
    return makeViewModel([
      makeRow([makeCell({ id: "A0" }), makeCell({ id: "A1" }), makeCell({ id: "A2" })]),
      makeRow([makeCell({ id: "B0" }), makeCell({ id: "B1" })]),
      makeRow([makeCell({ id: "C0" })]),
    ]);
  }

  it("Home moves to the first key of the CURRENT row, not the layer", () => {
    const onSelectCell = vi.fn();
    rtlRender(<GridNavHost viewModel={threeRowFixture()} onSelectCell={onSelectCell} />);

    pressKey("phone:default:B1", "Home");

    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("B0");
  });

  it("End moves to the last key of the CURRENT row, not the layer", () => {
    const onSelectCell = vi.fn();
    rtlRender(<GridNavHost viewModel={threeRowFixture()} onSelectCell={onSelectCell} />);

    pressKey("phone:default:A0", "End");

    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("A2");
  });

  it("Ctrl+Home moves to the very first cell of the whole layer, from anywhere", () => {
    const onSelectCell = vi.fn();
    rtlRender(<GridNavHost viewModel={threeRowFixture()} onSelectCell={onSelectCell} />);

    pressKey("phone:default:C0", "Home", { ctrlKey: true });

    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("A0");
  });

  it("Ctrl+End moves to the very last cell of the whole layer, from anywhere", () => {
    const onSelectCell = vi.fn();
    rtlRender(<GridNavHost viewModel={threeRowFixture()} onSelectCell={onSelectCell} />);

    pressKey("phone:default:A0", "End", { ctrlKey: true });

    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("C0");
  });

  it("Home on the row's already-first key still consumes the key but selects the same (already-first) cell, per the ARIA APG 'always claim the key' convention", () => {
    const onSelectCell = vi.fn();
    rtlRender(<GridNavHost viewModel={threeRowFixture()} onSelectCell={onSelectCell} />);

    pressKey("phone:default:A0", "Home");

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell.mock.calls[0]?.[0]?.id).toBe("A0");
  });
});

describe("useGridNav — firstCellOfLayer / lastCellOfLayer pure helpers", () => {
  it("returns undefined for an entirely empty view model (no rows)", () => {
    const vm = makeViewModel([]);
    expect(firstCellOfLayer(vm)).toBeUndefined();
    expect(lastCellOfLayer(vm)).toBeUndefined();
  });

  it("skips a leading/trailing empty row to find the first/last row that actually has a key", () => {
    const vm = makeViewModel([makeRow([]), makeRow([makeCell({ id: "X0" })]), makeRow([])]);
    expect(firstCellOfLayer(vm)?.id).toBe("X0");
    expect(lastCellOfLayer(vm)?.id).toBe("X0");
  });
});

describe("useGridNav — findCellPosition", () => {
  it("returns null for a null address", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    expect(findCellPosition(vm, null)).toBeNull();
  });

  it("returns null for an address not present in the view model (stale selection)", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    expect(findCellPosition(vm, "phone:default:NOT_REAL")).toBeNull();
  });

  it("finds the (rowIndex, colIndex) of a real address", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" })]),
      makeRow([makeCell({ id: "K2" }), makeCell({ id: "K3" })]),
    ]);
    expect(findCellPosition(vm, "phone:default:K3")).toEqual({ rowIndex: 1, colIndex: 1 });
  });
});

describe("useGridNav — layer-switch position preservation (FR-020d)", () => {
  it("preserves the exact (row, column) position across two TWIN layers (same row/key-count shape) — comparing one key across default/shift/caps is a single action", () => {
    const defaultLayer = makeViewModel(
      [
        makeRow([
          makeCell({ id: "K_Q", address: "phone:default:K_Q" }),
          makeCell({ id: "K_W", address: "phone:default:K_W" }),
        ]),
        makeRow([makeCell({ id: "K_A", address: "phone:default:K_A" })]),
      ],
      { layerId: "default" },
    );
    const shiftLayer = makeViewModel(
      [
        makeRow([
          makeCell({ id: "K_Q", address: "phone:shift:K_Q" }),
          makeCell({ id: "K_W", address: "phone:shift:K_W" }),
        ]),
        makeRow([makeCell({ id: "K_A", address: "phone:shift:K_A" })]),
      ],
      { layerId: "shift" },
    );

    // Author has K_W (row 0, col 1) selected on the default layer.
    const preserved = resolveLayerSwitchCell(defaultLayer, "phone:default:K_W", shiftLayer);

    expect(preserved?.address).toBe("phone:shift:K_W");
  });

  it("clamps the column when the new layer's row at that index has fewer keys", () => {
    const wideLayer = makeViewModel([
      makeRow([makeCell({ id: "A0" }), makeCell({ id: "A1" }), makeCell({ id: "A2" })]),
    ]);
    const narrowLayer = makeViewModel([makeRow([makeCell({ id: "B0", address: "phone:default:B0" })])]);

    const preserved = resolveLayerSwitchCell(wideLayer, "phone:default:A2", narrowLayer);

    expect(preserved?.id).toBe("B0");
  });

  it("falls back to the new layer's first cell when the row index no longer exists", () => {
    const twoRowLayer = makeViewModel([
      makeRow([makeCell({ id: "A0" })]),
      makeRow([makeCell({ id: "B0", address: "phone:default:B0" })]),
    ]);
    const oneRowLayer = makeViewModel([makeRow([makeCell({ id: "X0", address: "phone:other:X0" })])]);

    const preserved = resolveLayerSwitchCell(twoRowLayer, "phone:default:B0", oneRowLayer);

    expect(preserved?.id).toBe("X0");
  });

  it("falls back to the new layer's first cell when there was no previous selection at all", () => {
    const oldLayer = makeViewModel([makeRow([makeCell({ id: "A0" })])]);
    const newLayer = makeViewModel([makeRow([makeCell({ id: "Z0", address: "phone:other:Z0" })])]);

    const preserved = resolveLayerSwitchCell(oldLayer, null, newLayer);

    expect(preserved?.id).toBe("Z0");
  });
});

describe("useGridNav — focus restoration after remove/suppress/row actions (FR-020k, T068)", () => {
  it("precedence 1: lands on the next key in the row (the key that shifted into the removed cell's slot)", () => {
    const before = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" }), makeCell({ id: "K3" })]),
    ]);
    // K2 removed -- K3 shifts into index 1.
    const after = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K3" })])]);

    const target = resolveFocusAfterRemoval(before, "phone:default:K2", after);

    expect(target.kind).toBe("cell");
    expect(target.kind === "cell" ? target.cell.id : undefined).toBe("K3");
  });

  it("precedence 2: falls back to the PREVIOUS key in the row when the removed key was the row's last", () => {
    const before = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })])]);
    // K2 (the last key) removed -- nothing shifts into index 1.
    const after = makeViewModel([makeRow([makeCell({ id: "K1" })])]);

    const target = resolveFocusAfterRemoval(before, "phone:default:K2", after);

    expect(target.kind).toBe("cell");
    expect(target.kind === "cell" ? target.cell.id : undefined).toBe("K1");
  });

  it("precedence 3: falls back to THE ROW when every key in it is gone but the row itself survives", () => {
    const before = makeViewModel([
      makeRow([makeCell({ id: "K1" })]),
      makeRow([makeCell({ id: "K2" })]),
    ]);
    // The whole first row emptied by a row action; row 0 still exists (0 keys), row 1 untouched.
    const after = makeViewModel([makeRow([]), makeRow([makeCell({ id: "K2", address: "phone:default:K2" })])]);

    const target = resolveFocusAfterRemoval(before, "phone:default:K1", after);

    expect(target).toEqual({ kind: "row", rowIndex: 0 });
  });

  it("precedence 4: falls back to THE GRID CONTAINER when no rows survive at all", () => {
    const before = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    const after = makeViewModel([]);

    const target = resolveFocusAfterRemoval(before, "phone:default:K1", after);

    expect(target).toEqual({ kind: "container" });
  });

  it("never falls to the container tier when at least one cell survives anywhere in the grid -- the guard against the document.body bug class", () => {
    // A stress fixture: several rows, the removed key's own row ends up
    // fully empty, but OTHER rows still have keys. The function must not
    // report "container" (which a caller could only resolve by leaving
    // focus on an unmounted/removed node, i.e. document.body) while cells
    // still exist elsewhere -- it must report "row" (the emptied row, tier
    // 3), never silently drop to tier 4.
    const before = makeViewModel([
      makeRow([makeCell({ id: "R0K0" })]),
      makeRow([makeCell({ id: "R1K0" })]),
      makeRow([makeCell({ id: "R2K0" })]),
    ]);
    const after = makeViewModel([
      makeRow([]),
      makeRow([makeCell({ id: "R1K0", address: "phone:default:R1K0" })]),
      makeRow([makeCell({ id: "R2K0", address: "phone:default:R2K0" })]),
    ]);

    const target = resolveFocusAfterRemoval(before, "phone:default:R0K0", after);

    expect(target.kind).not.toBe("container");
    expect(target).toEqual({ kind: "row", rowIndex: 0 });
  });

  it("falls back to the next view model's own first cell when the removed address cannot be found in the BEFORE model at all (defensive, not a reachable UI path)", () => {
    const before = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    const after = makeViewModel([makeRow([makeCell({ id: "K9", address: "phone:default:K9" })])]);

    const target = resolveFocusAfterRemoval(before, "phone:default:NOT_REAL", after);

    expect(target.kind).toBe("cell");
    expect(target.kind === "cell" ? target.cell.id : undefined).toBe("K9");
  });
});

describe("useGridNav — applyFocusRestorationTarget: concrete DOM guarantee, focus never lands on document.body", () => {
  // This harness models exactly how a real consumer (e.g. the "Remove key"
  // action a later task wires into KeyInspector, T070) is meant to use
  // `resolveFocusAfterRemoval` + `applyFocusRestorationTarget` alongside a
  // real `KeyGrid`: compute the target BEFORE the state update, stash it,
  // then apply it imperatively via `useLayoutEffect` once the DOM has
  // re-rendered without the removed cell. It deliberately does NOT rely on
  // `KeyGrid.tsx`'s own focus-follow effect for this -- see
  // `applyFocusRestorationTarget`'s doc comment (gap 2) for exactly why that
  // effect's `document.activeElement` gate cannot be trusted for the
  // removal case: the browser moves focus to `document.body` SYNCHRONOUSLY
  // as part of removing the focused node, before either effect ever runs.
  function RemovalHarness() {
    const before = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" }), makeCell({ id: "K3" })]),
    ]);
    const [vm, setVm] = useState(before);
    const [selected, setSelected] = useState<string | null>("phone:default:K2");
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pendingTargetRef = useRef<GridFocusRestorationTarget | null>(null);

    useLayoutEffect(() => {
      if (pendingTargetRef.current === null) return;
      applyFocusRestorationTarget(containerRef.current, vm, pendingTargetRef.current);
      pendingTargetRef.current = null;
    }, [vm]);

    function removeK2(): void {
      const after = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K3" })])]);
      const target = resolveFocusAfterRemoval(vm, "phone:default:K2", after);
      if (target.kind === "cell") setSelected(target.cell.address);
      pendingTargetRef.current = target;
      setVm(after);
    }

    return (
      <div ref={containerRef}>
        <button data-testid="remove-k2" onClick={removeK2}>
          remove
        </button>
        <KeyGrid {...NAV_HANDLERS} viewModel={vm} selectedAddress={selected} onSelectCell={(c) => setSelected(c.address)} />
      </div>
    );
  }

  it("proves the full chain end to end: compute the restoration target, apply it imperatively, re-render with the cell removed, and assert real DOM focus landed on the surviving cell -- not document.body, not the removed node's ghost", () => {
    renderWithI18n(<RemovalHarness />);

    // Focus starts on K2 (the tabbable/selected cell), the same way an
    // author interacting with the grid would have left it.
    const k2 = screen.getByTestId("key-grid-cell-phone:default:K2");
    k2.focus();
    expect(document.activeElement).toBe(k2);

    fireEvent.click(screen.getByTestId("remove-k2"));

    const k3 = screen.getByTestId("key-grid-cell-phone:default:K3");
    expect(document.activeElement).toBe(k3);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("KeyGrid's OWN focus-follow effect now restores the CELL tier by itself, with no applyFocusRestorationTarget call needed -- the T068 gate fix (KeyGrid.tsx's focusInGridRef, not document.activeElement) survives the exact removal race that used to defeat it", () => {
    // This harness is deliberately 'naive' relative to the harness above: it
    // only ever calls `setSelected`/`onSelectCell` -- never
    // `applyFocusRestorationTarget` -- mirroring a caller (e.g. a future
    // KeyInspector "Remove key" action) who does nothing more than update
    // `selectedAddress` to the resolved survivor. Before the T068 gate fix,
    // this lost focus to `document.body`: KeyGrid's effect read
    // `document.activeElement` AFTER the removal had already forced it to
    // `body`. The fix tracks "was focus in the grid" proactively via
    // `onFocus`/`onBlur` instead, and removing a focused node fires neither
    // event (checked directly against jsdom) -- so the tracked ref is never
    // told to clear, and correctly reads `true` once this effect runs on the
    // post-removal re-render.
    function NaiveHarness() {
      const before = makeViewModel([
        makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" }), makeCell({ id: "K3" })]),
      ]);
      const [vm, setVm] = useState(before);
      const [selected, setSelected] = useState<string | null>("phone:default:K2");

      function removeK2(): void {
        const after = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K3" })])]);
        const target = resolveFocusAfterRemoval(vm, "phone:default:K2", after);
        setVm(after);
        if (target.kind === "cell") setSelected(target.cell.address);
      }

      return (
        <div>
          <button data-testid="remove-k2" onClick={removeK2}>
            remove
          </button>
          <KeyGrid {...NAV_HANDLERS} viewModel={vm} selectedAddress={selected} onSelectCell={(c) => setSelected(c.address)} />
        </div>
      );
    }

    renderWithI18n(<NaiveHarness />);
    const k2 = screen.getByTestId("key-grid-cell-phone:default:K2");
    k2.focus();
    expect(document.activeElement).toBe(k2);

    fireEvent.click(screen.getByTestId("remove-k2"));

    const k3 = screen.getByTestId("key-grid-cell-phone:default:K3");
    expect(document.activeElement).toBe(k3);
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("useGridNav — applyFocusRestorationTarget: row/container tiers (reachable now that KeyGrid.tsx's row divs + grid container carry tabIndex={-1})", () => {
  it("focuses the real KeyGrid row element for a 'row' target (precedence level 3 -- every key in the row gone, the row itself survives)", () => {
    // Mirrors resolveFocusAfterRemoval's own level-3 fixture (see the
    // precedence-3 test above): row 0 emptied entirely, row 1 untouched.
    const vm = makeViewModel([makeRow([]), makeRow([makeCell({ id: "K1", address: "phone:default:K1" })])]);
    const { container } = renderWithI18n(<KeyGrid {...NAV_HANDLERS} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />);

    const applied = applyFocusRestorationTarget(container.querySelector('[role="grid"]'), vm, {
      kind: "row",
      rowIndex: 0,
    });

    expect(applied).toBe(true);
    const rows = container.querySelectorAll('[role="row"][aria-rowindex]');
    expect(document.activeElement).toBe(rows[0]);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("focuses the real KeyGrid container element for a 'container' target (precedence level 4 -- no rows survive at all)", () => {
    const vm = makeViewModel([]);
    const { container } = renderWithI18n(<KeyGrid {...NAV_HANDLERS} viewModel={vm} selectedAddress={null} onSelectCell={vi.fn()} />);

    const gridEl = container.querySelector('[role="grid"]');
    const applied = applyFocusRestorationTarget(gridEl, vm, { kind: "container" });

    expect(applied).toBe(true);
    expect(document.activeElement).toBe(gridEl);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("the row/container tabIndex={-1} elements add NO Tab stops of their own -- exactly one cell stays tabbable (FR-020a survives this fix)", () => {
    const vm = makeViewModel([
      makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })]),
      makeRow([makeCell({ id: "K3" })]),
    ]);
    const { container } = renderWithI18n(
      <KeyGrid {...NAV_HANDLERS} viewModel={vm} selectedAddress="phone:default:K2" onSelectCell={vi.fn()} />,
    );

    const gridEl = container.querySelector('[role="grid"]');
    expect(gridEl?.getAttribute("tabindex")).toBe("-1");
    for (const rowEl of container.querySelectorAll('[role="row"][aria-rowindex]')) {
      expect(rowEl.getAttribute("tabindex")).toBe("-1");
    }
    const tabbableCells = Array.from(container.querySelectorAll('[role="gridcell"][aria-colindex]')).filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(tabbableCells).toHaveLength(1);
    expect(tabbableCells[0]).toBe(container.querySelector('[data-testid="key-grid-cell-phone:default:K2"]'));
  });

  it("returns false when the target row/container element genuinely is not focusable (a hand-built fixture with no tabIndex) -- applyFocusRestorationTarget never assumes constructability", () => {
    const vm = makeViewModel([makeRow([]), makeRow([makeCell({ id: "K1" })])]);
    const { container } = rtlRender(
      <div role="grid">
        <div role="row" aria-rowindex={1} />
        <div role="row" aria-rowindex={2}>
          <button role="gridcell" aria-rowindex={2} aria-colindex={1}>
            K1
          </button>
        </div>
      </div>,
    );

    const applied = applyFocusRestorationTarget(container.firstElementChild as HTMLElement, vm, {
      kind: "row",
      rowIndex: 0,
    });

    expect(applied).toBe(false);
  });

  it("returns false when containerElement is null", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    expect(applyFocusRestorationTarget(null, vm, { kind: "container" })).toBe(false);
  });
});

describe("useGridNav — ignores unrecognized keys and events with no focused gridcell", () => {
  it("does nothing for a key it does not recognize (e.g. a letter key)", () => {
    const onSelectCell = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" }), makeCell({ id: "K2" })])]);
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    pressKey("phone:default:K1", "a");

    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it("does nothing when the keydown does not originate from a role=gridcell element", () => {
    const onSelectCell = vi.fn();
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    rtlRender(<GridNavHost viewModel={vm} onSelectCell={onSelectCell} />);

    fireEvent.keyDown(screen.getByTestId("host-grid"), { key: "ArrowRight" });

    expect(onSelectCell).not.toHaveBeenCalled();
  });
});

// Sanity check that renderHook itself is wired correctly for a trivial case
// (exercises the hook's own return shape directly, independent of the DOM
// event path covered above).
describe("useGridNav — hook return shape", () => {
  it("returns a stable handleKeyDown function", () => {
    const vm = makeViewModel([makeRow([makeCell({ id: "K1" })])]);
    const { result } = renderHook(() => useGridNav({ viewModel: vm, onSelectCell: vi.fn() }));
    expect(typeof result.current.handleKeyDown).toBe("function");
  });
});
