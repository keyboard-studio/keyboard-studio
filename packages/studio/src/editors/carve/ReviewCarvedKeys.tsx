// ReviewCarvedKeys — a plain review of what the author carved.
//
// Adapted from the retired "Review removed keys" panel (design §4): it lists
// every carved combination (key + modifiers, or the store slot) and nothing
// else. There is no disposition column and no fallback verdict — what an
// undefined key does is the keyboard-wide fallback policy, decided in the
// Assign Mechanisms step, never here.

import { Trans, useLingui } from "@lingui/react/macro";
import { Dialog } from "../../ui/Dialog.tsx";
import type { CarvedCombo } from "../../lib/carvedCombo.ts";

export interface ReviewCarvedKeysDialogProps {
  open: boolean;
  combos: readonly CarvedCombo[];
  onClose: () => void;
}

export function ReviewCarvedKeysDialog({ open, combos, onClose }: ReviewCarvedKeysDialogProps) {
  const { t } = useLingui();
  return (
    <Dialog
      open={open}
      onCancel={onClose}
      label={t({ id: "carve.review.title", message: "Review carved keys" })}
      testId="review-carved-keys-dialog"
      minWidth={380}
      maxWidth={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, color: "var(--app-text)", fontFamily: "var(--app-font)" }}>
        <h2 style={{ margin: 0, font: "600 17px var(--app-font)" }}>
          <Trans id="carve.review.heading">Review carved keys</Trans>
        </h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--app-text-muted)" }}>
          <Trans id="carve.review.body">Every key combination you carved out of the starting keyboard.</Trans>
        </p>
        {combos.length === 0 ? (
          <p data-testid="review-carved-keys-empty" style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
            <Trans id="carve.review.empty">No carved keys yet — discard a character to review it here.</Trans>
          </p>
        ) : (
          <ul data-testid="review-carved-keys-list" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {combos.map((c) => (
              <li
                key={c.comboId}
                data-testid={`review-carved-keys-row-${c.comboId}`}
                style={{ padding: "6px 8px", borderRadius: 6, background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}
              >
                <span style={{ font: "600 13px var(--app-font-mono)" }}>{c.label}</span>
                {c.isStoreSlot && (
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--app-text-subtle)" }}>
                    <Trans id="carve.review.storeEntry">store entry</Trans>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div>
          <button
            type="button"
            className="ks-focus-ring"
            data-testid="review-carved-keys-close"
            onClick={onClose}
            style={{ font: "600 12.5px var(--app-font)", cursor: "pointer", color: "var(--app-text-muted)", background: "var(--app-surface-2)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "7px 14px" }}
          >
            <Trans id="carve.review.close">Close</Trans>
          </button>
        </div>
      </div>
    </Dialog>
  );
}
