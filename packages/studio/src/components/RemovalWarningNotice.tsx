// RemovalWarningNotice — the dismissable FR-006 warning: a removed character is
// needed by one or more listed languages, named here. Never blocks; Dismiss
// keeps the removal. Shared by the Copy carve gallery, the Open Remove tool and
// the Open gallery's existing-method removal.

import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Notice } from "../ui/index.ts";
import { characterDisplayName } from "../lib/irToCharacterView.ts";
import type { RemovalWarning } from "../lib/removalWarning.ts";

function languageLabel(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export interface RemovalWarningNoticeProps {
  warnings: readonly RemovalWarning[];
  onDismiss: (char: string) => void;
}

export function RemovalWarningNotice({ warnings, onDismiss }: RemovalWarningNoticeProps) {
  const { t, i18n } = useLingui();
  if (warnings.length === 0) return null;
  return (
    <div data-testid="removal-warning" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {warnings.map((w) => {
        const languages = new Intl.ListFormat(i18n.locale, { style: "long", type: "conjunction" }).format(
          w.languages.map((tag) => languageLabel(tag, i18n.locale)),
        );
        const name = characterDisplayName(w.char);
        return (
          <Notice key={w.char} tone="warn">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span data-testid={`removal-warning-${w.char.codePointAt(0)?.toString(16)}`}>
                <Trans id="removal.warning.needed">
                  {name} is needed by {languages}. You can keep it removed.
                </Trans>
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onDismiss(w.char)}
                aria-label={t({ id: "removal.warning.dismissLabel", message: `Dismiss warning for ${name}` })}
              >
                <Trans id="removal.warning.dismiss">Dismiss</Trans>
              </Button>
            </div>
          </Notice>
        );
      })}
    </div>
  );
}
