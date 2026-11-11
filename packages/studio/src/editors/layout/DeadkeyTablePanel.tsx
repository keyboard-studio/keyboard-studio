// DeadkeyTablePanel -- one deadkey's combination table (spec 117 US3, FR-028, FR-029b).
//
// Fan-out rows (spec 083's shape) are keyed by the base character and shown with the key that
// types it; keystroke-keyed rows are keyed by key and layer. Fan-out rows are written through the
// spec 083 pair operations (`commitLayoutDeadkeyOp`, undo kind `ld`); keystroke-keyed rows through
// `kmn-edits` entries (`commitKmnEdit`, undo kind `l`). One confirm is one undo step. A row that
// uses a store outside the fan-out shape is read-only with "view in code". For a new deadkey the
// space row ("space types the display character") is proposed and written only when the author
// confirms it. The panel starts no timer and calls no compile (decision D3).

import { useId, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { listDeadkeys } from "@keyboard-studio/contracts";
import type { LayerCombo } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { CommitKmnEditResult, KmnEditRefusal } from "../../stores/workingCopyStore.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { codepointLabel } from "../../survey/codepointLabel.ts";
import { buildDeadkeyTable, hexId } from "./deadkeyTable.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

export interface DeadkeyTablePanelProps {
  /** The deadkey, by its id as the keyboard names it in contexts (`0001`). */
  deadkeyId: string;
  /** The layers a keystroke-keyed row can be on. */
  layers: readonly LayerCombo[];
  onViewInCode: (nodeId: string) => void;
  /** Switch the grid to "after this deadkey" (this deadkey, or one a row's result starts). */
  onShowAfter: (deadkeyId: string) => void;
  /** The deadkey was just made: propose its space row. */
  proposeSpaceRow?: boolean;
  /** Close the table. When omitted the panel renders with no close button. */
  onClose?: () => void;
  /** The author explicitly declined the proposed space row ("Do not add it"). */
  onSpaceDismissed?: () => void;
}

export function DeadkeyTablePanel({ deadkeyId, layers, onViewInCode, onShowAfter, proposeSpaceRow = false, onClose, onSpaceDismissed }: DeadkeyTablePanelProps) {
  const { t } = useLingui();
  const copy = useLayoutCopy();
  const ids = { base: useId(), result: useId(), key: useId(), layer: useId(), keyResult: useId() };
  const ir = useWorkingCopyStore((s) => s.ir);

  const [newBase, setNewBase] = useState("");
  const [newResult, setNewResult] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newLayer, setNewLayer] = useState(layers[0] === undefined ? "" : layers[0].join("+"));
  const [newKeyResult, setNewKeyResult] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [spaceDismissed, setSpaceDismissed] = useState(false);
  const [problem, setProblem] = useState<KmnEditRefusal | "no-key" | null>(null);

  const table = useMemo(() => {
    if (ir === null) return null;
    const info = listDeadkeys(ir).find(
      (d) => (d.id !== null ? hexId(d.id) : d.name)?.toLowerCase() === deadkeyId.toLowerCase(),
    );
    return info === undefined ? null : buildDeadkeyTable(ir, info, layers);
  }, [ir, deadkeyId, layers]);

  if (table === null) return null;
  const { info } = table;
  const numericId = info.id;
  const dkContext = [{ kind: "deadkey", deadkeyId: table.deadkeyId }] as const;
  const display = info.displayChar ?? "";
  const hasSpacePair = table.fanout.some((r) => r.base === " ");
  const showSpace =
    proposeSpaceRow && !spaceDismissed && !hasSpacePair && display !== "" && numericId !== null && info.baseStore !== null;

  function after(result: CommitKmnEditResult): void {
    setProblem(result.ok ? null : result.reason);
  }

  function addPair(base: string, accented: string): void {
    if (numericId === null) return;
    const result = useWorkingCopyStore.getState().commitLayoutDeadkeyOp({ kind: "add-pair", id: numericId, base, accented });
    after(result);
    if (result.ok) {
      setNewBase("");
      setNewResult("");
    }
  }

  function changePair(index: number, base: string, accented: string): void {
    if (numericId === null) return;
    after(
      useWorkingCopyStore.getState().commitLayoutDeadkeyOp([
        { kind: "remove-pair", id: numericId, index },
        { kind: "insert-pair", id: numericId, index, base, accented },
      ]),
    );
  }

  function removePair(index: number): void {
    if (numericId === null) return;
    after(useWorkingCopyStore.getState().commitLayoutDeadkeyOp({ kind: "remove-pair", id: numericId, index }));
  }

  function setRow(vkey: string, layer: LayerCombo, text: string): boolean {
    const result = useWorkingCopyStore.getState().commitKmnEdit({
      op: "set-row",
      vkey,
      layer,
      context: dkContext,
      becomes: text === "" ? { kind: "nul" } : [{ kind: "text", text }],
    });
    after(result);
    return result.ok;
  }

  function removeRow(vkey: string, layer: LayerCombo): void {
    after(useWorkingCopyStore.getState().commitKmnEdit({ op: "remove-row", vkey, layer, context: dkContext }));
  }

  function addKeyRow(): void {
    const name = newKey.trim().toUpperCase().replace(/^K_/, "");
    if (name === "") {
      setProblem("no-key");
      return;
    }
    const layer = layers.find((l) => l.join("+") === newLayer) ?? [];
    if (setRow(`K_${name}`, layer, newKeyResult)) {
      setNewKey("");
      setNewKeyResult("");
    }
  }

  function problemText(reason: KmnEditRefusal | "no-key"): string {
    switch (reason) {
      case "no-key":
        return t({ id: "editor.layout.deadkey.table.noKey", message: "Enter the key this combination is typed on." });
      case "locked":
        return t({ id: "editor.layout.deadkey.table.refusedLocked", message: "This desktop layout is complete, so combinations cannot be changed here." });
      case "not-compiled":
        return t({ id: "editor.layout.deadkey.table.refusedNotCompiled", message: "The keyboard has not compiled, so the change was not made. Fix the compile errors first." });
      case "read-only":
        return t({ id: "editor.layout.deadkey.table.refusedReadOnly", message: "This row is read-only, so the change was not made. You can change it in the Code tab." });
      case "no-working-copy":
        return t({ id: "editor.layout.deadkey.table.refusedNoKeyboard", message: "There is no keyboard to change yet." });
      case "refused":
        return t({ id: "editor.layout.deadkey.table.refusedOther", message: "The keyboard code cannot take this change here. You can change it in the Code tab." });
    }
  }

  const heading = t({
    id: "editor.layout.deadkey.table.heading",
    message: `Combinations after deadkey ${{ name: display !== "" ? display : table.deadkeyId }}`,
  });
  const spaceName = t({ id: "editor.layout.deadkey.table.spaceName", message: "Space" });

  return (
    <section aria-label={heading} data-testid="deadkey-table-panel" style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }}>{heading}</h4>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            data-testid="deadkey-table-close"
            className="ks-focus-ring ks-hit-target ks-press"
            style={buttonStyle}
          >
            {t({ id: "editor.layout.deadkey.table.close", message: "Close" })}
          </button>
        )}
      </div>

      {table.empty && !showSpace && (
        <p role="status" style={noteStyle} data-testid="deadkey-table-empty">
          {t({
            id: "editor.layout.deadkey.table.empty",
            message: "This deadkey has no combinations yet. On its own it only swallows the next keystroke's deadkey state.",
          })}
        </p>
      )}

      <button
        type="button"
        onClick={() => onShowAfter(table.deadkeyId)}
        data-testid="deadkey-table-show-after"
        className="ks-focus-ring ks-hit-target ks-press"
        style={buttonStyle}
      >
        {t({ id: "editor.layout.deadkey.table.showAfter", message: "Show every key after this deadkey" })}
      </button>

      {showSpace && (
        <div
          role="group"
          aria-label={t({ id: "editor.layout.deadkey.table.spaceAria", message: "Proposed space row" })}
          data-testid="deadkey-table-space-proposal"
          style={noteBoxStyle}
        >
          <p style={{ margin: 0 }}>
            {t({
              id: "editor.layout.deadkey.table.spaceProposal",
              message: `Proposed: Space after this deadkey types ${{ text: display }}, so typing the deadkey then Space gives the accent itself.`,
            })}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => addPair(" ", display)}
              data-testid="deadkey-table-space-confirm"
              className="ks-focus-ring ks-hit-target ks-press"
              style={buttonStyle}
            >
              {t({ id: "editor.layout.deadkey.table.spaceConfirm", message: "Add the space row" })}
            </button>
            <button
              type="button"
              onClick={() => {
                setSpaceDismissed(true);
                onSpaceDismissed?.();
              }}
              data-testid="deadkey-table-space-remove"
              className="ks-focus-ring ks-hit-target ks-press"
              style={buttonStyle}
            >
              {t({ id: "editor.layout.deadkey.table.spaceRemove", message: "Do not add it" })}
            </button>
          </div>
        </div>
      )}

      {table.fanout.length > 0 && (
        <ul style={listStyle} data-testid="deadkey-table-fanout">
          {table.fanout.map((row) => {
            const key = `f${row.index}`;
            const value = edits[key] ?? row.result;
            const baseName = row.base === " " ? spaceName : row.base;
            return (
              <li key={key} style={rowStyle} data-testid="deadkey-table-fanout-row">
                <span>
                  {row.typedBy === null
                    ? t({ id: "editor.layout.deadkey.table.fanoutRowNoKey", message: `${{ base: baseName }} becomes` })
                    : t({
                        id: "editor.layout.deadkey.table.fanoutRow",
                        message: `${{ base: baseName }} (key ${{ key: row.typedBy.vkey.replace(/^K_/, "") }}, ${{ layer: copy.layerName(row.typedBy.layer) }}) becomes`,
                      })}
                </span>
                <input
                  type="text"
                  value={value}
                  aria-label={t({ id: "editor.layout.deadkey.table.resultAria", message: `Result for ${{ base: baseName }}` })}
                  onChange={(e) => setEdits((p) => ({ ...p, [key]: e.target.value }))}
                  data-testid="deadkey-table-fanout-result"
                  className="ks-focus-ring"
                  style={inputStyle}
                />
                <button
                  type="button"
                  disabled={value === "" || value === row.result}
                  onClick={() => changePair(row.index, row.base, value.normalize("NFC"))}
                  data-testid="deadkey-table-fanout-change"
                  className="ks-focus-ring ks-hit-target ks-press"
                  style={buttonStyle}
                >
                  {t({ id: "editor.layout.deadkey.table.change", message: "Change" })}
                </button>
                <button
                  type="button"
                  onClick={() => removePair(row.index)}
                  data-testid="deadkey-table-fanout-remove"
                  className="ks-focus-ring ks-hit-target ks-press"
                  style={buttonStyle}
                >
                  {t({ id: "editor.layout.deadkey.table.remove", message: "Remove" })}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {table.keystroke.length > 0 && (
        <ul style={listStyle} data-testid="deadkey-table-keystroke">
          {table.keystroke.map((row) => {
            const key = `k${row.ruleNodeId}`;
            const value = edits[key] ?? row.result;
            const keyName = row.vkey.replace(/^K_/, "");
            return (
              <li key={key} style={rowStyle} data-testid="deadkey-table-keystroke-row">
                <span>
                  {t({ id: "editor.layout.deadkey.table.keystrokeRow", message: `Key ${{ key: keyName }} (${{ layer: copy.layerName(row.layer) }}) becomes` })}
                </span>
                {row.editable && row.followsDeadkeyId === null ? (
                  <>
                    <input
                      type="text"
                      value={value}
                      aria-label={t({ id: "editor.layout.deadkey.table.keystrokeResultAria", message: `Result for key ${{ key: keyName }}` })}
                      onChange={(e) => setEdits((p) => ({ ...p, [key]: e.target.value }))}
                      data-testid="deadkey-table-keystroke-result"
                      className="ks-focus-ring"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      disabled={value === row.result}
                      onClick={() => setRow(row.vkey, row.layer, value.normalize("NFC"))}
                      data-testid="deadkey-table-keystroke-change"
                      className="ks-focus-ring ks-hit-target ks-press"
                      style={buttonStyle}
                    >
                      {t({ id: "editor.layout.deadkey.table.change", message: "Change" })}
                    </button>
                  </>
                ) : (
                  <span data-testid="deadkey-table-keystroke-readonly-result">
                    {row.nothing ? t({ id: "editor.layout.deadkey.table.nothing", message: "nothing" }) : row.result}
                  </span>
                )}
                {row.editable && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.vkey, row.layer)}
                    data-testid="deadkey-table-keystroke-remove"
                    className="ks-focus-ring ks-hit-target ks-press"
                    style={buttonStyle}
                  >
                    {t({ id: "editor.layout.deadkey.table.remove", message: "Remove" })}
                  </button>
                )}
                {row.followsDeadkeyId !== null && (
                  <button
                    type="button"
                    onClick={() => onShowAfter(row.followsDeadkeyId!)}
                    data-testid="deadkey-table-follow"
                    className="ks-focus-ring ks-hit-target ks-press"
                    style={buttonStyle}
                  >
                    {t({ id: "editor.layout.deadkey.table.follow", message: `Show keys after ${{ id: row.followsDeadkeyId }}` })}
                  </button>
                )}
                {!row.editable && (
                  <>
                    <span data-testid="deadkey-table-keystroke-reason" style={{ color: TEXT_DIM }}>
                      {row.readOnlyReason === undefined ? "" : copy.readOnlyReasonText(row.readOnlyReason)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onViewInCode(row.ruleNodeId)}
                      data-testid="deadkey-table-view-in-code"
                      className="ks-focus-ring ks-hit-target ks-press"
                      style={linkButtonStyle}
                    >
                      {t({ id: "editor.layout.deadkey.table.viewInCode", message: "View in code" })}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {info.baseStore !== null && numericId !== null ? (
        <div style={rowStyle} role="group" aria-label={t({ id: "editor.layout.deadkey.table.addAria", message: "Add a combination" })}>
          <label htmlFor={ids.base} style={labelStyle}>
            {t({ id: "editor.layout.deadkey.table.addBase", message: "Character typed after the deadkey" })}
          </label>
          <input
            id={ids.base}
            type="text"
            value={newBase}
            onChange={(e) => setNewBase(e.target.value)}
            data-testid="deadkey-table-add-base"
            className="ks-focus-ring"
            style={inputStyle}
          />
          <label htmlFor={ids.result} style={labelStyle}>
            {t({ id: "editor.layout.deadkey.table.addResult", message: "It becomes" })}
          </label>
          <input
            id={ids.result}
            type="text"
            value={newResult}
            onChange={(e) => setNewResult(e.target.value)}
            data-testid="deadkey-table-add-result"
            className="ks-focus-ring"
            style={inputStyle}
          />
          <button
            type="button"
            disabled={Array.from(newBase).length !== 1 || newResult === ""}
            onClick={() => addPair(newBase.normalize("NFC"), newResult.normalize("NFC"))}
            data-testid="deadkey-table-add"
            className="ks-focus-ring ks-hit-target ks-press"
            style={buttonStyle}
          >
            {t({ id: "editor.layout.deadkey.table.add", message: "Add combination" })}
          </button>
          {newBase !== "" && newResult !== "" && Array.from(newBase).length === 1 && (
            <span style={{ color: TEXT_DIM }} data-testid="deadkey-table-add-preview">
              {`${codepointLabel(newBase).title} -> ${Array.from(newResult.normalize("NFC"))
                .map((c) => codepointLabel(c).title)
                .join(" ")}`}
            </span>
          )}
        </div>
      ) : (
        <div style={rowStyle} role="group" aria-label={t({ id: "editor.layout.deadkey.table.addKeyAria", message: "Add a combination by key" })}>
          <label htmlFor={ids.key} style={labelStyle}>
            {t({ id: "editor.layout.deadkey.table.addKey", message: "Key typed after the deadkey (for example E)" })}
          </label>
          <input
            id={ids.key}
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            data-testid="deadkey-table-add-key"
            className="ks-focus-ring"
            style={inputStyle}
          />
          <label htmlFor={ids.layer} style={labelStyle}>
            {t({ id: "editor.layout.deadkey.table.addLayer", message: "Layer" })}
          </label>
          <select
            id={ids.layer}
            value={newLayer}
            onChange={(e) => setNewLayer(e.target.value)}
            data-testid="deadkey-table-add-layer"
            className="ks-focus-ring"
            style={inputStyle}
          >
            {layers.map((l) => (
              <option key={l.join("+")} value={l.join("+")}>
                {copy.layerName(l)}
              </option>
            ))}
          </select>
          <label htmlFor={ids.keyResult} style={labelStyle}>
            {t({ id: "editor.layout.deadkey.table.addResult", message: "It becomes" })}
          </label>
          <input
            id={ids.keyResult}
            type="text"
            value={newKeyResult}
            onChange={(e) => setNewKeyResult(e.target.value)}
            data-testid="deadkey-table-add-key-result"
            className="ks-focus-ring"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={addKeyRow}
            data-testid="deadkey-table-add-key-row"
            className="ks-focus-ring ks-hit-target ks-press"
            style={buttonStyle}
          >
            {t({ id: "editor.layout.deadkey.table.add", message: "Add combination" })}
          </button>
        </div>
      )}

      {problem !== null && (
        <p role="alert" style={noteStyle} data-testid="deadkey-table-problem">
          {problemText(problem)}
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
const noteBoxStyle = {
  ...noteStyle,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "6px 8px",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
} as const;
const listStyle = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 } as const;
const rowStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13, color: TEXT_MAIN } as const;
const labelStyle = { fontSize: 12, color: TEXT_DIM } as const;
const inputStyle = {
  padding: "4px 8px",
  fontSize: 14,
  fontFamily: FONT,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  width: 96,
} as const;
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
const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--app-accent-text)",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: FONT,
} as const;
