// OpenUndoButton -- the one "Undo" an author sees on an opened keyboard (spec
// 111 FR-045, T093). It acts on the session undo log (`openUndoStore`), which
// holds one step per applied change: removals, assignments, code-view edits,
// fixes. The accessible name says which step it will undo; with nothing to undo
// the button stays focusable (aria-disabled) and a hidden description says why.
// A refusal is announced in a live region. There is no redo: the studio offers
// none, so none is added here. Synchronous; no timers.

import { useEffect, useId, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useOpenUndoStore, type OpenUndoRecord } from "../stores/openUndoStore.ts";
import { lastUndoableRecord, undoLastOpenApply } from "../lib/openApply.ts";
import { Button } from "../ui/Button.tsx";
import { guardLeave } from "../stores/unappliedTextStore.ts";
import { visuallyHidden } from "../survey/surveyStyles.ts";

const MAX_SHOWN_CHARS = 5;

function shownChars(chars: readonly string[]): string {
  const shown = chars.slice(0, MAX_SHOWN_CHARS).join(" ");
  return chars.length > MAX_SHOWN_CHARS ? `${shown} …` : shown;
}

export function OpenUndoButton() {
  const { t } = useLingui();
  const records = useOpenUndoStore((s) => s.records);
  const hintId = useId();
  // The refusal is cleared, then set on the next render, so the same text twice
  // in a row is announced twice. Effects ride the render cycle: no timer.
  const [pending, setPending] = useState<{ afterId: string; text: string } | null>(null);
  const [shown, setShown] = useState<{ afterId: string; text: string } | null>(null);
  useEffect(() => {
    setShown(pending);
  }, [pending]);

  // The same selector the undo uses, so the label is the step that is undone.
  const last: OpenUndoRecord | undefined = lastUndoableRecord();
  void records; // subscribed above so a log change re-renders and re-selects

  const describe = (r: OpenUndoRecord): string => {
    const v = r.view;
    switch (r.labelKey) {
      case "code-view":
        return t({ id: "openUndo.codeView", message: "Undo: code view edit" });
      case "context-tolerance":
        return t({ id: "openUndo.contextTolerance", message: "Undo: context-tolerance fix" });
      case "take-back":
        return t({ id: "openUndo.unassign", message: "Undo: took back an assignment" });
      case "layout-edit":
        return t({ id: "openUndo.layoutEdit", message: "Undo: Layout tab change" });
      case "languages":
        return t({ id: "openUndo.languages", message: "Undo: language list change" });
      case "stylesheet":
        return t({ id: "openUndo.stylesheet", message: "Undo: stylesheet change" });
      case "doc-image-width":
        return t({ id: "openUndo.docImageWidth", message: "Undo: image width rule" });
      case "docs-edit":
        return t({ id: "openUndo.docsEdit", message: "Undo: documentation page edit" });
      case "docs-regenerate":
        return t({ id: "openUndo.docsRegenerate", message: "Undo: regenerated documentation section" });
      case "docs-create":
        return t({ id: "openUndo.docsCreate", message: "Undo: created documentation page" });
      case "osk":
        return t({ id: "openUndo.osk", message: "Undo: on-screen keyboard change" });
      case "copyright":
        return t({ id: "openUndo.copyright", message: "Undo: copyright holder change" });
      case "project-link":
        return t({ id: "openUndo.projectLink", message: "Undo: project link change" });
      case "caps":
        return t({ id: "openUndo.caps", message: "Undo: Caps Lock handling" });
      case undefined:
        break;
    }
    switch (v.kind) {
      case "removal":
        return t({
          id: "openUndo.removal",
          message: `Undo: removed ${{ chars: shownChars(v.entry.chars) }}`,
        });
      case "restore":
        return t({ id: "openUndo.restore", message: "Undo: restored removed items" });
      case "assign":
        return t({ id: "openUndo.assign", message: "Undo: assigned characters" });
      case "marks":
        return t({ id: "openUndo.marks", message: "Undo: wrote the marks guards" });
      case "files":
      case "touch":
        return t({ id: "openUndo.generic", message: `Undo: ${{ label: r.label }}` });
    }
  };

  const empty = last === undefined;
  // A refusal belongs to the step it refused; once the log moves it is stale.
  const notice = shown !== null && shown.afterId === last?.id ? shown.text : "";

  const refusalText = (result: Extract<ReturnType<typeof undoLastOpenApply>, { ok: false }>): string => {
    switch (result.code) {
      case "changed-since":
        return t({
          id: "openUndo.changedSince",
          message: `${{ files: (result.changedSince ?? []).join(", ") }} changed since, so this cannot be undone.`,
        });
      case "nothing":
        return t({ id: "openUndo.nothing", message: "Nothing to undo" });
      case "not-open":
        return t({ id: "openUndo.notOpen", message: "This keyboard was not opened for update, so there is nothing to undo." });
      case "stale":
        return t({ id: "openUndo.stale", message: "The list of changes moved on. Try Undo again." });
      case "write-failed":
        return t({ id: "openUndo.writeFailed", message: `Could not undo: ${{ detail: result.reason }}` });
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="compact"
        data-testid="open-undo-button"
        aria-disabled={empty ? "true" : undefined}
        aria-describedby={empty ? hintId : undefined}
        // Enabled: the name says what is undone. Empty: the name is the visible text.
        aria-label={empty ? undefined : describe(last)}
        title={empty ? undefined : describe(last)}
        // aria-disabled, not disabled, so Button can't pick its disabled look: match it here.
        style={
          empty
            ? {
                background: "transparent",
                borderColor: "var(--app-border)",
                color: "var(--app-text-disabled)",
                cursor: "not-allowed",
              }
            : undefined
        }
        onClick={() => {
          if (last === undefined) return;
          // Spec 111 FR-046: Undo reseeds the code views, so unapplied text there is asked about first.
          guardLeave(() => {
            // The step may have changed while the question was open: undo what is last now.
            const target = lastUndoableRecord();
            if (target === undefined) return;
            const result = undoLastOpenApply(target.id);
            // Empty now, set by the effect after this render commits.
            setShown(null);
            setPending(result.ok ? null : { afterId: target.id, text: refusalText(result) });
          }, { allowApply: false });
        }}
      >
        {t({ id: "openUndo.label", message: "Undo" })}
      </Button>
      {empty && (
        <span id={hintId} style={visuallyHidden}>
          {t({ id: "openUndo.nothing", message: "Nothing to undo" })}
        </span>
      )}
      <span
        role="status"
        data-testid="open-undo-notice"
        style={{ fontSize: 12, whiteSpace: "normal", maxWidth: 260, lineHeight: 1.2, flexShrink: 0 }}
      >
        {notice}
      </span>
    </>
  );
}
