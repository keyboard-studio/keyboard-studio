// SequencesPlaceholder — placeholder step for the (not yet implemented)
// Sequence Gallery.
//
// Product decision: multi-key sequences (S-03) are no longer configured
// inline in the Mechanism Gallery's method chooser. They move to their own
// dedicated part of the flow, positioned after the author finishes the
// Mechanism Gallery for their characters. This component is a stub for that
// part — it does not yet let the author define any sequences; it exists so
// the step is visible on the spine ahead of the real authoring UI landing.

import type { CSSProperties } from "react";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  BG_PAGE, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";

export interface SequencesPlaceholderProps {
  onComplete?: () => void;
  onBack?: () => void;
}

const pageStyle: CSSProperties = {
  background: BG_PAGE,
  height: "100%",
  boxSizing: "border-box",
  fontFamily: FONT,
  color: TEXT_MAIN,
  display: "flex",
  flexDirection: "column",
};

const ghostBtn: CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

const continueBtn: CSSProperties = {
  padding: "9px 20px",
  background: BLUE_ACTION,
  border: "none",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

/**
 * SequencesPlaceholder — full-page stub for the upcoming Sequence Gallery.
 * Matches MechanismGallery's header pattern (title + modality tag).
 */
export function SequencesPlaceholder({ onComplete, onBack }: SequencesPlaceholderProps) {
  const sequenceFlaggedChars = useWorkingCopyStore((s) => s.sequenceFlaggedChars);
  return (
    <div style={pageStyle}>
      {/* Header bar — title + modality label, matching MechanismGallery. */}
      <div
        style={{
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          gap: 16,
          padding: "16px 24px 14px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.05rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
          }}
        >
          Sequence Gallery
        </h1>
        <span
          style={{
            fontSize: 12,
            color: TEXT_DIM,
            fontFamily: FONT,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Desktop
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 560,
          margin: "0 auto",
          padding: "24px 32px",
          textAlign: "center",
          gap: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: TEXT_MAIN }}>
          This is where you&rsquo;ll define multi-key sequences &mdash; typing
          two or more keys in a row to produce a character.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: TEXT_DIM }}>
          Sequence authoring is coming soon and is not yet implemented in this
          build.
        </p>

        {sequenceFlaggedChars.length > 0 ? (
          <div style={{ textAlign: "left" }}>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: TEXT_MAIN }}>
              Characters you flagged for sequences ({sequenceFlaggedChars.length}):
            </p>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {sequenceFlaggedChars.map((c) => (
                <li
                  key={c}
                  title={toUPlusNotation(c)}
                  aria-label={`${toUPlusNotation(c)} ${c}`}
                  style={{
                    padding: "4px 8px",
                    background: "#1c2a3a",
                    border: "1px solid #58a6ff",
                    borderRadius: 6,
                    color: "#58a6ff",
                    fontSize: 13,
                    fontFamily: "monospace",
                  }}
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
            No characters flagged yet.
          </p>
        )}
      </div>

      <div
        style={{
          borderTop: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 24px",
        }}
      >
        {onBack !== undefined ? (
          <button
            type="button"
            data-testid="sequences-back"
            onClick={onBack}
            style={ghostBtn}
          >
            &larr; Back
          </button>
        ) : (
          <span />
        )}
        {onComplete !== undefined && (
          <button
            type="button"
            data-testid="sequences-continue"
            onClick={onComplete}
            aria-label="Continue (sequences placeholder)"
            style={continueBtn}
          >
            Continue &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
