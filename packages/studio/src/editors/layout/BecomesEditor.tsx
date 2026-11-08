// BecomesEditor -- set what a context plus one keystroke becomes (spec 113 US4, FR-029a, FR-029b).
//
// The author enters exactly the text the context and keystroke turn into, optionally followed by a
// deadkey, or chooses "nothing". The studio writes exactly that: it never decides which part of
// the context is kept. One confirm is one `kmn-edits` entry (`set-row`, or `remove-row`) through
// the working-copy store's `commitKmnEdit` (undo kind `l`); the editor never touches .kmn text or
// the compiler (decision D3: it starts no timer).

import { useId, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LayerCombo, LayoutBecomes, LayoutContext, LayoutContextElement } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { CommitKmnEditResult, KmnEditRefusal } from "../../stores/workingCopyStore.ts";
import { BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { codepointLabel } from "../../survey/codepointLabel.ts";

export interface BecomesEditorProps {
  vkey: string;
  layer: LayerCombo;
  /** What came before the keystroke. */
  context: LayoutContext;
  /** The row's current result, or null when the key has no row in this context yet. */
  current: LayoutBecomes | null;
  /** The deadkeys the result may end with, by id as contexts name them. */
  deadkeys: ReadonlyArray<{ ref: string; label: string }>;
  /** The edit was written; the caller closes the editor. */
  onDone: () => void;
  onCancel: () => void;
}

/** The result a row currently has, split into the editor's fields. */
function splitCurrent(current: LayoutBecomes | null): { text: string; deadkey: string; nothing: boolean } {
  if (current === null) return { text: "", deadkey: "", nothing: false };
  if (!Array.isArray(current)) return { text: "", deadkey: "", nothing: true };
  let text = "";
  let deadkey = "";
  for (const el of current as readonly LayoutContextElement[]) {
    if (el.kind === "text") text += el.text;
    else if (deadkey === "") deadkey = el.deadkeyId;
  }
  return { text, deadkey, nothing: false };
}

export function BecomesEditor({ vkey, layer, context, current, deadkeys, onDone, onCancel }: BecomesEditorProps) {
  const { t } = useLingui();
  const ids = { text: useId(), deadkey: useId(), nothing: useId() };
  const start = splitCurrent(current);
  const [text, setText] = useState(start.text);
  const [deadkey, setDeadkey] = useState(start.deadkey);
  const [nothing, setNothing] = useState(start.nothing);
  const [problem, setProblem] = useState<KmnEditRefusal | null>(null);

  const normalized = text.normalize("NFC");
  const canSet = nothing || normalized !== "" || deadkey !== "";

  function finish(result: CommitKmnEditResult): void {
    if (result.ok) {
      setProblem(null);
      onDone();
    } else setProblem(result.reason);
  }

  function set(): void {
    const becomes: LayoutBecomes = nothing
      ? { kind: "nul" }
      : [
          ...(normalized !== "" ? [{ kind: "text", text: normalized } as const] : []),
          ...(deadkey !== "" ? [{ kind: "deadkey", deadkeyId: deadkey } as const] : []),
        ];
    finish(useWorkingCopyStore.getState().commitKmnEdit({ op: "set-row", vkey, layer, context, becomes }));
  }

  function remove(): void {
    finish(useWorkingCopyStore.getState().commitKmnEdit({ op: "remove-row", vkey, layer, context }));
  }

  function problemText(reason: KmnEditRefusal): string {
    switch (reason) {
      case "locked":
        return t({ id: "editor.layout.becomes.refusedLocked", message: "This desktop layout is complete, so rows cannot be changed here." });
      case "not-compiled":
        return t({ id: "editor.layout.becomes.refusedNotCompiled", message: "The keyboard has not compiled, so the change was not made. Fix the compile errors first." });
      case "read-only":
        return t({ id: "editor.layout.becomes.refusedReadOnly", message: "This row is read-only, so the change was not made. You can change it in the Code tab." });
      case "no-working-copy":
        return t({ id: "editor.layout.becomes.refusedNoKeyboard", message: "There is no keyboard to change yet." });
      case "refused":
        return t({ id: "editor.layout.becomes.refusedOther", message: "The keyboard code cannot take this change here. You can change it in the Code tab." });
    }
  }

  const keyName = vkey.replace(/^K_/, "");
  const preview = nothing
    ? t({ id: "editor.layout.becomes.previewNothing", message: "types nothing" })
    : Array.from(normalized)
        .map((c) => codepointLabel(c).title)
        .join(" ");

  return (
    <div
      role="group"
      aria-label={t({ id: "editor.layout.becomes.aria", message: `Result for key ${{ key: keyName }}` })}
      data-testid="becomes-editor"
      style={groupStyle}
    >
      <label htmlFor={ids.text} style={labelStyle}>
        {t({ id: "editor.layout.becomes.textLabel", message: "It becomes" })}
      </label>
      <input
        id={ids.text}
        type="text"
        value={text}
        disabled={nothing}
        onChange={(e) => setText(e.target.value)}
        data-testid="becomes-input"
        className="ks-focus-ring"
        style={inputStyle}
      />
      <label htmlFor={ids.deadkey} style={labelStyle}>
        {t({ id: "editor.layout.becomes.deadkeyLabel", message: "Then start a deadkey" })}
      </label>
      <select
        id={ids.deadkey}
        value={deadkey}
        disabled={nothing}
        onChange={(e) => setDeadkey(e.target.value)}
        data-testid="becomes-deadkey"
        className="ks-focus-ring"
        style={inputStyle}
      >
        <option value="">{t({ id: "editor.layout.becomes.deadkeyNone", message: "No deadkey" })}</option>
        {deadkeys.map((d) => (
          <option key={d.ref} value={d.ref}>
            {d.label}
          </option>
        ))}
      </select>
      <label htmlFor={ids.nothing} style={labelStyle}>
        <input
          id={ids.nothing}
          type="checkbox"
          checked={nothing}
          onChange={(e) => setNothing(e.target.checked)}
          data-testid="becomes-nothing"
          className="ks-focus-ring"
        />{" "}
        {t({ id: "editor.layout.becomes.nothingLabel", message: "Nothing (the keystroke and what came before are removed)" })}
      </label>
      {preview !== "" && (
        <span style={{ color: TEXT_DIM, fontSize: 12 }} data-testid="becomes-preview">
          {preview}
        </span>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={!canSet} onClick={set} data-testid="becomes-set" className="ks-focus-ring ks-hit-target ks-press" style={buttonStyle}>
          {t({ id: "editor.layout.becomes.set", message: "Set result" })}
        </button>
        {current !== null && (
          <button type="button" onClick={remove} data-testid="becomes-remove" className="ks-focus-ring ks-hit-target ks-press" style={buttonStyle}>
            {t({ id: "editor.layout.becomes.remove", message: "Remove this row" })}
          </button>
        )}
        <button type="button" onClick={onCancel} data-testid="becomes-cancel" className="ks-focus-ring ks-hit-target ks-press" style={buttonStyle}>
          {t({ id: "editor.layout.becomes.cancel", message: "Cancel" })}
        </button>
      </div>
      {problem !== null && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }} data-testid="becomes-problem">
          {problemText(problem)}
        </p>
      )}
    </div>
  );
}

const groupStyle = { display: "flex", flexDirection: "column", gap: 6, padding: "6px 8px", border: `1px solid ${BORDER}`, borderRadius: 4, fontSize: 13, color: TEXT_MAIN } as const;
const labelStyle = { fontSize: 12, color: TEXT_DIM } as const;
const inputStyle = { padding: "4px 8px", fontSize: 14, fontFamily: FONT, border: `1px solid ${BORDER}`, borderRadius: 4, maxWidth: 220 } as const;
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
