// KeyEditPanel -- change what one key types in one layer (spec 117 US2, FR-020..FR-026).
//
// The author picks a key (the grid), types or picks the new text (or chooses "nothing"), reads
// the preview, and confirms: select, enter, confirm is three interactions (SC-005). One confirm
// is one `kmn-edits` entry (plus, in the same confirm, the accepted case partner and an optional
// way to keep a displaced character typeable). The panel writes only through the working-copy
// store's `commitKmnEdit`; it never touches .kmn text or the compiler (decision D3: it starts no
// timer). Content-team copy (FR-041).
//
// The deadkey option (spec 117 US3, FR-027) makes the key start a deadkey. A NEW deadkey goes
// through spec 083's lifecycle (`commitLayoutDeadkeyOp`, a `define` op, with its disclosure of
// what the key does on the likely base keyboards); when the key already types something, the
// lifecycle puts the new trigger ahead of that rule, so one confirm is one undo step and the
// trigger keeps its authorship marker. An EXISTING deadkey is a `set-key` entry with a deadkey
// output. Either way the confirm
// records `deadkeys-defined` with the current op list (an edit is a decision; recording does not
// rebuild, research R12 addendum).

import { useId, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { allocateDeadkeyId, listDeadkeys } from "@keyboard-studio/contracts";
import type { KmnEdit, LayerCombo } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { CommitKmnEditResult, KmnEditInput, KmnEditRefusal } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { completeDeadkeysStep } from "../../lib/mechanismStepCompletion.ts";
import { referenceBases } from "../../lib/referenceBases/index.ts";
import { BaseDisclosure } from "../deadkey/BaseDisclosure.tsx";
import { deadkeyRefOf, hexId } from "./deadkeyTable.ts";
import { selectDesktopAssignments } from "../../lib/unimplementedInventory.ts";
import { buildSlotOccupancy, slotKeyFor } from "../../survey/slotOccupancy.ts";
import { codepointLabel } from "../../survey/codepointLabel.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { casePartnerFor } from "./casePartner.ts";
import { keyFirstDisplacementFor } from "./keyFirstDisplacement.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

export interface KeyEditPanelProps {
  cell: DesktopCellViewModel;
  /** Switch to the Code tab with this rule in view (a refused edit points the author there). */
  onViewInCode: (nodeId: string) => void;
  /** Called after an edit was committed. */
  onCommitted?: (result: Extract<CommitKmnEditResult, { ok: true }>) => void;
  /** A new deadkey was defined on this key: open its table with the space row proposed. */
  onDeadkeyDefined?: (deadkeyId: string) => void;
}

const NEW_DEADKEY = "__new__";
const NO_ENTRIES: readonly KmnEdit[] = [];
const NO_STRINGS: readonly string[] = [];

export function KeyEditPanel({ cell, onViewInCode, onCommitted, onDeadkeyDefined }: KeyEditPanelProps) {
  const { t } = useLingui();
  const copy = useLayoutCopy();
  const ids = { text: useId(), inventory: useId(), nothing: useId(), partner: useId(), keep: useId(), deadkey: useId(), target: useId(), display: useId() };

  const ir = useWorkingCopyStore((s) => s.ir);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const declined = useWorkingCopyStore((s) => s.displacedDeclined);
  const entries = useDecisionStore(
    (s) => (s.decisions["kmn-edits"]?.value as { entries: KmnEdit[] } | undefined)?.entries ?? NO_ENTRIES,
  );
  const inventory = useDecisionStore(
    (s) => (s.decisions["character-inventory"]?.value as string[] | undefined) ?? NO_STRINGS,
  );

  const [text, setText] = useState("");
  const [nothing, setNothing] = useState(false);
  const [acceptPartner, setAcceptPartner] = useState(true);
  const [keepDisplaced, setKeepDisplaced] = useState(true);
  const [refusal, setRefusal] = useState<KmnEditRefusal | null>(null);
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [deadkeyMode, setDeadkeyMode] = useState(false);
  const [target, setTarget] = useState(NEW_DEADKEY);
  const [displayText, setDisplayText] = useState("");

  const layer: LayerCombo = cell.layer;
  const incoming = text.normalize("NFC");
  const existingDeadkeys = useMemo(
    () =>
      ir === null
        ? []
        : listDeadkeys(ir).flatMap((info) => {
            const ref = deadkeyRefOf(info);
            return ref === null ? [] : [{ ref, label: info.displayChar ?? ref }];
          }),
    [ir],
  );
  // The proposed display character: what the key types now, when that is one character.
  const proposedDisplay = cell.display !== null && Array.from(cell.display).length === 1 ? cell.display : "";
  const displayChar = (displayText !== "" ? displayText : proposedDisplay).normalize("NFC");
  const makesNew = deadkeyMode && target === NEW_DEADKEY;
  const hasInput = deadkeyMode ? !makesNew || displayChar !== "" : nothing || incoming !== "";
  const hosts = useMemo(
    () => (makesNew ? referenceBases({ key: cell.vkey, modifiers: [...layer] }) : null),
    [makesNew, cell.vkey, layer],
  );

  const displacement = useMemo(
    () =>
      ir === null || nothing || incoming === ""
        ? null
        : keyFirstDisplacementFor(ir, cell.vkey, layer, incoming, { declined, kmnEdits: entries }),
    [ir, nothing, incoming, cell.vkey, layer, declined, entries],
  );

  const partner = useMemo(
    () =>
      ir === null || nothing || incoming === ""
        ? null
        : casePartnerFor({ ir, vkey: cell.vkey, layer, text: incoming, entries }),
    [ir, nothing, incoming, cell.vkey, layer, entries],
  );

  // An Assign-tab assignment on this slot: replacing it needs an explicit second step.
  const overridesAssignment = useMemo(() => {
    if (ir === null) return false;
    const occupant = buildSlotOccupancy(ir, selectDesktopAssignments(phaseResults)).get(slotKeyFor(cell.vkey, layer));
    return occupant?.source === "session";
  }, [ir, phaseResults, cell.vkey, layer]);

  // The displaced character can only be kept on AltGr when that slot is free and is not this layer.
  const altgrLayer = useMemo(
    () => ([...layer.filter((x) => x !== "RALT"), "RALT"] as unknown as LayerCombo),
    [layer],
  );
  const altgrFree = useMemo(() => {
    if (ir === null || layer.includes("RALT")) return false;
    return !buildSlotOccupancy(ir, selectDesktopAssignments(phaseResults)).has(slotKeyFor(cell.vkey, altgrLayer));
  }, [ir, phaseResults, layer, cell.vkey, altgrLayer]);

  const deadkeyRows = cell.attribution.rows.filter((row) => row.context.some((c) => c.kind === "deadkey"));

  function lostLabel(): string {
    return displacement?.displaced === null || displacement === null
      ? ""
      : `${displacement.displaced.char} (${codepointLabel(displacement.displaced.char).title})`;
  }

  function commitDeadkey(): void {
    const store = useWorkingCopyStore.getState();
    let ref = target;
    if (makesNew) {
      const current = store.ir;
      if (current === null) {
        setRefusal("no-working-copy");
        return;
      }
      const id = allocateDeadkeyId(current);
      ref = hexId(id);
      const defined = store.commitLayoutDeadkeyOp({
        kind: "define",
        triggerKey: cell.vkey,
        ...(layer.length > 0 ? { triggerModifiers: [...layer] } : {}),
        id,
        accentChar: displayChar,
      });
      if (!defined.ok) {
        setRefusal(defined.reason);
        return;
      }
      completeDeadkeysStep();
      setRefusal(null);
      setDeadkeyMode(false);
      setDisplayText("");
      onDeadkeyDefined?.(ref);
      return;
    }
    const result = store.commitKmnEdit({ op: "set-key", vkey: cell.vkey, layer, output: { kind: "deadkey", deadkeyId: ref } });
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    completeDeadkeysStep();
    setRefusal(null);
    setDeadkeyMode(false);
    onCommitted?.(result);
  }

  function commit(): void {
    if (deadkeyMode) {
      commitDeadkey();
      return;
    }
    const op: KmnEditInput = nothing
      ? { op: "set-key", vkey: cell.vkey, layer, output: { kind: "nul" } }
      : { op: "set-key", vkey: cell.vkey, layer, output: { kind: "text", text: incoming } };

    const extra: KmnEditInput[] = [];
    let partnerInput: KmnEditInput | undefined;
    if (partner !== null && partner.kind === "offer") {
      partnerInput = acceptPartner
        ? { op: "set-key", vkey: partner.vkey, layer: partner.layer, output: { kind: "text", text: partner.text } }
        : { op: "decline-case-partner", vkey: cell.vkey, layer, partner: partner.text };
    }
    const lost = displacement !== null && displacement.displaced !== null && displacement.displacedIsLost && !displacement.declined;
    const keep = lost && altgrFree && keepDisplaced;
    if (keep && displacement.displaced !== null) {
      extra.push({
        op: "set-key",
        vkey: cell.vkey,
        layer: altgrLayer,
        output: { kind: "text", text: displacement.displaced.char },
      });
    }

    const result = useWorkingCopyStore
      .getState()
      .commitKmnEdit(op, { ...(partnerInput !== undefined ? { partner: partnerInput } : {}), extra });
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    if (lost && !keep && displacement.declineKey !== null) {
      useWorkingCopyStore.getState().declineDisplacement(displacement.declineKey);
    }
    setRefusal(null);
    setText("");
    setNothing(false);
    setConfirmOverride(false);
    onCommitted?.(result);
  }

  function onConfirm(): void {
    if (overridesAssignment && !confirmOverride && !deadkeyMode) {
      setConfirmOverride(true);
      return;
    }
    commit();
  }

  function refusalText(reason: KmnEditRefusal): string {
    switch (reason) {
      case "locked":
        return t({ id: "editor.layout.edit.refusedLocked", message: "This desktop layout is complete, so keys cannot be changed here." });
      case "not-compiled":
        return t({ id: "editor.layout.edit.refusedNotCompiled", message: "The keyboard has not compiled, so the change was not made. Fix the compile errors first." });
      case "read-only":
        return t({ id: "editor.layout.edit.refusedReadOnly", message: "This key is read-only, so the change was not made. You can change it in the Code tab." });
      case "no-working-copy":
        return t({ id: "editor.layout.edit.refusedNoKeyboard", message: "There is no keyboard to change yet." });
      case "refused":
        return t({ id: "editor.layout.edit.refusedOther", message: "The keyboard code cannot take this change here. You can change it in the Code tab." });
    }
  }

  if (!cell.editable) return null;

  const lostNow = displacement !== null && displacement.displaced !== null && displacement.displacedIsLost && !displacement.declined;
  const layerName = copy.layerName(layer);

  return (
    <section
      aria-label={t({ id: "editor.layout.edit.ariaLabel", message: "Change what this key types" })}
      data-testid="key-edit-panel"
      style={panelStyle}
    >
      <h4 style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }}>
        {t({ id: "editor.layout.edit.heading", message: "Change what this key types" })}
      </h4>

      <label htmlFor={ids.text} style={labelStyle}>
        {t({ id: "editor.layout.edit.textLabel", message: "New text for this key" })}
      </label>
      <input
        id={ids.text}
        type="text"
        value={text}
        disabled={nothing || deadkeyMode}
        onChange={(e) => {
          setText(e.target.value);
          setConfirmOverride(false);
        }}
        data-testid="key-edit-text"
        className="ks-focus-ring"
        style={inputStyle}
      />

      {inventory.length > 0 && (
        <>
          <label htmlFor={ids.inventory} style={labelStyle}>
            {t({ id: "editor.layout.edit.inventoryLabel", message: "Or pick a character from your inventory" })}
          </label>
          <select
            id={ids.inventory}
            value=""
            disabled={nothing}
            onChange={(e) => {
              if (e.target.value !== "") setText(e.target.value);
            }}
            data-testid="key-edit-inventory"
            className="ks-focus-ring"
            style={inputStyle}
          >
            <option value="">{t({ id: "editor.layout.edit.inventoryPlaceholder", message: "Choose a character" })}</option>
            {inventory.map((ch) => (
              <option key={ch} value={ch}>
                {`${ch} (${codepointLabel(ch).title})`}
              </option>
            ))}
          </select>
        </>
      )}

      <label htmlFor={ids.nothing} style={checkLabelStyle}>
        <input
          id={ids.nothing}
          type="checkbox"
          checked={nothing}
          disabled={deadkeyMode}
          onChange={(e) => setNothing(e.target.checked)}
          data-testid="key-edit-nothing"
        />
        {t({ id: "editor.layout.edit.nothingLabel", message: "Make this key type nothing" })}
      </label>

      <label htmlFor={ids.deadkey} style={checkLabelStyle}>
        <input
          id={ids.deadkey}
          type="checkbox"
          checked={deadkeyMode}
          onChange={(e) => setDeadkeyMode(e.target.checked)}
          data-testid="key-edit-deadkey"
        />
        {t({ id: "editor.layout.edit.deadkeyLabel", message: "Make this key a deadkey" })}
      </label>

      {deadkeyMode && (
        <div style={noteStyle} data-testid="key-edit-deadkey-options">
          <label htmlFor={ids.target} style={labelStyle}>
            {t({ id: "editor.layout.edit.deadkeyWhich", message: "Which deadkey" })}
          </label>
          <select
            id={ids.target}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-testid="key-edit-deadkey-target"
            className="ks-focus-ring"
            style={inputStyle}
          >
            <option value={NEW_DEADKEY}>{t({ id: "editor.layout.edit.deadkeyNew", message: "A new deadkey" })}</option>
            {existingDeadkeys.map((d) => (
              <option key={d.ref} value={d.ref}>
                {t({ id: "editor.layout.edit.deadkeyExisting", message: `${{ label: d.label }} (dk ${{ id: d.ref }})` })}
              </option>
            ))}
          </select>
          {makesNew && (
            <>
              <label htmlFor={ids.display} style={labelStyle}>
                {t({ id: "editor.layout.edit.deadkeyDisplay", message: "Display character (the accent this key types when pressed twice)" })}
              </label>
              <input
                id={ids.display}
                type="text"
                value={displayText !== "" ? displayText : proposedDisplay}
                onChange={(e) => setDisplayText(e.target.value)}
                data-testid="key-edit-deadkey-display"
                className="ks-focus-ring"
                style={inputStyle}
              />
              {hosts !== null && <BaseDisclosure hosts={hosts} />}
            </>
          )}
        </div>
      )}

      {deadkeyMode && hasInput && (
        <div data-testid="key-edit-preview" role="status" style={noteStyle}>
          <p style={{ margin: 0 }}>
            {makesNew
              ? t({
                  id: "editor.layout.edit.previewNewDeadkey",
                  message: `Key ${{ key: cell.keyLabel }} (${{ layer: layerName }}) will start a new deadkey shown as ${{ text: displayChar }}. Pressing it twice types ${{ text: displayChar }}.`,
                })
              : t({
                  id: "editor.layout.edit.previewExistingDeadkey",
                  message: `Key ${{ key: cell.keyLabel }} (${{ layer: layerName }}) will start the deadkey ${{ id: target }}.`,
                })}
          </p>
        </div>
      )}

      {!deadkeyMode && hasInput && (
        <div data-testid="key-edit-preview" role="status" style={noteStyle}>
          <p style={{ margin: 0 }}>
            {nothing
              ? t({ id: "editor.layout.edit.previewNothing", message: `Key ${{ key: cell.keyLabel }} (${{ layer: layerName }}) will type nothing.` })
              : t({
                  id: "editor.layout.edit.previewText",
                  message: `Key ${{ key: cell.keyLabel }} (${{ layer: layerName }}) will type ${{ text: incoming }}.`,
                })}
          </p>
          {deadkeyRows.length > 0 && (
            <>
              <p style={{ margin: "6px 0 0" }}>
                {t({ id: "editor.layout.edit.previewDeadkeys", message: "After a deadkey, this key still does the following:" })}
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="key-edit-preview-deadkeys">
                {deadkeyRows.map((row) => (
                  <li key={row.ruleNodeId}>
                    {t({
                      id: "editor.layout.edit.previewDeadkeyRow",
                      message: `After ${{ context: row.context.map((c) => (c.kind === "deadkey" ? c.deadkeyId : c.text)).join(" ") }}: ${{ result: rowResult(row.output) }}`,
                    })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!deadkeyMode && displacement !== null && displacement.alreadyTypedAt.length > 0 && (
        <p style={noteStyle} data-testid="key-edit-duplicate">
          {t({
            id: "editor.layout.edit.duplicate",
            message: `${{ text: incoming }} is already typed on ${{ keys: displacement.alreadyTypedAt.map((k) => k.vkey.replace(/^K_/, "")).join(", ") }}. This key will be another way to type it.`,
          })}
        </p>
      )}

      {!deadkeyMode && lostNow && (
        <div style={noteStyle} data-testid="key-edit-displacement">
          <p style={{ margin: 0 }}>
            {t({
              id: "editor.layout.edit.displacement",
              message: `This key now types ${{ what: lostLabel() }}, which no other key types. Replacing it would lose it.`,
            })}
          </p>
          {altgrFree && (
            <label htmlFor={ids.keep} style={checkLabelStyle}>
              <input
                id={ids.keep}
                type="checkbox"
                checked={keepDisplaced}
                onChange={(e) => setKeepDisplaced(e.target.checked)}
                data-testid="key-edit-keep-displaced"
              />
              {t({ id: "editor.layout.edit.keepDisplaced", message: "Keep it on this key with AltGr" })}
            </label>
          )}
        </div>
      )}

      {!deadkeyMode && partner !== null && partner.kind === "offer" && (
        <label htmlFor={ids.partner} style={checkLabelStyle} data-testid="key-edit-partner">
          <input
            id={ids.partner}
            type="checkbox"
            checked={acceptPartner}
            onChange={(e) => setAcceptPartner(e.target.checked)}
            data-testid="key-edit-partner-accept"
          />
          {t({
            id: "editor.layout.edit.partner",
            message: `Also set ${{ layer: copy.layerName(partner.layer) }} to ${{ text: partner.text }}`,
          })}
        </label>
      )}
      {partner !== null && partner.kind === "none" && partner.reason === "read-only" && (
        <p style={noteStyle} data-testid="key-edit-partner-readonly">
          {t({
            id: "editor.layout.edit.partnerReadOnly",
            message: "The other case of this key is read-only, so it is not offered. You can change it in the Code tab.",
          })}
        </p>
      )}

      {overridesAssignment && !deadkeyMode && (
        <p style={warnStyle} role="alert" data-testid="key-edit-override-warning">
          {t({
            id: "editor.layout.edit.overrideWarning",
            message: "This key was set in the Assign tab. Changing it here replaces that assignment.",
          })}
        </p>
      )}

      {refusal !== null && (
        <div style={warnStyle} role="alert" data-testid="key-edit-refusal">
          <p style={{ margin: 0 }}>{refusalText(refusal)}</p>
          {cell.attribution.plain !== null && (
            <button
              type="button"
              onClick={() => onViewInCode(cell.attribution.plain!.ruleNodeId)}
              style={linkButtonStyle}
              data-testid="key-edit-view-in-code"
            >
              {t({ id: "editor.layout.edit.viewInCode", message: "View in code" })}
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={!hasInput}
        data-testid="key-edit-confirm"
        className="ks-focus-ring ks-hit-target ks-press"
        style={confirmStyle}
      >
        {deadkeyMode
          ? t({ id: "editor.layout.edit.confirmDeadkey", message: "Make this key a deadkey" })
          : overridesAssignment && confirmOverride
            ? t({ id: "editor.layout.edit.confirmOverride", message: "Replace the Assign tab assignment" })
            : t({ id: "editor.layout.edit.confirm", message: "Change this key" })}
      </button>
    </section>
  );
}

function rowResult(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (Array.isArray(output)) {
    return output.map((p) => (p.kind === "text" ? p.text : p.deadkeyId)).join("");
  }
  const o = output as { kind: string; text?: string; deadkeyId?: string };
  return o.kind === "text" ? (o.text ?? "") : o.kind === "deadkey" ? (o.deadkeyId ?? "") : "";
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
const labelStyle = { fontSize: 12, color: TEXT_DIM } as const;
const checkLabelStyle = { display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: TEXT_MAIN } as const;
const inputStyle = { padding: "5px 8px", fontSize: 14, fontFamily: FONT, border: `1px solid ${BORDER}`, borderRadius: 4 } as const;
const noteStyle = { margin: 0, fontSize: 13, color: TEXT_MAIN, lineHeight: 1.5 } as const;
const warnStyle = { ...noteStyle, padding: "6px 8px", border: `1px solid ${BORDER}`, borderRadius: 4 } as const;
const confirmStyle = {
  alignSelf: "flex-start",
  padding: "6px 12px",
  fontSize: 13,
  fontFamily: FONT,
  cursor: "pointer",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: "transparent",
  color: TEXT_MAIN,
} as const;
const linkButtonStyle = {
  alignSelf: "flex-start",
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--app-accent-text)",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: FONT,
} as const;
