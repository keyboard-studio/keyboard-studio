// DesktopKeyGrid — the desktop layout as an ARIA grid (spec 117 FR-010, FR-040).
//
// The same accessible grid model as the touch key grid (spec 063): `role="grid"` over
// `role="row"` over `role="gridcell"`, one cell selected, a roving tabindex so the grid is a
// single Tab stop, and arrow / Home / End navigation from `useGridNav`. The navigation model
// includes frame keys (they are drawn and focusable but inert), so `aria-colindex` is the index
// in the same row `useGridNav` reads. A cell's address is its virtual key, which is the same
// on every layer, so the selection survives a layer switch.
//
// `useGridNav` only reports the next cell; moving DOM focus onto it is done here, as in
// `KeyGrid`: focus is followed only while it was already inside the grid, tracked through
// onFocus / onBlur so an outside selection change never steals focus.

import { Fragment, useEffect, useMemo, useRef } from "react";
import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { useGridNav } from "../assignLoop/keyGrid/useGridNav.ts";
import type { GridNavCell, GridNavViewModel } from "../assignLoop/keyGrid/useGridNav.ts";
import { FONT } from "../../lib/galleryTheme.ts";
import { DesktopKeyCell } from "./DesktopKeyCell.tsx";

/** A grid-nav cell that also carries its view model. `address` is the virtual key. */
export interface DesktopNavCell extends GridNavCell {
  readonly cell: DesktopCellViewModel;
}

export interface DesktopNavModel extends GridNavViewModel<DesktopNavCell> {
  /** Width of the widest row, in key-width units. */
  readonly totalUnits: number;
}

/**
 * Group the cells by grid row and give each its padding and width in key-width units: the raw
 * units `useGridNav`'s vertical step compares across rows.
 */
export function buildDesktopNavModel(cells: readonly DesktopCellViewModel[]): DesktopNavModel {
  const byRow = new Map<number, DesktopCellViewModel[]>();
  for (const c of cells) {
    const list = byRow.get(c.row);
    if (list === undefined) byRow.set(c.row, [c]);
    else list.push(c);
  }
  let totalUnits = 0;
  const rows = [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, list]) => {
      let cursor = 0;
      const keys = [...list]
        .sort((a, b) => a.x - b.x)
        .map((cell): DesktopNavCell => {
          const padPct = Math.max(0, cell.x - cursor);
          cursor = cell.x + cell.width;
          return { address: cell.vkey, padPct, widthPct: cell.width, cell };
        });
      totalUnits = Math.max(totalUnits, cursor);
      return { keys };
    });
  return { rows, totalUnits };
}

export interface DesktopKeyGridProps {
  cells: readonly DesktopCellViewModel[];
  /** The selected key (virtual key), or null for none yet. */
  selectedVkey: string | null;
  onSelectVkey: (vkey: string) => void;
  /** Already-localized accessible name for the grid (it names the layer). */
  label: string;
}

export function DesktopKeyGrid({ cells, selectedVkey, onSelectVkey, label }: DesktopKeyGridProps) {
  const model = useMemo(() => buildDesktopNavModel(cells), [cells]);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const focusInGridRef = useRef(false);

  const { handleKeyDown } = useGridNav<DesktopNavCell>({
    viewModel: model,
    onSelectCell: (next) => onSelectVkey(next.address),
  });

  const firstVkey = model.rows[0]?.keys[0]?.address ?? null;
  const hasSelectedVisible =
    selectedVkey !== null && model.rows.some((r) => r.keys.some((k) => k.address === selectedVkey));

  function registerRef(vkey: string, el: HTMLButtonElement | null): void {
    if (el) cellRefs.current.set(vkey, el);
    else cellRefs.current.delete(vkey);
  }

  useEffect(() => {
    if (selectedVkey === null || !focusInGridRef.current) return;
    cellRefs.current.get(selectedVkey)?.focus();
  }, [selectedVkey]);

  return (
    // The grid container is not a Tab stop: DOM focus lives on one roving gridcell.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- same roving-tabindex model as the touch KeyGrid: the single Tab stop is the selected gridcell (tabIndex 0, the rest -1), never this container.
    <div
      role="grid"
      aria-label={label}
      aria-rowcount={model.rows.length}
      data-testid="layout-grid"
      onKeyDown={handleKeyDown}
      onFocus={() => {
        focusInGridRef.current = true;
      }}
      onBlur={(e) => {
        const related = e.relatedTarget;
        if (related instanceof Node && e.currentTarget.contains(related)) return;
        focusInGridRef.current = false;
      }}
      style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONT, width: "100%" }}
    >
      {model.rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          role="row"
          aria-rowindex={rowIndex + 1}
          style={{ display: "flex", width: "100%" }}
        >
          {row.keys.map((nav, colIndex) => {
            const pct = (units: number) => (model.totalUnits > 0 ? (units / model.totalUnits) * 100 : 0);
            const isSelected = nav.address === selectedVkey;
            const isTabbable = isSelected || (!hasSelectedVisible && nav.address === firstVkey);
            return (
              <Fragment key={nav.address}>
                {nav.padPct > 0 && (
                  <span
                    aria-hidden="true"
                    style={{ flexGrow: 0, flexShrink: 0, flexBasis: `${pct(nav.padPct)}%` }}
                  />
                )}
                <DesktopKeyCell
                  cell={nav.cell}
                  rowIndex={rowIndex + 1}
                  colIndex={colIndex + 1}
                  widthPercent={pct(nav.widthPct)}
                  isSelected={isSelected}
                  isTabbable={isTabbable}
                  onSelect={onSelectVkey}
                  registerRef={registerRef}
                />
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}
