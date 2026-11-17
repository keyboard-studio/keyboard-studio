// DeadkeyList -- every deadkey the keyboard defines (spec 117 US3, FR-028, edge cases).
//
// A deadkey on several keys or layers is one entry with one table; a deadkey on no key is listed
// so it can be placed on the selected key or deleted (deleting goes through the spec 083 lifecycle,
// and cannot be undone here); a deadkey with no combinations yet is flagged. Reads the working IR
// and the static attribution of each layer; it starts no timer (decision D3).
//
// The rows sit behind a disclosure, collapsed by default: they used to render unprompted at the
// bottom of the pane, in the initial viewport, for a keyboard that already shows its deadkeys on
// the grid. A keyboard with no deadkeys says so directly — a disclosure with a count of zero
// adds a click for nothing.

import { useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { listDeadkeys } from "@keyboard-studio/contracts";
import type { LayerCombo } from "@keyboard-studio/contracts";
import { attributeLayer } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { selectLayoutIr } from "./layoutIr.ts";
import type { KmnEditRefusal } from "../../stores/workingCopyStore.ts";
import { completeDeadkeysStep } from "../../lib/mechanismStepCompletion.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { buildDeadkeyTable, deadkeyRefOf } from "./deadkeyTable.ts";
import { DESKTOP_VKEYS } from "./useLayoutAttribution.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

export interface DeadkeyListProps {
  layers: readonly LayerCombo[];
  /** The deadkey whose table is open, by its id as contexts name it. */
  openId: string | null;
  /** The selected grid cell, when the author has one: a deadkey on no key can be placed on it. */
  selectedCell: DesktopCellViewModel | null;
  onOpen: (deadkeyId: string) => void;
  /** A deadkey was deleted: close its table if it was open. */
  onDeleted: (deadkeyId: string) => void;
  /** Controlled disclosure state; when omitted the list manages its own collapsed state. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function DeadkeyList({ layers, openId, selectedCell, onOpen, onDeleted, expanded: expandedProp, onExpandedChange }: DeadkeyListProps) {
  const { t } = useLingui();
  const copy = useLayoutCopy();
  const ir = useWorkingCopyStore(selectLayoutIr);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [problem, setProblem] = useState<KmnEditRefusal | null>(null);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  function setExpanded(next: boolean): void {
    onExpandedChange?.(next);
    if (expandedProp === undefined) setInternalExpanded(next);
  }

  const entries = useMemo(() => {
    if (ir === null) return [];
    const attributed = layers.map((layer) => ({ layer, cells: attributeLayer(ir, layer, DESKTOP_VKEYS) }));
    const out = [];
    for (const info of listDeadkeys(ir)) {
      const ref = deadkeyRefOf(info);
      if (ref === null) continue;
      const placements: Array<{ vkey: string; layer: LayerCombo }> = [];
      for (const { layer, cells } of attributed) {
        for (const cell of cells) {
          const o = cell.plain?.output;
          if (o !== null && o !== undefined && !Array.isArray(o) && "kind" in o && o.kind === "deadkey" && o.deadkeyId.toLowerCase() === ref.toLowerCase()) {
            placements.push({ vkey: cell.vkey, layer });
          }
        }
      }
      const table = buildDeadkeyTable(ir, info, layers);
      out.push({ info, ref, placements, empty: table?.empty ?? true });
    }
    return out;
  }, [ir, layers]);

  function place(ref: string): void {
    if (selectedCell === null || !selectedCell.editable) return;
    // The step completes once the key is in the file: now, or on agreement when asked first.
    const result = useWorkingCopyStore.getState().commitKmnEdit(
      { op: "set-key", vkey: selectedCell.vkey, layer: selectedCell.layer, output: { kind: "deadkey", deadkeyId: ref } },
      { onAppliedLater: completeDeadkeysStep },
    );
    if (result.ok && result.pending !== true) completeDeadkeysStep();
    setProblem(result.ok ? null : result.reason);
  }

  function remove(id: number, ref: string): void {
    const result = useWorkingCopyStore.getState().commitLayoutDeadkeyOp({ kind: "delete", id }, { onAppliedLater: () => onDeleted(ref) });
    setConfirmDelete(null);
    setProblem(result.ok ? null : result.reason);
    if (result.ok && result.pending !== true) onDeleted(ref);
  }

  if (ir === null) return null;
  const heading = t({ id: "editor.layout.deadkey.list.heading", message: "Deadkeys in this keyboard" });

  if (entries.length === 0) {
    return (
      <section aria-label={heading} data-testid="deadkey-list" style={panelStyle}>
        <h4 style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }}>{heading}</h4>
        <p style={noteStyle} data-testid="deadkey-list-empty">
          {t({ id: "editor.layout.deadkey.list.none", message: "This keyboard has no deadkeys yet. Select a key and choose to make it a deadkey." })}
        </p>
      </section>
    );
  }

  const toggleLabel = expanded
    ? t({ id: "editor.layout.deadkey.list.hide", message: "Hide deadkeys" })
    : t({
        id: "editor.layout.deadkey.list.show",
        message: plural(entries.length, { one: "Show # deadkey", other: "Show # deadkeys" }),
      });

  return (
    <section aria-label={heading} data-testid="deadkey-list" style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }}>{heading}</h4>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="deadkey-list-entries"
          data-testid="deadkey-list-toggle"
          className="ks-focus-ring ks-hit-target ks-press"
          style={buttonStyle}
        >
          {toggleLabel}
        </button>
      </div>
      {expanded && (
        <ul id="deadkey-list-entries" style={listStyle}>
          {entries.map(({ info, ref, placements, empty }) => {
            const name = info.displayChar ?? ref;
            return (
              <li key={ref} style={rowStyle} data-testid="deadkey-list-item" data-deadkey={ref} aria-current={openId === ref ? "true" : undefined}>
                <strong>{name}</strong>
                <span style={{ color: TEXT_DIM }}>{`dk(${ref})`}</span>
                {placements.length > 0 ? (
                  <span data-testid="deadkey-list-keys">
                    {placements
                      .map((p) => `${p.vkey.replace(/^K_/, "")} (${copy.layerName(p.layer)})`)
                      .join(", ")}
                  </span>
                ) : (
                  <span data-testid="deadkey-list-unplaced" style={{ color: TEXT_DIM }}>
                    {t({ id: "editor.layout.deadkey.list.noKey", message: "on no key" })}
                  </span>
                )}
                {empty && (
                  <span role="status" data-testid="deadkey-list-empty-flag">
                    {t({ id: "editor.layout.deadkey.list.noCombinations", message: "no combinations yet" })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onOpen(ref)}
                  data-testid="deadkey-list-open"
                  className="ks-focus-ring ks-hit-target ks-press"
                  style={buttonStyle}
                >
                  {t({ id: "editor.layout.deadkey.list.open", message: "Open its table" })}
                </button>
                {placements.length === 0 && (
                  <button
                    type="button"
                    disabled={selectedCell === null || !selectedCell.editable}
                    onClick={() => place(ref)}
                    data-testid="deadkey-list-place"
                    className="ks-focus-ring ks-hit-target ks-press"
                    style={buttonStyle}
                  >
                    {t({ id: "editor.layout.deadkey.list.place", message: "Place on the selected key" })}
                  </button>
                )}
                {info.id !== null &&
                  (confirmDelete === ref ? (
                    <span role="group" aria-label={t({ id: "editor.layout.deadkey.list.deleteAria", message: "Confirm deleting this deadkey" })} style={rowStyle}>
                      <span>{t({ id: "editor.layout.deadkey.list.deleteWarn", message: "Delete it with all its combinations? This cannot be undone here." })}</span>
                      <button type="button" onClick={() => remove(info.id!, ref)} data-testid="deadkey-list-delete-confirm" className="ks-focus-ring ks-hit-target ks-press" style={buttonStyle}>
                        {t({ id: "editor.layout.deadkey.list.deleteConfirm", message: "Delete" })}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)} data-testid="deadkey-list-delete-cancel" className="ks-focus-ring ks-hit-target ks-press" style={buttonStyle}>
                        {t({ id: "editor.layout.deadkey.list.deleteCancel", message: "Keep it" })}
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(ref)} data-testid="deadkey-list-delete" className="ks-focus-ring ks-hit-target ks-press" style={buttonStyle}>
                      {t({ id: "editor.layout.deadkey.list.delete", message: "Delete" })}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {problem !== null && (
        <p role="alert" style={noteStyle} data-testid="deadkey-list-problem">
          {problem === "no-host"
            ? t({ id: "editor.layout.deadkey.list.refusedNoHost", message: "The change needs your agreement, but nothing could ask you, so it was not made. Your files are unchanged." })
            : t({ id: "editor.layout.deadkey.list.refused", message: "The keyboard could not take that change. It may be locked, not compiled yet, or read-only here." })}
        </p>
      )}
    </section>
  );
}

const panelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: BG_CARD,
  fontFamily: FONT,
} as const;
const noteStyle = { margin: 0, fontSize: 13, color: TEXT_MAIN, lineHeight: 1.5 } as const;
const listStyle = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 } as const;
const rowStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13, color: TEXT_MAIN } as const;
const buttonStyle = {
  padding: "4px 10px",
  fontSize: 12,
  fontFamily: FONT,
  cursor: "pointer",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: "transparent",
  color: TEXT_MAIN,
} as const;
