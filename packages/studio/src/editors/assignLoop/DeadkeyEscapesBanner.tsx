// DeadkeyEscapesBanner — confirm how a new deadkey's trigger character stays
// typeable.
//
// Raised when a gallery placement puts a deadkey on a trigger key for the
// first time. The trigger's own character (e.g. ;) can stay typeable by
// pressing the trigger twice, the trigger then space, and/or AltGr + the
// trigger — sil_cameroon_qwerty's ; deadkey offers all three. The placement
// already applied the remembered choice (the last deadkey's, else all
// three); each checkbox here edits that live, and the next deadkey proposes
// whatever was left checked. Same ProposalCard shell (role="note") as the
// case-pair and displacement banners.
//
// ICU note (same trap as the displacement banner): the trigger character may
// be an apostrophe, so it travels inside interpolated values, never in the
// message template.

import { Trans, useLingui } from "@lingui/react/macro";
import { keyLabelOrRaw } from "../../lib/keyLabel.ts";
import { KeyCap } from "../../ui/KeyCap.tsx";
import { BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { visuallyHidden } from "../../survey/surveyStyles.ts";
import { ProposalCard } from "./parts/ProposalCard.tsx";
import { DEADKEY_ESCAPES, type DeadkeyEscape } from "./deadkeyPurpose.ts";

export interface DeadkeyEscapesBannerProps {
  /** Trigger vkey, e.g. "K_COLON". */
  triggerKey: string;
  /** The character the trigger key typed before it became a deadkey, e.g. ";". */
  triggerChar: string;
  escapes: ReadonlySet<DeadkeyEscape>;
  /** False when AltGr + the trigger already types something else. */
  altgrAvailable: boolean;
  onToggle: (escape: DeadkeyEscape, on: boolean) => void;
  onDone: () => void;
}

export function DeadkeyEscapesBanner({
  triggerKey,
  triggerChar,
  escapes,
  altgrAvailable,
  onToggle,
  onDone,
}: DeadkeyEscapesBannerProps) {
  const { t } = useLingui();
  const keyName = keyLabelOrRaw(triggerKey);
  const labels: Record<DeadkeyEscape, string> = {
    "double-tap": t({
      id: "editor.assignLoop.deadkeyEscapes.doubleTap",
      message: `Press ${keyName} twice`,
    }),
    space: t({
      id: "editor.assignLoop.deadkeyEscapes.space",
      message: `Press ${keyName}, then space`,
    }),
    altgr: t({
      id: "editor.assignLoop.deadkeyEscapes.altgr",
      message: `AltGr + ${keyName}`,
    }),
  };
  return (
    <ProposalCard
      ariaLabel={t({
        id: "editor.assignLoop.deadkeyEscapes.ariaLabel",
        message: "Deadkey escapes",
      })}
      message={
        <Trans id="editor.assignLoop.deadkeyEscapes.prompt">
          <KeyCap>{keyName}</KeyCap> now starts a deadkey. Keep {triggerChar}{" "}
          typeable by:
        </Trans>
      }
    >
      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <legend style={visuallyHidden}>
          {t({
            id: "editor.assignLoop.deadkeyEscapes.legend",
            message: `Ways to type ${triggerChar}`,
          })}
        </legend>
        {DEADKEY_ESCAPES.map((escape) => {
          const disabled = escape === "altgr" && !altgrAvailable && !escapes.has("altgr");
          return (
            <label
              key={escape}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: FONT, color: disabled ? TEXT_DIM : TEXT_MAIN }}
            >
              <input
                type="checkbox"
                data-testid={`deadkey-escape-${escape}`}
                checked={escapes.has(escape)}
                disabled={disabled}
                onChange={(e) => onToggle(escape, e.target.checked)}
              />
              {labels[escape]}
              {disabled && (
                <span style={{ color: TEXT_DIM }}>
                  {" "}
                  <Trans id="editor.assignLoop.deadkeyEscapes.altgrTaken">
                    (already types something else)
                  </Trans>
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
          <Trans id="editor.assignLoop.deadkeyEscapes.remembered">
            Your next deadkey starts with these choices.
          </Trans>
        </span>
        <button
          type="button"
          data-testid="deadkey-escapes-done"
          onClick={onDone}
          style={{
            marginLeft: "auto",
            padding: "5px 14px",
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 5,
            color: TEXT_MAIN,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          <Trans id="editor.assignLoop.deadkeyEscapes.done">Done</Trans>
        </button>
      </div>
    </ProposalCard>
  );
}
