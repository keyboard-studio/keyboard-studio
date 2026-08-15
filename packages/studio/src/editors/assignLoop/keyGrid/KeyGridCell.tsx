// KeyGridCell — one gridcell in the touch key grid (spec 063 T064; FR-020,
// FR-020a, FR-022). Purely presentational: renders one
// `KeyGridCellViewModel` (./keyGridViewModel.ts, T063 — a pure projection
// holding no state) as an ARIA APG `gridcell`
// (https://www.w3.org/WAI/ARIA/apg/patterns/grid/), with a
// codepoint-derived accessible name (docs/accessibility.md rule 10) — never
// the bare glyph alone.
//
// Selection vs. Tab-stop are two INDEPENDENT flags the parent (KeyGrid.tsx)
// computes and passes in: `isSelected` drives the visual highlight and
// `aria-selected`; `isTabbable` drives `tabIndex` (roving tabindex — see
// KeyGrid.tsx's module doc for the `hasSelectedVisible` fallback, which this
// component does not itself compute).
//
// The longpress/multitap/flick annotation counts, the provenance marker, and
// the findings dot are all `aria-hidden` — their substance is already folded
// into this cell's own `aria-label` (see `buildCellAriaLabel` below), so a
// screen reader never hears the same fact twice. A dedicated per-finding
// details view (click-through to the diagnostic, fix affordances) is
// KeyInspector's job (T070), not this cell's — this cell only SUMMARIZES.
//
// ## The pointer paths (T111, FR-021) — first-class, and why they are DOM-flat
//
// FR-021 makes two claims that both hold: the design is mouse-first, AND
// keyboard coverage is complete. This component owns the mouse half — click
// selects, hover reveals the `(+)`/`⋯` wedges, right-click opens the command
// menu, double-click follows the key's "Goes to" layer. The keyboard half is
// `useKeyCommands.ts`'s (Insert / `ContextMenu`-`Shift+F10` / `Ctrl+Enter`);
// see that file's "T111's two keyboard routes" section. Neither half
// re-implements the other — the cell reports pointer INTENT through the three
// callbacks below, and the caller routes both halves into the same handlers.
//
// ## Required callbacks, cell-state gating (spec 065 T003, FR-001, FR-003)
//
// All three callbacks below are **required** props, not optional ones — see
// the defect of record in specs/065-touch-editor-parity/spec.md: an omitted
// handler used to mean "no wedge renders", which let a caller ship this
// component unwired without `tsc` ever noticing. Now a missing handler is a
// build error, and each affordance's visibility is gated on **what the cell
// itself is**, never on whether a handler happens to be present: the add and
// menu wedges render iff the cell is not blank/spacer
// (`showAddWedge`/`showMenuWedge`), the double-click follow fires iff the
// cell has a `nextlayer` to go to (`canFollowNextLayer`), and right-click
// always opens the command menu — there is always one to put in place of the
// browser's now.
//
// research.md (§"Hover-revealed `(+)`/`⋯` is Developer's wedge idea, kept
// deliberately") is explicit that Developer's floating wedges were the right
// mouse affordance and that their two faults were **being the only route** and
// **being unlabeled**. Both are fixed here: every wedge command also has a
// keyboard route, and each wedge carries a `title` for the sighted mouse user
// who is the only audience that can reach it.
//
// **Why the wedges are `aria-hidden` spans and not nested `<button>`s.** This
// cell IS a native `<button>` carrying `role="gridcell"` — and a button may
// not contain interactive descendants (no nested-button HTML, and the ARIA
// grid pattern wants a row's owned children to BE gridcells, which an
// intervening wrapper element or a sibling non-gridcell control both break).
// Making the wedges real buttons therefore costs either valid HTML or the APG
// structure this grid was built on, and it would also shatter FR-020a's
// single-Tab-stop guarantee: a 300-key window would gain 600 more Tab stops.
// So the wedges are decorative `aria-hidden` hit regions INSIDE the cell
// button, and `handleClick` below routes a click on one to its command
// instead of to selection, by testing the event target. That is not a
// degradation of the accessible experience: an assistive-technology user
// reaches all three commands through the keyboard routes and the command menu
// — the wedges would be pure redundancy in the accessibility tree, announced
// on every one of several hundred cells.
//
// **Drag-and-drop is deliberately absent (FR-021).** Reorder/resize "MUST
// remain a pointer *enhancement* over commands that exist independently,
// since drag has no good keyboard analogue" — and this increment has no such
// independent command to enhance: `keyEditOps.ts`'s `EditableKeyFields` omits
// `width`/`pad` entirely (see KeyGrid.tsx's own "Row slack" section), so
// geometry is read-only and there is nothing a drag could legitimately
// commit. This component therefore renders NO drag handle and sets no
// `draggable` — adding one before the operation union admits a width change
// would be an affordance that silently does nothing.

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { isSpacerKeyClass, type TouchKeyFinding } from "@keyboard-studio/contracts";
import { codepointLabel } from "../../../survey/codepointLabel.ts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { ERROR_RED, FONT_MONO, WARNING } from "../../../ui/theme.ts";
import type { KeyGridCellViewModel } from "./keyGridViewModel.ts";
import type { KeyGridCommandMenuAnchor } from "./useKeyCommands.ts";
import { severityLabel } from "./findingCopy.ts";

// Layer C's info-severity blue has no dedicated *-severity named export in
// ui/theme.ts (WARNING/ERROR_RED cover Layer B/A already) — matches the
// editor gutter's own Layer C convention (docs/architecture.md "Editor
// gutter diagnostics"). Reuses the accent-text token directly (epic #533).
const INFO_BLUE = "var(--app-accent-text)";

export interface KeyGridCellProps {
  cell: KeyGridCellViewModel;
  /** 1-based row index within the layer — mirrors `aria-rowindex`. */
  rowIndex: number;
  /** 1-based column (key) index within the row — mirrors `aria-colindex`; counts only actual keys, never the decorative pad/slack spacers KeyGrid renders alongside them. */
  colIndex: number;
  /** Percentage of the layer's widest-row total this cell's WIDTH occupies (the key's own left padding is a separate sibling spacer rendered by KeyGrid). */
  widthPercent: number;
  isSelected: boolean;
  isTabbable: boolean;
  onSelect: (cell: KeyGridCellViewModel) => void;
  /** Registers/unregisters this cell's DOM node against KeyGrid's own focus-follow map (see KeyGrid.tsx). */
  registerRef: (address: string, el: HTMLButtonElement | null) => void;
  /**
   * T111 — the `(+)` hover wedge. Keyboard equivalent: Insert
   * (`useKeyCommands.ts`). **Required** (spec 065 T003/FR-001, FR-003): the
   * wedge's presence is now gated on `cell` state alone (`showAddWedge =
   * !isBlank`), never on whether this callback exists — see `handleClick`
   * below, which calls it unconditionally in the add-wedge branch.
   */
  onAddKeyAfter: (cell: KeyGridCellViewModel) => void;
  /**
   * T111 — the `⋯` hover wedge AND right-click. Keyboard equivalent:
   * `ContextMenu` / `Shift+F10`. **Required** — there is always a menu to
   * open now, so right-click always opens it rather than falling through to
   * the browser's own (see `handleContextMenu`).
   */
  onOpenCommandMenu: (
    cell: KeyGridCellViewModel,
    anchor: KeyGridCommandMenuAnchor,
  ) => void;
  /**
   * T111 — double-click "follows" this key's `nextlayer`. Keyboard
   * equivalent: `Ctrl+Enter`. **Required**, but still never fired for a key
   * with no `nextlayer` — that is cell state (nothing to follow), not
   * missing wiring, so `handleDoubleClick`'s early return on
   * `nextlayer === undefined` stays.
   */
  onFollowNextLayer: (cell: KeyGridCellViewModel, nextlayer: string) => void;
}

/**
 * `data-key-grid-wedge` value marking each decorative hover wedge, read back
 * off `event.target` in `handleClick` to tell "the author clicked the `(+)`"
 * from "the author clicked the key" — see the module doc, "Why the wedges are
 * `aria-hidden` spans". A data attribute rather than a class name because
 * this file styles everything inline (no stylesheet exists to hang a class
 * on) and rather than geometry math because a hit test on coordinates would
 * silently drift from the rendered position.
 */
const WEDGE_ADD = "add";
const WEDGE_MENU = "menu";

/**
 * Highest-severity color + single-letter badge present in `findings`, or
 * undefined when there are none. Mirrors the editor gutter's Layer A (red) /
 * B (yellow) / C (blue) severity convention. The letter is not decorative
 * flourish — docs/accessibility.md rule 7 ("color never carries meaning
 * alone") means a colored dot by itself is a defect for a colorblind sighted
 * author; pairing it with E/W/I is the shape/text differentiator the rule
 * asks for. (The full finding text itself is aria-hidden here — this cell's
 * `aria-label` already states the count — a click-through to per-finding
 * detail is KeyInspector's job, T070.)
 */
function worstSeverity(
  findings: KeyGridCellViewModel["findings"],
): { color: string; letter: string } | undefined {
  const worst = worstSeverityValue(findings);
  if (worst === "error") return { color: ERROR_RED, letter: "E" };
  if (worst === "warning") return { color: WARNING, letter: "W" };
  if (worst === "hint") return { color: INFO_BLUE, letter: "I" };
  return undefined;
}

/**
 * The worst severity present, as the VALUE rather than as presentation — the one
 * ordering (`error` > `warning` > `hint`) both {@link worstSeverity}'s badge and
 * `describeFindings`'s accessible text read from, so the coloured badge and the
 * spoken word can never name different severities for the same cell.
 */
function worstSeverityValue(
  findings: KeyGridCellViewModel["findings"],
): TouchKeyFinding["severity"] | undefined {
  if (findings.some((f) => f.severity === "error")) return "error";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  if (findings.length > 0) return "hint";
  return undefined;
}

export function KeyGridCell({
  cell,
  rowIndex,
  colIndex,
  widthPercent,
  isSelected,
  isTabbable,
  onSelect,
  registerRef,
  onAddKeyAfter,
  onOpenCommandMenu,
  onFollowNextLayer,
}: KeyGridCellProps) {
  // `i18n` beside `t` for findingCopy.ts's severity word — see `describeFindings`.
  const { t, i18n } = useLingui();
  // T111: hover reveals the wedges. Local to the cell rather than lifted to
  // KeyGrid — only one cell is hovered at a time, and keeping it here means a
  // hover never re-renders the other 299 mounted cells.
  const [isHovered, setIsHovered] = useState(false);
  const isBlank = isSpacerKeyClass(cell.sp);
  const finding = worstSeverity(cell.findings);
  const hasAnnotations =
    cell.annotations.longpress > 0 || cell.annotations.multitap > 0 || cell.annotations.flick > 0;
  const hasProvenanceMarker = cell.provenance !== undefined && cell.provenance !== "hand-set";
  const displayLabel = cell.keycap.length > 0 ? displayChar(cell.keycap) : cell.id;

  // The label-building helpers below are declared INSIDE this component
  // (closing over `t`), not hoisted to module scope taking `t` as a
  // parameter. That is load-bearing, not a style choice: Lingui's macro
  // transform rewrites a `t({...})` call only where it can statically prove
  // the callee IS the exact binding destructured from `const { t } =
  // useLingui()` (it walks that binding's own `referencePaths`) — passing
  // `t` into a separately-declared function creates a NEW parameter binding
  // also named `t`, which the macro's reference walk never reaches. A call
  // written that way still compiles and runs, but the labeled
  // `${{ name: expr }}` interpolation is never extracted or substituted —
  // at runtime the template literal just calls `Object.prototype.toString`
  // on the `{ name: expr }` object, rendering "[object Object]" in the
  // accessible name (caught by this file's own test suite, KeyGrid.test.tsx,
  // which was the point of writing content assertions on `aria-label`
  // rather than only checking DOM presence).

  /** " produces X (U+..), Y (U+..)" or " no output" — a trailing clause, never a standalone sentence. */
  function describeProduces(): string {
    if (cell.producedChars.length === 0) {
      return " " + t({ id: "editor.assignLoop.keyGrid.cell.noOutput", message: "no output" });
    }
    const list = cell.producedChars.map((ch) => `${ch} (${codepointLabel(ch).title})`).join(", ");
    return (
      " " +
      t({
        id: "editor.assignLoop.keyGrid.cell.produces",
        message: `produces ${{ produces: list }}`,
      })
    );
  }

  /** ", auto-placed from base keyboard" / ", auto-suggested from physical layout" / "" for hand-set (the unmarked default). */
  function describeProvenance(): string {
    if (cell.provenance === undefined || cell.provenance === "hand-set") return "";
    const label =
      cell.provenance === "base-derived"
        ? t({
            id: "editor.assignLoop.keyGrid.cell.provenanceBaseDerived",
            message: "auto-placed from base keyboard",
          })
        : t({
            id: "editor.assignLoop.keyGrid.cell.provenancePhysicalSuggested",
            message: "auto-suggested from physical layout",
          });
    return ", " + label;
  }

  /**
   * ", Warning, 2 diagnostics" or "" when there are none.
   *
   * T117 (FR-050, US5 AS4): the worst severity is named in WORDS here, not left
   * to the badge's colour. The badge already carries its single LETTER, which
   * covers a sighted author on a monochrome display; this covers a screen-reader
   * user, who otherwise heard a count with no indication of how bad it was.
   * `findingCopy.ts` owns the severity word so the cell, the inspector, and the
   * grid's live region cannot disagree.
   */
  function describeFindings(): string {
    if (cell.findings.length === 0) return "";
    const worst = worstSeverityValue(cell.findings);
    const count = t({
      id: "editor.assignLoop.keyGrid.cell.findingsCount",
      message: plural(cell.findings.length, { one: "# diagnostic", other: "# diagnostics" }),
    });
    return worst === undefined
      ? ", " + count
      : `, ${severityLabel(worst, i18n)}, ${count}`;
  }

  /**
   * Build the cell's full accessible name. Each clause is its own small
   * translated fragment, concatenated with a plain locale-agnostic
   * separator — the same pattern CharacterMapPane.tsx's announcement
   * strings already use (`${actionWord} ${char} (${notation})
   * ${describeContribution(char)}`), not a mid-sentence reordering concern
   * (see catalog-format.md's "never concatenate translated fragments" rule,
   * which targets JSX `<Trans>` composition, not juxtaposed independent
   * facts like these).
   */
  function buildCellAriaLabel(): string {
    if (isBlank) {
      return t({
        id: "editor.assignLoop.keyGrid.cell.blankAriaLabel",
        message: `Blank key ${{ id: cell.id }}`,
      });
    }

    const base =
      cell.keycap.length > 0
        ? t({
            id: "editor.assignLoop.keyGrid.cell.ariaLabel",
            message: `${{ keycap: cell.keycap }} (${{ notation: codepointLabel(cell.keycap).title }}), key ${{ id: cell.id }}`,
          })
        : t({
            id: "editor.assignLoop.keyGrid.cell.ariaLabelNoKeycap",
            message: `Key ${{ id: cell.id }}`,
          });

    return base + describeProduces() + describeProvenance() + describeFindings();
  }

  const ariaLabel = buildCellAriaLabel();

  // T111 (FR-021) — the pointer surface. Both callbacks are required props
  // now (spec 065 T003), so gating is on CELL STATE alone: a blank/spacer key
  // gets no wedges because it is not an authorable key, not because a handler
  // might be missing — `isBlank` already suppresses its label and border
  // above.
  const showAddWedge = !isBlank;
  const showMenuWedge = !isBlank;
  const canFollowNextLayer = cell.nextlayer !== undefined;

  const addWedgeTitle = t({
    id: "editor.assignLoop.keyGrid.cell.addWedgeTitle",
    message: "Add a key after this one (Insert)",
  });
  const menuWedgeTitle = t({
    id: "editor.assignLoop.keyGrid.cell.menuWedgeTitle",
    message: "More commands (Menu key)",
  });
  // A mouse-only hint that this key is double-clickable (FR-021). Not part of
  // the accessible name: `buildCellAriaLabel` already states the key's
  // identity, and the same command is announced by the command menu, so
  // folding "double-click me" into every switch key's label would be noise a
  // keyboard user cannot act on as described.
  const followTitle = t({
    id: "editor.assignLoop.keyGrid.cell.followNextLayerTitle",
    message: "Double-click to go to this key's layer (Ctrl+Enter)",
  });

  /**
   * One click handler for the whole cell, routed by which decorative wedge (if
   * any) was hit — see the module doc, "Why the wedges are `aria-hidden`
   * spans". A click anywhere that is NOT a wedge selects, which keeps the
   * cell's primary action exactly what it was before T111.
   */
  function handleClick(event: ReactMouseEvent<HTMLButtonElement>): void {
    const target = event.target;
    const wedge =
      target instanceof Element
        ? target.closest("[data-key-grid-wedge]")?.getAttribute("data-key-grid-wedge")
        : null;

    if (wedge === WEDGE_ADD) {
      // Selection deliberately does NOT move first: the author asked to add a
      // key after THIS one, and `useKeyCommands`'s keyboard route acts on the
      // already-selected cell, so both routes act on the same anchor.
      onAddKeyAfter(cell);
      return;
    }
    if (wedge === WEDGE_MENU) {
      const rect = event.currentTarget.getBoundingClientRect();
      onOpenCommandMenu(cell, { x: rect.left, y: rect.bottom });
      return;
    }
    onSelect(cell);
  }

  /**
   * Right-click — the same menu the `⋯` wedge and `ContextMenu` open,
   * anchored at the pointer. Always suppresses the browser's own menu and
   * opens ours: `onOpenCommandMenu` is a required prop now, so there is
   * always a menu to put in the browser's place.
   */
  function handleContextMenu(event: ReactMouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    onOpenCommandMenu(cell, { x: event.clientX, y: event.clientY });
  }

  /**
   * Double-click follows the key's "Goes to" layer (FR-021); `Ctrl+Enter` is
   * the keyboard route. Still gated on `nextlayer` alone — a key that
   * switches nowhere has nothing to follow, which is cell state, not a
   * missing handler.
   */
  function handleDoubleClick(): void {
    const { nextlayer } = cell;
    if (nextlayer === undefined) return;
    onFollowNextLayer(cell, nextlayer);
  }

  return (
    <button
      type="button"
      role="gridcell"
      ref={(el) => registerRef(cell.address, el)}
      data-testid={`key-grid-cell-${cell.address}`}
      aria-rowindex={rowIndex}
      aria-colindex={colIndex}
      aria-selected={isSelected}
      tabIndex={isTabbable ? 0 : -1}
      aria-label={ariaLabel}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      // T111: no `draggable`, and no resize handle anywhere below — see the
      // module doc, "Drag-and-drop is deliberately absent".
      title={canFollowNextLayer ? followTitle : undefined}
      style={{
        position: "relative",
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: `${widthPercent}%`,
        boxSizing: "border-box",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: "4px 2px",
        height: 48,
        background: isSelected ? "var(--app-accent-subtle)" : isBlank ? "transparent" : BG_CARD,
        border: `1px solid ${isSelected ? ACCENT : isBlank ? "transparent" : BORDER}`,
        borderRadius: 4,
        color: isBlank ? TEXT_DIM : TEXT_MAIN,
        cursor: "pointer",
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      {!isBlank && (
        <span
          style={{
            fontSize: 13,
            lineHeight: 1,
            fontFamily: FONT_MONO,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {displayLabel}
        </span>
      )}
      {/* The key's own id, always (spec 065 T034, FR-023). Developer shows it;
      without it an author looking at a grid of glyphs cannot tell which key a
      rule is keyed on, which is the single most common thing they need to know
      while editing.

      ADDITIONAL to the codepoint-derived accessible name, never a replacement
      for it (FR-038): `aria-hidden` keeps it out of the accessible tree, where
      `buildCellAriaLabel` already names the id in words alongside the character
      and its U+ notation. Rendering it into the tree as well would make a
      screen reader say the id twice.

      Suppressed on a blank/spacer cell, matching `displayLabel`'s own
      `!isBlank` guard: a suppressed key's id is a sentinel (`T_BLANK`), and
      printing it would draw a label onto a cell whose whole point is to look
      empty. */}
      {!isBlank && (
        <span
          aria-hidden="true"
          data-testid={`key-grid-cell-${cell.address}-id`}
          style={{
            fontSize: 8,
            lineHeight: 1,
            fontFamily: FONT_MONO,
            color: TEXT_DIM,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {cell.id}
        </span>
      )}
      {hasAnnotations && (
        <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1, color: TEXT_DIM }}>
          {cell.annotations.longpress > 0 && `+${cell.annotations.longpress}`}
          {cell.annotations.multitap > 0 && ` x${cell.annotations.multitap}`}
          {cell.annotations.flick > 0 && ` >${cell.annotations.flick}`}
        </span>
      )}
      {hasProvenanceMarker && (
        <span
          aria-hidden="true"
          data-testid={`key-grid-cell-${cell.address}-provenance`}
          style={{
            position: "absolute",
            top: 2,
            left: 3,
            fontSize: 8,
            lineHeight: 1,
            fontWeight: 700,
            color: TEXT_DIM,
          }}
        >
          {cell.provenance === "base-derived" ? "B" : "P"}
        </span>
      )}
      {/* T111's hover wedges (FR-021) — decorative, aria-hidden hit regions,
      NOT nested buttons (see the module doc, "Why the wedges are aria-hidden
      spans"). Rendered only while hovered, and only when the matching
      callback exists, so a cell at rest looks exactly as it did before T111
      and an inert wedge is never shown. `visibility` rather than conditional
      mounting would keep them in the layout; conditional mounting is what
      makes "hover REVEALS" literally true. */}
      {isHovered && showAddWedge && (
        <span
          aria-hidden="true"
          data-key-grid-wedge={WEDGE_ADD}
          data-testid={`key-grid-cell-${cell.address}-add-wedge`}
          title={addWedgeTitle}
          style={{
            position: "absolute",
            bottom: 1,
            left: 2,
            fontSize: 9,
            lineHeight: "11px",
            minWidth: 11,
            textAlign: "center",
            borderRadius: 2,
            fontWeight: 700,
            color: TEXT_DIM,
            border: `1px solid ${BORDER}`,
            background: BG_CARD,
            cursor: "pointer",
          }}
        >
          +
        </span>
      )}
      {isHovered && showMenuWedge && (
        <span
          aria-hidden="true"
          data-key-grid-wedge={WEDGE_MENU}
          data-testid={`key-grid-cell-${cell.address}-menu-wedge`}
          title={menuWedgeTitle}
          style={{
            position: "absolute",
            bottom: 1,
            right: 2,
            fontSize: 9,
            lineHeight: "11px",
            minWidth: 11,
            textAlign: "center",
            borderRadius: 2,
            fontWeight: 700,
            color: TEXT_DIM,
            border: `1px solid ${BORDER}`,
            background: BG_CARD,
            cursor: "pointer",
          }}
        >
          {"⋯"}
        </span>
      )}
      {finding !== undefined && (
        <span
          aria-hidden="true"
          data-testid={`key-grid-cell-${cell.address}-finding-badge`}
          style={{
            position: "absolute",
            top: 2,
            right: 3,
            fontSize: 7,
            lineHeight: "9px",
            width: 9,
            height: 9,
            textAlign: "center",
            borderRadius: 2,
            fontWeight: 700,
            // Dark text on the bright severity-dot fill (finding.color) —
            // var(--app-bg) matches the old literal exactly in the navy
            // theme; see the report's "does not map cleanly" note for the
            // light-theme caveat this shares with the mapping table's other
            // "dark text on a bright fill" cases.
            color: "var(--app-bg)",
            background: finding.color,
          }}
        >
          {finding.letter}
        </span>
      )}
    </button>
  );
}
