// Metadata-only combobox picker — WAI-ARIA 1.2 editable combobox + listbox popup
// over BaseBrowserService.listAll(). Results ranked by rankBases() —
// exact script/BCP-47 match first, then name/id substring (AC#1).
// CJK/Ethiopic guard lives in OSKFrame, not here.

import { useEffect, useState, useDeferredValue, useMemo, useRef, useId } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";
import { getBaseBrowserService } from "../lib/services.ts";
import { rankBases, type RankedBase } from "../lib/rankBases.ts";
import type { SuggestTarget } from "../lib/suggestBase.ts";

// ---------------------------------------------------------------------------
// Import corpus — lazy-loaded so it never bloats the initial bundle.
// Shape: { keyboards: Array<{ keyboardId: string; status: string; ... }> }
// ---------------------------------------------------------------------------

interface CorpusEntry {
  keyboardId: string;
  status: string;
}

let _corpusCache: Map<string, string> | null | "failed" = null;

async function loadCorpus(): Promise<Map<string, string>> {
  if (_corpusCache !== null && _corpusCache !== "failed") return _corpusCache;
  try {
    // Dynamic import so the ~335 KB JSON never enters the initial chunk.
    const mod = await import("@docs/import-corpus.json");
    const data = (mod.default ?? mod) as { keyboards?: CorpusEntry[] };
    const map = new Map<string, string>();
    for (const entry of data.keyboards ?? []) {
      map.set(entry.keyboardId, entry.status);
    }
    _corpusCache = map;
    return map;
  } catch {
    _corpusCache = "failed";
    console.warn("[BaseKeyboardPicker] import-corpus.json not available - import-status badges suppressed");
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Badge styling per ImportStatus — colored via design-system tokens
// clean  → var(--sil-green)
// opaque → var(--app-accent)
// diverged → var(--sil-orange-dark)
// parse-err → var(--danger)
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  [ImportStatus.Clean]: "clean",
  [ImportStatus.CleanWithOpaque]: "opaque",
  [ImportStatus.ParseFailure]: "parse-err",
  [ImportStatus.RoundTripDivergence]: "diverged",
};

const STATUS_COLOR: Record<string, string> = {
  [ImportStatus.Clean]: "var(--sil-green)",
  [ImportStatus.CleanWithOpaque]: "var(--app-accent)",
  [ImportStatus.ParseFailure]: "var(--danger)",
  [ImportStatus.RoundTripDivergence]: "var(--sil-orange-dark)",
};

function ImportBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? "var(--app-text-muted)";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: "1px 4px",
        marginLeft: 4,
        lineHeight: 1,
        verticalAlign: "middle",
        whiteSpace: "nowrap",
      }}
      aria-label={`Import status: ${label}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Highlighted text renderer — bolds the match range without dangerouslySetInnerHTML
// ---------------------------------------------------------------------------

function HighlightedText({
  text,
  start,
  end,
}: {
  text: string;
  start: number;
  end: number;
}) {
  return (
    <>
      {text.slice(0, start)}
      <strong>{text.slice(start, end)}</strong>
      {text.slice(end)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface BaseKeyboardPickerProps {
  value: BaseKeyboard | null;
  onChange: (kb: BaseKeyboard | null) => void;
  target?: SuggestTarget;
}

// Render/screen-reader-noise cap — not a hard data limit; the full ranked list is
// retained in state and filtering continues as the user types.
const MAX_VISIBLE = 100;

export function BaseKeyboardPicker({ value, onChange, target }: BaseKeyboardPickerProps) {
  const [keyboards, setKeyboards] = useState<BaseKeyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [corpus, setCorpus] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Stable unique id prefix — avoids broken aria-* if the component ever mounts twice.
  const uid = useId();

  // Refs for scrollIntoView on active option
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  // Ref for click-outside detection
  const rootRef = useRef<HTMLDivElement>(null);

  // Defer the query so ranking stays responsive while typing.
  const deferredQuery = useDeferredValue(query);

  // Stable memo keys from target to avoid ranking on referentially-new objects each render.
  const targetScript = target?.script;
  const targetBcp47 = target?.bcp47;

  const stableTarget = useMemo<SuggestTarget | undefined>(
    () => {
      if (targetScript === undefined) return undefined;
      if (targetBcp47 !== undefined) return { script: targetScript, bcp47: targetBcp47 };
      return { script: targetScript };
    },
    [targetScript, targetBcp47],
  );

  const languagesById = useMemo(
    () => Object.fromEntries(keyboards.map((k) => [k.id, k.languages ?? []] as const)),
    [keyboards],
  );

  const ranked = useMemo(
    () => rankBases(keyboards, deferredQuery, stableTarget, languagesById),
    [keyboards, deferredQuery, stableTarget, languagesById],
  );

  const visibleRanked = ranked.slice(0, MAX_VISIBLE);

  // Clamp activeIndex so aria-* attributes never reference a non-existent option
  // when the deferred list resolves to fewer items than the current activeIndex.
  // Raw activeIndex stays in state and arrow-key math so clamping is only a derived read.
  const safeActiveIndex =
    visibleRanked.length === 0 ? -1 : Math.min(activeIndex, visibleRanked.length - 1);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBaseBrowserService()
      .listAll()
      .then(
        (list) => {
          if (cancelled) return;
          setKeyboards(list);
          setLoading(false);
        },
        (err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          console.error("[BaseKeyboardPicker] listAll() failed:", err);
          setError(message);
          setLoading(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the import corpus lazily after the keyboard list arrives.
  useEffect(() => {
    if (keyboards.length === 0) return;
    let cancelled = false;
    void loadCorpus().then((map) => {
      if (cancelled) return;
      setCorpus(map);
    });
    return () => {
      cancelled = true;
    };
  }, [keyboards.length]);

  // ---------------------------------------------------------------------------
  // Scroll active option into view
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (open && safeActiveIndex >= 0) {
      optionRefs.current[safeActiveIndex]?.scrollIntoView?.({ block: "nearest" });
    }
  }, [safeActiveIndex, open]);

  // ---------------------------------------------------------------------------
  // Click-outside — close list when pointer goes outside the combobox root
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function commit(kb: BaseKeyboard) {
    onChange(kb);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  }

  // Single source of truth for what the input displays.
  // When the list is open we show the live query; when closed we show the
  // selected value's name (or the last query if nothing is selected).
  const inputText = open ? query : (value !== null ? value.displayName : query);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Never hijack IME candidate confirmation.
    if (e.nativeEvent.isComposing) return;

    const len = visibleRanked.length;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (!open) {
          // Find index of current value in ranked list, or default to 0.
          const currentIdx = value !== null
            ? visibleRanked.findIndex((r) => r.base.id === value.id)
            : -1;
          setOpen(true);
          setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
        } else {
          setActiveIndex((i) => Math.min(i + 1, len - 1));
        }
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(len - 1);
        } else {
          setActiveIndex((i) => Math.max(i - 1, 0));
        }
        break;
      }
      case "Home": {
        if (open) { e.preventDefault(); setActiveIndex(0); }
        break;
      }
      case "End": {
        if (open) { e.preventDefault(); setActiveIndex(len - 1); }
        break;
      }
      case "Enter": {
        if (open && activeIndex >= 0) {
          const item = visibleRanked[activeIndex];
          if (item !== undefined) {
            e.preventDefault();
            commit(item.base);
          }
        }
        break;
      }
      case "Escape": {
        e.preventDefault();
        if (open) {
          // First Esc: close the list.
          setOpen(false);
          setActiveIndex(-1);
        } else {
          // Second Esc (list already closed): clear query AND selection.
          setQuery("");
          onChange(null);
        }
        break;
      }
      case "Tab": {
        setOpen(false);
        setActiveIndex(-1);
        // Do not prevent default — let focus move naturally.
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const inputId = `${uid}-input`;
  const listboxId = `${uid}-listbox`;

  const activeId =
    open && safeActiveIndex >= 0
      ? `${uid}-opt-${visibleRanked[safeActiveIndex]?.base.id ?? ""}`
      : undefined;

  const selectedStatus = value !== null ? corpus.get(value.id) : undefined;

  return (
    <div
      ref={rootRef}
      style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}
    >
      {/* Accessible label */}
      <label
        htmlFor={inputId}
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--app-text-subtle)",
          fontWeight: 600,
          fontFamily: "var(--app-font)",
        }}
      >
        Base keyboard
      </label>

      {/* Loading state */}
      {loading && (
        <div
          role="status"
          style={{
            fontSize: 13,
            color: "var(--app-text-muted)",
            padding: "6px 10px",
            background: "var(--app-bg)",
            border: "1px solid var(--app-border)",
            borderRadius: 6,
          }}
        >
          Loading base keyboards...
        </div>
      )}

      {/* Error state */}
      {error !== null && (
        <>
          <input
            id={inputId}
            disabled
            placeholder="failed to load keyboards"
            style={{
              background: "var(--app-bg)",
              color: "var(--app-text-muted)",
              border: "1px solid var(--danger)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "var(--app-font)",
              outline: "none",
              cursor: "not-allowed",
            }}
          />
          <div
            role="alert"
            style={{ fontSize: 12, color: "var(--danger)", lineHeight: 1.4 }}
          >
            {error}
          </div>
        </>
      )}

      {/* Empty catalog */}
      {!loading && error === null && keyboards.length === 0 && (
        <div
          role="status"
          style={{ fontSize: 12, color: "var(--app-text-muted)", paddingTop: 4 }}
        >
          No base keyboards found. Check your connection and try again.
        </div>
      )}

      {/* Main combobox — only rendered when keyboards are available */}
      {!loading && error === null && keyboards.length > 0 && (
        <>
          {/* Combobox input */}
          <input
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={undefined /* label provided via htmlFor */}
            type="text"
            autoComplete="off"
            placeholder="Type to search by name, id, script, or language…"
            value={inputText}
            onFocus={() => {
              if (!open) setOpen(true);
            }}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setQuery(v);
              setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{
              background: "var(--app-bg)",
              color: "var(--app-text)",
              border: `1px solid var(--app-border)`,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "var(--app-font)",
              outline: "none",
              cursor: "text",
            }}
          />

          {/* Listbox popup */}
          {open && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Base keyboard options"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 50,
                margin: "2px 0 0",
                padding: 0,
                listStyle: "none",
                background: "var(--app-surface)",
                border: "1px solid var(--app-border-strong)",
                borderRadius: 8,
                boxShadow: "0 8px 24px color-mix(in srgb, var(--app-bg) 22%, transparent)",
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {ranked.length === 0 && (
                <li
                  role="status"
                  style={{
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "var(--app-text-muted)",
                    fontFamily: "var(--app-font)",
                  }}
                >
                  No keyboards match &ldquo;{query}&rdquo;.
                </li>
              )}

              {(optionRefs.current = [], visibleRanked).map((rb: RankedBase, i: number) => {
                const kb = rb.base;
                const isActive = i === safeActiveIndex;
                const importStatus = corpus.get(kb.id);

                // Build highlighted displayName children.
                const dnRange = rb.matchRanges?.find((r) => r.field === "displayName");
                const idRange = rb.matchRanges?.find((r) => r.field === "id");

                return (
                  <li
                    key={kb.id}
                    id={`${uid}-opt-${kb.id}`}
                    role="option"
                    aria-selected={i === safeActiveIndex}
                    ref={(el) => { optionRefs.current[i] = el; }}
                    // onMouseDown prevents blur-close before click fires.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(kb)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "7px 12px",
                      cursor: "pointer",
                      background: isActive ? "var(--app-accent-subtle)" : "transparent",
                      color: "var(--app-text)",
                      fontFamily: "var(--app-font)",
                      fontSize: 13,
                      borderBottom: "1px solid var(--app-border)",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontWeight: isActive ? 600 : 400,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "block",
                        }}
                      >
                        {dnRange !== undefined ? (
                          <HighlightedText
                            text={kb.displayName}
                            start={dnRange.start}
                            end={dnRange.end}
                          />
                        ) : (
                          kb.displayName
                        )}
                        {importStatus !== undefined && <ImportBadge status={importStatus} />}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--app-text-muted)",
                          fontFamily: "var(--app-font-mono)",
                        }}
                      >
                        {idRange !== undefined ? (
                          <HighlightedText
                            text={kb.id}
                            start={idRange.start}
                            end={idRange.end}
                          />
                        ) : (
                          kb.id
                        )}
                        {" · "}
                        {kb.script}
                      </span>
                    </span>
                  </li>
                );
              })}

              {/* Truncation footer — non-option, not selectable */}
              {ranked.length > MAX_VISIBLE && (
                <li
                  aria-hidden="true"
                  style={{
                    padding: "6px 12px",
                    fontSize: 11,
                    color: "var(--app-text-subtle)",
                    fontFamily: "var(--app-font)",
                    textAlign: "center",
                    borderTop: "1px solid var(--app-border)",
                  }}
                >
                  showing {MAX_VISIBLE} of {ranked.length} — keep typing to narrow
                </li>
              )}
            </ul>
          )}

          {/* Visually-hidden live region for result count announcements */}
          <span
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap",
            }}
          >
            {open
              ? ranked.length === 0
                ? `No keyboards match "${query}".`
                : `${ranked.length} keyboard${ranked.length === 1 ? "" : "s"} found.`
              : ""}
          </span>

          {/* Import-status badge for the committed value (AC#2) */}
          {selectedStatus !== undefined && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--app-text-muted)",
                fontFamily: "var(--app-font)",
              }}
            >
              <span>Import readiness:</span>
              <ImportBadge status={selectedStatus} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
