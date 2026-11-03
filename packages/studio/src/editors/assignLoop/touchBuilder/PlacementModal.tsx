// PlacementBar + PlacementModal — the placement paradigm's UI.
//
// The placement bar is the tray of unplaced letters in the locked header; a
// letter is dragged onto a key — HTML5 DnD on desktop, an immediate
// pointer-based drag on touch (no longpress: a vertical move off the chip
// starts the drag, a horizontal move scrolls the tray) — or tapped, then a
// key tapped. The modal asks what the drop means: surface / longpress /
// flick (direction) / multitap (2x/3x). Replacing an occupied surface/flick
// slot offers "demote to longpress" or "send back to the placement list".
import { useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import { FLICK_GRID, type FlickDirection } from "./touchBuilderModel.ts";
import {
  placementOccupant,
  touchGestureIntent,
  type PlacementChoice,
} from "./placementOps.ts";

/** Drag MIME type for tray letters. The pane's key onDrop branches on it. */
export const TRAY_LETTER_MIME = "application/x-ks-tray-letter";

/**
 * Hit-test a touch-drag point against the board: the key (data-address)
 * under the point, or null over empty space. The ghost has
 * pointer-events: none so it never wins the hit test.
 */
function dropAddressAt(clientX: number, clientY: number): string | null {
  const target = document.elementFromPoint(clientX, clientY);
  const address = target?.closest("[data-address]")?.getAttribute("data-address");
  return address === null || address === undefined || address === "" ? null : address;
}

const CARD = "var(--app-surface)";
const BORDER = "var(--app-border-strong)";
const ACCENT = "var(--app-accent)";
const ACCENT_BG = "var(--app-accent-bg)";
const TEXT_MAIN = "var(--app-text)";
const TEXT_DIM = "var(--app-text-muted)";

// ---------------------------------------------------------------------------
// Placement bar (unplaced-letters tray)
// ---------------------------------------------------------------------------

export function PlacementBar(props: {
  letters: readonly string[];
  keycapFont: string;
  selectedLetter: string | null;
  onSelectLetter: (letter: string | null) => void;
  onDragStartLetter: (e: React.DragEvent, letter: string) => void;
  /** Live drop target during a touch drag (for key highlighting). */
  onTouchDragTarget: (address: string | null) => void;
  /** Touch drag end: the letter and the hit-tested drop target, if any. */
  onTouchDrop: (letter: string, address: string | null) => void;
}) {
  const { t } = useLingui();
  const {
    letters,
    keycapFont,
    selectedLetter,
    onSelectLetter,
    onDragStartLetter,
    onTouchDragTarget,
    onTouchDrop,
  } = props;

  // Touch drag state machine (mouse keeps native HTML5 DnD). A touch/pen
  // pointer that moves vertically off the chip becomes a drag immediately —
  // no longpress. Horizontal moves stand down so the tray keeps scrolling
  // (touch-action: pan-x; the browser aborts us via pointercancel). While
  // dragging, the key under the finger is highlight-reported so the drop
  // target is obvious even though the ghost floats above the finger.
  const gestureRef = useRef<{
    letter: string;
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const [ghost, setGhost] = useState<{ letter: string; x: number; y: number } | null>(null);
  // A drag ends with pointerup, which a click follows — swallow that click
  // so the drop doesn't also toggle the tap selection.
  const suppressClickRef = useRef(false);

  const reportHover = (address: string | null): void => {
    if (hoverRef.current !== address) {
      hoverRef.current = address;
      onTouchDragTarget(address);
    }
  };

  const endGesture = (): void => {
    gestureRef.current = null;
    setGhost(null);
    reportHover(null);
  };

  const handlePointerDown = (e: React.PointerEvent, letter: string): void => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if (gestureRef.current !== null) return; // one gesture at a time
    gestureRef.current = {
      letter,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent): void => {
    const g = gestureRef.current;
    if (g === null || e.pointerId !== g.pointerId) return;
    if (g.dragging) {
      setGhost({ letter: g.letter, x: e.clientX, y: e.clientY });
      reportHover(dropAddressAt(e.clientX, e.clientY));
      return;
    }
    const intent = touchGestureIntent(e.clientX - g.startX, e.clientY - g.startY);
    if (intent === "undecided") return;
    if (intent === "scroll") {
      gestureRef.current = null;
      return;
    }
    g.dragging = true;
    try {
      navigator.vibrate?.(15);
    } catch {
      /* haptics unsupported — the ghost is feedback enough */
    }
    setGhost({ letter: g.letter, x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent): void => {
    const g = gestureRef.current;
    if (g === null || e.pointerId !== g.pointerId) return;
    if (g.dragging) {
      suppressClickRef.current = true;
      onTouchDrop(g.letter, dropAddressAt(e.clientX, e.clientY));
    }
    endGesture();
  };

  const handlePointerCancel = (e: React.PointerEvent): void => {
    if (gestureRef.current?.pointerId === e.pointerId) endGesture();
  };

  return (
    <section
      aria-label={t({
        id: "editor.assignLoop.touch.builder.placementBarLabel",
        message: "Letters to place",
      })}
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>
        {t({
          id: "editor.assignLoop.touch.builder.placementBarHint",
          message: "Drag a letter onto a key — or tap a letter, then tap a key.",
        })}
      </div>
      {letters.length === 0 ? (
        <div style={{ fontSize: 12, color: TEXT_DIM }}>
          {t({
            id: "editor.assignLoop.touch.builder.placementBarEmpty",
            message: "Nothing left to place.",
          })}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {letters.map((letter) => {
            const isSelected = selectedLetter === letter;
            return (
              <button
                key={letter}
                type="button"
                draggable
                aria-pressed={isSelected}
                onDragStart={(e) => onDragStartLetter(e, letter)}
                onPointerDown={(e) => handlePointerDown(e, letter)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSelectLetter(isSelected ? null : letter);
                }}
                style={{
                  flex: "0 0 auto",
                  minWidth: 40,
                  minHeight: 40,
                  padding: "6px 10px",
                  fontSize: 18,
                  fontFamily: keycapFont,
                  color: TEXT_MAIN,
                  background: isSelected ? ACCENT_BG : "transparent",
                  border: `1px solid ${isSelected ? ACCENT : BORDER}`,
                  borderRadius: 8,
                  cursor: "grab",
                  // Vertical moves become our drag; horizontal moves scroll
                  // the tray. Also kills callouts/selection on long holds.
                  touchAction: "pan-x",
                  userSelect: "none",
                  WebkitTouchCallout: "none",
                }}
              >
                {letter}
              </button>
            );
          })}
        </div>
      )}
      {/* Drag ghost: follows the finger, above everything, never hit-tested. */}
      {ghost !== null && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: ghost.x - 22,
            top: ghost.y - 72,
            zIndex: 2000,
            pointerEvents: "none",
            minWidth: 44,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontFamily: keycapFont,
            color: TEXT_MAIN,
            background: CARD,
            border: `2px solid ${ACCENT}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            opacity: 0.95,
          }}
        >
          {ghost.letter}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Placement modal
// ---------------------------------------------------------------------------

type SlotKind = "surface" | "longpress" | "flick" | "multitap";

export function PlacementModal(props: {
  letter: string;
  targetKey: TouchKeyIR;
  keycapFont: string;
  onClose: () => void;
  onConfirm: (choice: PlacementChoice) => void;
}) {
  const { t } = useLingui();
  const { letter, targetKey, keycapFont, onClose, onConfirm } = props;
  const [slot, setSlot] = useState<SlotKind>("surface");
  const [flickDirection, setFlickDirection] = useState<FlickDirection>("n");
  const [tap, setTap] = useState<2 | 3>(2);
  const [displaced, setDisplaced] = useState<"demote" | "sendBack">("demote");

  const occupant =
    slot === "surface"
      ? placementOccupant(targetKey, { slot: "surface", displaced: null })
      : slot === "flick"
        ? placementOccupant(targetKey, { slot: "flick", direction: flickDirection, displaced: null })
        : null;
  const hasMultitap = (targetKey.multitap ?? []).length > 0;

  const confirm = (): void => {
    const choice: PlacementChoice =
      slot === "surface"
        ? { slot, displaced: occupant !== null ? displaced : null }
        : slot === "flick"
          ? { slot, direction: flickDirection, displaced: occupant !== null ? displaced : null }
          : slot === "longpress"
            ? { slot }
            : { slot: "multitap", tap };
    onConfirm(choice);
  };

  const slotLabel: Record<SlotKind, string> = {
    surface: t({ id: "editor.assignLoop.touch.builder.slotSurface", message: "Surface" }),
    longpress: t({ id: "editor.assignLoop.touch.builder.slotLongpress", message: "Longpress" }),
    flick: t({ id: "editor.assignLoop.touch.builder.slotFlick", message: "Flick" }),
    multitap: t({ id: "editor.assignLoop.touch.builder.slotMultitap", message: "Multitap" }),
  };
  const slotHint: Record<SlotKind, string> = {
    surface: t({
      id: "editor.assignLoop.touch.builder.slotSurfaceHint",
      message: "The key's face — what it produces",
    }),
    longpress: t({
      id: "editor.assignLoop.touch.builder.slotLongpressHint",
      message: "Hold the key for a popup",
    }),
    flick: t({
      id: "editor.assignLoop.touch.builder.slotFlickHint",
      message: "Swipe the key in a direction",
    }),
    multitap: t({
      id: "editor.assignLoop.touch.builder.slotMultitapHint",
      message: "Tap repeatedly to cycle",
    }),
  };

  const radioRow = (
    name: string,
    checked: boolean,
    onChange: () => void,
    label: React.ReactNode,
    disabled?: boolean,
  ): React.ReactNode => (
    <label
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: 13,
        color: TEXT_MAIN,
        padding: "4px 0",
      }}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  );

  return (
    // Backdrop click-to-close: pointer-only by design; keyboard users get
    // Escape (below) and the Cancel button.
    <div
      role="presentation"
      onClick={(e) => {
        // Clicks bubbling from the dialog have a different target.
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t({
          id: "editor.assignLoop.touch.builder.placementTitle",
          message: "Place letter",
        })}
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 20,
          width: "min(420px, 100%)",
          maxHeight: "85vh",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 16, color: TEXT_MAIN }}>
          {t({ id: "editor.assignLoop.touch.builder.placementTitle", message: "Place letter" })}{" "}
          <span style={{ fontFamily: keycapFont, fontSize: 20 }}>"{letter}"</span>
        </h2>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 12 }}>
          {t({
            id: "editor.assignLoop.touch.builder.placementTarget",
            message: "Onto key",
          })}{" "}
          {targetKey.id}
        </div>

        <div
          role="radiogroup"
          aria-label={t({
            id: "editor.assignLoop.touch.builder.placementSlotLabel",
            message: "Placement",
          })}
        >
          {(Object.keys(slotLabel) as SlotKind[]).map((s) => (
            <div key={s}>
              {radioRow(
                "placement-slot",
                slot === s,
                () => setSlot(s),
                <>
                  <strong>{slotLabel[s]}</strong>
                  <span style={{ color: TEXT_DIM }}> — {slotHint[s]}</span>
                </>,
              )}
            </div>
          ))}
        </div>

        {slot === "flick" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 6 }}>
              {t({
                id: "editor.assignLoop.touch.builder.flickDirectionLabel",
                message: "Flick direction",
              })}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, auto)",
                gap: 4,
                justifyContent: "start",
                alignItems: "center",
              }}
            >
              {(Object.keys(FLICK_GRID) as FlickDirection[]).map((direction) => {
                const pos = FLICK_GRID[direction];
                const isSelected = flickDirection === direction;
                return (
                  <button
                    key={direction}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setFlickDirection(direction)}
                    style={{
                      gridRow: pos.row,
                      gridColumn: pos.col,
                      minWidth: 44,
                      minHeight: 32,
                      fontSize: 11,
                      color: TEXT_MAIN,
                      background: isSelected ? ACCENT_BG : "transparent",
                      border: `1px solid ${isSelected ? ACCENT : BORDER}`,
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    {direction}
                  </button>
                );
              })}
              <div
                aria-hidden="true"
                style={{
                  gridRow: 2,
                  gridColumn: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 44,
                  minHeight: 32,
                  fontSize: 14,
                  fontFamily: keycapFont,
                  color: TEXT_DIM,
                }}
              >
                {targetKey.text || targetKey.id}
              </div>
            </div>
          </div>
        )}

        {slot === "multitap" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>
              {t({
                id: "editor.assignLoop.touch.builder.multitapTapLabel",
                message: "Which tap produces it",
              })}
            </div>
            <div role="radiogroup">
              {radioRow(
                "placement-tap",
                tap === 2,
                () => setTap(2),
                t({ id: "editor.assignLoop.touch.builder.tap2", message: "2× — double-tap" }),
              )}
              {radioRow(
                "placement-tap",
                tap === 3,
                () => setTap(3),
                <>
                  {t({ id: "editor.assignLoop.touch.builder.tap3", message: "3× — triple-tap" })}
                  {!hasMultitap && (
                    <span style={{ color: TEXT_DIM }}>
                      {" "}
                      —{" "}
                      {t({
                        id: "editor.assignLoop.touch.builder.tap3Needs2x",
                        message: "needs a double-tap character first",
                      })}
                    </span>
                  )}
                </>,
                !hasMultitap,
              )}
            </div>
          </div>
        )}

        {occupant !== null && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 13, color: TEXT_MAIN, marginBottom: 6 }}>
              <span style={{ fontFamily: keycapFont }}>"{occupant}"</span>{" "}
              {t({
                id: "editor.assignLoop.touch.builder.occupantLine",
                message: "is already there.",
              })}
            </div>
            <div role="radiogroup">
              {radioRow(
                "placement-displaced",
                displaced === "demote",
                () => setDisplaced("demote"),
                <>
                  <strong>
                    {t({
                      id: "editor.assignLoop.touch.builder.demoteLabel",
                      message: "Demote to longpress",
                    })}
                  </strong>
                  <span style={{ color: TEXT_DIM }}>
                    {" "}
                    —{" "}
                    {t({
                      id: "editor.assignLoop.touch.builder.demoteHint",
                      message: "keep it under this key",
                    })}
                  </span>
                </>,
              )}
              {radioRow(
                "placement-displaced",
                displaced === "sendBack",
                () => setDisplaced("sendBack"),
                <>
                  <strong>
                    {t({
                      id: "editor.assignLoop.touch.builder.sendBackLabel",
                      message: "Send back to the placement list",
                    })}
                  </strong>
                  <span style={{ color: TEXT_DIM }}>
                    {" "}
                    —{" "}
                    {t({
                      id: "editor.assignLoop.touch.builder.sendBackHint",
                      message: "place it elsewhere later",
                    })}
                  </span>
                </>,
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              color: TEXT_MAIN,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {t({ id: "editor.assignLoop.touch.builder.placementCancel", message: "Cancel" })}
          </button>
          <button
            type="button"
            onClick={confirm}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--app-text-on-accent)",
              background: ACCENT,
              border: `1px solid ${ACCENT}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {t({ id: "editor.assignLoop.touch.builder.placementConfirm", message: "Place" })}
          </button>
        </div>
      </div>
    </div>
  );
}
