// SurveyResetButton — the "Reset" control in the NavBar's top-right corner,
// rendered while a survey is mounted. Clicking it opens an "Are you sure?" + Yes
// confirmation (inline warning tied to the button, not a browser dialog — no
// window.confirm in this repo). Yes fires onReset, which the caller wires to
// the full start-over path (store resets + draft discard). Because that path
// clears working-copy edits directly instead of re-instantiating over them,
// it never routes through the "Switching base keyboards…" rebase confirm.
//
// It sits in the nav bar rather than floating over the survey pane: as a
// viewport-fixed chip it overlapped whatever occupied the bottom-left corner,
// which on a scrolled-to-bottom step is the Back button of every step's nav row.
//
// The confirmation is an absolutely-positioned popover anchored below-right of
// the trigger (the same shape AccountControl's dropdown uses), so arming it
// cannot reflow the sibling nav controls the way an inline swap would.
//
// The armed state disarms on Escape or on any pointer-down outside the
// control (shared with AccountControl via useDismissablePopover, #1513), so a
// stray click can't leave a live "Yes" button around.

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BORDER, ERROR_RED, FONT, TEXT_DIM } from "../ui/theme.ts";
import {
  useDismissablePopover,
  POPOVER_PANEL_STYLE,
} from "../ui/useDismissablePopover.ts";

interface SurveyResetButtonProps {
  /** Start the survey over entirely (stores + saved draft). */
  onReset: () => void;
}

const CONTAINER_STYLE: CSSProperties = {
  // Anchor for the confirm popover below; the nav bar's right group lays this
  // out like any other control.
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  fontFamily: FONT,
};

const RESET_BTN_STYLE: CSSProperties = {
  padding: "5px 12px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

/** Confirm popover — below-right of the trigger, above the survey content. */
const CONFIRM_PANEL_STYLE: CSSProperties = {
  ...POPOVER_PANEL_STYLE,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
};

const CONFIRM_TEXT_STYLE: CSSProperties = {
  color: TEXT_DIM,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const YES_BTN_STYLE: CSSProperties = {
  padding: "3px 12px",
  background: "transparent",
  border: `1px solid ${ERROR_RED}`,
  borderRadius: 6,
  color: ERROR_RED,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

export function SurveyResetButton({ onReset }: SurveyResetButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Disarm on Escape or on pointer-down anywhere outside the control. No
  // panelRef/triggerRef: this popover deliberately leaves focus where the
  // author put it (see file header).
  useDismissablePopover(confirming, {
    containerRef,
    onClose: () => setConfirming(false),
  });

  return (
    <div ref={containerRef} style={CONTAINER_STYLE} data-testid="survey-reset">
      {/* The trigger stays mounted while armed — it anchors the popover, and a
          second click closes the confirmation the same way Escape does. */}
      <button
        type="button"
        data-testid="survey-reset-arm"
        aria-label="Reset survey"
        aria-expanded={confirming}
        // "true", not "dialog": the confirm popover carries role="alert" and no
        // dialog semantics (see the panel below), so advertising a dialog would
        // over-promise. Mirrors SearchFiltersPopover's non-token role="group"
        // trigger; the pairing convention is aria-haspopup alongside aria-expanded.
        aria-haspopup="true"
        className="ks-focus-ring ks-hit-target"
        style={RESET_BTN_STYLE}
        onClick={() => setConfirming((armed) => !armed)}
      >
        Reset
      </button>
      {confirming && (
        <div style={CONFIRM_PANEL_STYLE}>
          {/* role="alert" announces the question on arm — the popover carries no
              dialog semantics, so focus is left where the author put it. */}
          <span role="alert" style={CONFIRM_TEXT_STYLE}>
            Are you sure?
          </span>
          <button
            type="button"
            data-testid="survey-reset-yes"
            className="ks-focus-ring ks-hit-target"
            style={YES_BTN_STYLE}
            onClick={() => {
              setConfirming(false);
              onReset();
            }}
          >
            Yes
          </button>
        </div>
      )}
    </div>
  );
}
