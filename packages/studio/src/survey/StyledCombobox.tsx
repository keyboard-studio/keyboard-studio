// StyledCombobox — the shared dark-themed dropdown (moved out of QuestionField so the
// language chooser can reuse it; spec 115). Presentation only.

import type { LanguageSummary } from "@keyboard-studio/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// StyledCombobox — the shared dark-themed dropdown used by BOTH the langtags
// name picker (Q1) and the generic options autocomplete (Q2 / region), so their
// dropdowns look identical. It is purely presentational: the parent supplies the
// options to display and reacts to onType / onSelect; the combobox owns only the
// open/highlight UI state and keyboard navigation.
//
// A native <datalist> cannot be styled to match, and (for the langtags picker)
// cannot tell homonyms apart, which is why this custom listbox exists.
// ---------------------------------------------------------------------------

/** One selectable row. `data` carries an optional payload (e.g. the resolved
 *  LanguageSummary) so the parent knows exactly which entry was picked. */
export interface ComboOption<T = LanguageSummary> {
  value: string;
  label: string;
  data?: T;
  /** Rich row content; `label` is still the plain text. */
  content?: ReactNode;
  /** Accessible name of the row when it differs from `label` (spec 056). */
  ariaLabel?: string;
}

export interface StyledComboboxProps<T = LanguageSummary> {
  id: string;
  value: string;
  options: ComboOption<T>[];
  placeholder?: string;
  required?: boolean;
  onType: (text: string) => void;
  onSelect: (option: ComboOption<T>) => void;
  /** Fired when the dropdown opens (focus / ArrowDown), so the parent can refresh
   *  its options for the current value if it needs to (the langtags picker does). */
  onOpen?: () => void;
}

export function StyledCombobox<T = LanguageSummary>({
  id,
  value,
  options,
  placeholder,
  required,
  onType,
  onSelect,
  onOpen,
}: StyledComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlight, setHighlight] = useState(-1);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const listId = `listbox-${id}`;
  const showList = open && options.length > 0;

  function openList(): void {
    setOpen(true);
    onOpen?.();
  }

  function select(option: ComboOption<T>): void {
    onSelect(option);
    setOpen(false);
    setHighlight(-1);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onType(e.target.value);
    setOpen(true);
    setHighlight(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && highlight >= 0 && highlight < options.length) {
        e.preventDefault();
        select(options[highlight]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  }

  // Epic #533: fixed 42px height + 15px type, matching the rest of the
  // design system's text inputs (was --control-h's 34px/14px). The focus
  // ring itself still comes from `.ks-focus-ring:focus-visible` (index.css) —
  // it already reads var(--app-accent) / var(--app-accent-ring), so no
  // inline focus style is needed here; `.ks-hit-target` still gives this the
  // same >=44px touch target as every other single-line control (TextField,
  // Dropdown).
  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 42,
    padding: "0 12px",
    background: "var(--app-surface)",
    border: "1px solid var(--app-border-strong)",
    borderRadius: "var(--app-radius-sm)",
    color: "var(--app-text)",
    fontSize: 15,
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-required={required === true}
        aria-activedescendant={
          highlight >= 0 && highlight < options.length ? `${listId}-opt-${highlight}` : undefined
        }
        autoComplete="off"
        {...(placeholder !== undefined ? { placeholder } : {})}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={openList}
        // Delay close so an option's onMouseDown registers before blur.
        // Only close when the input is still unfocused at fire time: the
        // timer can fire late while the main thread is busy (the language
        // search runs synchronous Fuse rounds), and a stale close would
        // otherwise shut a list the author has already reopened (walk 6c).
        onBlur={() =>
          setTimeout(() => {
            if (isMountedRef.current && document.activeElement !== inputRef.current) setOpen(false);
          }, 120)
        }
        ref={inputRef}
        className="ks-control ks-focus-ring ks-hit-target"
        style={inputStyle}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "var(--app-overlay)",
            border: "1px solid var(--app-border)",
            borderRadius: "var(--app-radius-sm)",
            maxHeight: 240,
            overflowY: "auto",
            boxShadow: "var(--app-shadow-pop)",
          }}
        >
          {options.map((opt, i) => (
            <li
              key={`${opt.value}-${i}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              {...(opt.ariaLabel !== undefined ? { "aria-label": opt.ariaLabel } : {})}
              data-value={opt.value}
              // onMouseDown (not onClick) so selection fires before the input's
              // onBlur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                select(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "6px 8px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
                color: i === highlight ? "var(--app-accent-text)" : "var(--app-text)",
                background: i === highlight ? "var(--app-accent-subtle)" : "transparent",
              }}
            >
              {opt.content ?? opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

