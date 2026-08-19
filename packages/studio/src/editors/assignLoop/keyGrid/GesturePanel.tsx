// GesturePanel — longpresses, multitaps and flicks, edited where the key is
// (spec 065 T041; FR-026, FR-027).
//
// ## Why this exists
//
// Before spec 065 the only way to add a longpress or a flick was the CHARACTER
// walk: find the character you want, find the method card that offers it as a
// gesture, apply it. That is the right flow when you are thinking "this language
// needs ɛ"; it is the wrong flow, and a genuinely hard one, when you are looking
// at a key and thinking "this key should long-press to its uppercase". FR-026
// asks for the second flow, on the key you already have selected.
//
// ## All eight flick directions, always listed
//
// The eight compass directions are rendered as a fixed list — every direction,
// present or not, with an add control on the empty ones. An author cannot
// discover that a direction is available if the UI only shows the ones already
// used, and "which flicks does this key have" is exactly the question the panel
// is for. `n`/`ne`/`e`/`se`/`s`/`sw`/`w`/`nw` are the wire vocabulary
// (`TouchKeyIR.flick`'s own keys), not a display invention.
//
// ## Store-free, like every sibling
//
// Nothing here mutates. Every add, edit and remove is reported through a
// callback; `TouchGallery.tsx` turns it into a `setSubKey` / `removeSubKey`
// operation on the ONE `keyEditOverlay` (T042), which is what makes the
// character/key mode toggle lossless — both modes read the same overlay, so
// there is no second write path to drift (FR-028).
//
// ## Every callback is REQUIRED (FR-001, FR-003)
//
// Same rule as `KeyPropertyPanel` and for the same reason: an optional `on*`
// prop with one caller is how spec 063 shipped a complete, unmounted key
// editor. A mount that cannot act fails `tsc`.

import { useCallback, useId, useState, type ReactNode } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import { BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { FONT_MONO } from "../../../ui/theme.ts";
import { Label, TextField } from "../../../ui/index.ts";

/** The three gesture collections a touch key can carry. Matches `SubKeyRef["kind"]`. */
export type GestureKind = "longpress" | "multitap" | "flick";

/**
 * The eight flick directions, in compass order starting north.
 *
 * The wire vocabulary from `TouchKeyIR.flick`, not a display invention — the
 * strings ARE the JSON keys, so a direction rendered here addresses the same
 * entry the appliers write.
 */
export const FLICK_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type FlickDirection = (typeof FLICK_DIRECTIONS)[number];

/** One gesture entry, flattened from whichever collection it came from. */
export interface GestureEntry {
  readonly kind: GestureKind;
  /** The sub-entry's id — for a flick, its direction. */
  readonly id: string;
  readonly keycap: string;
  readonly output: string;
}

/** Which gesture is being edited. `null` means none. */
export interface GestureSelection {
  readonly kind: GestureKind;
  readonly id: string;
}

export interface GesturePanelProps {
  /**
   * The selected key's own sub-entries, or `null` with no key selected. Taken
   * as the IR node rather than the grid's cell view model because the view
   * model summarizes sub-keys as COUNTS (see `keyGridViewModel.ts`) — this
   * panel needs the entries themselves.
   */
  selectedKey: TouchKeyIR | null;
  /** The gesture currently open for editing, if any. */
  selection: GestureSelection | null;
  /** Fired when the author picks a gesture to edit, or clears the selection. */
  onSelectGesture: (selection: GestureSelection | null) => void;
  /**
   * Add a gesture. For `flick` the caller supplies the direction as `id`; for
   * `longpress`/`multitap` this panel mints a placeholder id, since those
   * collections are ordered lists with no natural key.
   */
  onAddGesture: (kind: GestureKind, id: string) => void;
  /** A committed field edit on the selected gesture. Fired on blur/Enter, never per keystroke. */
  onEditGesture: (selection: GestureSelection, fields: { text?: string; output?: string }) => void;
  /** Remove the selected gesture. */
  onRemoveGesture: (selection: GestureSelection) => void;
  /** Localized panel accessible name override. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Reading a key's gestures
// ---------------------------------------------------------------------------

function entryOf(kind: GestureKind, sub: TouchKeyIR, idOverride?: string): GestureEntry {
  return {
    kind,
    id: idOverride ?? sub.id,
    keycap: sub.text ?? "",
    output: sub.output ?? "",
  };
}

/** Every gesture on a key, flattened — longpresses, then multitaps, then flicks. */
export function readGestures(key: TouchKeyIR | null): readonly GestureEntry[] {
  if (key === null) return [];
  const out: GestureEntry[] = [];
  for (const sub of key.sk ?? []) out.push(entryOf("longpress", sub));
  for (const sub of key.multitap ?? []) out.push(entryOf("multitap", sub));
  for (const direction of FLICK_DIRECTIONS) {
    const sub = key.flick?.[direction];
    if (sub !== undefined) out.push(entryOf("flick", sub, direction));
  }
  return out;
}

/**
 * A placeholder id for a new longpress or multitap entry.
 *
 * `sk` and `multitap` are ordered LISTS with no natural key, so an added entry
 * needs an id before the author has typed anything. `T_NEW_*` is Keyman
 * Developer's own auto-mint prefix, and is on contracts'
 * `TOUCH_RULELESS_ID_PREFIXES` exemption list — so a freshly added, not-yet-
 * filled-in gesture does not immediately report itself as a dead key. The
 * author replaces it by typing an output, exactly as they would for a main key.
 */
export function mintGestureId(kind: "longpress" | "multitap", existingCount: number): string {
  return `T_NEW_${kind.toUpperCase()}_${existingCount + 1}`;
}

// ---------------------------------------------------------------------------
// A committing text field (same discipline as KeyPropertyPanel's)
// ---------------------------------------------------------------------------

function CommittingField({
  testId,
  labelText,
  value,
  onCommit,
}: {
  testId: string;
  labelText: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  const [lastSeen, setLastSeen] = useState(value);
  if (value !== lastSeen) {
    setLastSeen(value);
    setDraft(value);
  }
  const commit = useCallback(() => {
    if (draft !== value) onCommit(draft);
  }, [draft, value, onCommit]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid={testId}>
      <Label htmlFor={inputId}>{labelText}</Label>
      <TextField
        id={inputId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

const SECTION_LABEL_STYLE = { fontSize: 11, color: TEXT_DIM, fontFamily: FONT };

const CHIP_STYLE = {
  fontFamily: FONT,
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 4,
  border: `1px solid ${BORDER}`,
  background: "transparent",
  color: TEXT_MAIN,
  cursor: "pointer",
} as const;

function GestureChip({
  entry,
  selected,
  onSelect,
}: {
  entry: GestureEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`gesture-panel-entry-${entry.kind}-${entry.id}`}
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...CHIP_STYLE,
        fontFamily: FONT_MONO,
        borderColor: selected ? TEXT_MAIN : BORDER,
      }}
    >
      {entry.keycap.length > 0 ? entry.keycap : entry.id}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function GesturePanel({
  selectedKey,
  selection,
  onSelectGesture,
  onAddGesture,
  onEditGesture,
  onRemoveGesture,
  label,
}: GesturePanelProps) {
  const { t } = useLingui();

  const gestures = readGestures(selectedKey);
  const longpresses = gestures.filter((g) => g.kind === "longpress");
  const multitaps = gestures.filter((g) => g.kind === "multitap");
  const flicks = gestures.filter((g) => g.kind === "flick");

  const selectedEntry =
    selection === null
      ? undefined
      : gestures.find((g) => g.kind === selection.kind && g.id === selection.id);

  const panelLabel =
    label ?? t({ id: "editor.assignLoop.keyGrid.gesture.ariaLabel", message: "Gestures" });

  const kindLabels: Record<GestureKind, string> = {
    longpress: t({ id: "editor.assignLoop.keyGrid.gesture.longpress", message: "Long press" }),
    multitap: t({ id: "editor.assignLoop.keyGrid.gesture.multitap", message: "Multi-tap" }),
    flick: t({ id: "editor.assignLoop.keyGrid.gesture.flick", message: "Flick" }),
  };

  const section = (
    kind: "longpress" | "multitap",
    entries: readonly GestureEntry[],
  ): ReactNode => (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
      data-testid={`gesture-panel-${kind}`}
    >
      <span style={SECTION_LABEL_STYLE}>{kindLabels[kind]}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {entries.map((entry) => (
          <GestureChip
            key={entry.id}
            entry={entry}
            selected={selection?.kind === entry.kind && selection.id === entry.id}
            onSelect={() => onSelectGesture({ kind: entry.kind, id: entry.id })}
          />
        ))}
        <button
          type="button"
          data-testid={`gesture-panel-add-${kind}`}
          onClick={() => onAddGesture(kind, mintGestureId(kind, entries.length))}
          style={CHIP_STYLE}
        >
          {t({ id: "editor.assignLoop.keyGrid.gesture.add", message: "Add" })}
        </button>
      </div>
    </div>
  );

  if (selectedKey === null) return null;

  return (
    <div
      role="region"
      aria-label={panelLabel}
      data-testid="gesture-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: FONT,
      }}
    >
      {section("longpress", longpresses)}
      {section("multitap", multitaps)}

      {/* All eight directions, always — see the module doc. */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
        data-testid="gesture-panel-flick"
      >
        <span style={SECTION_LABEL_STYLE}>{kindLabels.flick}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FLICK_DIRECTIONS.map((direction) => {
            const entry = flicks.find((g) => g.id === direction);
            return (
              <div
                key={direction}
                data-testid={`gesture-panel-flick-${direction}`}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <span style={{ ...SECTION_LABEL_STYLE, fontFamily: FONT_MONO }}>{direction}</span>
                {entry !== undefined ? (
                  <GestureChip
                    entry={entry}
                    selected={selection?.kind === "flick" && selection.id === direction}
                    onSelect={() => onSelectGesture({ kind: "flick", id: direction })}
                  />
                ) : (
                  <button
                    type="button"
                    data-testid={`gesture-panel-add-flick-${direction}`}
                    onClick={() => onAddGesture("flick", direction)}
                    style={CHIP_STYLE}
                  >
                    {t({ id: "editor.assignLoop.keyGrid.gesture.add", message: "Add" })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* The generic add control T041's id list names. A flick's direction IS
            its identity, so "add a flick" without saying which one is not a
            thing the author can mean — this defaults to the first free
            direction, and is absent when all eight are taken (FR-003). */}
        {flicks.length < FLICK_DIRECTIONS.length && (
          <button
            type="button"
            data-testid="gesture-panel-add-flick"
            onClick={() => {
              const free = FLICK_DIRECTIONS.find((d) => !flicks.some((g) => g.id === d));
              if (free !== undefined) onAddGesture("flick", free);
            }}
            style={{ ...CHIP_STYLE, alignSelf: "flex-start" }}
          >
            {t({
              id: "editor.assignLoop.keyGrid.gesture.addFlick",
              message: "Add a flick",
            })}
          </button>
        )}
      </div>

      {/* --- The selected sub-key's own properties (FR-027) -------------- */}
      {selection !== null && selectedEntry !== undefined && (
        <div
          data-testid="gesture-panel-subkey-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingTop: 8,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <span style={SECTION_LABEL_STYLE}>
            {/* The gesture TYPE, named in words — FR-027's first field. It is
                not editable in place: changing a longpress into a flick is a
                remove plus an add, with a different identity on the other side,
                and presenting it as a field would imply otherwise. */}
            {t({
              id: "editor.assignLoop.keyGrid.gesture.selectedType",
              message: `Editing: ${{ kind: kindLabels[selection.kind] }}`,
            })}
            {selection.kind === "flick" ? ` (${selection.id})` : ""}
          </span>

          <CommittingField
            testId="gesture-panel-subkey-field-text"
            labelText={t({ id: "editor.assignLoop.keyGrid.gesture.keycap", message: "Keycap" })}
            value={selectedEntry.keycap}
            onCommit={(text) => onEditGesture(selection, { text })}
          />

          <CommittingField
            testId="gesture-panel-subkey-field-output"
            labelText={t({ id: "editor.assignLoop.keyGrid.gesture.output", message: "Types" })}
            value={selectedEntry.output}
            onCommit={(output) => onEditGesture(selection, { output })}
          />

          <button
            type="button"
            data-testid="gesture-panel-subkey-remove"
            onClick={() => onRemoveGesture(selection)}
            style={{ ...CHIP_STYLE, alignSelf: "flex-start" }}
          >
            {t({ id: "editor.assignLoop.keyGrid.gesture.remove", message: "Remove this gesture" })}
          </button>
        </div>
      )}
    </div>
  );
}
