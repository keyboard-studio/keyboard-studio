// ReviewNoteEditor — the author's reason for keeping one NEW failure (spec 111,
// FR-025/026). Plain props only (the CriteriaPage D8 layer rule): the host
// passes the saved text and the write/remove callbacks. A note is never a
// decision; it lives in the criteria slice and is dropped automatically when
// its finding stops failing.

import { useId, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";

import { BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

export interface ReviewNoteEditorProps {
  /** The file the failure is in, shown so several notes on one row stay distinct. */
  fileLabel: string;
  /** Saved note text, or undefined when none is written. */
  text: string | undefined;
  onSave: (text: string) => void;
  onRemove: () => void;
}

export function ReviewNoteEditor({
  fileLabel,
  text,
  onSave,
  onRemove,
}: ReviewNoteEditorProps) {
  const { t } = useLingui();
  const fieldId = useId();
  const [draft, setDraft] = useState(text ?? "");
  const dirty = draft.trim() !== (text ?? "").trim();

  return (
    <div style={{ marginTop: 6, fontFamily: FONT }} data-testid="review-note-editor">
      <label htmlFor={fieldId} style={{ display: "block", fontSize: 12, color: TEXT_DIM }}>
        {fileLabel === ""
          ? t({
              id: "criteria.open.note.label",
              message: "Why keep this new failure?",
            })
          : t({
              id: "criteria.open.note.labelFile",
              message: `Why keep this new failure in ${fileLabel}?`,
            })}
      </label>
      <textarea
        id={fieldId}
        value={draft}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginTop: 2,
          padding: "4px 6px",
          border: `1px solid ${BORDER}`,
          borderRadius: 4,
          background: "var(--app-bg)",
          color: "var(--app-text)",
          fontFamily: FONT,
          fontSize: 13,
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          disabled={!dirty || draft.trim() === ""}
          onClick={() => onSave(draft.trim())}
        >
          <Trans id="criteria.open.note.save">Save note</Trans>
        </button>
        {text !== undefined && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onRemove();
            }}
          >
            <Trans id="criteria.open.note.remove">Remove note</Trans>
          </button>
        )}
      </div>
    </div>
  );
}
