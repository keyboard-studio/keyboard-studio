// WindowsLayoutPicker — searchable picker over every Windows layout in the
// catalog (spec 076 A4). WAI-ARIA 1.2 editable combobox with a listbox popup
// (list autocomplete, manual activation): typing filters by name, id, and
// language tag / name; ArrowUp/ArrowDown move the active option; Enter picks
// it; Escape closes the popup (a second Escape reverts the typed text).
// Focus never leaves the input — the active option is exposed through
// aria-activedescendant.
//
// The picker is controlled: `selectedId` is always a real layout (the step
// preselects the studio's proposal), and `suggestedId` marks which option is
// the studio's suggestion.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { searchWindowsLayouts, windowsLayoutById } from "../lib/windowsLayouts.ts";
import type { WindowsLayout } from "../lib/windowsLayouts.ts";

export interface WindowsLayoutPickerProps {
  /** The currently chosen layout id. */
  selectedId: string;
  /** The studio's suggestion, badged in the list. */
  suggestedId?: string | undefined;
  onSelect: (layoutId: string) => void;
  /** Id of the element labelling the combobox. */
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
}

function optionSummary(layout: WindowsLayout): string {
  const tags = layout.languages.slice(0, 4).map((l) => l.id).join(", ");
  const more = layout.languages.length > 4 ? ` +${layout.languages.length - 4}` : "";
  return tags === "" ? layout.id : `${layout.id} · ${tags}${more}`;
}

export function WindowsLayoutPicker({
  selectedId,
  suggestedId,
  onSelect,
  labelledBy,
  describedBy,
}: WindowsLayoutPickerProps) {
  const { t } = useLingui();
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const optionId = (id: string) => `${uid}-opt-${id}`;

  const selected = windowsLayoutById(selectedId);
  // null = the author is not editing; the input shows the selected name.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    const found = searchWindowsLayouts(query ?? "");
    // With no query, pin the suggestion first so it is the first thing seen.
    if ((query ?? "").trim() === "" && suggestedId !== undefined) {
      const i = found.findIndex((l) => l.id === suggestedId);
      if (i > 0) {
        const [hit] = found.splice(i, 1);
        if (hit !== undefined) found.unshift(hit);
      }
    }
    return found;
  }, [query, suggestedId]);

  const active = results[Math.min(activeIndex, results.length - 1)];
  const activeId = open && active !== undefined ? optionId(active.id) : undefined;

  useEffect(() => {
    if (!open || activeId === undefined) return;
    const el = document.getElementById(activeId);
    if (el !== null && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  // Close when the pointer goes outside.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(layout: WindowsLayout) {
    onSelect(layout.id);
    setOpen(false);
    setQuery(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          const i = results.findIndex((l) => l.id === selectedId);
          setActiveIndex(i === -1 ? 0 : i);
        } else {
          setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        if (open && active !== undefined) {
          e.preventDefault();
          choose(active);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        } else if (query !== null) {
          e.preventDefault();
          setQuery(null);
        }
        break;
      case "Tab":
        setOpen(false);
        setQuery(null);
        break;
      default:
        break;
    }
  }

  const inputText = query ?? selected?.name ?? "";
  const countMessage = t({
    id: "layout.picker.resultCount",
    message: plural(results.length, {
      one: "# layout matches",
      other: "# layouts match",
    }),
  });

  return (
    <div ref={rootRef} style={{ position: "relative", maxWidth: 520 }} data-testid="layout-picker">
      <input
        role="combobox"
        type="text"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        {...(activeId !== undefined ? { "aria-activedescendant": activeId } : {})}
        {...(labelledBy !== undefined ? { "aria-labelledby": labelledBy } : {})}
        {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
        data-testid="layout-picker-input"
        placeholder={t({
          id: "layout.picker.placeholder",
          message: "Search by layout name, language, or code…",
        })}
        value={inputText}
        onFocus={(e) => {
          e.currentTarget.select();
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "var(--app-bg)",
          color: "var(--app-text)",
          border: "1px solid var(--app-border)",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 14,
          fontFamily: "var(--app-font)",
        }}
      />
      <div role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {open ? countMessage : ""}
      </div>
      {open &&
        (results.length === 0 ? (
          <div
            id={listboxId}
            data-testid="layout-picker-empty"
            style={popupStyle}
          >
            <p style={{ margin: 0, padding: 10, fontSize: 13, color: "var(--app-text-muted)" }}>
              <Trans id="layout.picker.noMatches">
                No layout matches your search. Try a language name, a country, or part of a layout name.
              </Trans>
            </p>
          </div>
        ) : (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={t({ id: "layout.picker.listLabel", message: "Windows keyboard layouts" })}
            data-testid="layout-picker-list"
            style={{ ...popupStyle, listStyle: "none", margin: 0, padding: 0 }}
          >
            {results.map((layout) => {
              const isActive = layout.id === active?.id;
              const isSelected = layout.id === selectedId;
              return (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- APG combobox: keyboard selection happens on the input (Enter on the active option); the option click is the redundant pointer affordance
                <li
                  key={layout.id}
                  id={optionId(layout.id)}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`layout-option-${layout.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(layout)}
                  onMouseMove={() => {
                    const i = results.indexOf(layout);
                    if (i !== activeIndex) setActiveIndex(i);
                  }}
                  style={{
                    padding: "7px 10px",
                    cursor: "pointer",
                    background: isActive ? "color-mix(in srgb, var(--app-accent) 16%, transparent)" : "transparent",
                    borderLeft: isSelected ? "3px solid var(--app-accent)" : "3px solid transparent",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: isSelected ? 600 : 400 }}>
                    {layout.name}
                    {layout.id === suggestedId && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "var(--app-accent)" }}>
                        <Trans id="layout.picker.suggestedBadge">Suggested</Trans>
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--app-text-muted)" }}>{optionSummary(layout)}</div>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}

const popupStyle = {
  position: "absolute",
  zIndex: 20,
  top: "100%",
  left: 0,
  right: 0,
  marginTop: 2,
  maxHeight: 320,
  overflowY: "auto",
  background: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 6,
  boxShadow: "0 6px 18px color-mix(in srgb, var(--app-bg) 22%, transparent)",
} as const;
