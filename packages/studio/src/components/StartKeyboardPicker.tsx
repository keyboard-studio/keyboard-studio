// Metadata-only combobox picker — WAI-ARIA 1.2 editable combobox + listbox popup
// over StartBrowserService.listAll(). Results ranked by rankStarts() —
// exact script/BCP-47 match first, then name/id substring (AC#1).
// CJK/Ethiopic guard lives in OSKFrame, not here.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useEffect, useState, useDeferredValue, useMemo, useRef, useId } from "react";
import type { CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";
import { getStartBrowserService } from "../lib/services.ts";
import { rankStarts, type RankedBase } from "../lib/rankStarts.ts";
import type { SuggestTarget } from "../lib/suggestStart.ts";

// ---------------------------------------------------------------------------
// Import corpus — lazy-loaded so it never bloats the initial bundle.
// Shape: { keyboards: Array<{ keyboardId: string; status: string; ... }> }
// ---------------------------------------------------------------------------

interface CorpusEntry {
  keyboardId: string;
  status: string;
}

let _corpusCache: Map<string, string> | null | "failed" = null;

/**
 * Resets the module-level corpus cache.
 * Exported for test isolation only — do not call in production code.
 * Allows test suites to force a fresh import("@docs/import-corpus.json") so
 * vi.mock("@docs/import-corpus.json") drives badge rendering deterministically.
 */
export function _resetCorpusCacheForTesting(): void {
  _corpusCache = null;
}

/**
 * Seeds the module-level corpus cache directly with a keyboardId→status map.
 * Exported for test isolation only — do not call in production code.
 *
 * Why this exists (#829): loadCorpus() reads the corpus via a dynamic
 * import("@docs/import-corpus.json"). Tests mock that specifier, but vitest
 * runs several test files per worker and the dynamic-import mock registration
 * is intermittently dropped when this file is co-scheduled with another file
 * that also calls vi.mock(...). When that happens the dynamic import falls
 * through to the real ~346 KB corpus and badge assertions flake. Seeding the
 * cache here lets a test make the corpus fully deterministic without depending
 * on the (worker-fragile) dynamic-import mock at all — loadCorpus() returns the
 * seeded map immediately and never performs the import.
 */
export function _setCorpusCacheForTesting(map: Map<string, string>): void {
  _corpusCache = map;
}

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
    devLog.warn("[BaseKeyboardPicker] import-corpus.json not available - import-status badges suppressed");
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Badge styling per ImportStatus — colored via design-system tokens
// clean  → var(--sil-green)
// opaque → var(--app-accent)
// diverged → var(--app-warning-text)
// parse-err → var(--app-danger)
// ---------------------------------------------------------------------------

// Technical codec terms — kept for expert users and bug reports (badge
// tooltip, screen-reader label, and the legend below). They are never the
// visible badge text on their own: authors see the plain-language copy from
// useReadinessLabel() instead.
const STATUS_TECHNICAL_TERM: Record<string, string> = {
  [ImportStatus.Clean]: "clean",
  [ImportStatus.CleanWithOpaque]: "opaque",
  [ImportStatus.ParseFailure]: "parse-err",
  [ImportStatus.RoundTripDivergence]: "diverged",
};

const STATUS_COLOR: Record<string, string> = {
  [ImportStatus.Clean]: "var(--sil-green)",
  [ImportStatus.CleanWithOpaque]: "var(--app-accent)",
  [ImportStatus.ParseFailure]: "var(--app-danger)",
  [ImportStatus.RoundTripDivergence]: "var(--app-warning-text)",
};

// Every status the legend explains, in plain-language-first order.
const READINESS_STATUSES: readonly string[] = [
  ImportStatus.Clean,
  ImportStatus.CleanWithOpaque,
  ImportStatus.RoundTripDivergence,
  ImportStatus.ParseFailure,
];

/**
 * Plain-language label for an import status — what the status means for the
 * author and, where it matters, what to do about it. The technical codec
 * term stays available alongside it (see ImportBadge / the legend), never
 * instead of it.
 */
function useReadinessLabel(): (status: string) => string {
  const { t } = useLingui();
  return (status: string): string => {
    switch (status) {
      case ImportStatus.Clean:
        return t({ id: "base.readiness.clean", message: "Fully editable here" });
      case ImportStatus.CleanWithOpaque:
        return t({
          id: "base.readiness.opaque",
          message: "Editable — some advanced rules will be kept as-is",
        });
      case ImportStatus.RoundTripDivergence:
        return t({
          id: "base.readiness.diverged",
          message: "Editable — small formatting differences after import",
        });
      case ImportStatus.ParseFailure:
        return t({
          id: "base.readiness.parseErr",
          message: "Can't be used as a starting point in the studio yet — pick another keyboard",
        });
      default:
        return status;
    }
  };
}

function ImportBadge({ status }: { status: string }) {
  const { t } = useLingui();
  const plainLabel = useReadinessLabel()(status);
  const technical = STATUS_TECHNICAL_TERM[status] ?? status;
  const color = STATUS_COLOR[status] ?? "var(--app-text-muted)";
  // Screen-reader name and hover tooltip both carry the plain label AND the
  // technical term, so a bug report can quote either.
  const label = `${plainLabel} (${technical})`;
  const technicalLabel = technical;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: "2px 6px",
        lineHeight: 1.3,
        verticalAlign: "middle",
        whiteSpace: "normal",
      }}
      title={t({ id: "base.readiness.technicalLabel", message: `Technical status: ${technicalLabel}` })}
      aria-label={t({ id: "base.importBadge.ariaLabel", message: `Import status: ${label}` })}
    >
      {plainLabel}
    </span>
  );
}

// Keyboard-accessible legend for the readiness badges. A native
// <details>/<summary> disclosure: the summary is focusable and toggles with
// Enter/Space with no extra scripting, and every color comes from the theme
// tokens so it reads correctly in both themes.
function ImportReadinessLegend() {
  const plainLabelFor = useReadinessLabel();
  return (
    <details
      data-testid="import-readiness-legend"
      style={{
        fontSize: 12,
        color: "var(--app-text-muted)",
        fontFamily: "var(--app-font)",
        lineHeight: 1.5,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 600,
          color: "var(--app-accent)",
          fontFamily: "var(--app-font)",
        }}
      >
        <Trans id="base.readiness.legendSummary">What does import readiness mean?</Trans>
      </summary>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {READINESS_STATUSES.map((status) => {
          const color = STATUS_COLOR[status] ?? "var(--app-text-muted)";
          const technical = STATUS_TECHNICAL_TERM[status] ?? status;
          return (
            <li key={status}>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              <span style={{ color: "var(--app-text)", fontWeight: 600 }}>{plainLabelFor(status)}</span>{" "}
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 11 }}>({technical})</span>
            </li>
          );
        })}
      </ul>
    </details>
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

export interface StartKeyboardPickerProps {
  value: StartKeyboard | null;
  onChange: (kb: StartKeyboard | null) => void;
  target?: SuggestTarget;
  /** Visible label above the input. Defaults to "Starting keyboard". */
  label?: string;
  /**
   * When provided, search is restricted to keyboards whose id is in this set
   * (e.g. the suggested bases for the author's target). Omit (or pass
   * undefined) to search the full catalog.
   */
  scopeIds?: ReadonlySet<string> | undefined;
  /**
   * Escape hatch out of a scoped search. When set together with `scopeIds`,
   * the zero-match state offers a "Search all keyboards" action (also
   * triggered by Enter on an empty result list) that calls this instead of
   * dead-ending the author.
   */
  onSearchAll?: () => void;
}

// Render/screen-reader-noise cap — not a hard data limit; the full ranked list is
// retained in state and filtering continues as the user types.
const MAX_VISIBLE = 100;

// Shared visual shell for the combobox popup — used by both the option
// listbox and the zero-match status panel so they occupy the same space.
const POPUP_STYLE: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 50,
  margin: "2px 0 0",
  background: "var(--app-surface)",
  border: "1px solid var(--app-border-strong)",
  borderRadius: 8,
  boxShadow: "0 8px 24px color-mix(in srgb, var(--app-bg) 22%, transparent)",
};

export function StartKeyboardPicker({
  value,
  onChange,
  target,
  label,
  scopeIds,
  onSearchAll,
}: StartKeyboardPickerProps) {
  const { t } = useLingui();
  const readinessLabel = useReadinessLabel();
  const resolvedLabel = label ?? t({ id: "starting.picker.defaultLabel", message: "Starting keyboard" });
  const [keyboards, setKeyboards] = useState<StartKeyboard[]>([]);
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

  // Optional scope restriction (e.g. "suggested bases only") applied before
  // ranking; the full catalog stays loaded so widening the scope is instant.
  const scopedKeyboards = useMemo(
    () => (scopeIds === undefined ? keyboards : keyboards.filter((k) => scopeIds.has(k.id))),
    [keyboards, scopeIds],
  );

  const languagesById = useMemo(
    () => Object.fromEntries(scopedKeyboards.map((k) => [k.id, k.languages ?? []] as const)),
    [scopedKeyboards],
  );

  const ranked = useMemo(
    () => rankStarts(scopedKeyboards, deferredQuery, stableTarget, languagesById),
    [scopedKeyboards, deferredQuery, stableTarget, languagesById],
  );

  const visibleRanked = ranked.slice(0, MAX_VISIBLE);

  // Reset the option-ref array each render so stale refs from a previous,
  // longer list can't linger past a re-render with fewer options.
  optionRefs.current = [];

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
    getStartBrowserService()
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
          devLog.error("[BaseKeyboardPicker] listAll() failed:", err);
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

  function commit(kb: StartKeyboard) {
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
        if (!open) break;
        const item = activeIndex >= 0 ? visibleRanked[activeIndex] : undefined;
        if (item !== undefined) {
          e.preventDefault();
          commit(item.base);
        } else if (len === 0 && scopeIds !== undefined && onSearchAll !== undefined) {
          // Scoped search came up empty — Enter widens to the full catalog
          // (same action as the "Search all keyboards" button in the popup).
          e.preventDefault();
          onSearchAll();
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
        {resolvedLabel}
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
          <Trans id="starting.picker.loading">Loading starting keyboards...</Trans>
        </div>
      )}

      {/* Error state */}
      {error !== null && (
        <>
          <input
            id={inputId}
            disabled
            placeholder={t({
              id: "base.picker.error.placeholder",
              message: "failed to load keyboards",
            })}
            style={{
              background: "var(--app-bg)",
              color: "var(--app-text-muted)",
              border: "1px solid var(--app-danger)",
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
            style={{ fontSize: 12, color: "var(--app-danger)", lineHeight: 1.4 }}
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
          <Trans id="starting.picker.emptyCatalog">
            No starting keyboards found. Check your connection and try again.
          </Trans>
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
            placeholder={t({
              id: "base.picker.search.placeholder",
              message: "Type to search by name, id, script, or language…",
            })}
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

          {/* Zero-match popup — a plain status panel, NOT a listbox: an
              interactive button may not live inside role="listbox" (whose
              children must be options), so the empty state renders as its own
              popup element. It takes over the listboxId so the combobox's
              aria-controls always points at the visible popup. */}
          {open && ranked.length === 0 && (
            <div
              id={listboxId}
              role="status"
              style={{
                ...POPUP_STYLE,
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--app-text-muted)",
                fontFamily: "var(--app-font)",
              }}
            >
              <Trans id="base.picker.noMatch">No keyboards match &ldquo;{query}&rdquo;.</Trans>
              {scopeIds !== undefined && onSearchAll !== undefined && (
                <button
                  type="button"
                  // onMouseDown prevents blur-close before click fires.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onSearchAll}
                  style={{
                    display: "block",
                    marginTop: 6,
                    padding: "4px 10px",
                    background: "transparent",
                    border: "1px solid var(--app-border-strong)",
                    borderRadius: 6,
                    color: "var(--app-accent)",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "var(--app-font)",
                  }}
                >
                  <Trans id="base.picker.searchAll">
                    Search all keyboards instead (or press Enter)
                  </Trans>
                </button>
              )}
            </div>
          )}

          {/* Listbox popup — options only (role="option" children) */}
          {open && ranked.length > 0 && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={t({ id: "starting.picker.listboxLabel", message: "Starting keyboard options" })}
              style={{
                ...POPUP_STYLE,
                padding: 0,
                listStyle: "none",
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {visibleRanked.map((rb: RankedBase, i: number) => {
                const kb = rb.base;
                const isActive = i === safeActiveIndex;
                const importStatus = corpus.get(kb.id);
                // A base the codec cannot parse is visually de-emphasized so
                // the default path steers toward usable choices — but it
                // stays listed and selectable (author agency; support may
                // need to see it). Selecting one surfaces a clear warning
                // below the picker rather than a silent hard failure.
                const isParseFailure = importStatus === ImportStatus.ParseFailure;

                // Build highlighted displayName children.
                const dnRange = rb.matchRanges?.find((r) => r.field === "displayName");
                const idRange = rb.matchRanges?.find((r) => r.field === "id");

                return (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- APG combobox pattern: keyboard selection happens on the input (handleKeyDown: ArrowUp/Down + Enter -> commit), never on individual options; the option's onClick is the redundant pointer affordance
                  <li
                    key={kb.id}
                    id={`${uid}-opt-${kb.id}`}
                    role="option"
                    aria-selected={i === safeActiveIndex}
                    data-import-status={importStatus}
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
                      opacity: isParseFailure ? 0.6 : undefined,
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
                      {/* Readiness badge on its own line: the plain-language
                          labels are full phrases and must never be clipped
                          by the name row's ellipsis. */}
                      {importStatus !== undefined && (
                        <span style={{ display: "block", marginTop: 4 }}>
                          <ImportBadge status={importStatus} />
                        </span>
                      )}
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
                  <Trans id="base.picker.truncationFooter">
                    showing {MAX_VISIBLE} of {ranked.length} — keep typing to narrow
                  </Trans>
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
                ? t({
                    id: "base.picker.liveRegion.noMatch",
                    message: `No keyboards match "${query}".`,
                  })
                : t({
                    id: "base.picker.liveRegion.resultCount",
                    message: plural(ranked.length, {
                      one: "# keyboard found.",
                      other: "# keyboards found.",
                    }),
                  })
              : ""}
          </span>

          {/* Import-status badge for the committed value (AC#2) */}
          {selectedStatus !== undefined && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 4,
                fontSize: 12,
                color: "var(--app-text-muted)",
                fontFamily: "var(--app-font)",
              }}
            >
              <span><Trans id="base.picker.importReadiness">Import readiness:</Trans></span>
              <ImportBadge status={selectedStatus} />
            </div>
          )}

          {/* Selecting a base the codec cannot parse stays possible, but
              never silent: a clear warning names the consequence and the
              remedy in plain language. */}
          {selectedStatus === ImportStatus.ParseFailure && value !== null && (
            <div
              role="alert"
              data-testid="import-readiness-parse-err-warning"
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--app-danger-text)",
                background: "var(--app-danger-bg)",
                border: "1px solid var(--app-danger)",
                borderRadius: 6,
                padding: "8px 10px",
                fontFamily: "var(--app-font)",
              }}
            >
              <strong>{readinessLabel(selectedStatus)}</strong>{" "}
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 11 }}>
                ({STATUS_TECHNICAL_TERM[selectedStatus]})
              </span>
            </div>
          )}

          {/* Legend explaining every readiness label, shown whenever badges
              can appear (i.e. the corpus loaded). */}
          {corpus.size > 0 && <ImportReadinessLegend />}
        </>
      )}
    </div>
  );
}
