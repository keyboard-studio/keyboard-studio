// SelectMenu — a custom, DOM-rendered single-select dropdown.
//
// WHY this exists instead of the native-<select>-backed ui/Dropdown.tsx:
// native <select> popups do not open in the VS Code Simple Browser /
// Electron webview — clicking the control does nothing visible. SelectMenu
// renders its option list as an ordinary absolutely-positioned <ul>, which
// the webview paints fine, while keeping the same collapsed-trigger UX and
// listbox a11y semantics a real dropdown menu should have.

import React, { useEffect, useRef, useState, useCallback } from "react";
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
  /** Same idiom as `RadioGroup`'s `required` prop (RadioGroup.tsx) — sets
   * `aria-required` on the trigger button. */
  required?: boolean;
  /**
   * Value for `aria-label` on the trigger button — for call sites with no
   * sibling label element to reference (mirrors how a native `<select>`
   * often carries a bare `aria-label` string instead of `aria-labelledby`).
   * Ignored if `ariaLabelledby` is also set.
   */
  ariaLabel?: string;
  /**
   * Style override merged onto the trigger button, on top of the default
   * `TRIGGER_STYLE` — same "callers may override, merged not replaced" idiom
   * as `ui/Dropdown.tsx`, and applied to the same element Dropdown applies
   * its override to (the visible control), not the outer wrapper. Lets a
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
}

const TRIGGER_STYLE: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "0 10px",
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_MAIN,
  fontSize: 14,
  fontFamily: FONT,
  boxSizing: "border-box",
  outline: "none",
  cursor: "pointer",
  textAlign: "left",
};

const LIST_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 20,
  margin: "4px 0 0 0",
  padding: 4,
  listStyle: "none",
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
  maxHeight: 240,
  overflowY: "auto",
};

const OPTION_ROW_STYLE: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  textAlign: "left",
  padding: "6px 8px",
  background: "transparent",
  borderLeft: "3px solid transparent",
  borderRadius: 4,
  color: TEXT_MAIN,
  fontSize: 14,
  fontFamily: FONT,
  cursor: "pointer",
};

function defaultRenderLabel(opt: SelectMenuOption): React.ReactNode {
  return opt.label;
}

// Derives the option-row hover background from the theme accent (ACCENT,
// `#6ea8fe` in theme.ts) at 12% opacity, instead of hardcoding a second copy
// of the accent's RGB triplet. Keeps this in sync automatically if ACCENT
// ever changes.
function hexToRgba(hex: string, alpha: number): string {
  const stripped = hex.replace("#", "");
  const r = parseInt(stripped.slice(0, 2), 16);
  const g = parseInt(stripped.slice(2, 4), 16);
  const b = parseInt(stripped.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const OPTION_HOVER_BG = hexToRgba(ACCENT, 0.12);

// Issue #536: bump the option row to the >=44px coarse-pointer hit target,
// same convention as RadioGroup/MultiSelect.
const OPTION_ROW_CLASSNAME = "ks-hit-target";

/**
 * Custom single-select dropdown menu. Trigger is a collapsed button; the
 * option list is a DOM-rendered `<ul role="listbox">` positioned under it —
 * no native `<select>` popup involved (see file header for why that matters).
 *
 * Open/close: `open` is local React state toggled by the trigger (click, or
 * Enter/Space which toggle it symmetrically) and by option selection. A
 * `mousedown` listener on `document` closes the menu when the click target
 * falls outside `containerRef` (click-outside-to-close); a container-level
 * `onBlur` closes it when focus leaves the component entirely (tabbing
 * away); `Escape` closes it. All of these return focus to the trigger.
 *
 * Keyboard focus: opening the menu moves DOM focus onto the `<ul>` itself
 * (it carries `tabIndex={-1}` so it's programmatically focusable but not in
 * the Tab order) so `handleListKeyDown`'s arrow/Enter/Escape handling
 * actually receives key events — without this the list's onKeyDown is dead
 * code, since focus never leaves the trigger button.
 *
 * Active-option announcement: arrow keys commit the selection immediately
 * (selection-follows-focus, see handleListKeyDown), so the `<ul>` carries
 * `aria-activedescendant` pointing at the selected option's id and it
 * updates on every ArrowUp/ArrowDown — assistive tech announces the active
 * option without a separate highlighted-vs-selected distinction.
 */
export function SelectMenu({
  options,
  value,
  onChange,
  id,
  ariaLabelledby,
  required,
  ariaLabel,
  style,
  renderOptionLabel = defaultRenderLabel,
}: SelectMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const listId = id !== undefined ? `${id}-listbox` : undefined;
  // Arrow-key navigation here commits the selection immediately (see
  // handleListKeyDown below) — selection-follows-focus — so the "active"
  // option for a11y purposes IS always the currently-selected option; no
  // separate highlightedIndex is needed. Guarded on `id` being defined:
  // without it there is no stable option id to reference, so omit the
  // attribute rather than emit a broken `undefined-option-...` ref.
  const activeDescendantId =
    id !== undefined && selectedOption !== undefined
      ? `${id}-option-${selectedOption.value}`
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
      if (!containerRef.current?.contains(e.target as Node)) {
        closeAndRefocusTrigger();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open, closeAndRefocusTrigger]);

  // P0 fix: move focus onto the listbox when it opens, so arrow-key /
  // Enter / Escape handling on the <ul> (handleListKeyDown) actually fires.
  // Without this, focus stays on the trigger button and the list's
  // onKeyDown never receives an event.
  useEffect(() => {
    if (open) {
      listRef.current?.focus();
    }
  }, [open]);

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
  // Checked against the *container* (not the trigger) so focus moving from
  // the trigger into the listbox on open (see the effect above) does not
  // itself trigger a close.
  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    if (!open) return;
    const nextTarget = e.relatedTarget as Node | null;
    // Guard: relatedTarget is null both for genuinely ambiguous cases
    // (focus leaving the document/browser chrome) and — in some DOM
    // implementations — for in-component focus moves such as the trigger's
    // programmatic hand-off to the listbox above. Since we can't tell those
    // apart, don't close on a null relatedTarget; only close when we can
    // positively confirm the new focus target is outside the container.
    if (nextTarget !== null && !containerRef.current?.contains(nextTarget)) {
      close();
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocusTrigger();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const currentIndex = options.findIndex((opt) => opt.value === value);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + delta + options.length) % options.length;
      const nextOption = options[nextIndex];
      if (nextOption !== undefined) {
        onChange(nextOption.value);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      closeAndRefocusTrigger();
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
        aria-required={required}
        aria-label={ariaLabelledby === undefined ? ariaLabel : undefined}
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
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={activeDescendantId}
          style={LIST_STYLE}
          onKeyDown={handleListKeyDown}
        >
          {options.map((opt) => {
            const optionId = id !== undefined ? `${id}-option-${opt.value}` : undefined;
            const isSelected = opt.value === value;
            return (
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
                  borderLeftColor: isSelected ? ACCENT : "transparent",
                  color: isSelected ? ACCENT : TEXT_MAIN,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = OPTION_HOVER_BG;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {renderOptionLabel(opt)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
