// Dialog — the studio's shared modal primitive (mobile adaptation, Phase 0).
//
// Consolidates the identical centered-modal shell previously hand-copied
// between the key-grid dialogs (FamilyApplyDialog, RenameDialog,
// RemoveKeyDialog): backdrop, centering, focus trap, Escape handling,
// focus-on-open. The `min(…px, 92vw)` clamps on both min- and max-width are
// new hardening: the old shells used bare pixel widths, so a dialog could
// overflow viewports narrower than its min-width. Both clamps use the same
// 92vw bound, so min-width can never defeat max-width on a phone.
//
// What this primitive owns: the frame. What it does NOT own: the dialog's
// content, its open/close state machine, or its per-open state resets —
// those stay with the caller, exactly as before.
//
// Motion: the frame enters and exits on the shared critically damped UI
// spring (ui/motion.ts) — scale plus fade, no overshoot. The exit mirrors
// the enter exactly: the same spring, the same from-scale, reversed. The
// frame stays mounted through the exit flight and unmounts when the spring
// settles, so flipping `open` false never pops the dialog out from under
// the animation. An optional `anchor` (the invoking element or its rect)
// points the scale at the trigger via transform-origin; without one the
// dialog scales from its own center. Under prefers-reduced-motion the
// spring is replaced by a short opacity cross-fade with no scale.
//
// Desktop-invariance: the migrated dialogs render byte-identical frames
// (same z-indexes, padding, gap, tokens). The 44px close button is OPT-IN
// (`showCloseButton`) — the migrated dialogs keep their Cancel buttons and
// gain no new chrome. AccountControl's sign-in panel is deliberately NOT
// migrated: it is an anchored popover, not a centered modal — a different
// pattern, and centering it would change desktop behavior.
//
// Accessibility: ARIA APG modal dialog pattern (docs/accessibility.md) —
// focus moves into the dialog on open, Tab cycles inside, Escape cancels.
// The caller owns the invoker and restores focus to it (the key-grid
// dialogs' existing convention).
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { BG_CARD, BORDER, FONT, TEXT_DIM } from "./theme.ts";
import { useModalFocus } from "../hooks/useModalFocus.ts";
import {
  MOTION_SPRING_DEFAULT,
  createSpring,
  usePrefersReducedMotion,
  type Spring,
} from "./motion.ts";

/**
 * Anchor for the dialog's enter/exit scale: the invoking element (as a
 * ref) or an explicit rect. The frame's transform-origin is set to the
 * anchor's center so the dialog grows out of — and collapses back into —
 * its trigger, keeping the spatial relationship obvious.
 */
export type DialogAnchor = RefObject<HTMLElement | null> | DOMRectReadOnly;

export interface DialogProps {
  /**
   * Flipping to `true` mounts the frame and plays the enter animation;
   * flipping to `false` plays the exit animation and unmounts when it
   * settles. The caller still owns the boolean itself.
   */
  readonly open: boolean;
  /** Escape, the close button, or the backdrop. Does not itself move focus back — the caller owns the invoker. */
  readonly onCancel: () => void;
  /** Accessible name for the dialog (callers pass an already-localized string). */
  readonly label: string;
  /** Dialog content. */
  readonly children: ReactNode;
  /** Rendered as `data-testid` on the dialog element. */
  readonly testId?: string;
  /** Minimum width in px. Default 320. */
  readonly minWidth?: number;
  /** Maximum width in px, clamped to 92vw so the dialog fits a phone. Default 520. */
  readonly maxWidth?: number;
  /** When provided, renders a `<form>` (submit-on-Enter) instead of a `<div>`. */
  readonly onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /**
   * Opt-in 44px close (×) button, top-right. The migrated key-grid dialogs
   * leave this off — their Cancel buttons are the dismiss control and an
   * added × would change desktop chrome. New mobile surfaces (sheets)
   * turn it on.
   */
  readonly showCloseButton?: boolean;
  /** Already-localized accessible label for the close button. Required when `showCloseButton` is true. */
  readonly closeLabel?: string;
  /** Which element takes focus on open. Default `"first"` (first focusable). */
  readonly initialFocus?: "first" | "none";
  /** Backdrop z-index; the dialog sits one above. Default 299 (the key-grid dialogs' value). */
  readonly zIndex?: number;
  /**
   * Full-viewport variant for narrow-viewport modals (mobile adaptation
   * Phase 4 — the sequence builder). The frame fills the
   * viewport instead of centering; desktop callers leave this off and see
   * byte-identical frames.
   */
  readonly fullscreen?: boolean;
  /**
   * Optional anchor for the enter/exit scale: the invoking element (as a
   * ref) or an explicit rect. The frame scales from the anchor's center;
   * without an anchor it scales from its own center. Ignored under
   * reduced motion, where there is no scale.
   */
  readonly anchor?: DialogAnchor;
}

const BACKDROP_BG = "color-mix(in srgb, var(--sil-black) 50%, transparent)";
const DIALOG_SHADOW =
  "0 8px 24px color-mix(in srgb, var(--sil-black) 50%, transparent)";

/**
 * The spring flies 0..100 rather than 0..1 so the foundation's settle
 * epsilons stay in the px-scale regime they were calibrated for — a 0..1
 * flight would read as "close enough" and snap through most of the tail.
 */
const SPRING_OPEN = 100;
const SPRING_CLOSED = 0;
/**
 * Frame scale at the closed end of the flight. A subtle grow — dialogs
 * are not momentum interactions, so the critically damped default spring
 * (damping ratio 1.0) guarantees no bounce or overshoot past 1.
 */
const ENTER_FROM_SCALE = 0.94;
/** Reduced-motion cross-fade duration — matches --app-motion-duration-reduced. */
const REDUCED_FADE_MS = 120;

function anchorRectOf(anchor: DialogAnchor): DOMRectReadOnly | null {
  if ("current" in anchor) {
    return anchor.current?.getBoundingClientRect() ?? null;
  }
  return anchor;
}

export function Dialog({
  open,
  onCancel,
  label,
  children,
  testId,
  minWidth = 320,
  maxWidth = 520,
  onSubmit,
  showCloseButton = false,
  closeLabel,
  initialFocus = "first",
  zIndex = 299,
  fullscreen = false,
  anchor,
}: DialogProps) {
  const dialogRef = useRef<HTMLFormElement | HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  // `visible` keeps the frame mounted through the exit flight; the
  // caller's `open` flips instantly and the spring follows. `progress` is
  // the spring value 0..100 driving opacity and scale on the motion path.
  const [visible, setVisible] = useState(open);
  const [progress, setProgress] = useState(SPRING_CLOSED);
  // Reduced-motion cross-fade target — opacity 0/1 with a short CSS
  // transition, no spring and no scale.
  const [fadedIn, setFadedIn] = useState(false);
  // transform-origin for the scale: the anchor's center, else the frame's.
  const [origin, setOrigin] = useState("50% 50%");

  const springRef = useRef<Spring | null>(null);
  if (springRef.current === null) {
    springRef.current = createSpring({
      preset: MOTION_SPRING_DEFAULT,
      initial: SPRING_CLOSED,
      onUpdate: (x) => setProgress(x),
      onSettle: (target) => {
        // The exit flight ends by unmounting — symmetric with the enter,
        // which mounts before flying.
        if (target <= SPRING_CLOSED) setVisible(false);
      },
    });
  }

  // The rAF loop is the spring's only browser surface; release it on unmount.
  useEffect(() => {
    const spring = springRef.current;
    return () => {
      spring?.dispose();
    };
  }, []);

  // Drive the enter/exit flights off the caller's `open`. Re-targeting is
  // seamless by construction: the spring keeps its current on-screen
  // position and velocity, so a close-reopen mid-flight never jumps.
  useEffect(() => {
    const spring = springRef.current;
    if (open) {
      setVisible(true);
      if (reduced) {
        spring?.cancel();
        setFadedIn(true);
      } else {
        setFadedIn(false);
        spring?.retarget(SPRING_OPEN);
      }
      return undefined;
    }
    if (!visible) return undefined;
    if (reduced) {
      spring?.cancel();
      setFadedIn(false);
      const id = window.setTimeout(() => setVisible(false), REDUCED_FADE_MS);
      return () => window.clearTimeout(id);
    }
    spring?.retarget(SPRING_CLOSED);
    return undefined;
  }, [open, reduced, visible]);

  // Point the scale at the trigger. Measured in a layout effect while the
  // origin is still the default center, so the center-relative fractions
  // come out exact regardless of the frame's current scale.
  useLayoutEffect(() => {
    if (!visible) return;
    const frame = dialogRef.current;
    const rect = anchor === undefined ? null : anchorRectOf(anchor);
    if (frame === null || rect === null) {
      setOrigin("50% 50%");
      return;
    }
    const box = frame.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      setOrigin("50% 50%");
      return;
    }
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const ox = 50 + ((rect.left + rect.width / 2 - cx) / box.width) * 100;
    const oy = 50 + ((rect.top + rect.height / 2 - cy) / box.height) * 100;
    setOrigin(`${ox}% ${oy}%`);
  }, [visible, anchor]);

  // Focus trap, Escape, focus-on-open — the shared modal accessibility shape
  // (hooks/useModalFocus.ts), also used by PreviewSheet. Keyed on `visible`
  // so the trap stays wired through the exit flight and focus moves back
  // in on every re-open.
  const handleKeyDownTrap = useModalFocus({
    open: visible,
    containerRef: dialogRef,
    onEscape: onCancel,
    moveFocusOnOpen: initialFocus !== "none",
  });

  if (!visible) return null;

  const frameStyle = fullscreen
    ? ({
        position: "fixed",
        inset: 0,
        zIndex: zIndex + 1,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        // The opt-in close button occupies the frame's top-right corner; give
        // content room so the first row never slides underneath it.
        paddingTop: showCloseButton ? 48 : 16,
        width: "100vw",
        // dvh so a phone's collapsing browser chrome doesn't strand content
        // below the fold.
        height: "100dvh",
        overflowY: "auto",
        background: BG_CARD,
        border: "none",
        borderRadius: 0,
        fontFamily: FONT,
        boxSizing: "border-box",
      } as const)
    : ({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: zIndex + 1,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        // The opt-in close button occupies the frame's top-right corner; give
        // content room so the first row never slides underneath it.
        paddingTop: showCloseButton ? 48 : 16,
        // Both bounds clamp to 92vw: on a phone narrower than `minWidth` px the
        // CSS min-width would otherwise win over max-width and overflow.
        minWidth: `min(${minWidth}px, 92vw)`,
        maxWidth: `min(${maxWidth}px, 92vw)`,
        maxHeight: "80vh",
        overflowY: "auto",
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: FONT,
        boxShadow: DIALOG_SHADOW,
      } as const);

  // Motion overlay: the spring drives opacity and scale on the motion
  // path; reduced motion gets a pure opacity cross-fade. The exit is the
  // enter reversed — same spring, same from-scale, same origin.
  const p = Math.min(1, Math.max(0, progress / SPRING_OPEN));
  const scale = ENTER_FROM_SCALE + (1 - ENTER_FROM_SCALE) * p;
  const motionFrameStyle: CSSProperties = reduced
    ? {
        opacity: fadedIn ? 1 : 0,
        transition: `opacity ${REDUCED_FADE_MS}ms linear`,
      }
    : {
        opacity: p,
        transform: fullscreen
          ? `scale(${scale})`
          : `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: origin,
      };
  const motionBackdropStyle: CSSProperties = reduced
    ? {
        opacity: fadedIn ? 1 : 0,
        transition: `opacity ${REDUCED_FADE_MS}ms linear`,
      }
    : { opacity: p };

  const closeButton = showCloseButton ? (
    <button
      type="button"
      aria-label={closeLabel ?? "Close"}
      onClick={onCancel}
      style={{
        position: "absolute",
        top: 2,
        right: 2,
        width: "var(--app-touch-target)",
        height: "var(--app-touch-target)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        color: TEXT_DIM,
        fontSize: 22,
        cursor: "pointer",
      }}
    >
      ×
    </button>
  ) : null;

  // The APG modal DIALOG pattern (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  // requires the container itself to trap Tab focus via onKeyDown; jsx-a11y's
  // interactive-role allowlist does not include "dialog" (it is a window/structure
  // role, not a widget role), so the rule fires regardless of the explicit role —
  // the same carve-out the key-grid dialogs already document.
  const frame =
    onSubmit !== undefined ? (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
      <form
        ref={dialogRef as React.Ref<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        onSubmit={onSubmit}
        onKeyDown={handleKeyDownTrap}
        style={{ ...frameStyle, ...motionFrameStyle }}
      >
        {closeButton}
        {children}
      </form>
    ) : (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
      <div
        ref={dialogRef as React.Ref<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        onKeyDown={handleKeyDownTrap}
        style={{ ...frameStyle, ...motionFrameStyle }}
      >
        {closeButton}
        {children}
      </div>
    );

  return (
    <>
      {/* Fixed transparent backdrop — click outside to cancel. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: BACKDROP_BG,
          zIndex,
          ...motionBackdropStyle,
        }}
        onClick={onCancel}
        aria-hidden="true"
      />
      {frame}
    </>
  );
}
