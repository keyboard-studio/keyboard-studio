// DeadkeyInventory — the spec-083 User Story 2 inventory surface.
//
// Lists every deadkey `listDeadkeys` finds in the working IR — including
// ones the studio didn't create — with id, name, trigger, pair count,
// produced characters, and origin. Actions per row: Pairs, Rename,
// Retarget, Delete (routed to the detail editor).
//
// Honesty rules, enforced here:
// - Imported/unrecognized shapes: Pairs is disabled with the exact note
//   "rule shape not recognized — pair editing unavailable"; retarget and
//   delete stay enabled.
// - id:null (named/opaque dk(name), pre-FR-004): delete/retarget only.
// - Duplicate-id findings (KM_WARN_DUPLICATE_DEADKEY_ID) surface as a
//   visible repair notice with a real minimal repair (re-mint the extra
//   trigger rules via allocateDeadkeyId); the notice says what the repair
//   does and what it can't do (pair attribution).

import { useMemo, type CSSProperties } from "react";
import type { KeyboardIR, DeadkeyInfo } from "@keyboard-studio/contracts";
import { listDeadkeys, validateDeadkeyLifecycle } from "@keyboard-studio/contracts";
import {
  BG_CARD,
  BORDER,
  TEXT_MAIN,
  TEXT_DIM,
  FONT,
} from "../../lib/galleryTheme.ts";
import { withRepairedDuplicateTriggerIds, commitDeadkeyEdit, hex4 } from "./deadkeyWrite.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { DeadkeyOperation } from "../../lib/deadkeyOps.ts";

const headStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  margin: "0 0 12px",
  fontFamily: FONT,
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: TEXT_MAIN,
  margin: 0,
};

const defineBtnStyle: CSSProperties = {
  background: "var(--app-accent)",
  color: "var(--app-text-on-accent)",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: FONT,
};

const cardStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "12px 14px",
  margin: "0 0 10px",
  fontFamily: FONT,
};

const idStyle: CSSProperties = {
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  fontWeight: 700,
  fontSize: 14,
  color: TEXT_MAIN,
};

const tagStyle: CSSProperties = {
  fontSize: 11.5,
  color: TEXT_DIM,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "2px 8px",
  marginLeft: 8,
  whiteSpace: "nowrap",
};

const nameStyle: CSSProperties = {
  fontSize: 13,
  color: TEXT_MAIN,
  marginLeft: 8,
  fontStyle: "italic",
};

const metaStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  margin: "6px 0",
};

const keyChipStyle: CSSProperties = {
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  background: "var(--app-bg)",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  padding: "1px 6px",
  fontSize: 12,
};

const noteStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  margin: "6px 0",
  fontStyle: "italic",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 8,
};

const ghostBtnStyle: CSSProperties = {
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

const ghostBtnDisabledStyle: CSSProperties = {
  ...ghostBtnStyle,
  opacity: 0.45,
  cursor: "not-allowed",
};

const repairStyle: CSSProperties = {
  background: "var(--app-surface)",
  border: `1px solid var(--sil-orange-dark, ${BORDER})`,
  borderRadius: 8,
  padding: "12px 14px",
  margin: "0 0 12px",
  fontFamily: FONT,
  fontSize: 13,
  color: TEXT_MAIN,
};

const repairBtnStyle: CSSProperties = {
  ...ghostBtnStyle,
  marginTop: 8,
};

const footNoteStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  marginTop: 12,
  fontFamily: FONT,
};

const ORIGIN_LABEL: Record<DeadkeyInfo["origin"], string> = {
  studio: "defined in studio",
  "s02-legacy": "legacy codepoint id",
  imported: "imported",
};

/** Distinct produced characters, from the deadkey's output-store items. */
export function producedChars(ir: KeyboardIR, info: DeadkeyInfo): string[] {
  if (info.outputStore === null) return [];
  const store = ir.stores.find((s) => s.name === info.outputStore);
  if (!store) return [];
  const seen: string[] = [];
  for (const item of store.items) {
    if (item.kind === "char" && !seen.includes(item.value)) {
      seen.push(item.value);
    }
  }
  return seen;
}

export interface DeadkeyInventoryProps {
  ir: KeyboardIR;
  /** Open the define flow. */
  onDefine: () => void;
  /** Open the per-deadkey editor for an inventory row. */
  onEdit: (info: DeadkeyInfo) => void;
  /** Commit a repaired IR (duplicate-id repair). */
  onCommitRepair: (nextIr: KeyboardIR) => void;
}

export function DeadkeyInventory({ ir, onDefine, onEdit, onCommitRepair }: DeadkeyInventoryProps) {
  const deadkeys = useMemo(() => listDeadkeys(ir), [ir]);
  const duplicateFindings = useMemo(
    () => validateDeadkeyLifecycle(ir).filter((f) => f.code === "KM_WARN_DUPLICATE_DEADKEY_ID"),
    [ir],
  );

  // Deadkey overlay recording (spec 083 step 1.8): the duplicate-id repair
  // is an immediate commit, paired with its op so projection can replay it.
  const recordDeadkeyOp = useWorkingCopyStore((s) => s.commitDeadkeyOp);
  const repairDuplicates = () => {
    const repaired = withRepairedDuplicateTriggerIds(ir);
    onCommitRepair(commitDeadkeyEdit(ir, repaired));
    const op: DeadkeyOperation = { kind: "repair-duplicate-ids" };
    recordDeadkeyOp(op);
  };

  return (
    <div>
      <div style={headStyle}>
        <h2 style={titleStyle}>
          Deadkeys — {deadkeys.length} in this keyboard
        </h2>
        <button type="button" style={defineBtnStyle} onClick={onDefine}>
          Define new deadkey
        </button>
      </div>

      {duplicateFindings.length > 0 && (
        <div style={repairStyle} role="alert">
          <b>Shared deadkey id{duplicateFindings.length > 1 ? "s" : ""}.</b>{" "}
          {duplicateFindings.map((f) => f.message).join(" ")}
          <br />
          Both triggers arm the same deadkey state today, and the keyboard
          works as-is — repair only if these were meant to be different
          deadkeys. Repair keeps the first trigger rule on the id and gives
          every other trigger rule a fresh id with its own empty fan-out
          stores. Only true trigger rules (one key in, the deadkey out) are
          re-minted — any other rule outputting the same id is left for you
          to inspect. Pairs can&apos;t be attributed to one trigger or the
          other — they stay with the first; add pairs to the repaired
          deadkeys from their editors.
          <br />
          <button type="button" style={repairBtnStyle} onClick={repairDuplicates}>
            Repair: re-assign fresh ids
          </button>
        </div>
      )}

      {deadkeys.map((info) => {
        const idLabel = info.id !== null ? `dk(${hex4(info.id)})` : `dk(${info.name ?? "?"})`;
        const pairsEditable = info.baseStore !== null && info.outputStore !== null;
        const produced = producedChars(ir, info);
        return (
          <div key={idLabel} style={cardStyle}>
            <div>
              <span style={idStyle}>{idLabel}</span>
              {info.authorName !== undefined && (
                <span style={nameStyle}>&ldquo;{info.authorName}&rdquo;</span>
              )}
              <span style={tagStyle}>{ORIGIN_LABEL[info.origin]}</span>
            </div>
            <div style={metaStyle}>
              Trigger{" "}
              <span style={keyChipStyle}>{info.triggerKey ?? "(none found)"}</span>
              {"  "}·{"  "}
              {info.pairCount} pair{info.pairCount === 1 ? "" : "s"}
              {produced.length > 0 && (
                <>
                  {"  "}·{"  "}produces {produced.slice(0, 8).join(" ")}
                  {produced.length > 8 ? " …" : ""}
                </>
              )}
            </div>
            {!pairsEditable && (
              <div style={noteStyle}>rule shape not recognized — pair editing unavailable</div>
            )}
            {info.id === null && (
              <div style={noteStyle}>
                Named deadkey (pre-FR-004): the id is opaque until the codec closure lands — delete and retarget
                only.
              </div>
            )}
            <div style={actionsStyle}>
              <button
                type="button"
                style={pairsEditable && info.id !== null ? ghostBtnStyle : ghostBtnDisabledStyle}
                disabled={!pairsEditable || info.id === null}
                onClick={() => onEdit(info)}
              >
                Pairs
              </button>
              <button
                type="button"
                style={info.id !== null ? ghostBtnStyle : ghostBtnDisabledStyle}
                disabled={info.id === null}
                onClick={() => onEdit(info)}
              >
                Rename
              </button>
              <button type="button" style={ghostBtnStyle} onClick={() => onEdit(info)}>
                Retarget
              </button>
              <button type="button" style={ghostBtnStyle} onClick={() => onEdit(info)}>
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {deadkeys.length === 0 && (
        <div style={noteStyle}>
          No deadkeys in this keyboard yet. Define the first one above.
        </div>
      )}

      <div style={footNoteStyle}>
        Every deadkey in the keyboard is listed here — including ones the studio didn&apos;t create.
      </div>
    </div>
  );
}
