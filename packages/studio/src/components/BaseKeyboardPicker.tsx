// Metadata-only picker — dropdown over BaseBrowserService.listAll().
// Text filter narrows by displayName, id, script, and BCP47 language tags
// (client-side, over the already-loaded listAll() result).
// CJK/Ethiopic guard lives in OSKFrame, not here.

import { useEffect, useState, useDeferredValue } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";
import { getBaseBrowserService } from "../lib/services.ts";

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
// Badge styling per ImportStatus
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  [ImportStatus.Clean]: "clean",
  [ImportStatus.CleanWithOpaque]: "opaque",
  [ImportStatus.ParseFailure]: "parse-err",
  [ImportStatus.RoundTripDivergence]: "diverged",
};

const STATUS_COLOR: Record<string, string> = {
  [ImportStatus.Clean]: "#2ea043",
  [ImportStatus.CleanWithOpaque]: "#6ea8fe",
  [ImportStatus.ParseFailure]: "#f85149",
  [ImportStatus.RoundTripDivergence]: "#d29922",
};

function ImportBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const color = STATUS_COLOR[status] ?? "#8b949e";
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
// Filter predicate — case-insensitive substring across id, displayName,
// script, and BCP-47 language tags.
// ---------------------------------------------------------------------------

// Filters the already-loaded listAll() result in memory. BaseBrowserService.search()
// is intentionally not used here: it is for server-side filtering, and per-keystroke
// async calls would be wasteful and potentially rate-limited.
function matchesFilter(kb: BaseKeyboard, query: string): boolean {
  if (query === "") return true;
  const q = query.toLowerCase();
  if (kb.id.toLowerCase().includes(q)) return true;
  if (kb.displayName.toLowerCase().includes(q)) return true;
  if (kb.script.toLowerCase().includes(q)) return true;
  if (kb.languages?.some((l) => l.toLowerCase().includes(q))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface BaseKeyboardPickerProps {
  value: BaseKeyboard | null;
  onChange: (kb: BaseKeyboard | null) => void;
}

export function BaseKeyboardPicker({ value, onChange }: BaseKeyboardPickerProps) {
  const [keyboards, setKeyboards] = useState<BaseKeyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [corpus, setCorpus] = useState<Map<string, string>>(new Map());

  // Defer the filter value so the dropdown stays responsive while typing.
  const deferredFilter = useDeferredValue(filterText);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // getBaseBrowserService() is now async (lazy engine import).
    getBaseBrowserService()
      .then((svc) => svc.listAll())
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

  const filtered = keyboards.filter((k) => matchesFilter(k, deferredFilter));
  const selectedId = value?.id ?? "";

  // P0: when the author has a keyboard selected and then types a filter that
  // excludes it, notify the parent immediately so it does not resolve a keyboard
  // that is no longer visible. Keyed on the deferred filter + filtered list
  // length so the effect only fires when the visible set actually changes, not
  // on every render. onChange is excluded from deps because it is a stable
  // setter from the parent; including it would create a render loop if the
  // parent does not memoize it.
  useEffect(() => {
    if (value !== null && !filtered.some((k) => k.id === value.id)) {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredFilter, filtered.length]);

  // Ensure the currently-selected value is still in the filtered list; if not,
  // clear it so the <select> doesn't show a stale option.
  const selectedInFiltered =
    value === null || filtered.some((k) => k.id === selectedId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor="kbd-picker"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9aa7b8",
          fontWeight: 600,
        }}
      >
        Base keyboard
      </label>

      {/* Text filter — only shown once keyboards have loaded */}
      {!loading && error === null && (
        <input
          type="search"
          aria-label="Filter base keyboards"
          placeholder="Filter by name, id, script, or language…"
          value={filterText}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          style={{
            background: "#0d1117",
            color: "#e6edf3",
            border: "1px solid #283040",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      )}

      <select
        id="kbd-picker"
        value={selectedInFiltered ? selectedId : ""}
        disabled={loading || error !== null}
        onChange={(e) => {
          const id = e.currentTarget.value;
          const kb = filtered.find((k) => k.id === id) ?? null;
          onChange(kb);
        }}
        style={{
          background: "#161b22",
          color: "#e6edf3",
          border: `1px solid ${error ? "#7a2a2a" : "#283040"}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 14,
          fontFamily: "inherit",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        <option value="" disabled>
          {loading
            ? "loading..."
            : error
              ? "failed to load keyboards"
              : filtered.length === 0 && keyboards.length > 0
                ? "no keyboards match filter"
                : keyboards.length === 0
                  ? "no keyboards available"
                  : "-- choose a base keyboard --"}
        </option>
        {filtered.map((k) => {
          const importStatus = corpus.get(k.id);
          const label = importStatus != null
            ? `${k.displayName} (${k.id} · ${k.script}) [${STATUS_LABEL[importStatus] ?? importStatus}]`
            : `${k.displayName} (${k.id} · ${k.script})`;
          return (
            <option key={k.id} value={k.id}>
              {label}
            </option>
          );
        })}
      </select>

      {/* Import-status badge for the currently-selected keyboard */}
      {(() => {
        const selectedStatus = value !== null ? corpus.get(value.id) : undefined;
        return selectedStatus !== undefined ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#8b949e" }}>
            <span>Import readiness:</span>
            <ImportBadge status={selectedStatus} />
          </div>
        ) : null;
      })()}

      {/* Empty-catalog hint */}
      {!loading && error === null && keyboards.length === 0 && (
        <div
          role="status"
          style={{ fontSize: 12, color: "#8b949e", paddingTop: 4 }}
        >
          No base keyboards found. Check your connection and try again.
        </div>
      )}

      {/* Zero-match hint when filter is active */}
      {!loading && error === null && keyboards.length > 0 && filtered.length === 0 && filterText !== "" && (
        <div
          role="status"
          style={{ fontSize: 12, color: "#8b949e", paddingTop: 4 }}
        >
          No keyboards match &ldquo;{filterText}&rdquo;.
        </div>
      )}

      {error !== null && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "#f0a0a0",
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
