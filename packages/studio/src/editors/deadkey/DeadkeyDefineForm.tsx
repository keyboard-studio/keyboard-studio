// DeadkeyDefineForm — the spec-083 User Story 1 define flow.
//
// §3c (propose, don't blank): every field arrives proposed, never blank —
// the trigger picker suggests the corpus-common keys first (any key
// selectable), the id is proposed by allocateDeadkeyId (editable,
// re-generable, never derived from the trigger), the double-tap accent
// character is proposed from the trigger key, and the optional name
// carries the exact FR-004 promise copy. Commits through defineDeadkey;
// collisions surface the shared DeadkeyConflictDialog with explicit
// choices mapped by conflict kind.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { KeyboardIR, DeadkeyInfo } from "@keyboard-studio/contracts";
import {
  allocateDeadkeyId,
  listDeadkeys,
} from "@keyboard-studio/contracts";
import { defineDeadkey, type DeadkeyConflict } from "@keyboard-studio/engine";
import { KeyPickerField } from "../assignLoop/KeyPickerField.tsx";
import {
  resolveKeyPickerSelection,
  resolvedVkeyOf,
} from "../../lib/charInput.ts";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import {
  BG_CARD,
  BORDER,
  TEXT_MAIN,
  TEXT_DIM,
  FONT,
} from "../../lib/galleryTheme.ts";
import { DEADKEY_OPTIONS, TRIGGER_KEY_CHARS } from "./deadkeyTriggerOptions.ts";
import { commitDeadkeyResult, hex4 } from "./deadkeyWrite.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { DeadkeyOperation } from "../../lib/deadkeyOps.ts";
import { DeadkeyConflictDialog, type DeadkeyConflictChoice } from "./DeadkeyConflictDialog.tsx";
import { BaseDisclosure } from "./BaseDisclosure.tsx";
import { referenceBases } from "../../lib/referenceBases/index.ts";

const fieldStyle: CSSProperties = {
  margin: "0 0 14px",
  fontFamily: FONT,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: TEXT_MAIN,
  marginBottom: 6,
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: TEXT_DIM,
  marginTop: 4,
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

const ghostBtnStyle: CSSProperties = {
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
  color: TEXT_MAIN,
  fontFamily: FONT,
  marginLeft: 8,
};

const defineBtnStyle: CSSProperties = {
  background: "var(--app-accent)",
  color: "var(--app-text-on-accent)",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  cursor: "pointer",
  fontSize: 14,
  fontFamily: FONT,
  marginTop: 4,
};

const errorStyle: CSSProperties = {
  fontSize: 12.5,
  color: "var(--app-warning-text)",
  marginTop: 6,
};

const questionStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "12px 14px",
  margin: "12px 0",
  fontFamily: FONT,
};

const questionTextStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: TEXT_MAIN,
  margin: "0 0 4px",
};

const questionSubStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  margin: 0,
};

const tryItStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  margin: "12px 0",
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
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

export interface DeadkeyDefineFormProps {
  ir: KeyboardIR;
  /** Commit a successfully defined IR to the working copy. */
  /**
   * Commit an IR edit and the ops that produced it. `false`: not written (a
   * keyboard opened for update refused it), so the ops are not logged.
   * `"pending"`: waiting for the author's agreement; the surface logs the ops
   * itself once it is written. Anything else: written, and the editor logs them.
   */
  onCommitIr: (nextIr: KeyboardIR, ops: DeadkeyOperation[]) => boolean | "pending" | void;
  /** The trigger is taken — adopt the occupant's editor instead. */
  onAdoptExisting: (id: number) => void;
  /** A deadkey was defined — open its editor. */
  onDefined: (id: number) => void;
  /** Back to the inventory. */
  onCancel: () => void;
}

type ConflictState =
  | { kind: "trigger-in-use"; conflict: DeadkeyConflict; occupant: DeadkeyInfo | undefined; triggerLabel: string }
  | { kind: "id-in-use"; conflict: DeadkeyConflict; id: number };

export function DeadkeyDefineForm({ ir, onCommitIr, onAdoptExisting, onDefined, onCancel }: DeadkeyDefineFormProps) {
  const { t } = useLingui();
  const [triggerKey, setTriggerKey] = useState<string>("");
  const [triggerCustomChar, setTriggerCustomChar] = useState("");
  const [idText, setIdText] = useState(() => hex4(allocateDeadkeyId(ir)));
  const [authorName, setAuthorName] = useState("");
  const [accentChar, setAccentChar] = useState("");
  const [accentTouched, setAccentTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  // Deadkey overlay recording (spec 083 step 1.8): every IR commit here is
  // paired with the DeadkeyOperation that produced it, so
  // projectWorkingCopyVfs can replay the edit onto the projected VFS — the
  // working IR itself never reaches artifacts.
  const recordDeadkeyOp = useWorkingCopyStore((s) => s.commitDeadkeyOp);
  const commitAndRecord = (next: KeyboardIR, op: DeadkeyOperation): boolean => {
    const written = onCommitIr(next, [op]);
    if (written === false || written === "pending") return false;
    recordDeadkeyOp(op);
    return true;
  };

  // Proposed double-tap accent: the trigger's literal character (suggestion
  // key → its character; custom char → itself). Proposed, not imposed — the
  // author can edit it; a manual edit sticks (accentTouched).
  useEffect(() => {
    if (accentTouched) return;
    const resolution = resolveKeyPickerSelection(triggerKey, triggerCustomChar);
    if (resolution.kind === "customOk") {
      setAccentChar(resolution.char);
    } else if (resolution.kind === "key") {
      setAccentChar(TRIGGER_KEY_CHARS[resolution.vkey] ?? "");
    } else {
      setAccentChar("");
    }
  }, [triggerKey, triggerCustomChar, accentTouched]);

  const resolution = useMemo(
    () => resolveKeyPickerSelection(triggerKey, triggerCustomChar),
    [triggerKey, triggerCustomChar],
  );
  const resolvedVkey = resolvedVkeyOf(resolution);

  // Propose the double-tap accent character from the trigger (§3c).
  const proposedAccent = useMemo(() => {
    if (resolution.kind === "customOk") return resolution.char;
    if (resolution.kind === "key") return TRIGGER_KEY_CHARS[resolution.vkey] ?? "";
    return "";
  }, [resolution]);

  // Re-propose when the trigger changes; the author can still edit freely.
  useEffect(() => {
    setAccentChar(proposedAccent);
  }, [proposedAccent]);

  const triggerLabel =
    triggerKey === CUSTOM_KEY_OPTION_VALUE
      ? triggerCustomChar ||
        t({ id: "deadkey.define.customKeyFallback", message: "(custom key)" })
      : triggerKey ||
        t({ id: "deadkey.define.noTriggerFallback", message: "(no trigger chosen)" });

  const hosts = useMemo(
    () =>
      referenceBases({
        key: resolvedVkey ?? triggerLabel,
        modifiers: [],
      }),
    [resolvedVkey, triggerLabel],
  );

  const regenerateId = () => {
    setIdText(hex4(allocateDeadkeyId(ir)));
  };

  const handleDefine = () => {
    setFormError(null);
    if (resolvedVkey === null) {
      setFormError(
        t({
          id: "deadkey.define.error.pickTrigger",
          message: "Pick a trigger key first — choose a suggestion or enter any character.",
        }),
      );
      return;
    }
    const id = parseIdText(idText);
    if (id === null) {
      setFormError("The id must be a hex number like 3000 (dk(3000) also works).");
      return;
    }
    if (Array.from(accentChar).length !== 1) {
      setFormError(
        t({
          id: "deadkey.define.error.accentLength",
          message:
            "Double-tap emits must be exactly one character — the bare accent the trigger key types twice.",
        }),
      );
      return;
    }
    const name = authorName.trim();
    if (name !== "" && !NAME_RE.test(name)) {
      setFormError("The name must be 1–64 ASCII letters, digits, or underscores — it has to survive the .kmn comment it is stored in.");
      return;
    }

    const result = defineDeadkey(ir, {
      triggerKey: resolvedVkey,
      id,
      ...(name !== "" ? { authorName: name } : {}),
      accentChar,
    });
    const committed = commitDeadkeyResult(ir, result);
    if (committed.ok) {
      const written = commitAndRecord(committed.ir, {
        kind: "define",
        triggerKey: resolvedVkey,
        id,
        accentChar,
        ...(name !== "" ? { authorName: name } : {}),
      });
      if (written) onDefined(id);
      return;
    }
    for (const c of committed.conflicts) {
      if (c.kind === "trigger-in-use") {
        const occupantId = c.ids?.[0];
        const occupant =
          occupantId !== undefined
            ? listDeadkeys(ir).find((d) => d.id === occupantId)
            : undefined;
        setConflict({ kind: "trigger-in-use", conflict: c, occupant, triggerLabel: resolvedVkey });
        return;
      }
      if (c.kind === "id-in-use") {
        setConflict({ kind: "id-in-use", conflict: c, id });
        return;
      }
    }
    // Unmapped conflict kind — surface loudly, never silently.
    const detail = committed.conflicts.map((c) => c.message).join(" ");
    setFormError(
      t({
        id: "deadkey.define.error.defineRefused",
        message: `Define refused: ${detail}`,
      }),
    );
  };

  const conflictDialog = (() => {
    if (conflict === null) return null;
    if (conflict.kind === "trigger-in-use") {
      const occupant = conflict.occupant;
      const occupantRef =
        occupant && occupant.id !== null
          ? `dk(${hex4(occupant.id)})`
          : t({ id: "deadkey.define.existingDeadkeyRef", message: "the existing deadkey" });
      const ref = occupantRef;
      const summaryCount = occupant?.pairCount ?? 0;
      const summaryTrigger = occupant?.triggerKey ?? "?";
      const choices: DeadkeyConflictChoice[] = [
        {
          key: "adopt",
          title: t({
            id: "deadkey.define.choice.useOccupantTitle",
            message: `Use ${ref} instead`,
          }),
          body: t({
            id: "deadkey.define.choice.useOccupantBody",
            message:
              "It already answers to this trigger. Open its editor and add your pairs there — no second deadkey.",
          }),
          onSelect: () => {
            if (occupant?.id !== undefined && occupant.id !== null) {
              setConflict(null);
              onAdoptExisting(occupant.id);
            }
          },
          ...(occupant?.id == null
            ? {
                disabled: true,
                disabledNote: t({
                  id: "deadkey.define.choice.occupantUnknown",
                  message: "The occupant couldn't be identified.",
                }),
              }
            : {}),
        },
        {
          key: "retrigger",
          title: t({
            id: "deadkey.define.choice.retriggerTitle",
            message: "Choose a different trigger",
          }),
          body: t({
            id: "deadkey.define.choice.retriggerBody",
            message: "Go back and pick another key.",
          }),
          onSelect: () => setConflict(null),
        },
      ];
      const trigger = conflict.triggerLabel;
      return (
        <DeadkeyConflictDialog
          heading={t({
            id: "deadkey.define.heading.triggerInUse",
            message: `${trigger} already triggers a deadkey`,
          })}
          detail={conflict.conflict.message}
          meta={
            occupant !== undefined && occupant.id !== null
              ? t({
                  id: "deadkey.define.meta.occupantSummary",
                  message: `${ref} — ${summaryCount} pairs — uses ${summaryTrigger} as its trigger.`,
                })
              : undefined
          }
          choices={choices}
          onCancel={() => setConflict(null)}
        />
      );
    }
    // id-in-use
    const existingId = conflict.id;
    const id = hex4(existingId);
    const choices: DeadkeyConflictChoice[] = [
      {
        key: "adopt",
        title: t({
          id: "deadkey.define.choice.useExistingIdTitle",
          message: `Use dk(${id}) instead`,
        }),
        body: t({
          id: "deadkey.define.choice.useExistingIdBody",
          message:
            "That id is already minted. Open its editor rather than minting a second deadkey on the same id.",
        }),
        onSelect: () => {
          setConflict(null);
          onAdoptExisting(existingId);
        },
      },
      {
        key: "reid",
        title: t({
          id: "deadkey.define.choice.reidTitle",
          message: "Pick a different id",
        }),
        body: t({
          id: "deadkey.define.choice.reidBody",
          message: "Go back and edit the proposed id.",
        }),
        onSelect: () => setConflict(null),
      },
    ];
    return (
      <DeadkeyConflictDialog
        heading={t({
          id: "deadkey.define.heading.idMinted",
          message: `dk(${id}) is already minted`,
        })}
        detail={conflict.conflict.message}
        choices={choices}
        onCancel={() => setConflict(null)}
      />
    );
  })();

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_MAIN, margin: "0 0 12px", fontFamily: FONT }}>
        <Trans id="deadkey.define.heading">Define new deadkey</Trans>
      </h2>

      <div style={fieldStyle}>
        <span style={labelStyle}>
          <Trans id="deadkey.define.triggerLabel">Trigger key</Trans>
        </span>
        <KeyPickerField
          value={triggerKey}
          onChange={setTriggerKey}
          customChar={triggerCustomChar}
          onCustomCharChange={setTriggerCustomChar}
          options={[...DEADKEY_OPTIONS]}
          selectAriaLabel={t({
            id: "deadkey.define.triggerSelectAriaLabel",
            message: "Trigger key for the new deadkey",
          })}
          customInputAriaLabel={t({
            id: "deadkey.define.customTriggerAriaLabel",
            message: "Custom trigger character",
          })}
        />
        <div style={hintStyle}>
          <Trans id="deadkey.define.triggerHint">
            Corpus-common suggestions first — or pick any key on the keyboard. The id below is{" "}
            <em>not</em> derived from this choice.
          </Trans>
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="dk-define-id">
          <Trans id="deadkey.define.idLabel">Deadkey id</Trans>
        </label>
        <input
          id="dk-define-id"
          style={{ ...inputStyle, width: 120 }}
          value={idText}
          onChange={(e) => setIdText(e.target.value)}
          aria-describedby="dk-define-id-hint"
        />
        <button type="button" style={ghostBtnStyle} onClick={regenerateId}>
          <Trans id="deadkey.define.regenerateButton">Regenerate</Trans>
        </button>
        <div style={hintStyle} id="dk-define-id-hint">
          <Trans id="deadkey.define.idHint">
            Proposed, unique, stable for this deadkey&apos;s life. Editable, but never coupled to the trigger key.
          </Trans>
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="dk-define-name">
          <Trans id="deadkey.define.nameLabel">
            Name <span style={{ fontWeight: 400, color: TEXT_DIM }}>(optional)</span>
          </Trans>
        </label>
        <input
          id="dk-define-name"
          style={{ ...inputStyle, width: 220 }}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="acute"
        />
        <div style={hintStyle}>
          <Trans id="deadkey.define.nameHint">
            Recorded now, becomes the real id when the FR-004 codec closure lands. You won&apos;t be asked twice.
          </Trans>
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="dk-define-accent">
          <Trans id="deadkey.define.accentLabel">Double-tap emits</Trans>
        </label>
        <input
          id="dk-define-accent"
          style={{ ...inputStyle, width: 160 }}
          value={accentChar}
          onChange={(e) => {
            setAccentTouched(true);
            setAccentChar(e.target.value);
          }}
          maxLength={2}
        />
        <div style={hintStyle}>
          <Trans id="deadkey.define.accentHint">
            Bare accent when the trigger key is pressed twice, so the character stays typable.
          </Trans>
        </div>
      </div>

      <BaseDisclosure hosts={hosts} />

      <div style={questionStyle}>
        <p style={questionTextStyle}>
          <Trans id="deadkey.define.question">Do your typists expect a character on this key?</Trans>
        </p>
        <p style={questionSubStyle}>
          <Trans id="deadkey.define.questionSub">
            Only you can answer that. The rows above are the tradeoff, not a verdict.
          </Trans>
        </p>
      </div>

      <div style={tryItStyle}>
        <Trans id="deadkey.define.tryItLine">
          Try it:&nbsp; {triggerLabel} then a → ? &nbsp;&nbsp;·&nbsp;&nbsp; {triggerLabel} then {triggerLabel} →{" "}
          {accentChar || "?"}
        </Trans>
      </div>

      {formError !== null && (
        <div style={errorStyle} role="alert">{formError}</div>
      )}

      <div>
        <button type="button" style={defineBtnStyle} onClick={handleDefine}>
          <Trans id="deadkey.define.defineButton">Define deadkey</Trans>
        </button>
        <button type="button" style={ghostBtnStyle} onClick={onCancel}>
          {/* eslint-disable-next-line no-restricted-syntax -- not step nav: "Back to inventory" returns to this form's inventory list, not to the previous step. */}
          <Trans id="deadkey.define.backButton">Back to inventory</Trans>
        </button>
      </div>

      {conflictDialog}
    </div>
  );
}
