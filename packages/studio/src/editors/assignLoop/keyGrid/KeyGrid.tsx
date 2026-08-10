// KeyGrid — the touch layout key grid, built directly from the ARIA APG grid
// pattern (spec 058 T064; FR-020, FR-020a, FR-022). No local precedent exists
// for `role="grid"`/`"row"`/`"gridcell"` anywhere under packages/ (research.md
// R10.4 — zero occurrences) — this is the first, so it follows
// https://www.w3.org/WAI/ARIA/apg/patterns/grid/ directly rather than
// adapting an existing composite widget.
//
// Renders one (platform, layer) `KeyGridViewModel` (./keyGridViewModel.ts,
// T063 — a pure projection holding no state of its own) as a grid of
// gridcells, proportionally sized from the 100-unit model (`padPct`/
// `widthPct`, plus each row's `slackPct` — FR-022). Geometry is READ-ONLY
// this increment (no drag/resize) — see `keyEditOps.ts`'s own module doc,
// "What the union deliberately does NOT admit, and why": `width`/`pad` are
// absent from `EditableKeyFields`, so nothing this component can emit today
// actually COMMITS a width change to the overlay. The "Fill row"/"Even out
// row" controls that used to live here were withdrawn by spec 061 (FR-007,
// ADR 0002 — the grid renders the last key of an under-full row stretched,
// so there is no slack left for either control to act on) — see "Row slack,
// and the row-actions strip" below for what remains.
//
// ## Single Tab stop (FR-020a)
//
// Roving tabindex, copied from CharScrollStrip.tsx's own precedent
// (../parts/CharScrollStrip.tsx): exactly one cell has `tabIndex 0` at a
// time — the SELECTED cell when one exists among the rendered cells, else
// the grid's very first cell (the `hasSelectedVisible` fallback), so the
// grid is never stranded outside the Tab order when nothing is selected yet.
// A layout of several hundred keys therefore still produces exactly one Tab
// stop, not several hundred.
//
// ## Row slack, and the row-actions strip (spec 061 T012/T026, FR-007, FR-012,
// FR-013, ADR 0002)
//
// `KeyGridRowViewModel.slackPct` (keyGridViewModel.ts) is the gap between a row
// and the widest row in its layer. Spec 058 drew that gap as a decorative
// trailing hatch (`key-grid-row-slack-<rowIndex>`), deliberately declining to
// absorb it. **FR-012 withdrew that reading.** The hatch and its test id are
// gone; the slack is now added to the LAST key of the row, which is what
// KeymanWeb's own renderer does and therefore what the author's keyboard will
// actually look like. Every row consequently ends flush at the layer maximum.
//
// The last key is identified by `KeyGridCellViewModel.isLastInRow`, not by an
// index comparison here — the rule is stated once, where the row is assembled.
//
// This makes a key's RENDERED width differ from its DECLARED one for the last
// key of every under-full row. That divergence is FR-015's subject, not a bug:
// the declared width is a minimum, and both the row metrics readout and the key
// property panel quote the declared figure and say that it is declared.
//
// The "Fill row" / "Even out row" buttons that used to sit beside the hatch
// are gone too (FR-007, ADR 0002: once the last key stretches to fill a row,
// there is no slack left for either control to redistribute). What remains
// is the **row-actions strip** itself
// (`key-grid-row-actions-<rowIndex>`) — kept, per FR-038, because removing it
// would regress spec 058 SC-009's accessibility fix (see "Why this strip
// carries `role=\"row\"` + an inner `role=\"gridcell\"`" below). It renders
// **unconditionally**, once per layout row, and its `role="gridcell"` now holds
// `RowMetricsReadout` (T026): the four printed per-row figures and the
// non-blocking crowding complaint that replaced the hatch's silent gesture.
//
// ## Seams for T065-T071 — do not re-implement any of this here
//
// - **T065 `useGridNav`** (arrow/Home/End navigation, geometry-based ↑/↓,
//   layer-switch position preservation): this component attaches no keydown
//   handling of its own beyond the native button's Enter/Space activation.
//   `onKeyDown` is forwarded verbatim onto the grid container — T065's hook
//   computes the next cell from `viewModel` + the current `selectedAddress`
//   and calls the SAME `onSelectCell` this component already takes; this
//   component's own focus-follow effect (mirroring CharScrollStrip's
//   `[currentChar]` effect) then moves DOM focus onto the newly selected
//   cell whenever focus was already resting inside the grid. T065 does not
//   need direct DOM refs into this component for that reason.
// - **T066 RTL (this component's share of it — done)**: `viewModel.direction`
//   is wired onto the container's `dir` attribute, which mirrors the flex row
//   visually for free (CSS flex row start/end follow the inline axis, which
//   `dir` flips, and `dir` is an HTML attribute — it INHERITS to every row/
//   cell below, not just this one div). Because this component renders
//   `row.keys` in plain ARRAY order and never reverses that order for RTL,
//   the array's first element is already "row start in reading order" in
//   BOTH directions — for RTL it lands at the visual RIGHT purely because of
//   the CSS mirror, not because any code here special-cases direction. That
//   is exactly what makes `logicalRowStart`/`logicalRowEnd` below (exported
//   for T065/T068's `useGridNav.ts`) trivial: array-first/array-last, full
//   stop — a caller that instead picked "whichever cell is at screen-left"
//   would get Home and End backwards on an RTL row. Direction is resolved
//   PER LAYER for free too, simply because this component only ever renders
//   ONE (platform, layer) `viewModel` at a time — whichever layer's
//   `direction` the caller built the view model with is the one that
//   renders; nothing here aggregates across layers. **Not this component's
//   job:** deriving "is this layer's script RTL" in the first place (that
//   analysis has no home yet — flagged in this feature's write-up, not a
//   silent gap) and the actual arrow-key movement (`useGridNav.ts`).
// - **T067 windowing (landed)**: `windowedRows` (a `useMemo`, not stateful —
//   see `CharScrollStrip.tsx`'s own `visibleChars` for the identical
//   rationale: a manual scroll inside the current window must not be reset by
//   an unrelated re-render) mounts only a budget of whole ROWS around
//   whichever row contains `selectedAddress`, deferring the rest — see
//   `MAX_VISIBLE_KEY_COUNT` below. Whole rows, not individual keys, stay
//   mounted-or-not together: a partially-rendered row would corrupt the
//   proportional-geometry math (`layerMaxUnits`, still computed over the
//   FULL `viewModel.rows` — cheap arithmetic, no DOM cost) and the `role="row"`
//   semantics. `aria-rowindex` keeps reporting each row's TRUE position in
//   the full layer (not its index within the mounted slice) and the
//   container carries `aria-rowcount` — the APG-sanctioned way to tell
//   assistive tech a grid is virtualized rather than silently missing rows.
//   The "window the layer rail" half of FR-020j has no home yet: no
//   layer-rail/layer-switcher component exists anywhere in the studio today
//   (confirmed by search) — it is presumably a `TouchGallery.tsx` concern
//   once a layer switcher is actually built there, outside this file's scope
//   and outside T067 as scoped to this file.
// - **T068 focus restoration**: as long as the caller updates `selectedAddress`
//   to the nearest surviving cell's address after a remove/suppress action
//   (FR-020k) while focus was already in the grid, focus lands there
//   automatically — see the focus-follow effect below, "Focus tracking
//   survives node removal", for why this is now actually reliable in the
//   exact case that used to break it (the removed cell being the one that
//   had focus). The windowing above re-centers on the new `selectedAddress`
//   on every render, so a restored selection just outside the previous
//   window still comes into view rather than being stranded off-window.
//   The CELL tier is the only tier this effect can reach at all (it only
//   ever looks up `cellRefs.current.get(selectedAddress)`) — the ROW and
//   CONTAINER tiers (every key in a row gone, or the whole layer emptied,
//   FR-020k precedence levels 3-4) have no `selectedAddress` to key off of
//   and must go through `useGridNav.ts`'s `resolveFocusAfterRemoval` +
//   `applyFocusRestorationTarget`, called imperatively by whatever code
//   performs the removal — that is also true after this fix, since a
//   passive/reactive effect keyed on `selectedAddress` structurally has
//   nothing to read for "select this row" or "select the grid itself".
//   This file now gives those two tiers somewhere to land: the `role="row"`
//   divs and the `role="grid"` container below both carry `tabIndex={-1}`
//   (programmatically focusable, never a Tab stop — see "Single Tab stop"
//   above, which this does not change).
// - **T069 `SKIP_SELECTOR`**: this component does not register itself with
//   useCharCycleKeys.ts — that's a one-line addition to that hook's own file,
//   not something this component can do from here. The platform `role=
//   "tablist"` this file adds (T077, below) is already covered — that
//   selector list matches ANY `[role="tablist"]`, not a specific one.
// - **T070 `KeyInspector` / T071 `FindPanel`**: separate components. This
//   grid only exposes selection (`selectedAddress` + `onSelectCell`), never
//   an editing surface — FR-020b's "selection is separate from editing" is
//   why the split exists.
// - **T077 platform tabs + provenance (landed)**: `platforms` is an OPTIONAL
//   prop — the caller (TouchGallery.tsx, not this file) is the only one who
//   knows the full platform catalog for the effective layout, so it supplies
//   the list and this component only decides whether >1 warrants a tablist
//   (FR-034: "render whatever platforms exist" — zero UI for the single-
//   platform case, which is most keyboards). `provenance` is likewise
//   supplied by the caller (it already knows whether the layout came from
//   `scaffoldTouchLayout` or a shipped file) — this component only owns the
//   HONEST, jargon-free COPY for each of the two values, never the strings
//   "Case A"/"Case B" themselves (FR-034).
// - **T094 `useKeyCommands` (landed, elsewhere — no change needed here)**:
//   that hook's `handleKeyDown` (Insert -> "add key after") recognizes a
//   DISJOINT key set from `useGridNav`'s own (arrows/Home/End vs. Insert),
//   so it is not threaded through THIS component's single `onKeyDown` prop —
//   the caller composes `useGridNav`'s and `useKeyCommands`'s handlers into
//   one function before passing it here, the same way it will eventually
//   need to fold in T097-T099's Delete/remove handling. `useKeyCommands`
//   also exposes a `commands` list (today: one "Add key after" descriptor)
//   for T111's command-menu widget to render — this component takes no new
//   prop for that; T111 owns where that menu actually mounts (per-cell
//   hover/right-click, per this file's own T070/T071 precedent of pushing
//   editing surfaces to a sibling component rather than this one).

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEventHandler,
} from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { KeyGridCell } from "./KeyGridCell.tsx";
import { RowMetricsReadout } from "./RowMetricsReadout.tsx";
import { findingAnnouncement } from "./findingCopy.ts";
import type { KeyGridCommandMenuAnchor } from "./useKeyCommands.ts";
import type {
  KeyGridCellViewModel,
  KeyGridRowViewModel,
  KeyGridViewModel,
} from "./keyGridViewModel.ts";
import {
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
} from "../../../lib/galleryTheme.ts";

/**
 * One tab in the platform tablist (T077, FR-034 "render whatever platforms
 * exist"). `label` is the caller's job, not this component's: only the
 * caller (which owns the effective layout's full platform catalog) knows how
 * to localize/format an unrecognized platform id.
 */
export interface KeyGridPlatformTab {
  readonly id: string;
  readonly label: string;
}

/**
 * How this layout came to exist — FR-034's "state provenance honestly
 * without requiring the author to know whether it is Case A or Case B". The
 * two values name what actually happened, not the spec's internal Case A/
 * Case B labels; this component turns each into a single honest, jargon-free
 * sentence (see `provenanceMessage` below), true on its own without needing
 * to contrast against the other case.
 */
export type KeyGridProvenance = "derived-from-base" | "imported-existing";

/**
 * Row/key budget for what actually MOUNTS at once (T067, FR-020j) — the same
 * failure class, and the same numeric budget, as `CharScrollStrip.tsx`'s own
 * `MAX_VISIBLE_CHIPS`: corpus reality runs to 2,256 keys across 53 layers, and
 * mounting every key of even one outlier layer froze reconciliation the same
 * way CharScrollStrip's unbounded chip list did. This bounds DOM nodes;
 * FR-020a's single-Tab-stop guarantee is a separate, already-satisfied bound.
 */
export const MAX_VISIBLE_KEY_COUNT = 300;

/**
 * Row start in READING order (FR-020i's "logical Home") — `row.keys[0]`,
 * regardless of `direction`. See this file's module doc, "T066 RTL", for why
 * array order IS reading order in both directions here (this grid never
 * reverses the DOM for RTL; the CSS `dir` mirror does the visual flip alone).
 * Exported for `useGridNav.ts` (T065/T068) to call rather than re-derive from
 * on-screen geometry, which would get Home/End backwards for an RTL row.
 */
export function logicalRowStart(
  row: KeyGridRowViewModel,
): KeyGridCellViewModel | undefined {
  return row.keys[0];
}

/** Row end in READING order (FR-020i's "logical End") — the mirror of `logicalRowStart`. */
export function logicalRowEnd(
  row: KeyGridRowViewModel,
): KeyGridCellViewModel | undefined {
  return row.keys[row.keys.length - 1];
}

export interface KeyGridProps {
  /** The pure view model for one (platform, layer) pair — see keyGridViewModel.ts. */
  viewModel: KeyGridViewModel;
  /** The selected cell's stable `touchKeyAddress`, or null before any selection has settled. */
  selectedAddress: string | null;
  /** Selection change — from a click here, or (once T065 lands) from `useGridNav`'s arrow/Home/End handling calling this same callback. */
  onSelectCell: (cell: KeyGridCellViewModel) => void;
  /**
   * Grid-level keydown handling — **required** (spec 061 T002/D1, FR-001).
   * Composing `useGridNav`'s arrow/Home/End navigation with
   * `useKeyCommands`'s Insert/`ContextMenu`/`Ctrl+Enter` handling into one
   * function is the caller's job, not this component's: this component only
   * forwards whatever it is given verbatim onto the grid container (see the
   * module doc's "Seams for T065-T071"). A caller with nothing else to add
   * can still pass a no-op — but a mount that forgets this prop entirely now
   * fails `tsc`, rather than silently shipping a grid with no arrow-key
   * movement.
   */
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  /** Localized accessible name for the grid. Defaults to a generic label naming the layer when the caller does not supply a more specific one (e.g. one that also names the platform). */
  label?: string;
  /**
   * All platforms the effective layout actually has (T077, FR-034). Omit, or
   * supply 0/1 entries, and no tablist renders at all — a single-platform
   * layout (the common case) never shows a choice that isn't real. The
   * caller owns which `viewModel` corresponds to which platform; this
   * component only renders the switcher and reports the click/keypress back.
   * Data, not an editing affordance, so it stays optional (spec 061 contract
   * key-mode-ui.md §1).
   */
  platforms?: readonly KeyGridPlatformTab[];
  /** Which of `platforms` is active. Ignored when `platforms` has fewer than 2 entries. */
  activePlatformId?: string;
  /**
   * Fired when the author picks a different platform tab (click, or
   * Left/Right/Home/End inside the tablist). **Required** (spec 061 T002):
   * with no tablist rendered for fewer than 2 platforms, this simply never
   * fires in that case — but a mount that CAN show a tablist must be able to
   * act on it.
   */
  onPlatformChange: (platformId: string) => void;
  /** Honest, jargon-free statement of how this layout came to exist (T077, FR-034). Omit to render no statement. */
  provenance?: KeyGridProvenance;
  /**
   * T111 (FR-021) — the per-key pointer commands, forwarded verbatim to every
   * `KeyGridCell`. **Required** (spec 061 T002/T003, FR-001, FR-003): each
   * affordance's visibility is gated on the CELL's own state in
   * `KeyGridCell.tsx` (blank/spacer, `nextlayer` presence), never on whether
   * a handler happens to exist — see that file's own prop docs. This
   * component adds no behaviour of its own around them — it only passes them
   * down, the same way it forwards `onSelectCell`. Their KEYBOARD equivalents
   * are `useKeyCommands.ts`'s and arrive through `onKeyDown`, not through
   * these props.
   */
  onAddKeyAfter: (cell: KeyGridCellViewModel) => void;
  onOpenCommandMenu: (
    cell: KeyGridCellViewModel,
    anchor: KeyGridCommandMenuAnchor,
  ) => void;
  onFollowNextLayer: (cell: KeyGridCellViewModel, nextlayer: string) => void;
}

/** Sum of `widthPct + padPct` across a row's keys, in the 100-unit model's raw units (mirrors keyGridViewModel.ts's own `rowTotalPct`, recomputed here rather than exported since it's a cheap, pure, single-formula derivation). */
function rowUnitsTotal(keys: readonly KeyGridCellViewModel[]): number {
  let total = 0;
  for (const key of keys) total += key.widthPct + key.padPct;
  return total;
}

export function KeyGrid({
  viewModel,
  selectedAddress,
  onSelectCell,
  onKeyDown,
  label,
  platforms,
  activePlatformId,
  onPlatformChange,
  provenance,
  onAddKeyAfter,
  onOpenCommandMenu,
  onFollowNextLayer,
}: KeyGridProps) {
  // `i18n` beside `t` because findingCopy.ts composes with an `I18n` rather
  // than a JSX macro — the same split KeyInspector.tsx uses.
  const { t, i18n } = useLingui();
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gridRef = useRef<HTMLDivElement | null>(null);
  const platformTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gridId = useId();

  // T068 (FR-020k): tracks "is focus currently somewhere inside this grid",
  // kept up to date by `onFocus`/`onBlur` below rather than read from
  // `document.activeElement` inside the focus-follow effect — see that
  // effect's own doc comment, "Focus tracking survives node removal", for
  // the race this replaces.
  const focusInGridRef = useRef(false);

  function registerRef(address: string, el: HTMLButtonElement | null): void {
    if (el) cellRefs.current.set(address, el);
    else cellRefs.current.delete(address);
  }

  // T067 windowing (FR-020j): mount only a budget of whole ROWS around
  // whichever row contains `selectedAddress`, deferring the rest — see this
  // file's module doc, "T067 windowing", and `MAX_VISIBLE_KEY_COUNT` above.
  // A `useMemo`, not stateful state, for the same reason CharScrollStrip's
  // own `visibleChars` window is a `useMemo`: while the selection doesn't
  // move to a row outside the current window, an unrelated re-render
  // elsewhere must not reset it.
  const windowedRows = useMemo(() => {
    const rows = viewModel.rows;
    const totalKeys = rows.reduce((sum, row) => sum + row.keys.length, 0);
    if (rows.length === 0 || totalKeys <= MAX_VISIBLE_KEY_COUNT) {
      return rows.map((row, rowIndex) => ({ row, rowIndex }));
    }

    const selectedRowIndex =
      selectedAddress !== null
        ? rows.findIndex((row) =>
            row.keys.some((k) => k.address === selectedAddress),
          )
        : -1;
    const centerIndex = selectedRowIndex === -1 ? 0 : selectedRowIndex;

    let startIndex = centerIndex;
    let endIndex = centerIndex;
    let count = rows[centerIndex]?.keys.length ?? 0;
    let growUp = true;
    while (
      count < MAX_VISIBLE_KEY_COUNT &&
      (startIndex > 0 || endIndex < rows.length - 1)
    ) {
      const canGrowUp = startIndex > 0;
      const canGrowDown = endIndex < rows.length - 1;
      if (growUp && canGrowUp) {
        startIndex -= 1;
        count += rows[startIndex]?.keys.length ?? 0;
      } else if (canGrowDown) {
        endIndex += 1;
        count += rows[endIndex]?.keys.length ?? 0;
      } else if (canGrowUp) {
        startIndex -= 1;
        count += rows[startIndex]?.keys.length ?? 0;
      } else {
        break;
      }
      growUp = !growUp;
    }

    const slice: { row: KeyGridRowViewModel; rowIndex: number }[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const row = rows[i];
      if (row) slice.push({ row, rowIndex: i });
    }
    return slice;
  }, [viewModel, selectedAddress]);

  const firstAddress = windowedRows[0]?.row.keys[0]?.address ?? null;

  // See the module doc's "Single Tab stop" section — copied directly from
  // CharScrollStrip.tsx's own `hasSelectedVisible` precedent. "Visible" here
  // means "present in the currently-mounted `windowedRows` slice" — the same
  // recompute-against-the-actual-window CharScrollStrip's own version already
  // does against its MAX_VISIBLE_CHIPS window.
  const hasSelectedVisible = useMemo(
    () =>
      windowedRows.some(({ row }) =>
        row.keys.some((k) => k.address === selectedAddress),
      ),
    [windowedRows, selectedAddress],
  );

  // Layer-wide proportional-geometry basis (FR-022) — deliberately computed
  // over the FULL `viewModel.rows`, not the windowed slice: an unmounted row
  // still counts toward "the layer's widest row" for every MOUNTED row's own
  // percentage math. Cheap arithmetic, no DOM cost either way.
  const layerMaxUnits = useMemo(() => {
    let max = 0;
    for (const row of viewModel.rows) {
      const total = rowUnitsTotal(row.keys) + row.slackPct;
      if (total > max) max = total;
    }
    return max;
  }, [viewModel]);

  // T077 platform tabs (FR-034) — APG tabs pattern, automatic activation:
  // Left/Right move AND select the adjacent tab (wrapping), Home/End jump to
  // the first/last platform. `[role="tablist"]` is already in
  // useCharCycleKeys.ts's SKIP_SELECTOR, so the pane-level char-cycle handler
  // never eats these keys first.
  const handlePlatformTabsKeyDown: KeyboardEventHandler<HTMLDivElement> = (
    e,
  ) => {
    if (!platforms || platforms.length < 2) return;
    const activeIndex = platforms.findIndex((p) => p.id === activePlatformId);
    let nextIndex: number;
    switch (e.key) {
      case "ArrowRight":
        nextIndex =
          activeIndex === -1 ? 0 : (activeIndex + 1) % platforms.length;
        break;
      case "ArrowLeft":
        nextIndex =
          activeIndex === -1
            ? 0
            : (activeIndex - 1 + platforms.length) % platforms.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = platforms.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = platforms[nextIndex];
    if (!next) return;
    onPlatformChange(next.id);
    platformTabRefs.current.get(next.id)?.focus();
  };

  // Focus-follow: mirrors CharScrollStrip's own `[currentChar]` effect.
  // When the selection moves — a click here, or (once wired) a useGridNav
  // arrow-key call into `onSelectCell` — and focus was ALREADY resting
  // inside this grid, follow it onto the newly selected cell. Gated the
  // same way, for the same reason: a selection change caused by something
  // OUTSIDE the grid (e.g. a future FindPanel jump, T071) must not yank
  // focus away from wherever the author currently is.
  //
  // ## Focus tracking survives node removal (T068, FR-020k fix)
  //
  // This USED to gate on `document.activeElement` read live, right here,
  // inside the effect. That is provably too late for exactly the scenario
  // FR-020k names: when the cell that is being removed is the one that had
  // focus, the browser's node-removal steps move focus to `document.body`
  // SYNCHRONOUSLY, as part of the same DOM mutation that removes the node —
  // before ANY effect (layout or passive) gets a chance to run. By the time
  // this effect reads `document.activeElement`, it is already `body`, so the
  // old gate always concluded "focus was not in the grid" and skipped
  // re-focusing — the exact bug.
  //
  // `focusInGridRef` (declared above) fixes this by tracking the same fact
  // PROACTIVELY, via `onFocus`/`onBlur` below, instead of reading it
  // reactively inside this effect. The key fact that makes this
  // deterministic (checked directly against jsdom, not assumed): removing a
  // focused node resets `document.activeElement` to `body` WITHOUT firing
  // any `blur`/`focusout` event at all — there is nothing for `onBlur` to
  // observe, so `focusInGridRef` is never told to clear, and it correctly
  // still reads `true` by the time this effect runs on the post-removal
  // re-render — exactly the case that needs restoring. An ORDINARY focus
  // change (the author Tabs away, clicks a different pane, focus lands on a
  // still-live element elsewhere) DOES fire a real `blur`/`focusout` with a
  // populated `relatedTarget`, which `onBlur` below uses to correctly clear
  // the ref for that case — preserving the original "don't yank focus from
  // outside the grid" guarantee.
  //
  // This effect only ever reaches the CELL tier (see the module doc's "T068"
  // note) — the ROW/CONTAINER tiers still need `useGridNav.ts`'s
  // `applyFocusRestorationTarget`, called imperatively by the code
  // performing the removal, since there is no `selectedAddress` to key off
  // of for "select a row" or "select the grid itself".
  useEffect(() => {
    if (selectedAddress === null) return;
    const el = cellRefs.current.get(selectedAddress);

    if (typeof el?.scrollIntoView === "function") {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }

    if (focusInGridRef.current) {
      el?.focus();
    }
  }, [selectedAddress]);

  const gridLabel =
    label ??
    t({
      id: "editor.assignLoop.keyGrid.ariaLabel",
      message: `Key grid — ${{ layerId: viewModel.layerId }} layer`,
    });

  // T077 (FR-034): a single true, jargon-free sentence per provenance value —
  // never the spec's internal "Case A"/"Case B" labels, and never phrased as
  // a contrast against the other case (each reads as a fact on its own).
  const provenanceMessage =
    provenance === "derived-from-base"
      ? t({
          id: "editor.assignLoop.keyGrid.provenanceDerivedFromBase",
          message:
            "This layout was generated automatically from your keyboard's physical layout.",
        })
      : provenance === "imported-existing"
        ? t({
            id: "editor.assignLoop.keyGrid.provenanceImportedExisting",
            message:
              "This layout is based on the touch layout that shipped with your starting keyboard.",
          })
        : undefined;

  const showPlatformTabs = platforms !== undefined && platforms.length > 1;

  // T117 — what the grid's own live region says. The SELECTED cell's findings
  // only: an announcement fires on selection change, and reading out a whole
  // layer's diagnostics on every arrow key would make the grid unusable with a
  // screen reader. Composed by findingCopy.ts (T116), never here, so the
  // announcement and the inspector cannot word the same finding differently.
  const selectedFindingAnnouncement = useMemo(() => {
    if (selectedAddress === null) return undefined;
    for (const row of viewModel.rows) {
      const cell = row.keys.find((k) => k.address === selectedAddress);
      if (cell !== undefined) return findingAnnouncement(cell.findings, i18n);
    }
    return undefined;
  }, [selectedAddress, viewModel, i18n]);

  return (
    <>
      {showPlatformTabs && (
        // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- same roving-tabindex model as the grid above (module doc's "Single Tab stop"): DOM focus lives on the individual `role="tab"` buttons (each with its own managed tabIndex), never on this tablist container itself, so it intentionally carries no tabIndex of its own.
        <div
          role="tablist"
          aria-label={t({
            id: "editor.assignLoop.keyGrid.platformTabsAriaLabel",
            message: "Platform",
          })}
          data-testid="key-grid-platform-tabs"
          onKeyDown={handlePlatformTabsKeyDown}
          style={{ display: "flex", gap: 4, marginBottom: 6, fontFamily: FONT }}
        >
          {platforms.map((p) => {
            const isActive = p.id === activePlatformId;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                ref={(el) => {
                  if (el) platformTabRefs.current.set(p.id, el);
                  else platformTabRefs.current.delete(p.id);
                }}
                aria-selected={isActive}
                aria-controls={gridId}
                tabIndex={isActive ? 0 : -1}
                data-testid={`key-grid-platform-tab-${p.id}`}
                onClick={() => onPlatformChange(p.id)}
                style={{
                  padding: "6px 12px",
                  background: isActive ? "var(--app-accent-subtle)" : "transparent",
                  border: `1px solid ${isActive ? ACCENT : BORDER}`,
                  borderRadius: 6,
                  color: isActive ? TEXT_MAIN : TEXT_DIM,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: FONT,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {provenanceMessage !== undefined && (
        <p
          data-testid="key-grid-provenance"
          style={{
            fontSize: 11,
            color: TEXT_DIM,
            fontFamily: FONT,
            margin: "0 0 6px",
          }}
        >
          {provenanceMessage}
        </p>
      )}
      {/* APG's grid pattern offers TWO alternative focus models:
        aria-activedescendant on a focusable container (SelectMenu.tsx's
        role="listbox" uses this one), or roving tabindex on the CELLS with
        the container itself never a TAB STOP (the model this component uses
        — see the module doc's "Single Tab stop" section). This div's own
        `tabIndex={-1}` below does NOT change that: -1 makes it
        programmatically focusable (`.focus()`-able, needed for FR-020k's
        "container" tier — see useGridNav.ts's `applyFocusRestorationTarget`)
        without ever entering the Tab sequence — only tabIndex 0/positive
        values do that, and this is neither. DOM focus during ordinary
        authoring still always lives on exactly one gridcell, never here. */}
      <div
        ref={gridRef}
        id={gridId}
        role="grid"
        aria-label={gridLabel}
        aria-rowcount={viewModel.rows.length}
        dir={viewModel.direction}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onFocus={() => {
          focusInGridRef.current = true;
        }}
        onBlur={(e) => {
          // See the focus-follow effect's own doc comment, "Focus tracking
          // survives node removal": a node-removal-forced blur (the
          // scenario this whole fix is for) never reaches this handler at
          // all in the first place, so the only blurs that DO reach it are
          // genuine focus changes with a real `relatedTarget`. Moving to
          // ANOTHER element still inside this grid (e.g. clicking a
          // different cell) is not a departure — only clear the ref when
          // the next focus target is outside the container entirely.
          const related = e.relatedTarget;
          if (related instanceof Node && gridRef.current?.contains(related)) {
            return;
          }
          focusInGridRef.current = false;
        }}
        data-testid="key-grid"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontFamily: FONT,
        }}
      >
        {windowedRows.map(({ row, rowIndex }) => {
          // The row's unused width, in the same percentage space the cells use.
          // It is no longer drawn as anything of its own (the hatch is gone,
          // ADR 0002 / FR-012) — it is added to the LAST key below, which is
          // what KeymanWeb does and therefore what the author's keyboard will
          // look like. A row that IS the layer maximum contributes 0.
          const slackPercent =
            layerMaxUnits > 0 ? (row.slackPct / layerMaxUnits) * 100 : 0;
          return (
            <Fragment key={rowIndex}>
              <div
                role="row"
                aria-rowindex={rowIndex + 1}
                // tabIndex={-1}, not 0/omitted: programmatically focusable for
                // FR-020k's "row" tier (an entire row emptied by one action —
                // see useGridNav.ts's `applyFocusRestorationTarget`) without
                // ever becoming a Tab stop of its own (see the grid
                // container's own tabIndex comment above for the same
                // distinction).
                tabIndex={-1}
                style={{ display: "flex", width: "100%" }}
              >
                {row.keys.map((cell, colIndex) => {
                  const padPercent =
                    layerMaxUnits > 0 ? (cell.padPct / layerMaxUnits) * 100 : 0;
                  // FR-012: the last key of every row absorbs the row's slack,
                  // so every row ends flush at the layer maximum. `isLastInRow`
                  // comes off the view model rather than being re-derived from
                  // `colIndex === row.keys.length - 1` here, so the rule is
                  // stated once (keyGridViewModel.ts) for every consumer that
                  // draws or measures a cell.
                  //
                  // This is the DECLARED width plus the stretch — FR-015's
                  // "declared width is a minimum" made literal. The property
                  // panel's width field and the row metrics readout both quote
                  // the declared figure, and both say so.
                  const widthPercent =
                    layerMaxUnits > 0
                      ? ((cell.widthPct / layerMaxUnits) * 100) +
                        (cell.isLastInRow ? slackPercent : 0)
                      : 0;
                  const isSelected = cell.address === selectedAddress;
                  const isTabbable =
                    isSelected ||
                    (!hasSelectedVisible && cell.address === firstAddress);
                  return (
                    // Keyed on the address, which is unique within a layer
                    // because it carries an OCCURRENCE (keyGridViewModel.ts,
                    // "Duplicate ids"). That matters here specifically: ids
                    // repeat — `T_BLANK` twenty-five times in one shipped
                    // tablet layer — and duplicate React keys made the grid
                    // LEAK. React maps previous children by key, so duplicates
                    // overwrite each other, the shadowed fibers are never
                    // matched on a later render and never enter the deletion
                    // set, and they stay mounted; switching layers piled up
                    // orphaned blanks and front-of-row keys on every switch.
                    <Fragment key={cell.address}>
                      {/* Decorative left-padding spacer, not a gridcell — kept
                      aria-hidden and OUTSIDE the aria-colindex count below so
                      an assistive-technology cell iteration never confuses
                      it for a real key. */}
                      {padPercent > 0 && (
                        <span
                          aria-hidden="true"
                          data-testid={`key-grid-pad-${cell.address}`}
                          style={{
                            flexGrow: 0,
                            flexShrink: 0,
                            flexBasis: `${padPercent}%`,
                          }}
                        />
                      )}
                      <KeyGridCell
                        cell={cell}
                        rowIndex={rowIndex + 1}
                        colIndex={colIndex + 1}
                        widthPercent={widthPercent}
                        isSelected={isSelected}
                        isTabbable={isTabbable}
                        onSelect={onSelectCell}
                        registerRef={registerRef}
                        onAddKeyAfter={onAddKeyAfter}
                        onOpenCommandMenu={onOpenCommandMenu}
                        onFollowNextLayer={onFollowNextLayer}
                      />
                    </Fragment>
                  );
                })}
              </div>
              {/* The row-actions strip (spec 061 T012, FR-007, FR-038) — a
              retained container, not a new one: it used to hold "Fill row" /
              "Even out row", both withdrawn by ADR 0002 (the last key now
              stretches to fill a row, so there is nothing left for either
              button to redistribute). It renders UNCONDITIONALLY now, once
              per layout row, and as of spec 061 T026 its `role="gridcell"`
              holds the per-row metrics readout (FR-013, FR-014) — the printed
              numbers that replaced the withdrawn slack hatch. The readout goes
              INSIDE the existing gridcell rather than beside it: the roles
              below are what SC-009 fixed, and a new grid child would reopen
              exactly the `aria-required-children` violation they closed.

              ## Why this strip carries `role="row"` + an inner `role="gridcell"`
              (T123 / SC-009)

              It began as a plain `<div>` sibling of the `role="row"` above,
              which is invalid: `role="grid"` permits only `row`/`rowgroup`
              children, so a bare div here made axe's `aria-required-children`
              fail at CRITICAL impact on the grid container itself — caught by
              `e2e/touch-key-grid-a11y.spec.ts`, exactly the net-new-widget
              defect SC-009 exists to find. The alternatives were worse: moving
              the strip outside the grid loses its per-row placement (the whole
              point of a per-row affordance), `role="none"` re-parents the
              buttons into the grid and fails the same rule, and `aria-hidden`
              on focusable buttons trades one violation for another
              (`aria-hidden-focus`). Presenting the strip as a row with one cell
              is both valid and honest: it IS a row-scoped control, and this
              costs no visual change (roles only).

              No `aria-rowindex` here, deliberately. The indices belong to the
              LAYOUT's rows, and `aria-rowcount` above counts those (it already
              differs from the DOM row count by design — the grid windows rows).
              Numbering a control strip as if it were a layout row would make
              both figures lie. */}
              <div
                role="row"
                // Same tabIndex={-1} convention as the layout rows above:
                // programmatically focusable, never a Tab stop of its own.
                tabIndex={-1}
                data-testid={`key-grid-row-actions-${rowIndex}`}
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: -2,
                  marginBottom: 2,
                  paddingLeft: 2,
                }}
              >
                <div role="gridcell" style={{ display: "flex", gap: 6 }}>
                  <RowMetricsReadout rowIndex={rowIndex} metrics={row.metrics} />
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
      {windowedRows.length < viewModel.rows.length && (
        <div
          style={{
            fontSize: 11,
            color: TEXT_DIM,
            fontFamily: FONT,
            marginTop: 4,
          }}
        >
          <Trans id="editor.assignLoop.keyGrid.windowTruncatedNote">
            Showing {windowedRows.length} of {viewModel.rows.length} rows —
            navigate to a key to bring more rows into view.
          </Trans>
        </div>
      )}
      {/* T117 (US5 AS4, FR-050) — THE grid's one `aria-live` region, for the
          grid's own announcements. Exactly one, and only for this component:
          the app already has several (TouchGallery x2, DiagnosticsPanel), and
          US5 AS4's requirement is that the grid adds one of its own, NOT that
          the app consolidates to a single region.

          `polite`, not `assertive`: a diagnostic on the key you just moved to
          is context, not an interruption, and `assertive` would talk over the
          cell's own accessible name as focus lands.

          Driven purely by `selectedAddress` changing — no timer of any kind
          (Decision D3). The findings it reads are already on the cell's view
          model, computed in the same cycle that rendered the cell. */}
      <div
        role="status"
        aria-live="polite"
        data-testid="key-grid-live-region"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
      >
        {selectedFindingAnnouncement ?? ""}
      </div>
    </>
  );
}
