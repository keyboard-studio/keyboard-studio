// ReformatConsentDialog -- asks the author before a whole file is re-emitted
// (spec 111 FR-009).
//
// On Open, a change to a `.kmn` is spliced into the file's own text. When a
// change cannot be placed precisely, the projection leaves the file as it was
// and names it (`reformatRequired`). This dialog names each such file and lets
// the author agree to a full re-emit (which reformats the file) or keep the
// file as it is. It owns only the frame and the choice; the caller re-projects
// with `consentedReemit` on agreement.
//
// Accessibility (docs/accessibility.md): the shared `Dialog` primitive is the
// APG modal pattern -- focus moves in on open, Tab cycles, Escape cancels. The
// file names are a list, and the dialog's accessible name states the purpose.

import { useLingui } from "@lingui/react/macro";
import { Dialog } from "../ui/Dialog.tsx";
import { ACCENT, BORDER, FONT, TEXT_MAIN } from "../ui/theme.ts";

export interface ReformatConsentDialogProps {
  readonly open: boolean;
  /** The files (VFS paths) a full re-emit would reformat. */
  readonly files: readonly string[];
  /** The author agrees to the re-emit. */
  readonly onConsent: () => void;
  /** The author keeps the files as they are (also Escape). */
  readonly onCancel: () => void;
}

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

export function ReformatConsentDialog({
  open,
  files,
  onConsent,
  onCancel,
}: ReformatConsentDialogProps) {
  const { t } = useLingui();
  return (
    <Dialog
      open={open}
      onCancel={onCancel}
      label={t({
        id: "output.reformat.dialog.label",
        message: "Reformat files?",
      })}
      testId="reformat-consent-dialog"
      minWidth={380}
      maxWidth={560}
    >
      <p data-testid="reformat-consent-body" style={{ margin: 0, color: TEXT_MAIN }}>
        {t({
          id: "output.reformat.dialog.body",
          message:
            "Your changes can't be placed into these files without rewriting them. Rewriting reformats the whole file (comments and layout may change). Agree to rewrite, or keep the files as they are.",
        })}
      </p>
      <ul data-testid="reformat-consent-files" style={{ color: TEXT_MAIN }}>
        {files.map((f) => (
          <li key={f}>
            <code>{f}</code>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" data-testid="reformat-consent-keep" onClick={onCancel} style={buttonStyle}>
          {t({ id: "output.reformat.dialog.keep", message: "Keep files as they are" })}
        </button>
        <button
          type="button"
          data-testid="reformat-consent-agree"
          onClick={onConsent}
          style={{ ...buttonStyle, border: `1px solid ${ACCENT}`, fontWeight: 600 }}
        >
          {t({ id: "output.reformat.dialog.agree", message: "Rewrite the files" })}
        </button>
      </div>
    </Dialog>
  );
}
