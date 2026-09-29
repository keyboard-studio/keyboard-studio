// DeadkeyConflictDialog — the ONE conflict surface for every deadkey
// lifecycle action (define / rename / retarget / delete), spec 083 US6.
//
// Explicit-over-silent: every conflict kind maps to explicit author
// choices supplied by the calling flow. The dialog itself never picks,
// never merges, never defaults — Cancel is always present and always an
// option, and there is no silent default (no choice is pre-selected or
// submitted without a click).

import type { CSSProperties, ReactNode } from "react";
import {
  BG_CARD,
  BG_PAGE,
  BORDER,
  TEXT_MAIN,
  TEXT_DIM,
  FONT,
} from "../../lib/galleryTheme.ts";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  fontFamily: FONT,
};

const dialogStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "18px 20px",
  maxWidth: 520,
  width: "calc(100% - 48px)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
};

const headingStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: TEXT_MAIN,
  margin: "0 0 6px",
};

const detailStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  margin: "0 0 4px",
};

const metaStyle: CSSProperties = {
  fontSize: 12.5,
  color: TEXT_DIM,
  margin: "0 0 12px",
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
};

const choiceStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "10px 12px",
  margin: "0 0 8px",
  cursor: "pointer",
  fontFamily: FONT,
};

const choiceDisabledStyle: CSSProperties = {
  ...choiceStyle,
  opacity: 0.55,
  cursor: "not-allowed",
};

const choiceTitleStyle: CSSProperties = {
  display: "block",
  fontSize: 13.5,
  fontWeight: 700,
  color: TEXT_MAIN,
  marginBottom: 2,
};

const choiceBodyStyle: CSSProperties = {
  display: "block",
  fontSize: 12.5,
  color: TEXT_DIM,
};

const cancelRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 12,
};

const cancelBtnStyle: CSSProperties = {
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: 13,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

/** One explicit resolution the author can choose. */
export interface DeadkeyConflictChoice {
  /** Stable key for React + tests. */
  key: string;
  /** Choice title, e.g. "Merge into dk(003b)". */
  title: string;
  /** What this choice does — the tradeoff in one line. */
  body: string;
  /** When true the choice is offered but unavailable, with the reason shown. */
  disabled?: boolean | undefined;
  disabledNote?: string | undefined;
  /** The flow's resolution. Called only on an explicit click. */
  onSelect: () => void;
}

export interface DeadkeyConflictDialogProps {
  /** Dialog heading, e.g. "; already triggers a deadkey". */
  heading: string;
  /** The engine conflict's message — shown verbatim. */
  detail: string;
  /** Optional one-line context, e.g. "dk(003b) — 24 pairs — uses ; K_COLON as its trigger." */
  meta?: string | undefined;
  /** Optional extra content between the meta and the choices (e.g. a target picker). */
  extra?: ReactNode | undefined;
  /** The explicit choices for this conflict kind. Never empty. */
  choices: readonly DeadkeyConflictChoice[];
  /** Cancel — always present, always offered, never a silent default. */
  onCancel: () => void;
  cancelLabel?: string | undefined;
}

export function DeadkeyConflictDialog({
  heading,
  detail,
  meta,
  extra,
  choices,
  onCancel,
  cancelLabel = "Cancel",
}: DeadkeyConflictDialogProps) {
  return (
    <div style={overlayStyle}>
      <div
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        <h3 style={headingStyle}>{heading}</h3>
        <p style={detailStyle}>{detail}</p>
        {meta !== undefined && <p style={metaStyle}>{meta}</p>}
        {extra}
        <div>
          {choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              style={choice.disabled === true ? choiceDisabledStyle : choiceStyle}
              disabled={choice.disabled === true}
              onClick={choice.onSelect}
              aria-disabled={choice.disabled === true}
            >
              <b style={choiceTitleStyle}>{choice.title}</b>
              <span style={choiceBodyStyle}>
                {choice.body}
                {choice.disabled === true && choice.disabledNote !== undefined
                  ? ` ${choice.disabledNote}`
                  : null}
              </span>
            </button>
          ))}
        </div>
        <div style={cancelRowStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
