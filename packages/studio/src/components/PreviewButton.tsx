// PreviewButton — the compact narrow-viewport trigger for a PreviewSheet.
//
// On a phone the live preview lives in a sheet, not in a second pane. The
// survey (SurveyView) and the assign-loop galleries (AssignLoopShell) both
// open it with this one button, so the two surfaces look and behave the same.
// It floats in the bottom-right corner of the content column rather than
// taking a row of its own: the content stays full-height, and the journey
// footer below (Back / Next and the progress dots) is never covered or
// displaced, so the author can move on without closing anything first.
//
// The visible text is short ("Preview", "Character map"). The accessible name
// is the full action ("Show keyboard preview") via aria-label.

import type { CSSProperties } from "react";

export type PreviewButtonIcon = "keyboard" | "grid";

export interface PreviewButtonProps {
  /** Short visible label. */
  readonly label: string;
  /** Accessible name — the full action the button performs. */
  readonly ariaLabel: string;
  readonly onClick: () => void;
  readonly icon?: PreviewButtonIcon;
  readonly testId?: string;
  /**
   * "float" (default): absolutely positioned bottom-right of the nearest
   * positioned ancestor — for a fixed-height column with its own scroller.
   * "sticky": pinned to the bottom-right of a page that scrolls as a whole
   * (the button stays in view while the content scrolls under it).
   */
  readonly placement?: "float" | "sticky";
}

/**
 * How far the button sits above the bottom of its column: 12px above the
 * footer's top edge. The footer sits in the shell's normal column flow
 * BELOW the content area (StudioShell root: NavBar, content flex: 1,
 * StudioFooter), so every containing block this button floats in already
 * ends at the footer's top — adding `--studio-footer-h` here double-counted
 * the bar and lifted the button 52px too high on a coarse pointer (#2570).
 * That +footer term was a leftover from the frosted-glass era, when the
 * footer overlapped the content column; #2079 moved the bars into normal
 * flow and the term should have gone with the overlap. No safe-area inset:
 * 12px above the footer top is already clear of the home-indicator zone.
 */
const BUTTON_OFFSET = "12px";

/**
 * Bottom padding a scroll container needs so its last line can scroll clear
 * of the floating button (button height + 12px offset + a little air). The
 * footer needs no room here: it sits in normal flow below the scroll
 * container, not under it — the old `+ var(--studio-footer-h)` term
 * double-counted it (#2570).
 */
export const PREVIEW_BUTTON_CLEARANCE = "72px";

const BUTTON_STYLE: CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: BUTTON_OFFSET,
  zIndex: 5,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: "var(--app-touch-target)",
  padding: "0 16px 0 12px",
  borderRadius: 999,
  border: "1px solid var(--app-accent)",
  background: "var(--app-surface)",
  color: "var(--app-accent-text)",
  fontFamily: "var(--app-font)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow:
    "0 4px 12px color-mix(in srgb, var(--sil-black) 35%, transparent)",
};

function KeyboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h0.01M6 13h1M9 13h1M12 13h1M15 13h1M18 13h0.01M8 15.5h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PreviewButton({
  label,
  ariaLabel,
  onClick,
  icon = "keyboard",
  testId,
  placement = "float",
}: PreviewButtonProps) {
  const button = (
    <button
      type="button"
      className="ks-focus-ring"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      onClick={onClick}
      data-testid={testId}
      style={
        placement === "sticky"
          ? { ...BUTTON_STYLE, position: "static", pointerEvents: "auto" }
          : BUTTON_STYLE
      }
    >
      {icon === "grid" ? <GridIcon /> : <KeyboardIcon />}
      <span>{label}</span>
    </button>
  );
  if (placement === "float") return button;
  // The wrapper is sticky and click-through; only the button takes taps.
  return (
    <div
      style={{
        position: "sticky",
        bottom: BUTTON_OFFSET,
        display: "flex",
        justifyContent: "flex-end",
        pointerEvents: "none",
        marginTop: 12,
        zIndex: 5,
      }}
    >
      {button}
    </div>
  );
}
