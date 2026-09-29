// DeadkeyDetailEditor — the per-deadkey editor (spec 083 US2–US5).
//
// Sections: pairs (add/remove, when the fan-out stores are recognized),
// numeric rename (pre-FR-004) + always-available author name, retarget,
// atomic delete. Every mutation commits through define/rename/retarget/
// delete from the engine's deadkey-lifecycle module and routes the result
// through the studio mutate seam (deadkeyWrite.ts); conflicts surface the
// shared DeadkeyConflictDialog with explicit choices mapped by kind.
//
// Delete is atomic: a `referenced` conflict shows the referrer list and
// BLOCKS — the dialog offers repoint-to-another-deadkey or cancel, never
// a half-delete.

import { useMemo, useState, type CSSProperties } from "react";
import type { KeyboardIR, DeadkeyInfo } from "@keyboard-studio/contracts";
import { listDeadkeys } from "@keyboard-studio/contracts";
import {
  renameDeadkey,
  retargetDeadkey,
  deleteDeadkey,
  type DeadkeyConflict,
} from "@keyboard-studio/engine";
import { KeyPickerField } from "../assignLoop/KeyPickerField.tsx";
import {
  resolveKeyPickerSelection,
  resolvedVkeyOf,
} from "../../lib/charInput.ts";
import {
  BG_CARD,
  BORDER,
  TEXT_MAIN,
  TEXT_DIM,
  FONT,
} from "../../lib/galleryTheme.ts";
import { DEADKEY_OPTIONS } from "./deadkeyTriggerOptions.ts";
import {
  commitDeadkeyResult,
  commitDeadkeyEdit,
  hex4,
  withAddedDeadkeyPair,
  withRemovedDeadkeyPair,
  withMergedDeadkeyPairs,
  withDeadkeyAuthorName,
  withRepointedDeadkeyRefs,
  readDeadkeyPairs,
  findTriggerRules,
  deleteNamedDeadkey,
  retargetNamedDeadkey,
  namedDeadkeyFragments,
} from "./deadkeyWrite.ts";
import {
  DeadkeyConflictDialog,
  type DeadkeyConflictChoice,
} from "./DeadkeyConflictDialog.tsx";

const sectionStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "12px 14px",
  margin: "0 0 10px",
  fontFamily: FONT,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: TEXT_MAIN,
  margin: "0 0 8px",
};

const metaStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  margin: "4px 0",
};

const inputStyle: CSSProperties = {
  padding: "6px 10px",
  background: "var(--app-bg)",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_MAIN,
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  fontSize: 13,
  boxSizing: "border-box",
};

const btnStyle: CSSProperties = {
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

const primaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: "var(--app-accent)",
  color: "var(--app-text-on-accent)",
  border: "none",
};

const dangerBtnStyle: CSSProperties = {
  ...btnStyle,
  border: `1px solid var(--sil-orange-dark, ${BORDER})`,
  color: "var(--sil-orange-dark, #b3541e)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "6px 0",
  fontSize: 13,
  color: TEXT_MAIN,
};

const pairCharStyle: CSSProperties = {
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  minWidth: 24,
  display: "inline-block",
  textAlign: "center",
};

const errorStyle: CSSProperties = {
  fontSize: 12.5,
  color: "var(--sil-orange-dark, #b3541e)",
  marginTop: 6,
};

const referrerListStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  margin: "8px 0",
  paddingLeft: 18,
};

const NAME_RE = /^[A-Za-z0-9_]{1,64}$/;

function parseIdText(text: string): number | null {
  const t = text.trim().toLowerCase();
  // 1–8 hex digits: the codec/contracts pipeline imposes no 0xffff cap
  // (e.g. an imported dk(dead0) is numeric 0xdead0, and repair mints
  // 0xdead1), so the UI must not reject ids the pipeline itself produces.
  const m = /^(?:dk\()?(?:0x)?([0-9a-f]{1,8})\)?$/.exec(t);
  if (!m) return null;
  const id = parseInt(m[1]!, 16);
  return Number.isNaN(id) || id <= 0 ? null : id;
}

export interface DeadkeyDetailEditorProps {
  ir: KeyboardIR;
  deadkeyId: number | null;
  /** Opaque name, for looking up null-id (named) deadkeys. */
  deadkeyName?: string;
  onCommitIr: (nextIr: KeyboardIR) => void;
  /** Rename succeeded — follow the deadkey to its new id. */
  onRenamed: (newId: number) => void;
  /** Adopt another deadkey's editor (merge/repoint resolutions). */
  onAdoptExisting: (id: number) => void;
  /** Delete succeeded — back to the inventory. */
  onDeleted: () => void;
  /** Back to the inventory. */
  onClose: () => void;
}

type DialogState =
  | { kind: "rename-id-in-use"; conflict: DeadkeyConflict; from: number; to: number }
  | { kind: "retarget-trigger-in-use"; conflict: DeadkeyConflict; id: number | null; occupantId: number | null }
  | { kind: "delete-referenced"; conflict: DeadkeyConflict; id: number | null }
  | { kind: "delete-repoint"; conflict: DeadkeyConflict; id: number | null };

export function DeadkeyDetailEditor({
  ir,
  deadkeyId,
  deadkeyName,
  onCommitIr,
  onRenamed,
  onAdoptExisting,
  onDeleted,
  onClose,
}: DeadkeyDetailEditorProps) {
  const info: DeadkeyInfo | undefined = useMemo(
    () =>
      listDeadkeys(ir).find((d) =>
        deadkeyId !== null ? d.id === deadkeyId : d.name === deadkeyName,
      ),
    [ir, deadkeyId, deadkeyName],
  );

  const [newBase, setNewBase] = useState("");
  const [newAccented, setNewAccented] = useState("");
  const [renameIdText, setRenameIdText] = useState("");
  const [nameText, setNameText] = useState<string | null>(null);
  const [retargetKey, setRetargetKey] = useState("");
  const [retargetCustomChar, setRetargetCustomChar] = useState("");
  const [repointTarget, setRepointTarget] = useState("");
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  if (info === undefined) {
    return (
      <div style={sectionStyle}>
        <p style={metaStyle}>This deadkey no longer exists in the working copy.</p>
        <button type="button" style={btnStyle} onClick={onClose}>
          Back to inventory
        </button>
      </div>
    );
  }

  const id = info.id;
  const idLabel = id !== null ? `dk(${hex4(id)})` : `dk(${info.name ?? "?"})`;
  const pairsEditable = info.baseStore !== null && info.outputStore !== null;
  const pairs =
    pairsEditable && info.baseStore && info.outputStore
      ? readDeadkeyPairs(ir, info.baseStore, info.outputStore)
      : [];
  const otherDeadkeys = listDeadkeys(ir).filter(
    (d) => d.id !== null && d.id !== id,
  );
  const mergePossible =
    id !== null &&
    info.baseStore !== null &&
    info.outputStore !== null;

  const clearError = () => setSectionError(null);

  // -- Pairs ---------------------------------------------------------------
  const handleAddPair = () => {
    clearError();
    if (id === null || !info.baseStore || !info.outputStore) return;
    // Scalar count, not UTF-16 length — an astral character is one scalar
    // (mirrors the define form's accent validation).
    if (Array.from(newBase).length !== 1 || Array.from(newAccented).length !== 1) {
      setSectionError("A pair is two single characters: the base letter and its accented form.");
      return;
    }
    try {
      const next = withAddedDeadkeyPair(ir, info.baseStore, info.outputStore, newBase, newAccented);
      onCommitIr(commitDeadkeyEdit(ir, next));
      setNewBase("");
      setNewAccented("");
    } catch (e) {
      setSectionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemovePair = (index: number) => {
    clearError();
    if (id === null || !info.baseStore || !info.outputStore) return;
    try {
      const next = withRemovedDeadkeyPair(ir, info.baseStore, info.outputStore, index);
      onCommitIr(commitDeadkeyEdit(ir, next));
    } catch (e) {
      setSectionError(e instanceof Error ? e.message : String(e));
    }
  };

  // -- Rename (numeric) ----------------------------------------------------
  const handleRename = () => {
    clearError();
    if (id === null) return;
    const to = parseIdText(renameIdText);
    if (to === null) {
      setSectionError("The new id must be a hex number like 3001 (dk(3001) also works).");
      return;
    }
    const result = renameDeadkey(ir, { from: id, to });
    const committed = commitDeadkeyResult(ir, result);
    if (committed.ok) {
      onCommitIr(committed.ir);
      setRenameIdText("");
      if (to !== id) onRenamed(to);
      return;
    }
    for (const c of committed.conflicts) {
      if (c.kind === "id-in-use") {
        setDialog({ kind: "rename-id-in-use", conflict: c, from: id, to });
        return;
      }
    }
    setSectionError(`Rename refused: ${committed.conflicts.map((c) => c.message).join(" ")}`);
  };

  /** Merge mine into `to`, then delete mine — the shared merge resolution. */
  const mergeIntoAndDeleteMine = (from: number, to: number): string | null => {
    try {
      const merged = withMergedDeadkeyPairs(ir, from, to);
      const delResult = deleteDeadkey(merged, { id: from });
      const committed = commitDeadkeyResult(merged, delResult);
      if (!committed.ok) {
        return `Delete after merge refused: ${committed.conflicts.map((c) => c.message).join(" ")}`;
      }
      onCommitIr(committed.ir);
      onAdoptExisting(to);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  // -- Author name (always available, pre- and post-FR-004) ------------------
  const handleSaveName = () => {
    clearError();
    if (id === null) return;
    const name = (nameText ?? info.authorName ?? "").trim();
    if (name !== "" && !NAME_RE.test(name)) {
      setSectionError("The name must be 1–64 ASCII letters, digits, or underscores — it has to survive the .kmn comment it is stored in.");
      return;
    }
    try {
      const next = withDeadkeyAuthorName(ir, id, name === "" ? undefined : name);
      onCommitIr(commitDeadkeyEdit(ir, next));
      setNameText(null);
    } catch (e) {
      setSectionError(e instanceof Error ? e.message : String(e));
    }
  };

  // -- Retarget --------------------------------------------------------------
  const handleRetarget = () => {
    clearError();
    const resolution = resolveKeyPickerSelection(retargetKey, retargetCustomChar);
    const vkey = resolvedVkeyOf(resolution);
    if (vkey === null) {
      setSectionError("Pick a trigger key first — choose a suggestion or enter any character.");
      return;
    }
    if (id === null) {
      // Named deadkey: rewrite the trigger fragment.
      const name = info.name;
      if (!name) {
        setSectionError("This deadkey has no name to retarget — it may be an incomplete import.");
        return;
      }
      // Conflict check: is the new trigger already taken?
      const occupant = listDeadkeys(ir).find(
        (d) => d.triggerKey === vkey && d.id !== null,
      );
      if (occupant) {
        setDialog({
          kind: "retarget-trigger-in-use",
          conflict: {
            kind: "trigger-in-use",
            message: `${vkey} already triggers dk(${occupant.id !== null ? hex4(occupant.id) : occupant.name ?? "?"}).`,
            ids: occupant.id !== null ? [occupant.id] : [],
          },
          id,
          occupantId: occupant.id,
        });
        return;
      }
      const result = retargetNamedDeadkey(
        ir,
        name,
        resolution.kind === "customOk" ? { char: resolution.char } : { vkey },
      );
      if (result.ok) {
        onCommitIr(commitDeadkeyEdit(ir, result.ir));
        setRetargetKey("");
        setRetargetCustomChar("");
        return;
      }
      setSectionError(`Retarget refused: ${result.error}`);
      return;
    }
    if (findTriggerRules(ir, id).length === 0) {
      setSectionError("This deadkey has no trigger rule to move — it may be an incomplete import.");
      return;
    }
    const result = retargetDeadkey(ir, { id, newTriggerKey: vkey });
    const committed = commitDeadkeyResult(ir, result);
    if (committed.ok) {
      onCommitIr(committed.ir);
      setRetargetKey("");
      setRetargetCustomChar("");
      return;
    }
    for (const c of committed.conflicts) {
      if (c.kind === "trigger-in-use") {
        const occupantId = c.ids?.[0] ?? null;
        setDialog({ kind: "retarget-trigger-in-use", conflict: c, id, occupantId });
        return;
      }
    }
    setSectionError(`Retarget refused: ${committed.conflicts.map((c) => c.message).join(" ")}`);
  };

  // -- Delete (atomic; referenced blocks) --------------------------------------
  const handleDelete = () => {
    clearError();
    if (id === null) {
      // Named deadkey: remove its raw fragments.
      const name = info.name;
      if (!name) {
        setSectionError("This deadkey has no name to delete — it may be an incomplete import.");
        return;
      }
      const result = deleteNamedDeadkey(ir, name);
      if (result.ok) {
        onCommitIr(commitDeadkeyEdit(ir, result.ir));
        onDeleted();
        return;
      }
      // Referenced: show the blocking dialog with the referrer list.
      setDialog({
        kind: "delete-referenced",
        conflict: {
          kind: "referenced",
          message:
            `Cannot delete dk(${name}): ${result.referrers.length} ` +
            `reference(s) outside the deadkey's own rules still touch it. ` +
            `Repoint or remove them first — never a half-deleted deadkey.`,
          ids: [],
          referrers: result.referrers,
        },
        id,
      });
      return;
    }
    const result = deleteDeadkey(ir, { id });
    const committed = commitDeadkeyResult(ir, result);
    if (committed.ok) {
      onCommitIr(committed.ir);
      onDeleted();
      return;
    }
    for (const c of committed.conflicts) {
      if (c.kind === "referenced") {
        setDialog({ kind: "delete-referenced", conflict: c, id });
        return;
      }
    }
    setSectionError(`Delete refused: ${committed.conflicts.map((c) => c.message).join(" ")}`);
  };

  /** Repoint every listed referrer onto the target, then retry the delete. */
  const handleRepointAndDelete = () => {
    clearError();
    if (dialog?.kind !== "delete-repoint" && dialog?.kind !== "delete-referenced") return;
    const from = dialog.id;
    // Repointing is numeric-only; the dialog disables the repoint choice for
    // named deadkeys, so this is unreachable — but guard anyway.
    if (from === null) {
      setSectionError("Repointing a named deadkey needs the FR-004 codec closure.");
      return;
    }
    const to = parseIdText(repointTarget);
    if (to === null) {
      setSectionError("Pick a target deadkey to repoint the referrers to.");
      return;
    }
    if (to === from) {
      setSectionError("The repoint target must be a different deadkey.");
      return;
    }
    const referrers = dialog.conflict.referrers ?? [];
    // Merge pairs first so nothing is lost when the entity goes away —
    // only when both sides have recognizable stores.
    let working = ir;
    const target = listDeadkeys(ir).find((d) => d.id === to);
    if (
      target?.baseStore && target.outputStore &&
      info.baseStore && info.outputStore
    ) {
      try {
        working = withMergedDeadkeyPairs(working, from, to);
      } catch (e) {
        setSectionError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    const { ir: repointed, unparsed } = withRepointedDeadkeyRefs(working, from, to, referrers);
    if (unparsed.length > 0) {
      setSectionError(
        `Could not repoint ${unparsed.length} referrer(s) — the delete stays blocked: ${unparsed.join("; ")}`,
      );
      return;
    }
    const result = deleteDeadkey(repointed, { id: from });
    const committed = commitDeadkeyResult(repointed, result);
    if (!committed.ok) {
      // Still blocked (e.g. a referrer the rewrite couldn't cover) — show
      // the remaining list, never a half-delete.
      const remaining = committed.conflicts.find((c) => c.kind === "referenced");
      if (remaining) {
        setDialog({ kind: "delete-referenced", conflict: remaining, id: from });
      } else {
        setSectionError(`Delete refused: ${committed.conflicts.map((c) => c.message).join(" ")}`);
      }
      return;
    }
    onCommitIr(committed.ir);
    setDialog(null);
    onDeleted();
  };

  // -- Dialog ---------------------------------------------------------------
  const dialogNode = (() => {
    if (dialog === null) return null;

    if (dialog.kind === "rename-id-in-use") {
      const { from, to } = dialog;
      const choices: DeadkeyConflictChoice[] = [
        {
          key: "merge",
          title: `Merge into dk(${hex4(to)})`,
          body: "Move this deadkey's pairs into the existing deadkey, then delete this one. Nothing is lost; the two share one id.",
          disabled: !mergePossible,
          disabledNote: !mergePossible
            ? "One side's rule shape isn't recognized — pair merging is unavailable."
            : undefined,
          onSelect: () => {
            const err = mergeIntoAndDeleteMine(from, to);
            if (err) setSectionError(err);
            else setDialog(null);
          },
        },
        {
          key: "reid",
          title: "Pick a different id",
          body: "Go back and edit the proposed id.",
          onSelect: () => setDialog(null),
        },
      ];
      return (
        <DeadkeyConflictDialog
          heading={`dk(${hex4(to)}) is already minted`}
          detail={dialog.conflict.message}
          choices={choices}
          onCancel={() => setDialog(null)}
        />
      );
    }

    if (dialog.kind === "retarget-trigger-in-use") {
      const occupantRef =
        dialog.occupantId !== null ? `dk(${hex4(dialog.occupantId)})` : "the existing deadkey";
      const choices: DeadkeyConflictChoice[] = [
        {
          key: "merge",
          title: `Merge into ${occupantRef}`,
          body: "Move this deadkey's pairs into the deadkey already on that trigger, then delete this one. Nothing is lost.",
          disabled: !mergePossible || dialog.occupantId === null || dialog.id === null,
          disabledNote:
            dialog.id === null
              ? "Named deadkeys can't merge pairs until the FR-004 codec closure lands."
              : dialog.occupantId === null
                ? "The occupant couldn't be identified."
                : "One side's rule shape isn't recognized — pair merging is unavailable.",
          onSelect: () => {
            if (dialog.occupantId === null || dialog.id === null) return;
            const err = mergeIntoAndDeleteMine(dialog.id, dialog.occupantId);
            if (err) setSectionError(err);
            else setDialog(null);
          },
        },
        {
          key: "retrigger",
          title: "Choose a different trigger",
          body: "Go back and pick another key.",
          onSelect: () => setDialog(null),
        },
      ];
      return (
        <DeadkeyConflictDialog
          heading="That trigger key is already taken"
          detail={dialog.conflict.message}
          choices={choices}
          onCancel={() => setDialog(null)}
        />
      );
    }

    // delete-referenced / delete-repoint share the blocked dialog; the
    // repoint choice swaps in the target picker (rendered inside the dialog
    // via `extra` — the overlay covers the page behind it).
    const referrers = dialog.conflict.referrers ?? [];
    if (dialog.kind === "delete-repoint") {
      const targetId = parseIdText(repointTarget);
      return (
        <DeadkeyConflictDialog
          heading={`Repoint ${referrers.length} referrer${referrers.length === 1 ? "" : "s"} onto another deadkey`}
          detail="Every reference below is rewritten to the target deadkey (pairs are merged first when both sides have recognizable stores), then the delete is retried. The delete stays blocked until every referrer is covered."
          extra={
            <div style={{ margin: "0 0 12px" }}>
              <div style={{ ...rowStyle, margin: "0 0 8px" }}>
                <select
                  style={{ ...inputStyle, fontFamily: FONT }}
                  value={repointTarget}
                  onChange={(e) => setRepointTarget(e.target.value)}
                  aria-label="Target deadkey for repointing"
                >
                  <option value="">Choose a deadkey…</option>
                  {otherDeadkeys.map((d) => (
                    <option key={d.id} value={hex4(d.id!)}>
                      dk({hex4(d.id!)}){d.authorName ? ` “${d.authorName}”` : ""} — {d.pairCount} pairs
                    </option>
                  ))}
                </select>
              </div>
              <ul style={{ ...referrerListStyle, margin: 0 }}>
                {referrers.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          }
          choices={[
            {
              key: "repoint-delete",
              title: `Repoint onto ${targetId === null ? "…" : `dk(${hex4(targetId)})`} and delete`,
              body: "Rewrite the referrers, retry the delete. Cancel keeps everything as it is.",
              disabled: targetId === null,
              disabledNote: "Pick a target deadkey above first.",
              onSelect: handleRepointAndDelete,
            },
            {
              key: "back",
              title: "Back to the referrer list",
              body: "Return without changing anything.",
              onSelect: () =>
                setDialog({ kind: "delete-referenced", conflict: dialog.conflict, id: dialog.id }),
            },
          ]}
          onCancel={() => setDialog(null)}
        />
      );
    }

    // delete-referenced — BLOCKED. No "delete anyway" exists.
    return (
      <DeadkeyConflictDialog
        heading={`${idLabel} can't be deleted yet`}
        detail={`${dialog.conflict.message} The deadkey is left untouched — never a half-delete.`}
        meta={referrers.length > 0 ? undefined : "No referrer details were reported."}
        choices={[
          {
            key: "repoint",
            title: "Repoint the referrers to another deadkey…",
            body: "Choose a target deadkey; every reference below moves to it (pairs merged first), then the delete is retried.",
            disabled: otherDeadkeys.length === 0 || dialog.id === null,
            disabledNote:
              dialog.id === null
                ? "Repointing named-deadkey referrers needs the FR-004 codec closure — remove them by hand first."
                : "There is no other deadkey to repoint to.",
            onSelect: () => setDialog({ kind: "delete-repoint", conflict: dialog.conflict, id: dialog.id }),
          },
        ]}
        onCancel={() => setDialog(null)}
        cancelLabel="Cancel (keep the deadkey)"
      />
    );
  })();

  return (
    <div>
      <div style={{ ...rowStyle, justifyContent: "space-between" }}>
        <button type="button" style={btnStyle} onClick={onClose}>
          ← Back to inventory
        </button>
        <span style={{ ...metaStyle, fontFamily: "ui-monospace, monospace", fontSize: 14, color: TEXT_MAIN, fontWeight: 700 }}>
          {idLabel}
          {info.authorName !== undefined ? ` “${info.authorName}”` : ""}
        </span>
      </div>

      <div style={sectionStyle}>
        <div style={metaStyle}>
          Trigger {info.triggerKey ?? "(none found)"} · {info.pairCount} pairs ·{" "}
          {info.origin === "studio" ? "defined in studio" : info.origin === "s02-legacy" ? "legacy codepoint id" : "imported"}
        </div>
        {!pairsEditable && (
          <div style={{ ...metaStyle, fontStyle: "italic" }}>
            rule shape not recognized — pair editing unavailable
          </div>
        )}
      </div>

      {/* Pairs */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Pairs</h3>
        {pairsEditable && id !== null ? (
          <>
            {pairs.map((p, i) => (
              <div key={i} style={rowStyle}>
                <span style={pairCharStyle}>{p.base}</span>
                <span style={{ color: TEXT_DIM }}>→</span>
                <span style={pairCharStyle}>{p.accented}</span>
                <button type="button" style={btnStyle} onClick={() => handleRemovePair(i)} aria-label={`Remove pair ${p.base} to ${p.accented}`}>
                  Remove
                </button>
              </div>
            ))}
            {pairs.length === 0 && <div style={metaStyle}>No pairs yet.</div>}
            <div style={rowStyle}>
              <input
                style={{ ...inputStyle, width: 48 }}
                value={newBase}
                onChange={(e) => setNewBase(e.target.value)}
                placeholder="a"
                maxLength={2}
                aria-label="Base character"
              />
              <span style={{ color: TEXT_DIM }}>→</span>
              <input
                style={{ ...inputStyle, width: 48 }}
                value={newAccented}
                onChange={(e) => setNewAccented(e.target.value)}
                placeholder="á"
                maxLength={2}
                aria-label="Accented character"
              />
              <button type="button" style={btnStyle} onClick={handleAddPair}>
                Add pair
              </button>
            </div>
          </>
        ) : (
          <div style={metaStyle}>rule shape not recognized — pair editing unavailable</div>
        )}
      </div>

      {/* Rename */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Rename</h3>
        {id !== null ? (
          <>
            <div style={rowStyle}>
              <input
                style={{ ...inputStyle, width: 110 }}
                value={renameIdText}
                onChange={(e) => setRenameIdText(e.target.value)}
                placeholder={hex4(id)}
                aria-label="New numeric id"
              />
              <button type="button" style={btnStyle} onClick={handleRename}>
                Rename id
              </button>
            </div>
            <div style={metaStyle}>
              Numeric ids only until the FR-004 codec closure lands — the id is decoupled from the trigger key.
            </div>
            <div style={rowStyle}>
              <input
                style={{ ...inputStyle, width: 200 }}
                value={nameText ?? info.authorName ?? ""}
                onChange={(e) => setNameText(e.target.value)}
                placeholder="acute"
                aria-label="Author name (optional)"
              />
              <button type="button" style={btnStyle} onClick={handleSaveName}>
                Save name
              </button>
            </div>
            <div style={metaStyle}>
              Name (optional) — always available. Recorded now, becomes the real id when the FR-004 codec
              closure lands. You won&apos;t be asked twice.
            </div>
          </>
        ) : (
          <div style={metaStyle}>
            Named deadkeys (dk(name)) can&apos;t be renamed until the FR-004 codec closure lands — delete and
            retarget still work.
          </div>
        )}
      </div>

      {/* Retarget */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Retarget</h3>
        <div style={rowStyle}>
          <KeyPickerField
            value={retargetKey}
            onChange={setRetargetKey}
            customChar={retargetCustomChar}
            onCustomCharChange={setRetargetCustomChar}
            options={[...DEADKEY_OPTIONS]}
            selectAriaLabel="New trigger key"
            customInputAriaLabel="Custom new trigger character"
          />
          <button type="button" style={btnStyle} onClick={handleRetarget}>
            Move trigger
          </button>
        </div>
        <div style={metaStyle}>
          The id stays {id !== null ? `dk(${hex4(id)})` : "as-is"} — only the trigger key moves.
        </div>
      </div>

      {/* Delete */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Delete</h3>
        <div style={metaStyle}>
          Removes the whole entity — trigger, fan-out and escape rules, and both fan-out stores. Atomic:
          if anything outside the deadkey still references it, the delete is blocked and the referrers are
          listed.
        </div>
        {id === null ? (
          <>
            <div style={metaStyle}>
              Named deadkey — deletes its raw fragments. Atomic: if anything outside the deadkey still
              references it, the delete is blocked and the referrers are listed.
            </div>
            <button type="button" style={dangerBtnStyle} onClick={handleDelete}>
              Delete {idLabel}
            </button>
          </>
        ) : (
          <button type="button" style={dangerBtnStyle} onClick={handleDelete}>
            Delete {idLabel}
          </button>
        )}
      </div>

      {sectionError !== null && (
        <div style={errorStyle} role="alert">{sectionError}</div>
      )}

      {dialogNode}
    </div>
  );
}
