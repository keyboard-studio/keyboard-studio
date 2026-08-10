// SelectMenu — a custom, DOM-rendered single-select dropdown.
//
// WHY this exists instead of a native-<select>-backed dropdown (the
// now-removed ui/Dropdown.tsx):
// native <select> popups do not open in the VS Code Simple Browser /
// Electron webview — clicking the control does nothing visible. SelectMenu
// renders its option list as an ordinary <ul>, which the webview paints
// fine, while keeping the same collapsed-trigger UX and listbox a11y
// semantics a real dropdown menu should have.
//
// WHY the open list is a portal, not an absolutely-positioned in-place <ul>:
// some call sites (the assign-loop galleries' scrolling left pane, see
// AssignLoopShell.tsx) nest this component inside an `overflow: auto`
// ancestor that itself sits inside an `overflow: hidden` two-pane row.
// `position: fixed` alone does NOT escape that — a `fixed` descendant is
// still clipped by an ancestor's `overflow: hidden`/`auto` as long as it
// stays inside that ancestor's DOM subtree (a common CSS surprise). The only
// way to truly escape ancestor clipping is to physically move the DOM node
// out of that subtree, hence `createPortal(..., document.body)` combined
// with `position: fixed` positioned from the trigger's `getBoundingClientRect()`.

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { BG_PAGE, BORDER, TEXT_MAIN, ACCENT, FONT } from "./theme.ts";
import { mergeClassNames } from "./classNames.ts";

export interface SelectMenuOption {
  value: string;
  label: string;
}

export interface SelectMenuProps {
  options: readonly SelectMenuOption[];
  /** Currently selected value. */
  value: string;
  onChange: (value: string) => void;
  /** Used for the trigger button id + option id prefix. */
  id?: string;
  /**
   * Value for `aria-labelledby` on the trigger button. Same idiom as
   * RadioGroup/MultiSelect — pass the id of a sibling label element.
   */
  ariaLabelledby?: string;
  /** Sets `aria-required` on the popup listbox (the role that supports the
   * attribute — a plain button does not). The planned APG select-only
   * combobox migration (spec 056 Cycle 2) moves it to the trigger when the
   * trigger gains `role="combobox"`. */
  required?: boolean;
  /**
   * Value for `aria-label` on the trigger button — for call sites with no
   * sibling label element to reference (mirrors how a native `<select>`
   * often carries a bare `aria-label` string instead of `aria-labelledby`).
   * Ignored if `ariaLabelledby` is also set.
   */
  ariaLabel?: string;
  /**
   * Value for `aria-describedby` on the trigger button — a sibling element
   * explaining the control (as distinct from naming it, which is
   * `ariaLabelledby`/`ariaLabel`'s job). A native `<select>` takes the same
   * attribute for the same purpose.
   */
  ariaDescribedby?: string;
  /**
   * Style override merged onto the trigger button, on top of the default
   * `TRIGGER_STYLE` — the "callers may override, merged not replaced" idiom
   * inherited from the now-removed `ui/Dropdown.tsx`, applied to the visible
   * control (the trigger button), not the outer wrapper. Lets a
   * caller size the control (e.g. a fixed width) the way a native `<select>`
   * would otherwise auto-size to its content.
   */
  style?: React.CSSProperties;
  /**
   * Optional per-option render hook for the label span (e.g. render each
   * font name in its own font). Defaults to plain `opt.label` text. Used
   * both for each row in the open list and for the trigger's current-value
   * display.
   */
  renderOptionLabel?: (opt: SelectMenuOption) => React.ReactNode;
  /**
   * Opt-in "type a physical key to select it" hook — deliberately NOT a
   * built-in behavior of this generic component. Only KeyPickerField
   * (physical/touch key pickers) supplies this, using keyOptions.ts's
   * `charToVkey`; flick-direction, layer-token, and font SelectMenus leave
   * it unset. Called from `handleListKeyDown` (i.e. only while the list is
   * open — see the class doc comment below) for any keydown that isn't
   * already claimed by Escape/ArrowUp/ArrowDown/Enter. Return the matching
   * option's `value`, or `null` to fall through as an ordinary (ignored)
   * keydown. The caller is responsible for checking modifier keys
   * (Ctrl/Alt/Meta) and multi-char `event.key` values (e.g. "Tab",
   * "ArrowLeft") itself — this component does not second-guess what the
   * resolver returns, but see handleListKeyDown for the belt-and-suspenders
   * `options` membership check.
   */
  resolveKeyToValue?: (event: React.KeyboardEvent) => string | null;
  /**
   * Separates arrow-key *highlight* movement from *commit* (calling
   * `onChange`). Defaults to `"onHighlight"` — today's contract, unchanged
   * for every existing call site: ArrowUp/ArrowDown call `onChange`
   * immediately as the highlight moves (selection-follows-focus), so
   * `aria-activedescendant` always tracks the same option `aria-selected`
   * marks. Harmless for a consumer like LocaleSwitcher, where `onChange` is
   * just picking a value.
   *
   * `"onExplicitSelect"` is for a consumer where `onChange` has a real side
   * effect beyond picking a value (e.g. CurrentKeyboardIndicator, which
   * resumes a different project and navigates on `onChange`) — a
   * keyboard-only user arrowing through the list must not trigger that
   * side effect on every keypress. Under this mode, arrow keys move a
   * local highlight and update `aria-activedescendant` WITHOUT calling
   * `onChange`; `onChange` fires only on Enter/Space on the highlighted
   * option, or a click. Escape/Tab close the list without committing — the
   * highlight is local state that is never written back to `value`, so an
   * abandoned traversal leaves no phantom selection and the trigger keeps
   * showing the real, unchanged selection throughout. `aria-selected`
   * continues to mark the genuinely selected (`value`-matching) option, not
   * the highlight — `aria-activedescendant` is the only attribute that
   * moves with the highlight.
   */
  commitMode?: "onHighlight" | "onExplicitSelect";
}

// Border is split into borderWidth/borderStyle/borderColor (rather than the
// `border: "1px solid <token>"` shorthand): jsdom's style-shorthand parser
// cannot decompose a shorthand value containing an unresolved `var(...)`.
const TRIGGER_STYLE: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "0 10px",
  background: BG_PAGE,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius-sm)",
  color: TEXT_MAIN,
  fontSize: 14,
  fontFamily: FONT,
  boxSizing: "border-box",
  outline: "none",
  cursor: "pointer",
  textAlign: "left",
};

// Gap between the trigger and the list, and the list's own internal scroll
// cap — kept as named constants since MenuPosition math (below) needs the
// same numbers to decide whether there's room to open downward.
const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 240;

// Portalled to document.body (see file header), so this is no longer
// positioned relative to the trigger via a `position: relative` ancestor —
// `top`/`left`/`bottom`/`width` are computed per-open from the trigger's
// getBoundingClientRect() and merged on at render time (see MenuPosition).
// zIndex is deliberately high: once in document.body the list is a
// top-level sibling of the whole app, past every in-app stacking context
// (the highest in-app value at time of writing is 200 — AccountControl.tsx).
const LIST_STYLE: React.CSSProperties = {
  position: "fixed",
  zIndex: 1000,
  margin: 0,
  padding: 4,
  listStyle: "none",
  background: BG_PAGE,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius-sm)",
  // A popover/menu surface floating above the page — the geometry layer's
  // "pop" shadow token (geometry.css) is exactly this use case.
  boxShadow: "var(--app-shadow-pop)",
  maxHeight: MENU_MAX_HEIGHT,
  overflowY: "auto",
};

/** Fixed-position coordinates for the portalled list, derived from the
 * trigger's bounding rect. Either `top` (opens downward, the common case) or
 * `bottom` (flipped upward — not enough room below the trigger) is set, never
 * both. */
interface MenuPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

function computeMenuPosition(triggerRect: DOMRect): MenuPosition {
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  // Flip upward only when there's genuinely less room below than above —
  // avoids flipping a merely-short-but-adequate space below into an
  // even-shorter space above.
  const shouldFlipUp = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow;
  if (shouldFlipUp) {
    return {
      bottom: window.innerHeight - triggerRect.top + MENU_GAP,
      left: triggerRect.left,
      width: triggerRect.width,
    };
  }
  return {
    top: triggerRect.bottom + MENU_GAP,
    left: triggerRect.left,
    width: triggerRect.width,
  };
}

const OPTION_ROW_STYLE: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  textAlign: "left",
  padding: "6px 8px",
  background: "transparent",
  borderLeft: "3px solid transparent",
  borderRadius: "var(--app-radius-sm)",
  color: TEXT_MAIN,
  fontSize: 14,
  fontFamily: FONT,
  cursor: "pointer",
};

function defaultRenderLabel(opt: SelectMenuOption): React.ReactNode {
  return opt.label;
}

// Option-row hover background — epic #533 replaced the theme accent
// constant with a `var(--app-accent)` string, so the old hand-rolled
// hex-to-rgba(…, 0.12) helper (which parsed ACCENT as a literal hex color)
// no longer has a hex value to parse. `--app-accent-bg` is the token built
// for exactly this "accent wash" role (colors.css) and is themed
// consistently across light/navy, so it replaces the helper outright rather
// than reimplementing alpha-blending over a CSS var (not resolvable in JS).
const OPTION_HOVER_BG = "var(--app-accent-bg)";

// Issue #536: bump the option row to the >=44px coarse-pointer hit target,
// same convention as RadioGroup/MultiSelect.
const OPTION_ROW_CLASSNAME = "ks-hit-target";

/**
 * Custom single-select dropdown menu. Trigger is a collapsed button; the
 * option list is a DOM-rendered `<ul role="listbox">`, portalled to
 * `document.body` and fixed-positioned under the trigger — no native
 * `<select>` popup involved (see file header for why that matters, both for
 * the DOM-rendered list generally and for the portal specifically).
 *
 * Open/close: `open` is local React state toggled by the trigger (click, or
 * Enter/Space which toggle it symmetrically) and by option selection. A
 * `mousedown` listener on `document` closes the menu when the click target
 * falls outside BOTH `containerRef` and `listRef` (click-outside-to-close;
 * the list check matters because it now lives outside `containerRef` in the
 * DOM, in its `document.body` portal); a container-level `onBlur` closes it
 * when focus leaves the component entirely (tabbing away) — likewise
 * checked against both refs, since focus moving into the portalled list must
 * not be treated as focus leaving; `Escape` closes it. All of these return
 * focus to the trigger.
 *
 * Positioning: while open, the list's `position: fixed` coordinates are
 * (re)computed from the trigger's `getBoundingClientRect()` — on open, and
 * on every `scroll` (capture-phase, so it also catches an ancestor scroll
 * container's scroll, which does not bubble to `window`) and `resize` while
 * still open. Reposition-on-scroll was chosen over close-on-scroll: it's a
 * few more lines but keeps the menu usable while the author scrolls the
 * pane it's anchored to, rather than punishing that with a surprise close.
 * Flips to open upward (`bottom` instead of `top`) when there's more room
 * above the trigger than below (see `computeMenuPosition`).
 *
 * Keyboard focus: opening the menu moves DOM focus onto the `<ul>` itself
 * (it carries `tabIndex={-1}` so it's programmatically focusable but not in
 * the Tab order), done via a callback ref (`attachListRef`) that fires
 * exactly once per mount rather than a `useEffect` keyed on position updates
 * — the list only exists in the DOM once `menuPosition` is computed, and a
 * position-keyed effect would refire (and re-steal focus) on every
 * scroll-driven reposition. `handleListKeyDown`'s arrow/Enter/Escape
 * handling depends on this focus hand-off — without it the list's
 * onKeyDown is dead code, since focus never leaves the trigger button.
 *
 * Active-option announcement: under the default `commitMode` ("onHighlight"),
 * arrow keys commit the selection immediately (selection-follows-focus, see
 * handleListKeyDown), so the `<ul>`'s `aria-activedescendant` points at the
 * selected option's id and updates on every ArrowUp/ArrowDown — assistive
 * tech announces the active option without a separate
 * highlighted-vs-selected distinction. Under `commitMode="onExplicitSelect"`
 * the highlight (`highlightedValue`) is tracked separately from the
 * committed `value` — `aria-activedescendant` follows the highlight,
 * `aria-selected` stays on the true selection, and only Enter/Space/click
 * commits (see the `commitMode` prop doc comment).
 */
export function SelectMenu({
  options,
  value,
  onChange,
  id,
  ariaLabelledby,
  required,
  ariaLabel,
  ariaDescribedby,
  style,
  renderOptionLabel = defaultRenderLabel,
  resolveKeyToValue,
  commitMode = "onHighlight",
}: SelectMenuProps): React.ReactElement {
  const isExplicitSelect = commitMode === "onExplicitSelect";
  const [open, setOpen] = useState(false);
  // null until the first position computation after opening (see the
  // layout effect below) — the portalled list only renders once this is
  // non-null, so there's never a frame painted at (0, 0) before its real
  // coordinates are known.
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Typed `HTMLUListElement | null` (not just `HTMLUListElement`) so this is
  // a MutableRefObject, not a RefObject — attachListRef (below) needs to
  // write `.current` itself, since it's the callback ref supplied to the
  // portalled `<ul>` rather than a plain `ref={listRef}`.
  const listRef = useRef<HTMLUListElement | null>(null);

  // Only meaningful under commitMode="onExplicitSelect" (see that prop's doc
  // comment) — tracks the arrow-key highlight separately from the committed
  // `value`, so traversal never calls `onChange` until Enter/Space/click.
  // Unused under the default "onHighlight" mode (highlightedOption below
  // falls back to selectedOption in that mode), so this state's existence
  // has no effect on that path.
  const [highlightedValue, setHighlightedValue] = useState<string>(value);

  // Re-syncs the highlight to the true current selection every time the menu
  // opens, so a fresh open always highlights `value` rather than wherever a
  // previous open's abandoned traversal left off.
  useEffect(() => {
    if (open) {
      setHighlightedValue(value);
    }
  }, [open, value]);

  const selectedOption = options.find((opt) => opt.value === value);
  const listId = id !== undefined ? `${id}-listbox` : undefined;
  // Under the default "onHighlight" mode, arrow-key navigation commits the
  // selection immediately (see handleListKeyDown below) — selection-
  // follows-focus — so the "active" option for a11y purposes IS always the
  // currently-selected option. Under "onExplicitSelect", the highlight can
  // differ from the committed selection while traversing (see
  // highlightedValue above).
  const highlightedOption = isExplicitSelect
    ? options.find((opt) => opt.value === highlightedValue)
    : selectedOption;
  // Guarded on `id` being defined: without it there is no stable option id
  // to reference, so omit the attribute rather than emit a broken
  // `undefined-option-...` ref.
  const activeDescendantId =
    id !== undefined && highlightedOption !== undefined
      ? `${id}-option-${highlightedOption.value}`
      : undefined;

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const closeAndRefocusTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      // The list is portalled to document.body (see file header), so a
      // click inside it is NOT inside containerRef in the DOM — it must be
      // checked separately, or every option click would count as
      // "outside" and close the menu before the option's own onClick fires.
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insideList = listRef.current?.contains(target) ?? false;
      if (!insideContainer && !insideList) {
        closeAndRefocusTrigger();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open, closeAndRefocusTrigger]);

  // Computes/recomputes the portalled list's fixed-position coordinates
  // from the trigger's current bounding rect. Guarded against a momentarily
  // null trigger ref (e.g. an unmount race) — simply skips the update
  // rather than throwing.
  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      setMenuPosition(computeMenuPosition(rect));
    }
  }, []);

  // Computes the initial position on open (and clears it on close, so a
  // stale position from a previous open never flashes before the next
  // open's real coordinates land). Runs as a layout effect so the position
  // is known before the browser paints the newly-opened list.
  useLayoutEffect(() => {
    if (open) {
      updateMenuPosition();
    } else {
      setMenuPosition(null);
    }
  }, [open, updateMenuPosition]);

  // Keeps the list anchored to the trigger while scrolling/resizing.
  // Reposition-on-scroll (rather than close-on-scroll) is the chosen
  // trade-off — see the class doc comment above for why. Capture-phase is
  // required for the scroll listener: the assign-loop galleries' scrolling
  // left pane (AssignLoopShell.tsx) is an `overflow: auto` element whose
  // own `scroll` events do not bubble to `window` — only capture-phase
  // listeners on an ancestor observe them.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("resize", updateMenuPosition);
    return () => {
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [open, updateMenuPosition]);

  // P0 fix (pre-portal): move focus onto the listbox when it mounts, so
  // arrow-key / Enter / Escape handling on the <ul> (handleListKeyDown)
  // actually fires — without this, focus stays on the trigger button and
  // the list's onKeyDown never receives an event.
  //
  // A callback ref rather than a `useEffect([open])`: the list (now
  // portalled) only mounts once `menuPosition` is non-null, one render
  // after `open` flips true, and `menuPosition` keeps changing afterward on
  // every scroll-driven reposition. An effect keyed on either `open` or
  // `menuPosition` would either miss the mount (wrong dependency) or
  // re-steal focus on every reposition (right dependency, wrong frequency).
  // A callback ref fires exactly once per actual mount/unmount of the DOM
  // node, which is exactly the "list just appeared" moment this needs.
  const attachListRef = useCallback((node: HTMLUListElement | null) => {
    listRef.current = node;
    if (node !== null) {
      node.focus();
    }
  }, []);

  const selectOption = (opt: SelectMenuOption): void => {
    onChange(opt.value);
    closeAndRefocusTrigger();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === "Enter" || e.key === " ") {
      // P1 fix: symmetric with the mouse click handler below — toggle
      // rather than only ever opening.
      e.preventDefault();
      setOpen((prev) => !prev);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocusTrigger();
    }
  };

  // P1 fix: close the menu when focus leaves the component altogether
  // (e.g. Tab away while open), not just on Escape / click-outside.
  // Checked against the *container* AND the *list* (not just the trigger)
  // so focus moving from the trigger into the listbox on open (see
  // attachListRef above) does not itself trigger a close — the list check
  // is required post-portal since it's no longer a DOM descendant of
  // containerRef.
  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    if (!open) return;
    const nextTarget = e.relatedTarget as Node | null;
    // Guard: relatedTarget is null both for genuinely ambiguous cases
    // (focus leaving the document/browser chrome) and — in some DOM
    // implementations — for in-component focus moves such as the trigger's
    // programmatic hand-off to the listbox above. Since we can't tell those
    // apart, don't close on a null relatedTarget; only close when we can
    // positively confirm the new focus target is outside the container.
    if (nextTarget === null) return;
    const insideContainer = containerRef.current?.contains(nextTarget) ?? false;
    const insideList = listRef.current?.contains(nextTarget) ?? false;
    if (!insideContainer && !insideList) {
      close();
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocusTrigger();
      return;
    }
    // P2 fix (portal-Tab regression): the open <ul> is portalled to the end
    // of document.body (see file header), so it sits AFTER every other
    // focusable element in DOM order — a real Tab/Shift+Tab press while it's
    // focused would move focus to whatever follows document.body's last
    // child (or precedes it, for Shift+Tab), not to whatever visually/
    // logically follows the trigger button. That's an unpredictable jump for
    // a keyboard user. Rather than fighting the browser's native tab order
    // (e.g. trying to trap focus inside the list, which creates its own
    // surprises), close the menu and return focus to the trigger — the same
    // hand-off Escape/click-outside/option-select already use — so the
    // user's NEXT Tab press continues from a stable, expected place. Not
    // calling preventDefault(): the browser's default Tab still runs against
    // the (now-refocused) trigger, so the user ends up exactly where they'd
    // expect if this were a non-portalled, in-place dropdown.
    if (e.key === "Tab") {
      closeAndRefocusTrigger();
      return;
    }
    // Type-to-select (opt-in — see resolveKeyToValue's doc comment above).
    // Checked before Arrow/Enter handling below since neither branch there
    // can match a resolver's return anyway (Arrow*/Enter/Escape are all
    // multi-char `event.key` values, never a single typed character), but
    // ordering it first keeps the "claimed keys" list easy to scan top to
    // bottom. Re-validated against `options` here (not just trusted from the
    // caller) so a resolver bug can never select a value this dropdown
    // doesn't actually offer.
    if (resolveKeyToValue !== undefined) {
      // P2 fix: while a type-to-select list is open, an unmodified single
      // printable keydown (e.g. Space) is claimed by the menu even when the
      // resolver doesn't map it to an in-`options` value — otherwise the
      // still-focused `<ul>` falls through to default browser behavior
      // (Space scrolling the page being the motivating case).
      const isUnmodifiedPrintableChar =
        e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (isUnmodifiedPrintableChar) {
        e.preventDefault();
      }
      const resolvedValue = resolveKeyToValue(e);
      if (resolvedValue !== null) {
        const matched = options.find((opt) => opt.value === resolvedValue);
        if (matched !== undefined) {
          selectOption(matched);
          return;
        }
      }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // Under "onExplicitSelect", navigate relative to the current
      // highlight (not the committed `value`) — see the commitMode prop's
      // doc comment. Under the default mode these are the same value.
      const currentIndex = options.findIndex(
        (opt) => opt.value === (isExplicitSelect ? highlightedValue : value),
      );
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + delta + options.length) % options.length;
      const nextOption = options[nextIndex];
      if (nextOption !== undefined) {
        if (isExplicitSelect) {
          // Move the highlight only — no onChange, no commit.
          setHighlightedValue(nextOption.value);
        } else {
          onChange(nextOption.value);
        }
      }
    } else if (e.key === "Enter" || (isExplicitSelect && e.key === " ")) {
      e.preventDefault();
      if (isExplicitSelect) {
        // Commit the highlighted option now — the one place under this
        // mode that calls onChange from the keyboard.
        const matched = options.find((opt) => opt.value === highlightedValue);
        if (matched !== undefined) {
          selectOption(matched);
        } else {
          closeAndRefocusTrigger();
        }
      } else {
        closeAndRefocusTrigger();
      }
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }} onBlur={handleContainerBlur}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={ariaLabelledby}
        aria-label={ariaLabelledby === undefined ? ariaLabel : undefined}
        aria-describedby={ariaDescribedby}
        // Not read by the component itself — a stable, value-based test hook
        // mirroring a native <select>'s own `.value`, since callers can no
        // longer read that off this button directly.
        data-value={value}
        className={mergeClassNames("ks-control ks-focus-ring ks-hit-target")}
        style={{ ...TRIGGER_STYLE, ...style }}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption !== undefined ? renderOptionLabel(selectedOption) : ""}</span>
        <span aria-hidden="true">&#9662;</span>
      </button>
      {open &&
        menuPosition !== null &&
        createPortal(
          <ul
            ref={attachListRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-required={required}
            aria-activedescendant={activeDescendantId}
            style={{ ...LIST_STYLE, ...menuPosition }}
            onKeyDown={handleListKeyDown}
          >
            {options.map((opt) => {
              const optionId = id !== undefined ? `${id}-option-${opt.value}` : undefined;
              const isSelected = opt.value === value;
              return (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- APG listbox pattern: keyboard selection happens on the focused <ul role="listbox"> (handleListKeyDown + aria-activedescendant), never on individual options; the option's onClick is the redundant pointer affordance
                <li
                  key={opt.value}
                  role="option"
                  id={optionId}
                  aria-selected={isSelected}
                  // Not read by the component itself — a stable, value-based
                  // test hook so specs can select an option without depending
                  // on exact label text/formatting (mirrors how tests used to
                  // query a native <option value="...">).
                  data-value={opt.value}
                  className={OPTION_ROW_CLASSNAME}
                  onClick={() => selectOption(opt)}
                  style={{
                    ...OPTION_ROW_STYLE,
                    // Selected-row fill: the accent-subtle wash from the
                    // design handoff's selection rule (border + ring + subtle
                    // fill). The 3px ring itself is intentionally skipped
                    // here — it reads as a per-card affordance (see
                    // Card.tsx's CARD_SELECTED); stamping it on every row of
                    // a dense, scrollable listbox would double up with the
                    // adjacent rows' borders and read as visual noise. The
                    // left accent bar plus the subtle fill together still
                    // make the selected option unambiguous.
                    background: isSelected ? "var(--app-accent-subtle)" : "transparent",
                    borderLeftColor: isSelected ? ACCENT : "transparent",
                    color: isSelected ? ACCENT : TEXT_MAIN,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = OPTION_HOVER_BG;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected
                      ? "var(--app-accent-subtle)"
                      : "transparent";
                  }}
                >
                  {renderOptionLabel(opt)}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
