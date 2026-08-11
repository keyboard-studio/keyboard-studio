// KeyGridCommandMenu — the per-key command menu the `⋯` wedge, right-click,
// and `ContextMenu`/`Shift+F10` all open (spec 058 T111; FR-021, FR-020b).
//
// Renders a `useKeyCommands.ts` `KeyGridCommandDescriptor[]` and nothing else:
// it computes no command, knows no key-edit semantics, and owns no selection.
// That split is the same one KeyGrid.tsx already documents for KeyInspector
// (T070) and FindPanel (T071) — the grid exposes intent, a sibling component
// renders the surface — which is why this is its own file rather than markup
// inside `KeyGridCell.tsx`. The cell cannot host it structurally anyway: the
// cell is a `<button>`, and a menu of buttons cannot nest inside one (see that
// file's "Why the wedges are `aria-hidden` spans").
//
// ## The ARIA pattern, and the one place it is deliberately relaxed
//
// Follows the APG menu pattern (https://www.w3.org/WAI/ARIA/apg/patterns/menu/):
// `role="menu"` with `role="menuitem"` children, ArrowUp/ArrowDown moving a
// roving tabindex between items (wrapping at both ends), Home/End jumping to
// the first/last, Escape closing and returning focus whence it came, and focus
// landing on the first ENABLED item when the menu opens.
//
// **The relaxation:** APG says a menu's disabled items may be skipped by
// keyboard navigation. This menu does NOT skip them — arrow keys land on
// disabled items too, which is the accessible counterpart of
// `KeyGridCommandDescriptor.enabled`'s own contract ("a menu renders a
// disabled entry rather than omitting it, so the command's existence stays
// discoverable"). Skipping them with the keyboard would hide from a keyboard
// author exactly what the disabled entry exists to tell a sighted one: that
// the command is real but not applicable to this key right now. `aria-disabled`
// (not the `disabled` attribute) is what carries that, so the item stays
// focusable and announced.
//
// ## Positioning
//
// `anchor` is viewport coordinates from whichever pointer gesture opened the
// menu (`KeyGridCommandMenuAnchor`); `position: fixed` consumes them directly,
// with no scroll-offset math and no `getBoundingClientRect` of its own. A
// KEYBOARD invocation has no anchor — `useKeyCommands` omits it — and the menu
// then renders `position: static` inside whatever container the caller mounted
// it in, so it appears in normal flow next to the grid rather than pinned to a
// stale or invented coordinate. Deliberately no flip/collision logic: this is
// a short list opened at the pointer, and inventing viewport-edge avoidance
// here would be untested geometry.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import type {
  KeyGridCommandDescriptor,
  KeyGridCommandMenuAnchor,
} from "./useKeyCommands.ts";

export interface KeyGridCommandMenuProps {
  /** The commands to render — `useKeyCommands()`'s `commands`, verbatim. */
  readonly commands: readonly KeyGridCommandDescriptor[];
  /** Where the pointer opened it, or undefined for a keyboard invocation (see module doc, "Positioning"). */
  readonly anchor?: KeyGridCommandMenuAnchor;
  /**
   * Close the menu. Called after a command runs, on Escape, and on a click
   * outside. The caller owns the open/closed state — this component only
   * renders when mounted and asks to be unmounted.
   */
  readonly onClose: () => void;
  /** Localized accessible name. Defaults to a generic "Key commands". */
  readonly label?: string;
}

/**
 * The per-key command menu (T111). Mount it only while open — there is no
 * `isOpen` prop, because an unmounted menu is the one state that reliably has
 * no focus trap, no stale anchor, and no keydown listener left attached.
 */
export function KeyGridCommandMenu({
  commands,
  anchor,
  onClose,
  label,
}: KeyGridCommandMenuProps) {
  const { t } = useLingui();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Roving tabindex within the menu. Starts on the first ENABLED command —
  // opening a menu with focus parked on an inapplicable entry reads as
  // "nothing here works". Falls back to 0 when every command is disabled
  // (possible: nothing selected), so the menu is never focus-less.
  const firstEnabledIndex = commands.findIndex((c) => c.enabled);
  const [activeIndex, setActiveIndex] = useState(
    firstEnabledIndex === -1 ? 0 : firstEnabledIndex,
  );

  // Move DOM focus onto the active item whenever it changes — including the
  // initial mount, which is what makes a keyboard-opened menu immediately
  // operable without a Tab press.
  useEffect(() => {
    itemRefs.current.get(activeIndex)?.focus();
  }, [activeIndex]);

  // Click outside closes. `mousedown` rather than `click` so the menu is gone
  // before the underlying cell would receive a synthetic click from the same
  // gesture — otherwise dismissing the menu would also re-select a key.
  useEffect(() => {
    function handlePointerDown(event: globalThis.MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (commands.length === 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = (activeIndex + 1) % commands.length;
        break;
      case "ArrowUp":
        next = (activeIndex - 1 + commands.length) % commands.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = commands.length - 1;
        break;
      case "Escape":
        event.preventDefault();
        // Escape is claimed and stopped here: it must not also bubble to the
        // grid, where FR-020b gives it the separate meaning "return focus from
        // the inspector to the cell".
        event.stopPropagation();
        onClose();
        return;
      default:
        return;
    }
    event.preventDefault();
    setActiveIndex(next);
  }

  function runCommand(command: KeyGridCommandDescriptor): void {
    // Gate on `enabled` here as well as visually: an `aria-disabled` item is
    // deliberately still focusable and clickable at the DOM level (see the
    // module doc's "relaxation" note), so this is the check that actually
    // prevents an inapplicable command from firing.
    if (!command.enabled) return;
    command.run();
    onClose();
  }

  const menuLabel =
    label ??
    t({
      id: "editor.assignLoop.keyGrid.commandMenu.ariaLabel",
      message: "Key commands",
    });

  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- same roving-tabindex model KeyGrid.tsx's own role="tablist" container documents: DOM focus lives on the individual role="menuitem" buttons (each with its own managed tabIndex, moved by the arrow keys above), never on this container, so it intentionally carries no tabIndex of its own. The APG menu pattern's alternative (a focusable container driving aria-activedescendant) is the model this deliberately does NOT use.
    <div
      ref={menuRef}
      role="menu"
      aria-label={menuLabel}
      data-testid="key-grid-command-menu"
      onKeyDown={handleKeyDown}
      style={{
        ...(anchor !== undefined
          ? { position: "fixed" as const, left: anchor.x, top: anchor.y }
          : { position: "static" as const }),
        zIndex: 40,
        minWidth: 200,
        padding: 4,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        fontFamily: FONT,
      }}
    >
      {commands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          role="menuitem"
          ref={(el) => {
            if (el) itemRefs.current.set(index, el);
            else itemRefs.current.delete(index);
          }}
          // `aria-disabled`, never the `disabled` attribute — see the module
          // doc's "relaxation" note: the entry must stay focusable and
          // announced so the command's existence is discoverable.
          aria-disabled={!command.enabled}
          tabIndex={index === activeIndex ? 0 : -1}
          data-testid={`key-grid-command-${command.id}`}
          onClick={() => runCommand(command)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            padding: "5px 8px",
            background: index === activeIndex ? "var(--app-accent-subtle)" : "transparent",
            border: `1px solid ${index === activeIndex ? ACCENT : "transparent"}`,
            borderRadius: 4,
            color: command.enabled ? TEXT_MAIN : TEXT_DIM,
            opacity: command.enabled ? 1 : 0.6,
            fontSize: 12,
            textAlign: "left",
            cursor: command.enabled ? "pointer" : "default",
            fontFamily: FONT,
          }}
        >
          <span>{command.label}</span>
          {command.shortcutKey !== undefined && (
            // The keybinding hint is the visible proof of FR-021's "every one
            // of those commands MUST also have a keyboard route" — a raw key
            // name, never localized prose (see
            // `KeyGridCommandDescriptor.shortcutKey`).
            <span style={{ fontSize: 10, color: TEXT_DIM, whiteSpace: "nowrap" }}>
              {command.shortcutKey}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
