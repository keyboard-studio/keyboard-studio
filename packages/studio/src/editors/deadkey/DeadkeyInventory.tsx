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
// - id:null (named dk(name), typed since #2238): delete/retarget only.
// - Duplicate-id findings (KM_WARN_DUPLICATE_DEADKEY_ID) surface as a
//   visible repair notice with a real minimal repair (re-mint the extra
//   trigger rules via allocateDeadkeyId); the notice says what the repair
//   does and what it can't do (pair attribution).

import { useMemo, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg, plural } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
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
  border: `1px solid var(--app-warning-text, ${BORDER})`,
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

const ORIGIN_LABEL = {
  studio: msg({
    id: "deadkey.inventory.origin.studio",
    message: "defined in studio",
  }),
  "s02-legacy": msg({
    id: "deadkey.inventory.origin.s02Legacy",
    message: "legacy codepoint id",
  }),
  imported: msg({
    id: "deadkey.inventory.origin.imported",
    message: "imported",
  }),
} as const satisfies Record<DeadkeyInfo["origin"], MessageDescriptor>;

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
  onCommitRepair: (nextIr: KeyboardIR, ops: DeadkeyOperation[]) => boolean | "pending" | void;
}

export function DeadkeyInventory({ ir, onDefine, onEdit, onCommitRepair }: DeadkeyInventoryProps) {
  const { t } = useLingui();
  const deadkeys = useMemo(() => listDeadkeys(ir), [ir]);
  const duplicateFindings = useMemo(
    () => validateDeadkeyLifecycle(ir).filter((f) => f.code === "KM_WARN_DUPLICATE_DEADKEY_ID"),
    [ir],
  );

  // Deadkey overlay recording (spec 083 step 1.8): the duplicate-id repair
  // is an immediate commit, paired with its op so projection can replay it.
  const recordDeadkeyOp = useWorkingCopyStore((s) => s.commitDeadkeyOp);
  const duplicateCount = duplicateFindings.length;
  const repairDuplicates = () => {
    const repaired = withRepairedDuplicateTriggerIds(ir);
    const op: DeadkeyOperation = { kind: "repair-duplicate-ids" };
    const written = onCommitRepair(commitDeadkeyEdit(ir, repaired), [op]);
    if (written === false || written === "pending") return;
    recordDeadkeyOp(op);
  };

  return (
    <div>
      <div style={headStyle}>
        <h2 style={titleStyle}>
          <Trans id="deadkey.inventory.title">Deadkeys — {deadkeys.length} in this keyboard</Trans>
        </h2>
        <button type="button" style={defineBtnStyle} onClick={onDefine}>
          <Trans id="deadkey.inventory.defineButton">Define new deadkey</Trans>
        </button>
      </div>

      {duplicateFindings.length > 0 && (
        <div style={repairStyle} role="alert">
          <b>
            {t({
              id: "deadkey.inventory.sharedIdHeading",
              message: plural(duplicateCount, {
                one: "Shared deadkey id.",
                other: "Shared deadkey ids.",
              }),
            })}
          </b>{" "}
          {duplicateFindings.map((f) => f.message).join(" ")}
          <br />
          <Trans id="deadkey.inventory.repairExplanation">
            Both triggers arm the same deadkey state today, and the keyboard
            works as-is — repair only if these were meant to be different
            deadkeys. Repair keeps the first trigger rule on the id and gives
            every other trigger rule a fresh id with its own empty fan-out
            stores. Only true trigger rules (one key in, the deadkey out) are
            re-minted — any other rule outputting the same id is left for you
            to inspect. Pairs can&apos;t be attributed to one trigger or the
            other — they stay with the first; add pairs to the repaired
            deadkeys from their editors.
          </Trans>
          <br />
          <button type="button" style={repairBtnStyle} onClick={repairDuplicates}>
            <Trans id="deadkey.inventory.repairButton">Repair: re-assign fresh ids</Trans>
          </button>
        </div>
      )}

      {deadkeys.map((info) => {
        const idLabel = info.id !== null ? `dk(${hex4(info.id)})` : `dk(${info.name ?? "?"})`;
        const pairsEditable = info.baseStore !== null && info.outputStore !== null;
        const produced = producedChars(ir, info);
        const count = info.pairCount;
        return (
          <div key={idLabel} style={cardStyle}>
            <div>
              <span style={idStyle}>{idLabel}</span>
              {info.authorName !== undefined && (
                <span style={nameStyle}>&ldquo;{info.authorName}&rdquo;</span>
              )}
              <span style={tagStyle}>{t(ORIGIN_LABEL[info.origin])}</span>
            </div>
            <div style={metaStyle}>
              <Trans id="deadkey.inventory.meta.triggerLabel">Trigger</Trans>{" "}
              <span style={keyChipStyle}>
                {info.triggerKey ??
                  t({ id: "deadkey.inventory.meta.noTrigger", message: "(none found)" })}
              </span>
              {"  "}·{"  "}
              {t({
                id: "deadkey.inventory.meta.pairCount",
                message: plural(count, {
                  one: "# pair",
                  other: "# pairs",
                }),
              })}
              {produced.length > 0 && (
                <>
                  {"  "}·{"  "}
                  <Trans id="deadkey.inventory.meta.produces">produces</Trans>{" "}
                  {produced.slice(0, 8).join(" ")}
                  {produced.length > 8 ? " …" : ""}
                </>
              )}
            </div>
            {!pairsEditable && (
              <div style={noteStyle}>
                <Trans id="deadkey.inventory.shapeNote">
                  rule shape not recognized — pair editing unavailable
                </Trans>
              </div>
            )}
            {info.id === null && (
              <div style={noteStyle}>
                <Trans id="deadkey.inventory.namedNote">
                  Named deadkey: carried as dk(name) in the IR — delete and retarget only; pair editing and rename
                  are not available for named deadkeys.
                </Trans>
              </div>
            )}
            <div style={actionsStyle}>
              <button
                type="button"
                style={pairsEditable && info.id !== null ? ghostBtnStyle : ghostBtnDisabledStyle}
                disabled={!pairsEditable || info.id === null}
                onClick={() => onEdit(info)}
              >
                <Trans id="deadkey.inventory.actionPairs">Pairs</Trans>
              </button>
              <button
                type="button"
                style={info.id !== null ? ghostBtnStyle : ghostBtnDisabledStyle}
                disabled={info.id === null}
                onClick={() => onEdit(info)}
              >
                <Trans id="deadkey.inventory.actionRename">Rename</Trans>
              </button>
              <button type="button" style={ghostBtnStyle} onClick={() => onEdit(info)}>
                <Trans id="deadkey.inventory.actionRetarget">Retarget</Trans>
              </button>
              <button type="button" style={ghostBtnStyle} onClick={() => onEdit(info)}>
                <Trans id="deadkey.inventory.actionDelete">Delete</Trans>
              </button>
            </div>
          </div>
        );
      })}

      {deadkeys.length === 0 && (
        <div style={noteStyle}>
          <Trans id="deadkey.inventory.emptyNote">
            No deadkeys in this keyboard yet. Define the first one above.
          </Trans>
        </div>
      )}

      <div style={footNoteStyle}>
        <Trans id="deadkey.inventory.footnote">
          Every deadkey in the keyboard is listed here — including ones the studio didn&apos;t create.
        </Trans>
      </div>
    </div>
  );
}
