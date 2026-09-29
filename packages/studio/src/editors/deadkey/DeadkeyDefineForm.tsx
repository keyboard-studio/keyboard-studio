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
import { HostDisclosure } from "./HostDisclosure.tsx";
import { referenceHosts } from "../../lib/referenceHosts/index.ts";

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
  onCommitIr: (nextIr: KeyboardIR) => void;
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
  const commitAndRecord = (next: KeyboardIR, op: DeadkeyOperation) => {
    onCommitIr(next);
    recordDeadkeyOp(op);
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
      ? triggerCustomChar || "(custom key)"
      : triggerKey || "(no trigger chosen)";

  const hosts = useMemo(
    () =>
      referenceHosts({
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
      setFormError("Pick a trigger key first — choose a suggestion or enter any character.");
      return;
    }
    const id = parseIdText(idText);
    if (id === null) {
      setFormError("The id must be a hex number like 3000 (dk(3000) also works).");
      return;
    }
    if (Array.from(accentChar).length !== 1) {
      setFormError("Double-tap emits must be exactly one character — the bare accent the trigger key types twice.");
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
      commitAndRecord(committed.ir, {
        kind: "define",
        triggerKey: resolvedVkey,
        id,
        accentChar,
        ...(name !== "" ? { authorName: name } : {}),
      });
      onDefined(id);
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
    setFormError(
      `Define refused: ${committed.conflicts.map((c) => c.message).join(" ")}`,
    );
  };

  const conflictDialog = (() => {
    if (conflict === null) return null;
    if (conflict.kind === "trigger-in-use") {
      const occupant = conflict.occupant;
      const occupantRef =
        occupant && occupant.id !== null ? `dk(${hex4(occupant.id)})` : "the existing deadkey";
      const choices: DeadkeyConflictChoice[] = [
        {
          key: "adopt",
          title: `Use ${occupantRef} instead`,
          body: "It already answers to this trigger. Open its editor and add your pairs there — no second deadkey.",
          onSelect: () => {
            if (occupant?.id !== undefined && occupant.id !== null) {
              setConflict(null);
              onAdoptExisting(occupant.id);
            }
          },
          ...(occupant?.id == null ? { disabled: true, disabledNote: "The occupant couldn't be identified." } : {}),
        },
        {
          key: "retrigger",
          title: "Choose a different trigger",
          body: "Go back and pick another key.",
          onSelect: () => setConflict(null),
        },
      ];
      return (
        <DeadkeyConflictDialog
          heading={`${conflict.triggerLabel} already triggers a deadkey`}
          detail={conflict.conflict.message}
          meta={
            occupant !== undefined && occupant.id !== null
              ? `${occupantRef} — ${occupant.pairCount} pairs — uses ${occupant.triggerKey ?? "?"} as its trigger.`
              : undefined
          }
          choices={choices}
          onCancel={() => setConflict(null)}
        />
      );
    }
    // id-in-use
    const existingId = conflict.id;
    const choices: DeadkeyConflictChoice[] = [
      {
        key: "adopt",
        title: `Use dk(${hex4(existingId)}) instead`,
        body: "That id is already minted. Open its editor rather than minting a second deadkey on the same id.",
        onSelect: () => {
          setConflict(null);
          onAdoptExisting(existingId);
        },
      },
      {
        key: "reid",
        title: "Pick a different id",
        body: "Go back and edit the proposed id.",
        onSelect: () => setConflict(null),
      },
    ];
    return (
      <DeadkeyConflictDialog
        heading={`dk(${hex4(existingId)}) is already minted`}
        detail={conflict.conflict.message}
        choices={choices}
        onCancel={() => setConflict(null)}
      />
    );
  })();

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_MAIN, margin: "0 0 12px", fontFamily: FONT }}>
        Define new deadkey
      </h2>

      <div style={fieldStyle}>
        <span style={labelStyle}>Trigger key</span>
        <KeyPickerField
          value={triggerKey}
          onChange={setTriggerKey}
          customChar={triggerCustomChar}
          onCustomCharChange={setTriggerCustomChar}
          options={[...DEADKEY_OPTIONS]}
          selectAriaLabel="Trigger key for the new deadkey"
          customInputAriaLabel="Custom trigger character"
        />
        <div style={hintStyle}>
          Corpus-common suggestions first — or pick any key on the keyboard. The id below is{" "}
          <em>not</em> derived from this choice.
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="dk-define-id">Deadkey id</label>
        <input
          id="dk-define-id"
          style={{ ...inputStyle, width: 120 }}
          value={idText}
          onChange={(e) => setIdText(e.target.value)}
          aria-describedby="dk-define-id-hint"
        />
        <button type="button" style={ghostBtnStyle} onClick={regenerateId}>
          Regenerate
        </button>
        <div style={hintStyle} id="dk-define-id-hint">
          Proposed, unique, stable for this deadkey&apos;s life. Editable, but never coupled to the trigger key.
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="dk-define-name">
          Name <span style={{ fontWeight: 400, color: TEXT_DIM }}>(optional)</span>
        </label>
        <input
          id="dk-define-name"
          style={{ ...inputStyle, width: 220 }}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="acute"
        />
        <div style={hintStyle}>
          Recorded now, becomes the real id when the FR-004 codec closure lands. You won&apos;t be asked twice.
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="dk-define-accent">Double-tap emits</label>
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
          Bare accent when the trigger key is pressed twice, so the character stays typable.
        </div>
      </div>

      <HostDisclosure hosts={hosts} />

      <div style={questionStyle}>
        <p style={questionTextStyle}>Do your typists expect a character on this key?</p>
        <p style={questionSubStyle}>Only you can answer that. The rows above are the tradeoff, not a verdict.</p>
      </div>

      <div style={tryItStyle}>
        Try it:&nbsp; {triggerLabel} then a → ? &nbsp;&nbsp;·&nbsp;&nbsp; {triggerLabel} then {triggerLabel} →{" "}
        {accentChar || "?"}
      </div>

      {formError !== null && (
        <div style={errorStyle} role="alert">{formError}</div>
      )}

      <div>
        <button type="button" style={defineBtnStyle} onClick={handleDefine}>
          Define deadkey
        </button>
        <button type="button" style={ghostBtnStyle} onClick={onCancel}>
          Back to inventory
        </button>
      </div>

      {conflictDialog}
    </div>
  );
}
