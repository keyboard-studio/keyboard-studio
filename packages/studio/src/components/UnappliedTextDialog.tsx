// UnappliedTextDialog -- asks what to do with code-view text the author has not
// applied when they leave the view (spec 111 FR-046). Mounted once in
// StudioShell; driven by `unappliedTextStore`.
//
// Accessibility (docs/accessibility.md): the shared `Dialog` primitive is the APG
// modal pattern -- focus moves in on open, Tab cycles, Escape keeps the author
// where they are. The views named are a list in plain words.

import { useEffect } from "react";
import { useLingui } from "@lingui/react/macro";
import { Dialog } from "../ui/Dialog.tsx";
import { ACCENT, BORDER, FONT, TEXT_MAIN } from "../ui/theme.ts";
import { useUnappliedTextStore } from "../stores/unappliedTextStore.ts";

const buttonStyle = {
  padding: "8px 16px",
  fontSize: 14,
  fontFamily: FONT,
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: "var(--app-surface)",
  color: TEXT_MAIN,
  cursor: "pointer",
} as const;

export function UnappliedTextDialog() {
  const { t, i18n } = useLingui();
  const asking = useUnappliedTextStore((s) => s.asking);
  const answer = useUnappliedTextStore((s) => s.answer);
  // A question left open when the dialog unmounts is answered "keep editing", so the next leave is not ignored.
  useEffect(() => () => useUnappliedTextStore.getState().answer("cancel"), []);
  const views =
    asking === null
      ? ""
      : new Intl.ListFormat(i18n.locale, { style: "long", type: "conjunction" }).format(asking.labels);
  return (
    <Dialog
      open={asking !== null}
      onCancel={() => answer("cancel")}
      label={t({ id: "open.unapplied.dialog.label", message: "Apply your changes?" })}
      testId="unapplied-text-dialog"
      minWidth={380}
      maxWidth={560}
    >
      <p data-testid="unapplied-text-body" style={{ margin: 0, color: TEXT_MAIN }}>
        {asking?.allowApply === false
          ? t({
              id: "open.unapplied.dialog.bodyUndo",
              message: `Undo changes the keyboard's files, and ${{ views }} holds changes that are not applied. Discard those changes and undo, or keep editing?`,
            })
          : t({
              id: "open.unapplied.dialog.body",
              message: `You have changes in ${{ views }} that are not applied to the keyboard's files yet. Apply them, or discard them?`,
            })}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" data-testid="unapplied-text-cancel" onClick={() => answer("cancel")} style={buttonStyle}>
          {t({ id: "open.unapplied.dialog.cancel", message: "Keep editing" })}
        </button>
        <button type="button" data-testid="unapplied-text-discard" onClick={() => answer("discard")} style={buttonStyle}>
          {t({ id: "open.unapplied.dialog.discard", message: "Discard changes" })}
        </button>
        {asking?.allowApply === false ? null : (
          <button
            type="button"
            data-testid="unapplied-text-apply"
            onClick={() => answer("apply")}
            style={{ ...buttonStyle, border: `1px solid ${ACCENT}`, fontWeight: 600 }}
          >
            {t({ id: "open.unapplied.dialog.apply", message: "Apply changes" })}
          </button>
        )}
      </div>
    </Dialog>
  );
}
