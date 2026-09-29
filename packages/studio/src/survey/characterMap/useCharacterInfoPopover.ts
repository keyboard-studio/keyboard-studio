// useCharacterInfoPopover — delegated hover/focus activation for the
// character map's info popover (keyboard-studio#1783).
//
// Performance contract: groups render up to 3000 cells, so this hook
// attaches exactly ONE set of listeners to the pane's scroll container —
// `pointerover`/`focusin` (React's onPointerOver/onFocus, which bubble)
// read the cell's character from its `data-char`/`data-block` attributes.
// No handler is ever attached to a cell, no tooltip element is rendered per
// cell, and `describeCharacter` runs lazily for the single active cell only.
//
// WCAG 2.2 SC 1.4.13 (Content on Hover or Focus):
// - opens on hover AND on keyboard focus;
// - Esc dismisses without moving focus (and stays shut while the pointer or
//   focus remains on that cell — reopens on the next cell);
// - hoverable: the pointer can move onto the popover without it closing
//   (relatedTarget checks, no close timers anywhere);
// - persistent: stays open until hover/focus leaves both the cell and the
//   popover, or it is dismissed;
// - linked via `aria-describedby` (set imperatively on the active cell, so
//   no cell re-renders) — the cell's accessible name stays short;
// - never steals focus (no tabbable descendants) and never blocks clicks
//   longer than it is hovered (it closes on scroll and on cell toggle).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type UIEvent,
} from "react";
import {
  describeCharacter,
  type CharacterDescription,
  type UnicodeCharacterLookups,
} from "@keyboard-studio/engine";
import { loadUnicodeTable } from "./unicodeTable.ts";
import {
  CHARACTER_INFO_POPOVER_ID,
  type CharacterInfoTarget,
} from "./CharacterInfoPopover.tsx";

interface ActiveTarget extends CharacterInfoTarget {
  anchorEl: HTMLElement;
}

export interface UseCharacterInfoPopoverOptions {
  /** Override the table loader (tests inject a stub; default is the real
   * lazily-imported pinned table). */
  loadTable?: () => Promise<UnicodeCharacterLookups>;
}

export interface UseCharacterInfoPopoverResult {
  /** The active cell, or null when the popover is shut. */
  target: CharacterInfoTarget | null;
  /** describeCharacter() output for the target; null while the table loads. */
  details: CharacterDescription | null;
  /** Mutable: the popover assigns .current via callback ref. */
  popoverRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Spread onto the pane's scroll container (delegated listeners). */
  containerHandlers: {
    onPointerOver: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerOut: (e: PointerEvent<HTMLDivElement>) => void;
    onFocus: (e: FocusEvent<HTMLDivElement>) => void;
    onBlur: (e: FocusEvent<HTMLDivElement>) => void;
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
    onScroll: (e: UIEvent<HTMLDivElement>) => void;
  };
  /** For the popover element itself (hoverable). */
  handlePopoverPointerOut: (e: PointerEvent<HTMLDivElement>) => void;
  /** Shut the popover (cell toggle, zoom, language change, …). */
  close: () => void;
}

export function useCharacterInfoPopover(
  options: UseCharacterInfoPopoverOptions = {},
): UseCharacterInfoPopoverResult {
  const { loadTable = loadUnicodeTable } = options;
  const [active, setActive] = useState<ActiveTarget | null>(null);
  const [details, setDetails] = useState<CharacterDescription | null>(null);
  // Mutable: the popover's callback ref assigns .current on mount (React 18
  // types useRef<T | null>(null) as readonly RefObject, hence the cast).
  const popoverRef = useRef<HTMLDivElement | null>(null) as React.MutableRefObject<HTMLDivElement | null>;
  const activeRef = useRef<ActiveTarget | null>(null);
  activeRef.current = active;
  // Esc-dismissed char: a ref (not state) — it gates activation only and
  // never affects rendering.
  const dismissedCharRef = useRef<string | null>(null);

  const close = useCallback(() => {
    dismissedCharRef.current = null;
    setActive(null);
  }, []);

  // Details are computed lazily for the ACTIVE cell only, once the (cached)
  // table promise resolves. Stale resolutions are dropped. The dep is
  // intentionally the char, not the whole target object: a re-measured rect
  // or a replaced anchor element for the SAME char must not refetch.
  /* eslint-disable react-hooks/exhaustive-deps -- dep is active?.char by design (see above) */
  useEffect(() => {
    if (active === null) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setDetails(null);
    const char = active.char;
    loadTable()
      .then((unicode) => {
        if (!cancelled) setDetails(describeCharacter(char, unicode));
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.char, loadTable]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // aria-describedby: the cell's accessible name ("Add X (U+XXXX)") stays
  // short; screen-reader users get the popover's details as its description.
  // Imperative — activating a cell must not re-render 3000 buttons.
  useEffect(() => {
    const el = active?.anchorEl;
    if (el === undefined || !el.isConnected) return;
    el.setAttribute("aria-describedby", CHARACTER_INFO_POPOVER_ID);
    return () => {
      el.removeAttribute("aria-describedby");
    };
  }, [active]);

  const insideInteractive = useCallback(
    (node: unknown): boolean => {
      if (!(node instanceof Node)) return false;
      // Only the active anchor cell and the popover (and their descendants)
      // count — blank space elsewhere in the scroll container must let the
      // popover close when the pointer/focus moves there.
      return (
        activeRef.current?.anchorEl.contains(node) === true ||
        popoverRef.current?.contains(node) === true
      );
    },
    // activeRef/popoverRef are stable mutable refs; the callback reads
    // .current at call time, so no dependency on `active` is needed and the
    // delegated listeners never need re-attaching.
    [],
  );

  const activateFromEvent = useCallback((target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.("[data-char]");
    if (!(el instanceof HTMLElement)) return;
    const char = el.getAttribute("data-char");
    if (char === null || char === "") return;
    // Esc-dismissed: this cell stays shut until the pointer/focus leaves it.
    if (char === dismissedCharRef.current) return;
    dismissedCharRef.current = null;
    setActive((prev) =>
      prev !== null && prev.anchorEl === el
        ? prev
        : {
            char,
            block: el.getAttribute("data-block") ?? "",
            rect: el.getBoundingClientRect(),
            anchorEl: el,
          },
    );
  }, []);

  const handlePointerOver = useCallback(
    (e: PointerEvent<HTMLDivElement>) => activateFromEvent(e.target),
    [activateFromEvent],
  );

  // No close timers: moving cell→cell or cell→popover keeps the popover
  // open via the relatedTarget checks (hoverable); only leaving both closes.
  const handlePointerOut = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!insideInteractive(e.relatedTarget)) close();
    },
    [close, insideInteractive],
  );

  const handleFocus = useCallback(
    (e: FocusEvent<HTMLDivElement>) => activateFromEvent(e.target),
    [activateFromEvent],
  );

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      if (!insideInteractive(e.relatedTarget)) close();
    },
    [close, insideInteractive],
  );

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    // Dismissible without moving focus (1.4.13): Esc shuts the popover and
    // arms the dismissed gate so it does not instantly reopen while the
    // pointer/focus stays on this cell. The gate clears on the next close
    // or on activation of any other cell.
    if (e.key === "Escape" && activeRef.current !== null) {
      dismissedCharRef.current = activeRef.current.char;
      setActive(null);
    }
  }, []);

  // pointerout (bubbles, unlike pointerleave) with the same relatedTarget
  // guard as the container: moves inside the popover keep it open; leaving
  // both the popover and the active cell closes it.
  const handlePopoverPointerOut = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!insideInteractive(e.relatedTarget)) close();
    },
    [close, insideInteractive],
  );

  // A scroll would detach the fixed-position popover from its cell — shut
  // it instead of chasing the layout.
  const handleScroll = useCallback(() => close(), [close]);

  return {
    target: active,
    details,
    popoverRef,
    containerHandlers: {
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      onScroll: handleScroll,
    },
    handlePopoverPointerOut,
    close,
  };
}
