// SurveyResetButton — small floating "Reset" control pinned to the corner of
// the survey route. Clicking it swaps to an inline "Are you sure?" + Yes
// confirmation (inline warning tied to the button, not a browser dialog — no
// window.confirm in this repo). Yes fires onReset, which the caller wires to
// the full start-over path (store resets + draft discard). Because that path
// clears working-copy edits directly instead of re-instantiating over them,
// it never routes through the "Switching base keyboards…" rebase confirm.
//
// The armed state disarms on Escape or on any pointer-down outside the
// control, so a stray click can't leave a live "Yes" button around.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BG_CARD, BORDER, ERROR_RED, FONT, TEXT_DIM } from "../ui/theme.ts";

interface SurveyResetButtonProps {
  /** Start the survey over entirely (stores + saved draft). */
  onReset: () => void;
}

const CONTAINER_STYLE: CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 16,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontFamily: FONT,
};

const RESET_BTN_STYLE: CSSProperties = {
  padding: 0,
  background: "transparent",
  border: "none",
  color: TEXT_DIM,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

const CONFIRM_TEXT_STYLE: CSSProperties = {
  color: TEXT_DIM,
  fontSize: 12,
};

const YES_BTN_STYLE: CSSProperties = {
  padding: "2px 12px",
  background: "transparent",
  border: `1px solid ${ERROR_RED}`,
  borderRadius: 6,
  color: ERROR_RED,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

export function SurveyResetButton({ onReset }: SurveyResetButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // While armed, disarm on Escape or on pointer-down anywhere outside the
  // control. Listeners exist only while confirming so the idle button adds
  // no document-level handlers.
  useEffect(() => {
    if (!confirming) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirming(false);
    }
    function onPointerDown(e: PointerEvent) {
      const container = containerRef.current;
      if (container !== null && e.target instanceof Node && !container.contains(e.target)) {
        setConfirming(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [confirming]);

  return (
    <div ref={containerRef} style={CONTAINER_STYLE} data-testid="survey-reset">
      {confirming ? (
        <>
          <span style={CONFIRM_TEXT_STYLE}>Are you sure?</span>
          <button
            type="button"
            data-testid="survey-reset-yes"
            style={YES_BTN_STYLE}
            onClick={() => {
              setConfirming(false);
              onReset();
            }}
          >
            Yes
          </button>
        </>
      ) : (
        <button
          type="button"
          data-testid="survey-reset-arm"
          aria-label="Reset survey"
          style={RESET_BTN_STYLE}
          onClick={() => setConfirming(true)}
        >
          Reset
        </button>
      )}
    </div>
  );
}
