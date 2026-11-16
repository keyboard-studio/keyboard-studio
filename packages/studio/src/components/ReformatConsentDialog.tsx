// ReformatConsentDialog -- asks the author before a whole file is re-emitted
// (spec 111 FR-009), at the moment a change is applied.
//
// On Open, a change to a `.kmn` is spliced into the file's own text. When a
// change cannot be placed precisely, nothing is written and the apply names the
// file (`needs-consent`). This dialog names each such file and lets the author
// agree to a full re-emit (which reformats the file) or keep the file as it is.
// It owns only the frame and the choice; `OpenApplyHost` applies again with
// `consentedReemit` on agreement. Its only consumer is that host.
//
// Accessibility (docs/accessibility.md): the shared `Dialog` primitive is the
// APG modal pattern -- focus moves in on open, Tab cycles, Escape cancels. The
// file names are a list, and the dialog's accessible name states the purpose.

import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { Dialog } from "../ui/Dialog.tsx";
import { ACCENT, BORDER, FONT, TEXT_MAIN } from "../ui/theme.ts";
import type { TouchReplacementSummary } from "../lib/openApply/types.ts";

export interface ReformatConsentDialogProps {
  readonly open: boolean;
  /** The files (VFS paths) a full re-emit would reformat. */
  readonly files: readonly string[];
  /**
   * Set when the question is about replacing (or creating) the touch layout
   * rather than a reformat (spec 111 FR-009, FR-017): the dialog names the file
   * and says what will change.
   */
  readonly touchReplacement?: TouchReplacementSummary | undefined;
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
  touchReplacement,
  onConsent,
  onCancel,
}: ReformatConsentDialogProps) {
  const { t, i18n } = useLingui();
  const s = touchReplacement;
  const list = (items: readonly string[]): string =>
    new Intl.ListFormat(i18n.locale, { style: "long", type: "conjunction" }).format(items);
  const label =
    s === undefined
      ? t({ id: "output.reformat.dialog.label", message: "Reformat files?" })
      : s.creating
        ? t({ id: "output.touchReplace.dialog.createLabel", message: "Create a touch layout?" })
        : t({ id: "output.touchReplace.dialog.replaceLabel", message: "Replace the touch layout?" });
  const keepLabel =
    s === undefined
      ? t({ id: "output.reformat.dialog.keep", message: "Keep files as they are" })
      : s.creating
        ? t({ id: "output.touchReplace.dialog.keepNone", message: "Do not create it" })
        : t({ id: "output.touchReplace.dialog.keep", message: "Keep my touch layout" });
  const agreeLabel =
    s === undefined
      ? t({ id: "output.reformat.dialog.agree", message: "Rewrite the files" })
      : s.creating
        ? t({ id: "output.touchReplace.dialog.create", message: "Create the touch layout" })
        : t({ id: "output.touchReplace.dialog.replace", message: "Replace the touch layout" });
  return (
    <Dialog open={open} onCancel={onCancel} label={label} testId="reformat-consent-dialog" minWidth={380} maxWidth={560}>
      <p data-testid="reformat-consent-body" style={{ margin: 0, color: TEXT_MAIN }}>
        {s === undefined
          ? t({
              id: "output.reformat.dialog.body",
              message:
                "Your changes can't be placed into these files without rewriting them. Rewriting reformats the whole file (comments and layout may change). Agree to rewrite, or keep the files as they are.",
            })
          : s.creating
            ? t({
                id: "output.touchReplace.dialog.createBody",
                message: `This keyboard has no touch layout. The studio will create ${{ path: s.path }} from your desktop keys. You can undo this afterwards.`,
              })
            : t({
                id: "output.touchReplace.dialog.replaceBody",
                message: `The studio will replace ${{ path: s.path }} with a new touch layout made from your desktop keys. Your current touch layout will be gone, except through Undo.`,
              })}
      </p>
      {s === undefined ? (
        <ul data-testid="reformat-consent-files" style={{ color: TEXT_MAIN }}>
          {files.map((f) => (
            <li key={f}>
              <code>{f}</code>
            </li>
          ))}
        </ul>
      ) : (
        <ul data-testid="touch-replace-summary" style={{ color: TEXT_MAIN }}>
          <li data-testid="touch-replace-keys">
            {s.unreadable
              ? t({
                  id: "output.touchReplace.dialog.keysUnreadable",
                  message: "The touch layout file cannot be read, so the number of keys cannot be compared.",
                })
              : s.creating
                ? t({
                    id: "output.touchReplace.dialog.keysCreated",
                    message: plural(s.keysAfter, { one: "# key will be created", other: "# keys will be created" }),
                  })
                : t({
                    id: "output.touchReplace.dialog.keysChanged",
                    message: `Keys: ${{ before: s.keysBefore }} now, ${{ after: s.keysAfter }} after`,
                  })}
          </li>
          {s.layersAdded.length > 0 && (
            <li data-testid="touch-replace-layers-added">
              {t({ id: "output.touchReplace.dialog.layersAdded", message: `Layers added: ${{ layers: list(s.layersAdded) }}` })}
            </li>
          )}
          {s.layersRemoved.length > 0 && (
            <li data-testid="touch-replace-layers-removed">
              {t({
                id: "output.touchReplace.dialog.layersRemoved",
                message: `Layers removed: ${{ layers: list(s.layersRemoved) }}`,
              })}
            </li>
          )}
          {s.orphanedRules > 0 && (
            <li data-testid="touch-replace-orphaned-rules">
              {t({
                id: "output.touchReplace.dialog.orphanedRules",
                message: plural(s.orphanedRules, {
                  one: "# rule refers to a touch key the new layout does not have; it will no longer apply.",
                  other: "# rules refer to touch keys the new layout does not have; they will no longer apply.",
                }),
              })}
            </li>
          )}
          {s.orphanedDrafts > 0 && (
            <li data-testid="touch-replace-orphaned-drafts">
              {t({
                id: "output.touchReplace.dialog.orphanedDrafts",
                message: plural(s.orphanedDrafts, {
                  one: "# touch placement in progress uses a key the new layout does not have.",
                  other: "# touch placements in progress use keys the new layout does not have.",
                }),
              })}
            </li>
          )}
          {s.alsoWrites.length > 0 && (
            <li data-testid="touch-replace-also">
              {t({
                id: "output.touchReplace.dialog.alsoWrites",
                message: `The keyboard's other files are updated to include it: ${{ files: list(s.alsoWrites) }}`,
              })}
            </li>
          )}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" data-testid="reformat-consent-keep" onClick={onCancel} style={buttonStyle}>
          {keepLabel}
        </button>
        <button
          type="button"
          data-testid="reformat-consent-agree"
          onClick={onConsent}
          style={{ ...buttonStyle, border: `1px solid ${ACCENT}`, fontWeight: 600 }}
        >
          {agreeLabel}
        </button>
      </div>
    </Dialog>
  );
}
