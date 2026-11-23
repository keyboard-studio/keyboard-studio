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
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
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
import { BaseDisclosure } from "./BaseDisclosure.tsx";
import { referenceBases } from "../../lib/referenceBases/index.ts";
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
} from "./deadkeyWrite.ts";
import {
  DeadkeyConflictDialog,
  type DeadkeyConflictChoice,
} from "./DeadkeyConflictDialog.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { DeadkeyOperation } from "../../lib/deadkeyOps.ts";

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

const dangerBtnStyle: CSSProperties = {
  ...btnStyle,
  border: `1px solid var(--app-warning-text, ${BORDER})`,
  color: "var(--app-warning-text)",
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
  color: "var(--app-warning-text)",
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
  /**
   * Commit an IR edit and the ops that produced it. `false`: not written (a
   * keyboard opened for update refused it), so the ops are not logged.
   * `"pending"`: waiting for the author's agreement; the surface logs the ops
   * itself once it is written. Anything else: written, and the editor logs them.
   */
  onCommitIr: (nextIr: KeyboardIR, ops: DeadkeyOperation[]) => boolean | "pending" | void;
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
  const { t } = useLingui();
  const info: DeadkeyInfo | undefined = useMemo(
    () =>
      listDeadkeys(ir).find((d) =>
        deadkeyId !== null ? d.id === deadkeyId : d.name === deadkeyName,
      ),
    [ir, deadkeyId, deadkeyName],
  );

  // Deadkey overlay recording (spec 083 step 1.8): every IR commit here is
  // paired with the DeadkeyOperation(s) that produced it, so
  // projectWorkingCopyVfs can replay the edits onto the projected VFS —
  // the working IR itself never reaches artifacts. (Declared here, before
  // the info-undefined early return below — hooks cannot run after it.)
  const recordDeadkeyOp = useWorkingCopyStore((s) => s.commitDeadkeyOp);
  const commitAndRecord = (next: KeyboardIR, ops: DeadkeyOperation[]) => {
    const written = onCommitIr(next, ops);
    if (written === false || written === "pending") return;
    for (const op of ops) recordDeadkeyOp(op);
  };

  const [newStart, setNewStart] = useState("");
  const [newAccented, setNewAccented] = useState("");
  const [renameIdText, setRenameIdText] = useState("");
  const [nameText, setNameText] = useState<string | null>(null);
  const [retargetKey, setRetargetKey] = useState("");
  const [retargetCustomChar, setRetargetCustomChar] = useState("");
  const [repointTarget, setRepointTarget] = useState("");
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  // Host-layout disclosure for the retarget picker (1802 A1–A3, spec 083):
  // the same per-host consequence rows the define flow shows, so moving the
  // trigger is an informed choice, not a blind one. (Above the
  // info-undefined early return — hooks cannot run after it.)
  const retargetBases = useMemo(() => {
    const resolution = resolveKeyPickerSelection(retargetKey, retargetCustomChar);
    const vkey = resolvedVkeyOf(resolution);
    const label =
      retargetKey === ""
        ? t({ id: "deadkey.detail.noNewTriggerChosen", message: "(no new trigger chosen)" })
        : (vkey ?? retargetCustomChar);
    return referenceBases({ key: label, modifiers: [] });
  }, [retargetKey, retargetCustomChar]);

  if (info === undefined) {
    return (
      <div style={sectionStyle}>
        <p style={metaStyle}>
          <Trans id="deadkey.detail.goneFromWorkingCopy">
            This deadkey no longer exists in the working copy.
          </Trans>
        </p>
        <button type="button" style={btnStyle} onClick={onClose}>
          <Trans id="deadkey.detail.backToInventory">Back to inventory</Trans>
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
    if (Array.from(newStart).length !== 1 || Array.from(newAccented).length !== 1) {
      setSectionError(
        t({
          id: "deadkey.detail.pairMustBeSingleChars",
          message: "A pair is two single characters: the base letter and its accented form.",
        }),
      );
      return;
    }
    try {
      const next = withAddedDeadkeyPair(ir, info.baseStore, info.outputStore, newStart, newAccented);
      commitAndRecord(commitDeadkeyEdit(ir, next), [
        { kind: "add-pair", id, base: newStart, accented: newAccented },
      ]);
      setNewStart("");
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
      commitAndRecord(commitDeadkeyEdit(ir, next), [{ kind: "remove-pair", id, index }]);
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
      setSectionError(
        t({
          id: "deadkey.detail.renameIdMustBeHex",
          message: "The new id must be a hex number like 3001 (dk(3001) also works).",
        }),
      );
      return;
    }
    const result = renameDeadkey(ir, { from: id, to });
    const committed = commitDeadkeyResult(ir, result);
    if (committed.ok) {
      commitAndRecord(committed.ir, [{ kind: "rename", from: id, to }]);
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
    const reasons = committed.conflicts.map((c) => c.message).join(" ");
    setSectionError(
      t({
        id: "deadkey.detail.renameRefused",
        message: `Rename refused: ${reasons}`,
      }),
    );
  };

  /** Merge mine into `to`, then delete mine — the shared merge resolution. */
  const mergeIntoAndDeleteMine = (from: number, to: number): string | null => {
    try {
      const merged = withMergedDeadkeyPairs(ir, from, to);
      const delResult = deleteDeadkey(merged, { id: from });
      const committed = commitDeadkeyResult(merged, delResult);
      if (!committed.ok) {
        const reasons = committed.conflicts.map((c) => c.message).join(" ");
        return t({
          id: "deadkey.detail.deleteAfterMergeRefused",
          message: `Delete after merge refused: ${reasons}`,
        });
      }
      commitAndRecord(committed.ir, [
        { kind: "merge-pairs", fromId: from, toId: to },
        { kind: "delete", id: from },
      ]);
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
      commitAndRecord(commitDeadkeyEdit(ir, next), [
        { kind: "set-name", id, name: name === "" ? undefined : name },
      ]);
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
      setSectionError(
        t({
          id: "deadkey.detail.pickTriggerFirst",
          message: "Pick a trigger key first — choose a suggestion or enter any character.",
        }),
      );
      return;
    }
    if (id === null) {
      // Named deadkey: rewrite the trigger fragment.
      const name = info.name;
      if (!name) {
        setSectionError(
          t({
            id: "deadkey.detail.noNameToRetarget",
            message: "This deadkey has no name to retarget — it may be an incomplete import.",
          }),
        );
        return;
      }
      // Conflict check: is the new trigger already taken?
      const occupant = listDeadkeys(ir).find(
        (d) => d.triggerKey === vkey && d.id !== null,
      );
      if (occupant) {
        const trigger = vkey;
        const deadkey = `dk(${occupant.id !== null ? hex4(occupant.id) : occupant.name ?? "?"})`;
        setDialog({
          kind: "retarget-trigger-in-use",
          conflict: {
            kind: "trigger-in-use",
            message: t({
              id: "deadkey.detail.triggerAlreadyTaken",
              message: `${trigger} already triggers ${deadkey}.`,
            }),
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
        commitAndRecord(commitDeadkeyEdit(ir, result.ir), [
          {
            kind: "retarget-named",
            name,
            newTrigger:
              resolution.kind === "customOk" ? { char: resolution.char } : { vkey },
          },
        ]);
        setRetargetKey("");
        setRetargetCustomChar("");
        return;
      }
      const details = result.error;
      setSectionError(
        t({
          id: "deadkey.detail.retargetRefused",
          message: `Retarget refused: ${details}`,
        }),
      );
      return;
    }
    if (findTriggerRules(ir, id).length === 0) {
      setSectionError(
        t({
          id: "deadkey.detail.noTriggerRuleToMove",
          message: "This deadkey has no trigger rule to move — it may be an incomplete import.",
        }),
      );
      return;
    }
    const result = retargetDeadkey(ir, { id, newTriggerKey: vkey });
    const committed = commitDeadkeyResult(ir, result);
    if (committed.ok) {
      commitAndRecord(committed.ir, [{ kind: "retarget", id, newTriggerKey: vkey }]);
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
    const details = committed.conflicts.map((c) => c.message).join(" ");
    setSectionError(
      t({
        id: "deadkey.detail.retargetRefused",
        message: `Retarget refused: ${details}`,
      }),
    );
  };

  // -- Delete (atomic; referenced blocks) --------------------------------------
  const handleDelete = () => {
    clearError();
    if (id === null) {
      // Named deadkey: remove its raw fragments.
      const name = info.name;
      if (!name) {
        setSectionError(
          t({
            id: "deadkey.detail.noNameToDelete",
            message: "This deadkey has no name to delete — it may be an incomplete import.",
          }),
        );
        return;
      }
      const result = deleteNamedDeadkey(ir, name);
      if (result.ok) {
        commitAndRecord(commitDeadkeyEdit(ir, result.ir), [{ kind: "delete-named", name }]);
        onDeleted();
        return;
      }
      // Referenced: show the blocking dialog with the referrer list.
      const count = result.referrers.length;
      setDialog({
        kind: "delete-referenced",
        conflict: {
          kind: "referenced",
          message: t({
            id: "deadkey.detail.cannotDeleteReferenced",
            message: `Cannot delete dk(${name}): ${plural(count, {
              one: "# reference",
              other: "# references",
            })} outside the deadkey's own rules still touch it. Repoint or remove them first — never a half-deleted deadkey.`,
          }),
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
      commitAndRecord(committed.ir, [{ kind: "delete", id }]);
      onDeleted();
      return;
    }
    for (const c of committed.conflicts) {
      if (c.kind === "referenced") {
        setDialog({ kind: "delete-referenced", conflict: c, id });
        return;
      }
    }
    const details = committed.conflicts.map((c) => c.message).join(" ");
    setSectionError(
      t({
        id: "deadkey.detail.deleteRefused",
        message: `Delete refused: ${details}`,
      }),
    );
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
      setSectionError(
        t({
          id: "deadkey.detail.pickRepointTarget",
          message: "Pick a target deadkey to repoint the referrers to.",
        }),
      );
      return;
    }
    if (to === from) {
      setSectionError(
        t({
          id: "deadkey.detail.repointTargetMustDiffer",
          message: "The repoint target must be a different deadkey.",
        }),
      );
      return;
    }
    const referrers = dialog.conflict.referrers ?? [];
    // Merge pairs first so nothing is lost when the entity goes away —
    // only when both sides have recognizable stores.
    let working = ir;
    let merged = false;
    const target = listDeadkeys(ir).find((d) => d.id === to);
    if (
      target?.baseStore && target.outputStore &&
      info.baseStore && info.outputStore
    ) {
      try {
        working = withMergedDeadkeyPairs(working, from, to);
        merged = true;
      } catch (e) {
        setSectionError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    const { ir: repointed, unparsed } = withRepointedDeadkeyRefs(working, from, to, referrers);
    if (unparsed.length > 0) {
      const count = unparsed.length;
      const details = unparsed.join("; ");
      setSectionError(
        t({
          id: "deadkey.detail.couldNotRepoint",
          message: `Could not repoint ${plural(count, {
            one: "# referrer",
            other: "# referrers",
          })} — the delete stays blocked: ${details}`,
        }),
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
        const details = committed.conflicts.map((c) => c.message).join(" ");
        setSectionError(
          t({
            id: "deadkey.detail.deleteRefused",
            message: `Delete refused: ${details}`,
          }),
        );
      }
      return;
    }
    commitAndRecord(committed.ir, [
      ...(merged ? [{ kind: "merge-pairs" as const, fromId: from, toId: to }] : []),
      { kind: "repoint", fromId: from, toId: to, referrers },
      { kind: "delete", id: from },
    ]);
    setDialog(null);
    onDeleted();
  };

  // -- Dialog ---------------------------------------------------------------
  const dialogNode = (() => {
    if (dialog === null) return null;

    if (dialog.kind === "rename-id-in-use") {
      const { from, to } = dialog;
      const idHex = hex4(to);
      const choices: DeadkeyConflictChoice[] = [
        {
          key: "merge",
          title: t({
            id: "deadkey.detail.mergeIntoTitle",
            message: `Merge into dk(${idHex})`,
          }),
          body: t({
            id: "deadkey.detail.mergeIntoBody",
            message:
              "Move this deadkey's pairs into the existing deadkey, then delete this one. Nothing is lost; the two share one id.",
          }),
          disabled: !mergePossible,
          disabledNote: !mergePossible
            ? t({
                id: "deadkey.detail.mergeUnavailableNote",
                message: "One side's rule shape isn't recognized — pair merging is unavailable.",
              })
            : undefined,
          onSelect: () => {
            const err = mergeIntoAndDeleteMine(from, to);
            if (err) setSectionError(err);
            else setDialog(null);
          },
        },
        {
          key: "reid",
          title: t({ id: "deadkey.detail.pickDifferentId", message: "Pick a different id" }),
          body: t({
            id: "deadkey.detail.pickDifferentIdBody",
            message: "Go back and edit the proposed id.",
          }),
          onSelect: () => setDialog(null),
        },
      ];
      return (
        <DeadkeyConflictDialog
          heading={t({
            id: "deadkey.detail.idAlreadyMinted",
            message: `dk(${idHex}) is already minted`,
          })}
          detail={dialog.conflict.message}
          choices={choices}
          onCancel={() => setDialog(null)}
        />
      );
    }

    if (dialog.kind === "retarget-trigger-in-use") {
      const occupantRef =
        dialog.occupantId !== null
          ? `dk(${hex4(dialog.occupantId)})`
          : t({ id: "deadkey.detail.theExistingDeadkey", message: "the existing deadkey" });
      const occupant = occupantRef;
      const choices: DeadkeyConflictChoice[] = [
        {
          key: "merge",
          title: t({
            id: "deadkey.detail.mergeIntoOccupantTitle",
            message: `Merge into ${occupant}`,
          }),
          body: t({
            id: "deadkey.detail.mergeIntoOccupantBody",
            message:
              "Move this deadkey's pairs into the deadkey already on that trigger, then delete this one. Nothing is lost.",
          }),
          disabled: !mergePossible || dialog.occupantId === null || dialog.id === null,
          disabledNote:
            dialog.id === null
              ? "Named deadkeys can't merge pairs until the FR-004 codec closure lands."
              : dialog.occupantId === null
                ? t({
                    id: "deadkey.detail.occupantUnknown",
                    message: "The occupant couldn't be identified.",
                  })
                : t({
                    id: "deadkey.detail.mergeUnavailableNote",
                    message: "One side's rule shape isn't recognized — pair merging is unavailable.",
                  }),
          onSelect: () => {
            if (dialog.occupantId === null || dialog.id === null) return;
            const err = mergeIntoAndDeleteMine(dialog.id, dialog.occupantId);
            if (err) setSectionError(err);
            else setDialog(null);
          },
        },
        {
          key: "retrigger",
          title: t({ id: "deadkey.detail.chooseDifferentTrigger", message: "Choose a different trigger" }),
          body: t({
            id: "deadkey.detail.chooseDifferentTriggerBody",
            message: "Go back and pick another key.",
          }),
          onSelect: () => setDialog(null),
        },
      ];
      return (
        <DeadkeyConflictDialog
          heading={t({
            id: "deadkey.detail.triggerTaken",
            message: "That trigger key is already taken",
          })}
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
      const count = referrers.length;
      const target = targetId === null ? "\u2026" : `dk(${hex4(targetId)})`;
      return (
        <DeadkeyConflictDialog
          heading={t({
            id: "deadkey.detail.repointHeading",
            message: `Repoint ${plural(count, {
              one: "# referrer",
              other: "# referrers",
            })} onto another deadkey`,
          })}
          detail={t({
            id: "deadkey.detail.repointDetail",
            message:
              "Every reference below is rewritten to the target deadkey (pairs are merged first when both sides have recognizable stores), then the delete is retried. The delete stays blocked until every referrer is covered.",
          })}
          extra={
            <div style={{ margin: "0 0 12px" }}>
              <div style={{ ...rowStyle, margin: "0 0 8px" }}>
                <select
                  style={{ ...inputStyle, fontFamily: FONT }}
                  value={repointTarget}
                  onChange={(e) => setRepointTarget(e.target.value)}
                  aria-label={t({
                    id: "deadkey.detail.repointTargetAriaLabel",
                    message: "Target deadkey for repointing",
                  })}
                >
                  <option value="">
                    <Trans id="deadkey.detail.chooseADeadkey">Choose a deadkey…</Trans>
                  </option>
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
              title: t({
                id: "deadkey.detail.repointAndDeleteTitle",
                message: `Repoint onto ${target} and delete`,
              }),
              body: t({
                id: "deadkey.detail.repointAndDeleteBody",
                message: "Rewrite the referrers, retry the delete. Cancel keeps everything as it is.",
              }),
              disabled: targetId === null,
              disabledNote: t({
                id: "deadkey.detail.pickTargetFirstNote",
                message: "Pick a target deadkey above first.",
              }),
              onSelect: handleRepointAndDelete,
            },
            {
              key: "back",
              title: t({ id: "deadkey.detail.backToReferrerList", message: "Back to the referrer list" }),
              body: t({
                id: "deadkey.detail.backToReferrerListBody",
                message: "Return without changing anything.",
              }),
              onSelect: () =>
                setDialog({ kind: "delete-referenced", conflict: dialog.conflict, id: dialog.id }),
            },
          ]}
          onCancel={() => setDialog(null)}
        />
      );
    }

    // delete-referenced — BLOCKED. No "delete anyway" exists.
    const reason = dialog.conflict.message;
    return (
      <DeadkeyConflictDialog
        heading={t({
          id: "deadkey.detail.cantDeleteYet",
          message: `${idLabel} can't be deleted yet`,
        })}
        detail={t({
          id: "deadkey.detail.leftUntouched",
          message: `${reason} The deadkey is left untouched — never a half-delete.`,
        })}
        meta={
          referrers.length > 0
            ? undefined
            : t({
                id: "deadkey.detail.noReferrerDetails",
                message: "No referrer details were reported.",
              })
        }
        choices={[
          {
            key: "repoint",
            title: t({
              id: "deadkey.detail.repointReferrersTitle",
              message: "Repoint the referrers to another deadkey…",
            }),
            body: t({
              id: "deadkey.detail.repointReferrersBody",
              message:
                "Choose a target deadkey; every reference below moves to it (pairs merged first), then the delete is retried.",
            }),
            disabled: otherDeadkeys.length === 0 || dialog.id === null,
            disabledNote:
              dialog.id === null
                ? "Repointing named-deadkey referrers needs the FR-004 codec closure — remove them by hand first."
                : t({
                    id: "deadkey.detail.noOtherDeadkey",
                    message: "There is no other deadkey to repoint to.",
                  }),
            onSelect: () => setDialog({ kind: "delete-repoint", conflict: dialog.conflict, id: dialog.id }),
          },
        ]}
        onCancel={() => setDialog(null)}
        cancelLabel={t({
          id: "deadkey.detail.cancelKeepDeadkey",
          message: "Cancel (keep the deadkey)",
        })}
      />
    );
  })();

  // Labels for the trigger-meta line, hoisted so `lingui extract` sees each
  // t() call (the extractor misses t() calls nested inside another call's
  // `values` object).
  const triggerLabel =
    info.triggerKey ?? t({ id: "deadkey.detail.noTriggerFound", message: "(none found)" });
  const originLabel =
    info.origin === "studio"
      ? t({ id: "deadkey.detail.originStudio", message: "defined in studio" })
      : info.origin === "s02-legacy"
        ? t({ id: "deadkey.detail.originLegacy", message: "legacy codepoint id" })
        : t({ id: "deadkey.detail.originImported", message: "imported" });
  const pairCount = info.pairCount;
  const idStaysLabel =
    id !== null ? `dk(${hex4(id)})` : t({ id: "deadkey.detail.asIs", message: "as-is" });

  return (
    <div>
      <div style={{ ...rowStyle, justifyContent: "space-between" }}>
        <button type="button" style={btnStyle} onClick={onClose}>
          ← <Trans id="deadkey.detail.backToInventory">Back to inventory</Trans>
        </button>
        <span style={{ ...metaStyle, fontFamily: "ui-monospace, monospace", fontSize: 14, color: TEXT_MAIN, fontWeight: 700 }}>
          {idLabel}
          {info.authorName !== undefined ? ` “${info.authorName}”` : ""}
        </span>
      </div>

      <div style={sectionStyle}>
        <div style={metaStyle}>
          {t({
            id: "deadkey.detail.triggerMeta",
            message: `Trigger ${triggerLabel} · ${plural(pairCount, {
              one: "# pair",
              other: "# pairs",
            })} · ${originLabel}`,
          })}
        </div>
        {!pairsEditable && (
          <div style={{ ...metaStyle, fontStyle: "italic" }}>
            <Trans id="deadkey.detail.ruleShapeUnrecognized">
              rule shape not recognized — pair editing unavailable
            </Trans>
          </div>
        )}
      </div>

      {/* Pairs */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>
          <Trans id="deadkey.detail.pairsHeading">Pairs</Trans>
        </h3>
        {pairsEditable && id !== null ? (
          <>
            {pairs.map((p, i) => {
              const base = p.base;
              const accented = p.accented;
              return (
              <div key={i} style={rowStyle}>
                <span style={pairCharStyle}>{p.base}</span>
                <span style={{ color: TEXT_DIM }}>→</span>
                <span style={pairCharStyle}>{p.accented}</span>
                <button
                  type="button"
                  style={btnStyle}
                  onClick={() => handleRemovePair(i)}
                  aria-label={t({
                    id: "deadkey.detail.removePairAriaLabel",
                    message: `Remove pair ${base} to ${accented}`,
                  })}
                >
                  <Trans id="editor.sequences.removeButton">Remove</Trans>
                </button>
              </div>
              );
            })}
            {pairs.length === 0 && (
              <div style={metaStyle}>
                <Trans id="deadkey.detail.noPairsYet">No pairs yet.</Trans>
              </div>
            )}
            <div style={rowStyle}>
              <input
                style={{ ...inputStyle, width: 48 }}
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                placeholder="a"
                maxLength={2}
                aria-label={t({ id: "deadkey.detail.baseCharAriaLabel", message: "Base character" })}
              />
              <span style={{ color: TEXT_DIM }}>→</span>
              <input
                style={{ ...inputStyle, width: 48 }}
                value={newAccented}
                onChange={(e) => setNewAccented(e.target.value)}
                placeholder="á"
                maxLength={2}
                aria-label={t({
                  id: "deadkey.detail.accentedCharAriaLabel",
                  message: "Accented character",
                })}
              />
              <button type="button" style={btnStyle} onClick={handleAddPair}>
                <Trans id="deadkey.detail.addPair">Add pair</Trans>
              </button>
            </div>
          </>
        ) : (
          <div style={metaStyle}>
            <Trans id="deadkey.detail.ruleShapeUnrecognized">
              rule shape not recognized — pair editing unavailable
            </Trans>
          </div>
        )}
      </div>

      {/* Rename */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>
          <Trans id="editor.assignLoop.keyGrid.renameDialog.confirm">Rename</Trans>
        </h3>
        {id !== null ? (
          <>
            <div style={rowStyle}>
              <input
                style={{ ...inputStyle, width: 110 }}
                value={renameIdText}
                onChange={(e) => setRenameIdText(e.target.value)}
                placeholder={hex4(id)}
                aria-label={t({ id: "deadkey.detail.newNumericIdAriaLabel", message: "New numeric id" })}
              />
              <button type="button" style={btnStyle} onClick={handleRename}>
                <Trans id="deadkey.detail.renameId">Rename id</Trans>
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
                aria-label={t({
                  id: "deadkey.detail.authorNameAriaLabel",
                  message: "Author name (optional)",
                })}
              />
              <button type="button" style={btnStyle} onClick={handleSaveName}>
                <Trans id="deadkey.detail.saveName">Save name</Trans>
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
        <h3 style={sectionTitleStyle}>
          <Trans id="deadkey.detail.retargetHeading">Retarget</Trans>
        </h3>
        <div style={rowStyle}>
          <KeyPickerField
            value={retargetKey}
            onChange={setRetargetKey}
            customChar={retargetCustomChar}
            onCustomCharChange={setRetargetCustomChar}
            options={[...DEADKEY_OPTIONS]}
            selectAriaLabel={t({ id: "deadkey.detail.newTriggerKeyAriaLabel", message: "New trigger key" })}
            customInputAriaLabel={t({
              id: "deadkey.detail.customTriggerCharAriaLabel",
              message: "Custom new trigger character",
            })}
          />
          <button type="button" style={btnStyle} onClick={handleRetarget}>
            <Trans id="deadkey.detail.moveTrigger">Move trigger</Trans>
          </button>
        </div>
        <div style={metaStyle}>
          {t({
            id: "deadkey.detail.idStaysNote",
            message: `The id stays ${idStaysLabel} — only the trigger key moves.`,
          })}
        </div>
        <BaseDisclosure hosts={retargetBases} />
      </div>

      {/* Delete */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>
          <Trans id="profile.myKeyboards.deleteButton">Delete</Trans>
        </h3>
        <div style={metaStyle}>
          <Trans id="deadkey.detail.deleteExplainer">
            Removes the whole entity — trigger, fan-out and escape rules, and both fan-out stores.
            Atomic: if anything outside the deadkey still references it, the delete is blocked and the
            referrers are listed.
          </Trans>
        </div>
        {id === null ? (
          <>
            <div style={metaStyle}>
              <Trans id="deadkey.detail.deleteNamedExplainer">
                Named deadkey — deletes its raw fragments. Atomic: if anything outside the deadkey still
                references it, the delete is blocked and the referrers are listed.
              </Trans>
            </div>
            <button type="button" style={dangerBtnStyle} onClick={handleDelete}>
              {t({
                id: "deadkey.detail.deleteDeadkeyButton",
                message: `Delete ${idLabel}`,
              })}
            </button>
          </>
        ) : (
          <button type="button" style={dangerBtnStyle} onClick={handleDelete}>
            {t({
              id: "deadkey.detail.deleteDeadkeyButton",
              message: `Delete ${idLabel}`,
            })}
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
