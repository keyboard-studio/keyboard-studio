// PreviewSheet — the narrow-viewport home of the live KeymanWeb OSK preview
// (mobile adaptation, Phase 4).
//
// On a phone there is no room for the assign loop's side-by-side preview
// pane, so the preview becomes a toggleable sheet: a drag-up bottom sheet in
// portrait, a right-side dock when height is scarce (landscape — see
// mockup 6). The sheet is shared by the assign-loop galleries
// (AssignLoopShell's narrow branch) and touch_seed_source.
//
// Principle 9 (author-controlled OSK visibility): the sheet's open state IS
// the visibility control. Opening the sheet mounts `children` — the
// OSKFrame runs its normal init path (iframe onLoad → SET_STRINGS →
// SET_KEYBOARD on engine ready). Dismissing the sheet (× button, backdrop
// tap, Escape, or drag) unmounts `children`, destroying the iframe and
// unloading KeymanWeb. Host lifecycle only — the engine, iframe internals,
// and postMessage channel are untouched.
//
// This is a distinct pattern from the centered `ui/Dialog` modal, so it is
// its own component — but the accessibility shape (Escape, focus trap,
// focus-on-open) is shared via `hooks/useModalFocus.ts`, and it uses the
// same `--app-*` tokens. z-index sits below Dialog's (299/300) so a fullscreen
// modal (e.g. the narrow sequence builder) can cover an open sheet.

import {
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useLingui } from "@lingui/react/macro";
import { useViewport } from "../hooks/useViewport.ts";
import { useModalFocus } from "../hooks/useModalFocus.ts";
import { BREAKPOINTS } from "../ui/breakpoints.ts";
import { BG_CARD, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

export interface PreviewSheetProps {
  /** Nothing renders while `false` — children unmount, unloading KeymanWeb. */
  readonly open: boolean;
  /** × button, backdrop, Escape, or drag-dismiss. The caller owns the invoker and restores focus to it. */
  readonly onOpenChange: (open: boolean) => void;
  /** Accessible name + visible header title (callers pass an already-localized string). */
  readonly label: string;
  /** The preview content — typically the gallery's OSK preview pane. Mounted only while open. */
  readonly children: ReactNode;
  /** Rendered as `data-testid` on the sheet element. */
  readonly testId?: string;
}

const BACKDROP_BG = "color-mix(in srgb, var(--sil-black) 50%, transparent)";
const SHEET_SHADOW =
  "0 -8px 24px color-mix(in srgb, var(--sil-black) 50%, transparent)";
const SHEET_Z = 241;
const BACKDROP_Z = 240;
/** Drag past this many px toward the dismiss edge to close; otherwise snap back. */
const DRAG_DISMISS_PX = 96;

export function PreviewSheet({
  open,
  onOpenChange,
  label,
  children,
  testId,
}: PreviewSheetProps) {
  const { t } = useLingui();
  const { orientation, height } = useViewport();
  // Side dock only under scarce height (mockup 6): a bottom sheet in a
  // short landscape viewport would eat the whole 390px of height, so the
  // sheet docks right instead. Tall landscape (desktop/tablet) keeps the
  // bottom sheet — though in practice sheets only open in narrow contexts,
  // where landscape implies height < 479px anyway.
  const sideDock =
    orientation === "landscape" && height <= BREAKPOINTS.shortHeightMax;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Drag state lives in a ref — pointermove fires far too often to route
  // through React state, and only the sheet's own transform needs updating.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    activePointerId: number;
  } | null>(null);

  const closeLabel = t({
    id: "previewSheet.close",
    message: "Close preview",
  });

  // Focus trap, Escape, focus-on-open — the shared modal accessibility shape
  // (hooks/useModalFocus.ts), also used by ui/Dialog. The close button is
  // always present and always actionable, so it takes focus on open.
  const handleKeyDownTrap = useModalFocus({
    open,
    containerRef: sheetRef,
    onEscape: () => onOpenChange(false),
    preferredFocusRef: closeRef,
  });

  if (!open) return null;

  // Drag-to-dismiss on the header. Portrait: drag down; landscape dock:
  // drag right. Only the primary pointer, and never when the gesture starts
  // on a button (the × control) — a tap there must stay a tap.
  function handleHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    if (!e.isPrimary) return;
    if ((e.target as Element).closest("button") !== null) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      activePointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleHeaderPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || e.pointerId !== drag.activePointerId) return;
    // Toward the dismiss edge only — dragging the other way does nothing
    // (no rubber-banding to unwind).
    const delta = sideDock
      ? Math.max(0, e.clientX - drag.startX)
      : Math.max(0, e.clientY - drag.startY);
    if (sheetRef.current !== null) {
      sheetRef.current.style.transform = sideDock
        ? `translateX(${delta}px)`
        : `translateY(${delta}px)`;
    }
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || e.pointerId !== drag.activePointerId) return;
    dragRef.current = null;
    const delta = sideDock ? e.clientX - drag.startX : e.clientY - drag.startY;
    if (sheetRef.current !== null) sheetRef.current.style.transform = "";
    if (delta > DRAG_DISMISS_PX) onOpenChange(false);
  }

  const sheetStyle: CSSProperties = sideDock
    ? {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(440px, 72vw)",
        zIndex: SHEET_Z,
        display: "flex",
        flexDirection: "column",
        background: BG_CARD,
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: SHEET_SHADOW,
        fontFamily: FONT,
      }
    : {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "82dvh",
        zIndex: SHEET_Z,
        display: "flex",
        flexDirection: "column",
        background: BG_CARD,
        borderTop: `1px solid ${BORDER}`,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        boxShadow: SHEET_SHADOW,
        fontFamily: FONT,
      };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: BACKDROP_BG,
          zIndex: BACKDROP_Z,
        }}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
        data-testid={testId !== undefined ? `${testId}-backdrop` : undefined}
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- sheet follows the APG modal dialog pattern: the container traps Tab (see Dialog.tsx's matching carve-out). */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        data-sheet-dock={sideDock ? "side" : "bottom"}
        onKeyDown={handleKeyDownTrap}
        style={sheetStyle}
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-testid={testId !== undefined ? `${testId}-header` : undefined}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: sideDock ? "8px 8px 8px 16px" : "4px 8px 8px",
            // Touch the header, not the buttons, to drag.
            touchAction: "none",
            cursor: "grab",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          {!sideDock && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "var(--app-border)",
              }}
            />
          )}
          <span
            style={{
              flexGrow: 1,
              fontSize: 14,
              fontWeight: 600,
              color: TEXT_DIM,
              fontFamily: FONT,
              // The pill sits above the title row; leave it room.
              paddingTop: sideDock ? 0 : 8,
            }}
          >
            {label}
          </span>
          <button
            ref={closeRef}
            type="button"
            aria-label={closeLabel}
            onClick={() => onOpenChange(false)}
            data-testid={
              testId !== undefined ? `${testId}-close` : undefined
            }
            style={{
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
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            flexGrow: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: 16,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
