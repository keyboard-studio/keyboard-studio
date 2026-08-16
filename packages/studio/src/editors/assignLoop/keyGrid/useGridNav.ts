// useGridNav — keyboard navigation + focus restoration for the touch key
// grid (spec 063 T065, T068; FR-020b, FR-020c, FR-020d, FR-020k).
//
// This hook (and the pure helpers it's built from) is deliberately the ONLY
// place that computes "which cell comes next" for the grid. KeyGrid.tsx
// forwards `onKeyDown` verbatim onto its container (see that file's module
// doc, "Seams for T065-T071") and has its own focus-follow effect that moves
// DOM focus onto whatever cell `onSelectCell` lands on, whenever focus was
// already resting inside the grid. So this hook never touches the DOM
// itself for ordinary navigation — it only ever computes the next
// `KeyGridCellViewModel` and hands it to the SAME `onSelectCell` a click
// already uses.
//
// ## How "current position" is found — from the DOM event, not from a prop
//
// `handleKeyDown` does NOT take `selectedAddress` as an input. It reads the
// row/column of the cell that actually had DOM focus when the key was
// pressed, via that cell's own `aria-rowindex`/`aria-colindex` attributes
// (already rendered by KeyGridCell.tsx, 1-based, matching this module's
// `rowIndex + 1` / `colIndex + 1` exactly). Two reasons this is more robust
// than trusting `selectedAddress`:
//
//   1. Tabbing into an UNSELECTED grid (nothing chosen yet) lands native DOM
//      focus on the roving-tabindex fallback cell (KeyGrid's own
//      `hasSelectedVisible` convention — the grid's first cell) WITHOUT
//      calling `onSelectCell`. `selectedAddress` is still null at that
//      point. Reading the real DOM position means an arrow key from that
//      state still moves correctly instead of silently no-op'ing.
//   2. It can never drift from what the author is actually looking at: the
//      focused DOM node and "current position" are, definitionally, the
//      same thing.
//
// `e.target.closest('[role="gridcell"]')` also makes this hook safe to use
// with more than one grid mounted at once (a future platform-tabs layout,
// FR-034/T077) — the event only ever bubbles from within the one grid whose
// container it was attached to, so there is no risk of reading a sibling
// grid's focused cell.
//
// ## Geometry-based vertical navigation (FR-020c)
//
// Index-clamping (`row[targetRow].keys[currentColIndex]`) is explicitly
// wrong per FR-020c: touch rows have unequal key counts AND unequal widths
// (a real corpus fact, not a hypothetical), so the key at the same ARRAY
// INDEX in the row above/below is frequently not the key that visually sits
// above/below the current one. Instead, `computeRowSpans` walks a row's
// cells in the SAME 100-unit units KeyGridViewModel already carries
// (`padPct` + `widthPct`, per keyGridViewModel.ts) and accumulates each
// cell's [start, end) span and centre. `findColumnByCentre` then answers
// "which cell in the ADJACENT row's span contains THIS row's current
// cell's centre" — the actual visual landing spot, not an index guess. This
// is safe to do in raw 100-unit terms (never converting to rendered
// percent/pixels) because every row in a layer is scaled by the SAME
// `layerMaxUnits` divisor when rendered (see KeyGrid.tsx's `rowUnitsTotal`
// and the shared `layerMaxUnits`) and all rows share the same left origin
// (0) — so comparing raw-unit centres across rows is equivalent to
// comparing rendered pixel centres, without this hook needing to duplicate
// KeyGrid.tsx's rendering-percent math or read any DOM geometry
// (`getBoundingClientRect`, which would be layout-thrashing on every
// keystroke and wrong under `display: none`/before layout, e.g. in a
// windowed-but-offscreen row per T067).
//
// ## No wrap (FR-020d)
//
// Every step function below returns `undefined` — not a wrapped-around
// cell — at a boundary: `stepWithinRow` at the row's first/last cell,
// `stepVertical` when there is no row above/below. `handleKeyDown` still
// calls `e.preventDefault()` for every recognized navigation key even when
// the computed step is `undefined` (matching the ARIA APG grid pattern's
// convention that these keys are always "claimed" by the grid, so e.g. Home
// never falls through to scrolling the page) — it just does not call
// `onSelectCell` when there's nowhere to go. Layer/platform wrap is
// trivially impossible here too: this hook only ever sees ONE
// `KeyGridViewModel` (one platform+layer pair), so it structurally cannot
// step outside it.
//
// ## Layer-switch position preservation (FR-020d)
//
// `resolveLayerSwitchCell` is a separate, non-hook pure function — switching
// layers is a selector action (a future layer-rail/tab UI, not built yet),
// not a keydown this hook's `handleKeyDown` ever sees. It reads the
// (rowIndex, colIndex) of the previously-selected cell in the OLD view
// model and looks up that SAME position in the NEW one. For twin layers
// (`default`/`shift`/`caps` sharing the same row/key-count shape —
// FR-029g's predictability guarantee) that is an exact, not approximate,
// match: comparing one key across layers becomes the single action FR-020d
// asks for. A non-twin layer (different row/key counts) degrades
// gracefully by clamping the column within whatever row now exists at that
// index, or falling back to the grid's own first cell when the row itself
// is gone — never throwing, never returning nothing to select.
//
// ## Focus restoration after remove/suppress/row actions (FR-020k, T068)
//
// `resolveFocusAfterRemoval` is the second non-hook pure function. Given the
// view model from BEFORE an edit action, the address that is no longer
// present (or no longer meaningfully selectable) afterward, and the view
// model from AFTER, it returns a `GridFocusRestorationTarget` following the
// spec's exact precedence chain: next key in the row, else previous key in
// the row, else the row itself, else the grid container.
// `applyFocusRestorationTarget` is its DOM-applying counterpart —
// deliberately not routed through `KeyGrid.tsx`'s own focus-follow effect:
// even after that effect's own gate fix (it now tracks focus proactively via
// `onFocus`/`onBlur` rather than reading `document.activeElement` after the
// fact — see that file's "Focus tracking survives node removal" doc), a
// passive effect keyed on `selectedAddress` still has no way to reach the
// `"row"`/`"container"` tiers, since neither has a `selectedAddress` to key
// off of. `KeyGrid.tsx`'s row divs and grid container both carry
// `tabIndex={-1}` (added alongside this file's own T068 fix) so
// `applyFocusRestorationTarget` can actually reach all three tiers, not only
// `"cell"`. See both functions' own doc comments for the full reasoning and
// the precedence-detection details.
//
// ## RTL seam (left for T066 — NOT implemented here)
//
// `viewModel.direction` is available on every `KeyGridViewModel` this hook
// receives, but `handleKeyDown` below treats ArrowLeft/ArrowRight and
// Home/End as pure VISUAL/array-order semantics (ArrowRight = higher column
// index, Home = index 0) regardless of `direction`. FR-020i requires LOGICAL
// semantics instead (row start/end in READING order) once a layer is RTL.
// Deliberately left unflipped: this hook's `stepWithinRow`/`firstCellOfRow`/
// `lastCellOfRow` are the exact, and only, functions that need a
// direction-aware swap (when `viewModel.direction === "rtl"`, ArrowRight
// should behave like today's ArrowLeft and vice versa; Home/End should swap
// which row-end they target) — T066's job, scoped to this file (not
// KeyGrid.tsx, despite tasks.md's coarse per-file assignment: KeyGrid.tsx
// forwards this hook's handler verbatim and owns no navigation logic of its
// own to flip).

import { useCallback } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { KeyGridCellViewModel, KeyGridRowViewModel, KeyGridViewModel } from "./keyGridViewModel.ts";

// ---------------------------------------------------------------------------
// Position lookup
// ---------------------------------------------------------------------------

export interface GridCellPosition {
  readonly rowIndex: number;
  readonly colIndex: number;
}

/**
 * (rowIndex, colIndex) of the cell whose `address` matches, or `null` when
 * `address` is `null` or not present anywhere in `viewModel` (a stale
 * selection — the same "unresolvable is an ordinary outcome, not a crash"
 * convention `keyGridViewModel.ts`'s own `buildKeyGridViewModel` uses).
 */
export function findCellPosition(
  viewModel: KeyGridViewModel,
  address: string | null,
): GridCellPosition | null {
  if (address === null) return null;
  for (let rowIndex = 0; rowIndex < viewModel.rows.length; rowIndex++) {
    const row = viewModel.rows[rowIndex];
    if (row === undefined) continue;
    const colIndex = row.keys.findIndex((key) => key.address === address);
    if (colIndex !== -1) return { rowIndex, colIndex };
  }
  return null;
}

/**
 * Reads the row/column of whichever gridcell had DOM focus when `event`
 * fired, from that cell's own `aria-rowindex`/`aria-colindex` attributes
 * (1-based, converted to 0-based here) — see this module's doc comment,
 * "How 'current position' is found", for why this is preferred over trusting
 * a `selectedAddress` prop. Returns `null` when the event did not originate
 * from (or bubble through) a `role="gridcell"` element, or when either
 * attribute is missing/non-numeric.
 */
export function readFocusedCellPosition(
  event: Pick<ReactKeyboardEvent<HTMLElement>, "target">,
): GridCellPosition | null {
  const { target } = event;
  if (!(target instanceof Element)) return null;
  const cellEl = target.closest('[role="gridcell"]');
  if (cellEl === null) return null;
  const rowAttr = cellEl.getAttribute("aria-rowindex");
  const colAttr = cellEl.getAttribute("aria-colindex");
  if (rowAttr === null || colAttr === null) return null;
  const oneBasedRow = Number(rowAttr);
  const oneBasedCol = Number(colAttr);
  if (!Number.isInteger(oneBasedRow) || !Number.isInteger(oneBasedCol)) return null;
  return { rowIndex: oneBasedRow - 1, colIndex: oneBasedCol - 1 };
}

// ---------------------------------------------------------------------------
// Geometry — centre-span computation for vertical navigation (FR-020c)
// ---------------------------------------------------------------------------

interface CellSpan {
  readonly start: number;
  readonly end: number;
  readonly centre: number;
}

/**
 * Each key's [start, end) span and centre, in the SAME raw `padPct +
 * widthPct` units `keyGridViewModel.ts`'s own `rowTotalPct` sums — never
 * converted to a rendered percent. See this module's doc comment for why raw
 * units are safe to compare across rows directly.
 */
function computeRowSpans(row: KeyGridRowViewModel): readonly CellSpan[] {
  let cursor = 0;
  return row.keys.map((key) => {
    const start = cursor + key.padPct;
    const end = start + key.widthPct;
    cursor = end;
    return { start, end, centre: (start + end) / 2 };
  });
}

/**
 * The column index in `row` whose span [start, end) contains `centre`, or —
 * when `centre` falls outside every span (the adjacent row is narrower or
 * offset, e.g. an unequal-width row) — the nearest row end: column 0 if
 * `centre` is before the first span, the last column if it's after the last
 * span. Returns -1 only when `row` has no keys at all.
 */
function findColumnByCentre(row: KeyGridRowViewModel, centre: number): number {
  const spans = computeRowSpans(row);
  if (spans.length === 0) return -1;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span !== undefined && centre >= span.start && centre < span.end) return i;
  }
  const first = spans[0];
  if (first !== undefined && centre < first.start) return 0;
  return spans.length - 1;
}

// ---------------------------------------------------------------------------
// Row/layer bounds helpers
// ---------------------------------------------------------------------------

/** First row in `viewModel` that actually has a key, or `undefined` if every row is empty (or there are no rows). */
function firstNonEmptyRow(viewModel: KeyGridViewModel): { rowIndex: number; row: KeyGridRowViewModel } | undefined {
  for (let rowIndex = 0; rowIndex < viewModel.rows.length; rowIndex++) {
    const row = viewModel.rows[rowIndex];
    if (row !== undefined && row.keys.length > 0) return { rowIndex, row };
  }
  return undefined;
}

/** Last row in `viewModel` that actually has a key, scanning from the end — the mirror of {@link firstNonEmptyRow}. */
function lastNonEmptyRow(viewModel: KeyGridViewModel): { rowIndex: number; row: KeyGridRowViewModel } | undefined {
  for (let rowIndex = viewModel.rows.length - 1; rowIndex >= 0; rowIndex--) {
    const row = viewModel.rows[rowIndex];
    if (row !== undefined && row.keys.length > 0) return { rowIndex, row };
  }
  return undefined;
}

/** The layer's very first cell (Ctrl+Home), or `undefined` when the whole grid is empty. */
export function firstCellOfLayer(viewModel: KeyGridViewModel): KeyGridCellViewModel | undefined {
  return firstNonEmptyRow(viewModel)?.row.keys[0];
}

/** The layer's very last cell (Ctrl+End), or `undefined` when the whole grid is empty. */
export function lastCellOfLayer(viewModel: KeyGridViewModel): KeyGridCellViewModel | undefined {
  const found = lastNonEmptyRow(viewModel);
  if (found === undefined) return undefined;
  return found.row.keys[found.row.keys.length - 1];
}

// ---------------------------------------------------------------------------
// Step functions — each returns `undefined` at a boundary (no wrap, FR-020d)
// ---------------------------------------------------------------------------

/**
 * ←/→ within the row (FR-020b). `delta` is `1` for the array-order "next"
 * direction, `-1` for "previous" — see this module's doc comment, "RTL
 * seam", for why this is visual/array-order rather than logical today.
 * `undefined` at either end of the row: no wrap to the next/previous row.
 */
export function stepWithinRow(
  viewModel: KeyGridViewModel,
  position: GridCellPosition,
  delta: 1 | -1,
): KeyGridCellViewModel | undefined {
  const row = viewModel.rows[position.rowIndex];
  if (row === undefined) return undefined;
  const nextCol = position.colIndex + delta;
  if (nextCol < 0 || nextCol >= row.keys.length) return undefined;
  return row.keys[nextCol];
}

/**
 * ↑/↓, geometry-based (FR-020c). `delta` is `1` for the row below, `-1` for
 * the row above. `undefined` when there is no row in that direction: no
 * wrap between rows (and, since this hook only ever sees one layer, no wrap
 * between layers either — FR-020d).
 */
export function stepVertical(
  viewModel: KeyGridViewModel,
  position: GridCellPosition,
  delta: 1 | -1,
): KeyGridCellViewModel | undefined {
  const currentRow = viewModel.rows[position.rowIndex];
  if (currentRow === undefined) return undefined;
  const targetRowIndex = position.rowIndex + delta;
  const targetRow = viewModel.rows[targetRowIndex];
  if (targetRow === undefined) return undefined;

  const currentSpans = computeRowSpans(currentRow);
  const currentSpan = currentSpans[position.colIndex];
  if (currentSpan === undefined) return undefined;

  const targetCol = findColumnByCentre(targetRow, currentSpan.centre);
  if (targetCol === -1) return undefined;
  return targetRow.keys[targetCol];
}

/** Home within the row (FR-020b). `undefined` only if the row itself has no keys. */
export function firstCellOfRow(
  viewModel: KeyGridViewModel,
  rowIndex: number,
): KeyGridCellViewModel | undefined {
  return viewModel.rows[rowIndex]?.keys[0];
}

/** End within the row (FR-020b). `undefined` only if the row itself has no keys. */
export function lastCellOfRow(
  viewModel: KeyGridViewModel,
  rowIndex: number,
): KeyGridCellViewModel | undefined {
  const row = viewModel.rows[rowIndex];
  if (row === undefined || row.keys.length === 0) return undefined;
  return row.keys[row.keys.length - 1];
}

// ---------------------------------------------------------------------------
// Layer-switch position preservation (FR-020d)
// ---------------------------------------------------------------------------

/**
 * The cell to select in `nextViewModel` that best preserves
 * `previousSelectedAddress`'s row/column position from `previousViewModel` —
 * the FR-020d requirement that switching layers (`default` -> `shift` ->
 * `caps`, ...) is a single action, not a re-hunt for the same key. See this
 * module's doc comment, "Layer-switch position preservation", for the
 * twin-layer exact-match case and the degraded fallback for a differently-
 * shaped layer.
 *
 * Never returns `undefined` unless `nextViewModel` has no cells at all —
 * a stale/absent previous selection falls back to the grid's own
 * tabbable-fallback cell (mirroring KeyGrid's `hasSelectedVisible`
 * convention) rather than leaving nothing selected after a layer switch.
 */
export function resolveLayerSwitchCell(
  previousViewModel: KeyGridViewModel,
  previousSelectedAddress: string | null,
  nextViewModel: KeyGridViewModel,
): KeyGridCellViewModel | undefined {
  const position = findCellPosition(previousViewModel, previousSelectedAddress);
  if (position === null) return firstCellOfLayer(nextViewModel);

  const row = nextViewModel.rows[position.rowIndex];
  if (row === undefined || row.keys.length === 0) return firstCellOfLayer(nextViewModel);

  const clampedCol = Math.min(position.colIndex, row.keys.length - 1);
  return row.keys[clampedCol];
}

// ---------------------------------------------------------------------------
// Focus restoration after remove/suppress/row actions (FR-020k, T068)
// ---------------------------------------------------------------------------

/**
 * The DOM-focus fallback tier `resolveFocusAfterRemoval` landed on, following
 * FR-020k's exact precedence: a surviving CELL (levels 1-2: the next key in
 * the row, else the previous key in the row), else the ROW itself (level 3:
 * the row survives but every key in it is now gone), else the grid
 * CONTAINER (level 4: no rows survive at all).
 *
 * **Both DOM-reachability gaps this used to flag are now closed:**
 *
 * 1. **All three tiers now have a DOM node to focus.** `KeyGrid.tsx`'s row
 *    `<div role="row">` elements and its grid container `<div role="grid">`
 *    both carry `tabIndex={-1}` — programmatically focusable, never a Tab
 *    stop of their own (see that file's "Single Tab stop" doc; FR-020a is
 *    unaffected). `applyFocusRestorationTarget` below already queried for
 *    exactly those elements via their `aria-rowindex`/`role` attributes; it
 *    needed no change once `KeyGrid.tsx` made them focusable.
 * 2. **`KeyGrid.tsx`'s OWN focus-follow effect no longer races the removal
 *    for the `"cell"` tier either.** It used to read `document.activeElement`
 *    live inside a passive `useEffect`, which runs AFTER React's commit has
 *    already unmounted the removed cell's `<button>` — and per the HTML
 *    focus spec, removing the currently-focused element resets
 *    `document.activeElement` to `document.body` SYNCHRONOUSLY, as part of
 *    that same removal, before ANY effect gets a chance to run. `KeyGrid.tsx`
 *    now tracks "is focus in the grid" PROACTIVELY instead, via `onFocus`/
 *    `onBlur` on the grid container (see that file's "Focus tracking
 *    survives node removal" doc) — removing a focused node does not fire a
 *    `blur`/`focusout` event at all (checked directly against jsdom, not
 *    assumed), so the tracked ref is never told to clear and correctly
 *    reads `true` by the time the effect runs on the post-removal re-render.
 *
 * `applyFocusRestorationTarget` below remains the right tool regardless of
 * that fix: it is the ONLY way to reach the `"row"`/`"container"` tiers at
 * all (a passive effect keyed on `selectedAddress` has no `selectedAddress`
 * to key off of for "select this row" or "select the grid itself"), and it
 * gives a caller a synchronous, deterministic guarantee for the `"cell"`
 * tier too rather than depending on `KeyGrid.tsx`'s own internal tracking.
 * Call it unconditionally, right after applying the corresponding
 * `selectedAddress`/view-model state update for a remove/suppress/row
 * action (FR-020k) — an explicit, author-triggered action, not an
 * incidental external selection change, so the "don't yank focus" rationale
 * behind `KeyGrid.tsx`'s own gate does not apply here.
 */
export type GridFocusRestorationTarget =
  | { readonly kind: "cell"; readonly cell: KeyGridCellViewModel }
  | { readonly kind: "row"; readonly rowIndex: number }
  | { readonly kind: "container" };

/**
 * Computes where focus belongs after `removedAddress` is no longer a valid
 * selection in `nextViewModel` — a key removed, suppressed out of
 * selectability, or an entire row action, per FR-020k. `previousViewModel`
 * supplies the position `removedAddress` occupied BEFORE the action;
 * `nextViewModel` is queried at that same position to find what survives.
 *
 * Precedence (FR-020k, in order):
 * 1. **Next key in the row** — the key that now occupies the removed cell's
 *    former column index (removal shifts every following key left by one).
 * 2. **Previous key in the row** — when the removed key was the row's last,
 *    so no key occupies that index anymore: the row's new last key.
 * 3. **The row** — the row itself still exists in `nextViewModel` but now
 *    has zero keys (an entire row emptied by one action).
 * 4. **The grid container** — `nextViewModel` has no rows left at all, or
 *    `removedAddress`'s row index no longer exists.
 *
 * `previousViewModel` not containing `removedAddress` at all (a caller
 * error, or it was already gone) is treated the same as "nothing to anchor
 * to": falls back to `nextViewModel`'s own tabbable-fallback cell (mirroring
 * KeyGrid's `hasSelectedVisible` convention), or the container tier if even
 * that is empty — never `undefined`, so this function's return is always
 * one of the three tiers above, never "nothing".
 */
export function resolveFocusAfterRemoval(
  previousViewModel: KeyGridViewModel,
  removedAddress: string,
  nextViewModel: KeyGridViewModel,
): GridFocusRestorationTarget {
  const position = findCellPosition(previousViewModel, removedAddress);
  if (position === null) {
    const fallback = firstCellOfLayer(nextViewModel);
    return fallback !== undefined ? { kind: "cell", cell: fallback } : { kind: "container" };
  }

  const nextRow = nextViewModel.rows[position.rowIndex];
  if (nextRow !== undefined && nextRow.keys.length > 0) {
    // Level 1: the key now sitting at the removed cell's former index (the
    // row shifted left under it).
    const atSameIndex = nextRow.keys[position.colIndex];
    if (atSameIndex !== undefined) return { kind: "cell", cell: atSameIndex };
    // Level 2: the removed key was the row's last — its new last key.
    const lastInRow = nextRow.keys[nextRow.keys.length - 1];
    if (lastInRow !== undefined) return { kind: "cell", cell: lastInRow };
  }

  // Level 3: the row survives (still present in `nextViewModel.rows`) but
  // has no keys left.
  if (position.rowIndex < nextViewModel.rows.length) {
    return { kind: "row", rowIndex: position.rowIndex };
  }

  // Level 4: no rows left at all.
  return { kind: "container" };
}

/**
 * Locates the `role="row"` element for `rowIndex` (0-based) within
 * `containerElement`, via its `aria-rowindex` (1-based, matching
 * `KeyGrid.tsx`'s own `aria-rowindex={rowIndex + 1}`) — a real ARIA
 * attribute already rendered today, not a test-only hook.
 */
function queryRowElement(containerElement: Element, rowIndex: number): HTMLElement | null {
  return containerElement.querySelector<HTMLElement>(`[role="row"][aria-rowindex="${rowIndex + 1}"]`);
}

/**
 * Locates the `role="gridcell"` element at (rowIndex, colIndex) (both
 * 0-based) within `containerElement`, via `aria-rowindex`/`aria-colindex`
 * (1-based, matching `KeyGridCell.tsx`'s own rendering exactly) — the same
 * real-ARIA-attribute approach `readFocusedCellPosition` uses in the other
 * direction (DOM -> position instead of position -> DOM).
 */
function queryCellElement(
  containerElement: Element,
  rowIndex: number,
  colIndex: number,
): HTMLElement | null {
  const rowEl = queryRowElement(containerElement, rowIndex);
  if (rowEl === null) return null;
  return rowEl.querySelector<HTMLElement>(`[role="gridcell"][aria-colindex="${colIndex + 1}"]`);
}

/**
 * Applies a `GridFocusRestorationTarget` directly to the DOM, scoped to
 * `containerElement` (the grid's own `role="grid"` element, or any ancestor
 * of it — e.g. a wrapping `<div ref>` a caller places around `<KeyGrid>`).
 * Returns `true` when focus was actually moved to a genuinely focusable
 * element, `false` when the target could not be reached — e.g.
 * `containerElement` is `null`, the addressed cell/row is not actually
 * present in the rendered DOM, or (for a hand-built fixture that doesn't
 * mirror `KeyGrid.tsx`'s real markup) the target element carries no
 * `tabIndex` at all and is therefore never really focusable.
 *
 * Deliberately does NOT gate on `document.activeElement` the way
 * `KeyGrid.tsx`'s own focus-follow effect used to — see this module's doc
 * comment on `GridFocusRestorationTarget` for why that raced the removal.
 * Call this unconditionally, right after applying the corresponding
 * `selectedAddress`/view-model state update for a remove/suppress/row
 * action (FR-020k) — never in response to an ordinary navigation or an
 * external (non-author-triggered) selection change, which should still go
 * through `onSelectCell` + `KeyGrid`'s own gated effect so a selection
 * change made from OUTSIDE the grid does not yank focus away from wherever
 * the author currently is (KeyGrid.tsx's own module doc, "Focus-follow").
 *
 * `nextViewModel` must be the SAME view model the DOM has already been
 * rendered from (i.e. call this after the state update that changed
 * `viewModel`/`selectedAddress` has committed) — it is used only to resolve
 * a `"cell"` target's `address` back to the (rowIndex, colIndex) its DOM
 * node was rendered at.
 */
export function applyFocusRestorationTarget(
  containerElement: HTMLElement | null,
  nextViewModel: KeyGridViewModel,
  target: GridFocusRestorationTarget,
): boolean {
  if (containerElement === null) return false;

  if (target.kind === "cell") {
    const position = findCellPosition(nextViewModel, target.cell.address);
    if (position === null) return false;
    const el = queryCellElement(containerElement, position.rowIndex, position.colIndex);
    if (el === null) return false;
    el.focus();
    return document.activeElement === el;
  }

  if (target.kind === "row") {
    // `KeyGrid.tsx`'s real row divs carry `tabIndex={-1}`, so this succeeds
    // there; a hand-built test fixture without one leaves `.focus()` a
    // silent no-op (every browser, and jsdom, only ever move
    // `document.activeElement` to an element that is ACTUALLY focusable).
    const rowEl = queryRowElement(containerElement, target.rowIndex);
    if (rowEl === null) return false;
    rowEl.focus();
    return document.activeElement === rowEl;
  }

  // "container" — same as the row tier: only succeeds against an element
  // that actually carries a `tabIndex` (KeyGrid.tsx's real grid div does).
  containerElement.focus();
  return document.activeElement === containerElement;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

const RECOGNIZED_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

export interface UseGridNavOptions {
  /** The one (platform, layer) view model this hook navigates within — never wraps outside it (FR-020d). */
  viewModel: KeyGridViewModel;
  /** Selection change, called with the computed next cell — the SAME callback a click uses (KeyGrid's `onSelectCell`). */
  onSelectCell: (cell: KeyGridCellViewModel) => void;
}

export interface UseGridNavResult {
  /** Pass directly as `KeyGrid`'s `onKeyDown` prop. */
  handleKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Arrow/Home/End navigation for one `KeyGrid` (FR-020b, FR-020c, FR-020d).
 * See this module's doc comment for the overall design (how "current
 * position" is read from the DOM event rather than a `selectedAddress`
 * prop, why vertical navigation is geometry-based, why there is no wrap,
 * and the RTL/layer-switch/focus-restoration seams this hook exposes as
 * separate pure functions rather than folding into the returned handler).
 */
export function useGridNav({ viewModel, onSelectCell }: UseGridNavOptions): UseGridNavResult {
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!RECOGNIZED_KEYS.has(event.key)) return;
      const position = readFocusedCellPosition(event);
      if (position === null) return;

      let next: KeyGridCellViewModel | undefined;
      switch (event.key) {
        case "ArrowLeft":
          next = stepWithinRow(viewModel, position, -1);
          break;
        case "ArrowRight":
          next = stepWithinRow(viewModel, position, 1);
          break;
        case "ArrowUp":
          next = stepVertical(viewModel, position, -1);
          break;
        case "ArrowDown":
          next = stepVertical(viewModel, position, 1);
          break;
        case "Home":
          next = event.ctrlKey
            ? firstCellOfLayer(viewModel)
            : firstCellOfRow(viewModel, position.rowIndex);
          break;
        case "End":
          next = event.ctrlKey
            ? lastCellOfLayer(viewModel)
            : lastCellOfRow(viewModel, position.rowIndex);
          break;
        default:
          return;
      }

      // Every recognized navigation key is claimed by the grid regardless of
      // whether it actually moves the selection (e.g. Home on the row's
      // already-first cell) — matching the ARIA APG grid pattern's
      // convention so these keys never fall through to page scroll.
      event.preventDefault();
      if (next !== undefined) onSelectCell(next);
    },
    [viewModel, onSelectCell],
  );

  return { handleKeyDown };
}
