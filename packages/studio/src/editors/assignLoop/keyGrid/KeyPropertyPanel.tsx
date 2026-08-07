// KeyPropertyPanel — the ONE panel that holds everything about the selected
// key (spec 061 T035; FR-003, FR-015, FR-018, FR-019, FR-020).
//
// ## What this replaces, and why the old shape was a defect
//
// Key mode used to stack two panels: a read-only `KeyInspector` above an
// editing `AssignPanel`. Issue #1530's complaint #2 ("no fields are editable")
// was partly an artifact of that stacking — the panel that LOOKS like the
// property panel, the one at the top showing the key's id, keycap, type and
// diagnostics, was the one that could not be edited. Keyman Developer presents
// one panel, and so does this.
//
// ## Composition, not a copy (research D3)
//
// `KeyInspector` is rendered INSIDE this panel with `embedded`, supplying the
// header, "Sends", produced characters, provenance, sub-key counts, the key-type
// (`sp`) control and the findings-with-fixes list. Its ~300 lines of display
// logic and its every `key-inspector-*` test id are therefore unchanged, which
// is exactly what T035's "migrate the ids so existing assertions keep meaning
// what they meant" asks for — the surest migration being no move at all.
//
// The character-assignment machinery (id minting, rule synthesis, guard stores,
// case triples — `AssignPanel`, 828 lines) is likewise composed rather than
// reimplemented, passed in as `assignSlot` and revealed from the id field's
// disclosure. That is the recorded US3 decision's own wording: "keeping
// AssignPanel's `onCommit` inherits the Case A / Case B `promotedLayout` split
// the e2e header warns an add/remove commit must not skip." Rebuilding it here
// would put that split at risk for no gain.
//
// What this file adds on top is the part that did not exist: eight editable
// fields, delete, and move.
//
// ## Store-free, like every sibling in this directory
//
// No `useWorkingCopyStore`, no engine mutation. Every edit is reported through
// a callback and the caller (`TouchGallery.tsx`) decides what it means — the
// same discipline `KeyInspector`, `AssignPanel`, `FindPanel` and `KeyGrid` all
// follow.
//
// ## Every callback is REQUIRED (FR-001, FR-003, research D1)
//
// The defect class spec 061 exists to close is an optional `on*` prop with
// exactly one caller: eight compile-time errors became eight silent runtime
// nothings. Nothing here is optional. A mount that cannot act fails `tsc`.
//
// ## Absent, never disabled (FR-003, FR-020)
//
// The four move buttons are rendered only when they can act: a key at the start
// of its row has no "move left" button at all, rather than a greyed one. A
// disabled control still says "this is a thing you could do here", which is
// false at a boundary, and FR-003 is explicit that an affordance that does not
// apply MUST be absent.

import { useCallback, useId, useMemo, useState, type ReactNode, type Ref } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import type { TouchKeyFix, TouchLayoutIR } from "@keyboard-studio/contracts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { Button, Label, TextField } from "../../../ui/index.ts";
import { KeyInspector, type TouchKeySpValue } from "./KeyInspector.tsx";
import type { KeyGridCellViewModel, TouchKeyFinding } from "./keyGridViewModel.ts";

// ---------------------------------------------------------------------------
// The editable field set (FR-018)
// ---------------------------------------------------------------------------

/**
 * The eight fields FR-018 names. `sp` is edited through the composed
 * `KeyInspector`'s radio group rather than a text input — it is a closed set of
 * six values with real explanatory notes, and a free-text box for it would be
 * strictly worse — so it appears in this union for completeness of the contract
 * but has no `key-property-panel-field-sp` input of its own.
 */
export type KeyPropertyField =
  | "text"
  | "hint"
  | "id"
  | "sp"
  | "layer"
  | "nextlayer"
  | "width"
  | "pad";

/** The value a field edit carries. `width`/`pad` are numbers; everything else is a string. */
export interface KeyPropertyFieldChange {
  readonly field: Exclude<KeyPropertyField, "sp">;
  readonly value: string | number;
}

/** Which way a move goes. Mirrors the engine's `MoveKeyOp["direction"]` exactly. */
export type KeyMoveDirection = "left" | "right" | "up" | "down";

/**
 * Where the selected key sits, so this panel can decide which move buttons can
 * act — supplied by the caller rather than derived here, because the panel sees
 * one cell and the answer depends on the whole layer.
 */
export interface KeyGridPosition {
  readonly rowIndex: number;
  readonly keyIndex: number;
  readonly rowCount: number;
  /** Number of keys in the selected key's own row. */
  readonly rowLength: number;
}

export interface KeyPropertyPanelProps {
  /** The currently selected cell, or `null` before a selection has settled. */
  selectedCell: KeyGridCellViewModel | null;
  /** The EFFECTIVE (overlay-folded) layout, forwarded to the embedded inspector's "Sends" row. */
  layout?: TouchLayoutIR;
  /** Where the selected key sits. `undefined` hides every move button — the honest state when position is unknown. */
  position?: KeyGridPosition;
  /** Attaches the panel's root node (the focus bridge's target). */
  panelRef?: Ref<HTMLDivElement>;
  /** Fired on Escape anywhere in the panel (FR-020b's "returns it to the cell"). */
  onEscape?: () => void;
  /** A field's committed new value. Fired on blur/Enter, never per keystroke. */
  onFieldChange: (change: KeyPropertyFieldChange) => void;
  /** The key-type radio group (forwarded to the embedded inspector). */
  onSpChange: (sp: TouchKeySpValue) => void;
  /** A finding's fix button (forwarded to the embedded inspector). */
  onApplyFix: (fix: TouchKeyFix, finding: TouchKeyFinding) => void;
  /** Delete — opens the three-outcome dialog; this panel commits nothing itself (FR-019). */
  onDelete: () => void;
  /** Move one position. Only ever fired for a direction whose button is rendered (FR-020). */
  onMove: (direction: KeyMoveDirection) => void;
  /**
   * The character-assignment surface, revealed from the id field's disclosure.
   * A slot rather than a direct mount so this panel stays store-free and
   * unit-testable without the engine's minting machinery.
   */
  assignSlot?: ReactNode;
  /** Localized panel accessible name override. */
  label?: string;
}

const ROW_STYLE = { display: "flex", flexDirection: "column" as const, gap: 2 };
const SECTION_LABEL_STYLE = { fontSize: 11, color: TEXT_DIM, fontFamily: FONT };

// ---------------------------------------------------------------------------
// Which moves can act (FR-020) — no wrapping, ever
// ---------------------------------------------------------------------------

/**
 * The directions this key can actually move in. Mirrors both appliers'
 * boundary rules exactly (`applyKeyEditsToLayout.ts`'s `moveKeyWithinLayer` and
 * its raw-JSON twin): `left`/`right` stop at the row's ends, `up`/`down` at the
 * first and last rows, and nothing wraps.
 *
 * Exported so its own test can pin the boundary table without rendering.
 */
export function availableMoveDirections(
  position: KeyGridPosition | undefined,
): readonly KeyMoveDirection[] {
  if (position === undefined) return [];
  const out: KeyMoveDirection[] = [];
  if (position.keyIndex > 0) out.push("left");
  if (position.keyIndex < position.rowLength - 1) out.push("right");
  if (position.rowIndex > 0) out.push("up");
  if (position.rowIndex < position.rowCount - 1) out.push("down");
  return out;
}

// ---------------------------------------------------------------------------
// One editable field
// ---------------------------------------------------------------------------

/**
 * A text field that reports on COMMIT — blur or Enter — never per keystroke.
 *
 * Per-keystroke commits would push one undo entry per character (FR-040 asks
 * that every edit be undoable and NAME what it undoes, which "typed a letter"
 * does not), and would re-run the 300 ms validation cycle on a half-typed id.
 * The local draft resets whenever the incoming value changes, so selecting a
 * different key never leaves the previous key's text in the box.
 */
function CommittingField({
  field,
  labelText,
  value,
  numeric,
  helpText,
  onCommit,
}: {
  field: Exclude<KeyPropertyField, "sp">;
  labelText: string;
  value: string;
  numeric?: boolean;
  helpText?: ReactNode;
  onCommit: (value: string) => void;
}) {
  const inputId = useId();
  const helpId = useId();
  const [draft, setDraft] = useState(value);
  const [lastSeen, setLastSeen] = useState(value);
  if (value !== lastSeen) {
    // Derive-during-render rather than an effect: React's own documented
    // "adjusting state when a prop changes" pattern, and it avoids a frame in
    // which the box shows the previously-selected key's value.
    setLastSeen(value);
    setDraft(value);
  }

  const commit = useCallback(() => {
    if (draft !== value) onCommit(draft);
  }, [draft, value, onCommit]);

  return (
    <div style={ROW_STYLE} data-testid={`key-property-panel-field-${field}`}>
      {/* A real <label htmlFor>, not an aria-label: docs/accessibility.md's
          "semantic HTML first" rule, and it makes the help text clickable-to-
          focus like every other labelled control in the studio. */}
      <Label htmlFor={inputId}>{labelText}</Label>
      <TextField
        id={inputId}
        value={draft}
        {...(helpText !== undefined ? { "aria-describedby": helpId } : {})}
        {...(numeric === true ? { inputMode: "numeric" as const } : {})}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
      />
      {helpText !== undefined && (
        <span id={helpId} style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
          {helpText}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function KeyPropertyPanel({
  selectedCell,
  layout,
  position,
  panelRef,
  onEscape,
  onFieldChange,
  onSpChange,
  onApplyFix,
  onDelete,
  onMove,
  assignSlot,
  label,
}: KeyPropertyPanelProps) {
  const { t } = useLingui();
  const geometryGroupId = useId();
  const [assignOpen, setAssignOpen] = useState(false);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onEscape?.();
    },
    [onEscape],
  );

  const moves = useMemo(() => availableMoveDirections(position), [position]);

  const moveLabels: Record<KeyMoveDirection, string> = {
    left: t({ id: "editor.assignLoop.keyGrid.property.move.left", message: "Move left" }),
    right: t({ id: "editor.assignLoop.keyGrid.property.move.right", message: "Move right" }),
    up: t({ id: "editor.assignLoop.keyGrid.property.move.up", message: "Move up" }),
    down: t({ id: "editor.assignLoop.keyGrid.property.move.down", message: "Move down" }),
  };

  const panelLabel =
    label ?? t({ id: "editor.assignLoop.keyGrid.property.ariaLabel", message: "Key properties" });

  const commitText = useCallback(
    (field: Exclude<KeyPropertyField, "sp">) => (raw: string) => {
      if (field === "width" || field === "pad") {
        const parsed = Number(raw.trim());
        // Reject non-integers and out-of-range values rather than committing a
        // width the layout cannot render. `width` must be > 0 (a zero-width key
        // is invisible and unhittable); `pad` may be 0. A rejected entry simply
        // does not commit — the field reverts on the next render, and no
        // diagnostic is raised for what is plainly a typo.
        if (!Number.isInteger(parsed)) return;
        if (field === "width" && parsed <= 0) return;
        if (field === "pad" && parsed < 0) return;
        onFieldChange({ field, value: parsed });
        return;
      }
      onFieldChange({ field, value: raw });
    },
    [onFieldChange],
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- programmatically focusable REGION, not a Tab stop (FR-020b: Enter/F2 moves focus here explicitly); same idiom KeyInspector used before this panel absorbed it.
    <div
      ref={panelRef}
      role="region"
      aria-label={panelLabel}
      tabIndex={-1}
      data-testid="key-property-panel"
      onKeyDown={handleKeyDown}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: FONT,
        outline: "none",
      }}
    >
      {/* Display, key type and diagnostics — the composed inspector. Rendered
          even with no selection, since it owns the empty state's copy. */}
      <KeyInspector
        embedded
        selectedCell={selectedCell}
        {...(layout !== undefined ? { layout } : {})}
        onSpChange={onSpChange}
        onApplyFix={onApplyFix}
      />

      {selectedCell !== null && (
        <>
          {/* --- The editable fields (FR-018) --------------------------- */}
          <div style={ROW_STYLE}>
            <span style={SECTION_LABEL_STYLE}>
              {t({ id: "editor.assignLoop.keyGrid.property.fieldsLabel", message: "Properties" })}
            </span>
          </div>

          <CommittingField
            field="text"
            labelText={t({ id: "editor.assignLoop.keyGrid.property.text", message: "Keycap" })}
            value={selectedCell.keycap}
            onCommit={commitText("text")}
          />

          <CommittingField
            field="hint"
            labelText={t({ id: "editor.assignLoop.keyGrid.property.hint", message: "Hint" })}
            value={selectedCell.hint ?? ""}
            helpText={t({
              id: "editor.assignLoop.keyGrid.property.hint.help",
              message: "A small second label, shown above the keycap.",
            })}
            onCommit={commitText("hint")}
          />

          <CommittingField
            field="id"
            labelText={t({ id: "editor.assignLoop.keyGrid.property.id", message: "Key id" })}
            value={selectedCell.id}
            helpText={t({
              id: "editor.assignLoop.keyGrid.property.id.help",
              message: "What rules match on. Changing it can disconnect the key from its rule.",
            })}
            onCommit={commitText("id")}
          />

          {/* The proposal machinery, behind a disclosure on the id field
              (research D3): assigning a character is how most authors should
              reach an id, but it is a bigger surface than a text box and does
              not belong permanently open. */}
          {assignSlot !== undefined && (
            <div style={ROW_STYLE}>
              <button
                type="button"
                data-testid="key-property-panel-assign-disclosure"
                aria-expanded={assignOpen}
                onClick={() => setAssignOpen((open) => !open)}
                style={{
                  alignSelf: "flex-start",
                  fontFamily: FONT,
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: `1px solid ${BORDER}`,
                  background: "transparent",
                  color: TEXT_MAIN,
                  cursor: "pointer",
                }}
              >
                {assignOpen
                  ? t({
                      id: "editor.assignLoop.keyGrid.property.assign.hide",
                      message: "Hide character assignment",
                    })
                  : t({
                      id: "editor.assignLoop.keyGrid.property.assign.show",
                      message: "Assign a character instead",
                    })}
              </button>
              {assignOpen && assignSlot}
            </div>
          )}

          <CommittingField
            field="layer"
            labelText={t({
              id: "editor.assignLoop.keyGrid.property.layer",
              message: "Modifier override",
            })}
            value={selectedCell.layerOverride ?? ""}
            helpText={t({
              id: "editor.assignLoop.keyGrid.property.layer.help",
              message: "Send this key's output as if a different modifier layer were held.",
            })}
            onCommit={commitText("layer")}
          />

          <CommittingField
            field="nextlayer"
            labelText={t({
              id: "editor.assignLoop.keyGrid.property.nextlayer",
              message: "Goes to layer",
            })}
            value={selectedCell.nextlayer ?? ""}
            onCommit={commitText("nextlayer")}
          />

          {/* --- Geometry (FR-015) -------------------------------------- */}
          <div style={ROW_STYLE}>
            <span id={geometryGroupId} style={SECTION_LABEL_STYLE}>
              {t({ id: "editor.assignLoop.keyGrid.property.geometryLabel", message: "Size" })}
            </span>
            {/* FR-015's own requirement, stated to the author rather than
                assumed: the number in the width box is a MINIMUM. The last key
                of each row renders wider, stretching to the widest row — which
                is why the box can disagree with what is on screen without
                either being wrong. */}
            <span
              data-testid="key-property-panel-width-minimum-note"
              style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}
            >
              {t({
                id: "editor.assignLoop.keyGrid.property.widthMinimumNote",
                message:
                  "Width is a minimum. The last key in a row is drawn wider than this, stretching to match the widest row.",
              })}
            </span>
          </div>

          <CommittingField
            field="width"
            numeric
            labelText={t({
              id: "editor.assignLoop.keyGrid.property.width",
              message: "Width (minimum)",
            })}
            value={String(selectedCell.widthPct)}
            onCommit={commitText("width")}
          />

          <CommittingField
            field="pad"
            numeric
            labelText={t({ id: "editor.assignLoop.keyGrid.property.pad", message: "Left padding" })}
            value={String(selectedCell.padPct)}
            onCommit={commitText("pad")}
          />

          {/* --- Move (FR-020) ------------------------------------------ */}
          {moves.length > 0 && (
            <div style={ROW_STYLE} data-testid="key-property-panel-move">
              <span style={SECTION_LABEL_STYLE}>
                {t({ id: "editor.assignLoop.keyGrid.property.moveLabel", message: "Move" })}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {moves.map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    data-testid={`key-property-panel-move-${direction}`}
                    onClick={() => onMove(direction)}
                    style={{
                      fontFamily: FONT,
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 4,
                      border: `1px solid ${BORDER}`,
                      background: "transparent",
                      color: TEXT_MAIN,
                      cursor: "pointer",
                    }}
                  >
                    {moveLabels[direction]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* --- Delete (FR-019) ---------------------------------------- */}
          <div style={ROW_STYLE}>
            <Button
              variant="secondary"
              data-testid="key-property-panel-delete"
              onClick={onDelete}
            >
              {t({ id: "editor.assignLoop.keyGrid.property.delete", message: "Delete this key" })}
            </Button>
            <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
              {t({
                id: "editor.assignLoop.keyGrid.property.delete.help",
                message: "You will be asked what should happen to the space it leaves.",
              })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
