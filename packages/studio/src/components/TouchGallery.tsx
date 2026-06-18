// TouchGallery — Phase E "touch patterns" flow.
//
// Presents a card list of touch-category patterns (content/patterns/touch/).
// The user enables patterns they want in their touch layout; on Continue the
// collected TouchAssignments are returned to the caller (StudioShell) which
// stores them via recordTouchAssignments() and advances to Phase F.
//
// Touch lint (Layer C checks 18.1–18.5) runs on the base VFS using the single
// 300 ms debounce cycle defined in useDebounce.ts — no second timer is added.
//
// Pattern loading: reuses the BrowserPatternLibraryService (getPatternLibraryService)
// which loads all YAML patterns via import.meta.glob. This is the same service
// MechanismGallery uses; it caches results so the second call is free.

import { useState, useEffect, useMemo, type CSSProperties } from "react";
import type { Pattern, TouchAssignment } from "@keyboard-studio/contracts";
import { scaffoldTouchLayout } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { getPatternLibraryService } from "../lib/services.ts";
import { LintSummary } from "../lint/LintSummary.tsx";
import { useTouchLint } from "../hooks/useTouchLint.ts";

// ---------------------------------------------------------------------------
// Style constants — dark palette matching MechanismGallery / PhaseB
// ---------------------------------------------------------------------------

const BG_PAGE = "#0d1117";
const BG_CARD = "#161b22";
const BORDER = "#30363d";
const ACCENT = "#6ea8fe";
const TEXT_DIM = "#8b949e";
const TEXT_MAIN = "#e6edf3";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const BLUE_ACTION = "#1f6feb";

// ---------------------------------------------------------------------------
// TouchGallery component
// ---------------------------------------------------------------------------

export interface TouchGalleryProps {
  onComplete: (assignments: TouchAssignment[]) => void;
}

export function TouchGallery({ onComplete }: TouchGalleryProps) {
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const ir = useWorkingCopyStore((s) => s.ir);

  // Derive keyboardId from identity (Track 1) or baseKeyboard (Track 2).
  const keyboardId = identity?.keyboardId ?? baseKeyboard?.id ?? null;

  // Seed the touch layout from the locked desktop snapshot (spec §8 Phase E / issue #371).
  const seededLayout = useMemo(
    () => (ir ? scaffoldTouchLayout(ir) : null),
    [ir],
  );

  // Derived counts for the "Seeded from desktop" info line.
  const seededLayerCount = seededLayout?.platforms[0]?.layers.length ?? 0;
  const seededKeyCount = useMemo(() => {
    const platform = seededLayout?.platforms[0];
    if (!platform) return 0;
    let count = 0;
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        count += row.keys.length;
      }
    }
    return count;
  }, [seededLayout]);

  // Whether any key in the seeded phone platform has sk[] (longpress menu) entries.
  const seededHasDeadkeys = useMemo(() => {
    if (!seededLayout) return false;
    for (const platform of seededLayout.platforms) {
      for (const layer of platform.layers) {
        for (const row of layer.rows) {
          for (const key of row.keys) {
            if (key.sk && key.sk.length > 0) return true;
          }
        }
      }
    }
    return false;
  }, [seededLayout]);

  // Load touch-category patterns from the browser pattern library.
  const [touchPatterns, setTouchPatterns] = useState<Pattern[]>([]);
  const [patternLoadError, setPatternLoadError] = useState<string | null>(null);

  useEffect(() => {
    const svc = getPatternLibraryService();
    svc
      .listAll()
      .then((all) => {
        const touch = all.filter((p) => p.category === "touch");
        // Sort by priority field (lower number = higher priority) if present;
        // patterns without priority sort after those with it, then by id.
        touch.sort((a, b) => {
          const pa = a.priority;
          const pb = b.priority;
          if (pa !== undefined && pb !== undefined) return pa - pb;
          if (pa !== undefined) return -1;
          if (pb !== undefined) return 1;
          return a.id.localeCompare(b.id);
        });
        setTouchPatterns(touch);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[TouchGallery] listAll failed:", err);
        setPatternLoadError(msg);
      });
  }, []);

  // Track which pattern IDs the user has enabled.
  const [enabledPatternIds, setEnabledPatternIds] = useState<Set<string>>(
    new Set(),
  );

  function togglePattern(patternId: string) {
    setEnabledPatternIds((prev) => {
      const next = new Set(prev);
      if (next.has(patternId)) {
        next.delete(patternId);
      } else {
        next.add(patternId);
      }
      return next;
    });
  }

  // Touch lint — runs on the base VFS via the single debounce cycle.
  const { touchFindings, touchLintRunning } = useTouchLint(baseVfs, keyboardId);

  // Build TouchAssignment[] from enabled patterns and call onComplete.
  function handleContinue() {
    const assignments: TouchAssignment[] = [...enabledPatternIds].map(
      (patternId) => ({
        scope: "keyboard-default" as const,
        // Per spec §7.7 (assignmentMap.ts): keyboard-default scope uses target: ""
        // (applies to the whole inventory). The sentinel "" is defined in MechanismAssignment.
        target: "",
        modality: "touch" as const,
        mechanisms: [{ patternId }],
        source: "user" as const,
      }),
    );
    onComplete(assignments);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const pageStyle: CSSProperties = {
    background: BG_PAGE,
    height: "100%",
    boxSizing: "border-box",
    fontFamily: FONT,
    color: TEXT_MAIN,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  };

  const ghostBtn: CSSProperties = {
    padding: "8px 18px",
    background: "transparent",
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT_DIM,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div
        style={{
          padding: "20px 28px 16px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.1rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
          }}
        >
          Touch layout patterns
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: TEXT_DIM,
            fontFamily: FONT,
          }}
        >
          Choose touch input patterns for your keyboard. Your desktop layout
          has been locked — these selections apply to phone and tablet.
        </p>
        {seededLayout !== null && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: TEXT_DIM,
              fontFamily: FONT,
            }}
          >
            {`Seeded from desktop: ${seededKeyCount} keys, ${seededLayerCount} layers`}
          </p>
        )}
      </div>

      {/* Scrollable content area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxSizing: "border-box",
        }}
      >
        {/* Pattern load error */}
        {patternLoadError !== null && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: "10px 14px",
              background: "#2a0a0a",
              border: "1px solid #f85149",
              borderRadius: 6,
              color: "#f85149",
              fontSize: 12,
              fontFamily: FONT,
            }}
          >
            Failed to load touch patterns: {patternLoadError}
          </div>
        )}

        {/* Pattern cards */}
        {touchPatterns.length === 0 && patternLoadError === null && (
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
            Loading touch patterns...
          </p>
        )}

        {touchPatterns.length > 0 && (
          <div
            role="list"
            aria-label="Touch input patterns"
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {touchPatterns.map((pattern) => {
              const enabled = enabledPatternIds.has(pattern.id);
              return (
                <div
                  key={pattern.id}
                  role="listitem"
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${enabled ? ACCENT : BORDER}`,
                    background: enabled ? "#0d2840" : BG_CARD,
                    overflow: "hidden",
                    transition: "border-color 120ms ease, background 120ms ease",
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={enabled}
                    onClick={() => togglePattern(pattern.id)}
                    style={{
                      width: "100%",
                      padding: "14px 18px",
                      background: "transparent",
                      border: "none",
                      color: TEXT_MAIN,
                      fontSize: 13,
                      fontFamily: FONT,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: enabled ? ACCENT : TEXT_MAIN,
                        fontSize: 14,
                      }}
                    >
                      {pattern.title}
                    </span>
                    <span style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
                      {pattern.description}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Long-press pre-population note (spec §8 Phase E) */}
        {seededLayout !== null &&
          [...enabledPatternIds].some(
            (id) => id.includes("longpress") || id.includes("hint"),
          ) &&
          seededHasDeadkeys && (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
                fontStyle: "italic",
              }}
            >
              Desktop deadkeys detected — long-press menus will be pre-populated.
            </p>
          )}

        {/* Lint summary — Layer C touch checks (18.1–18.5) */}
        <div>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              color: TEXT_DIM,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: FONT,
            }}
          >
            Touch layout checks
            {touchLintRunning ? " (running...)" : ""}
          </p>
          <LintSummary findings={touchFindings} />
        </div>
      </div>

      {/* Footer — Continue button */}
      <div
        style={{
          padding: "16px 28px",
          borderTop: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={handleContinue}
          style={{
            padding: "10px 28px",
            background: BLUE_ACTION,
            border: "none",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Continue
        </button>
        {enabledPatternIds.size > 0 && (
          <span style={{ fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
            {enabledPatternIds.size} pattern
            {enabledPatternIds.size !== 1 ? "s" : ""} selected
          </span>
        )}
        {enabledPatternIds.size === 0 && (
          <button
            type="button"
            onClick={handleContinue}
            style={{
              ...ghostBtn,
              fontSize: 12,
              padding: "5px 12px",
            }}
          >
            Skip touch patterns
          </button>
        )}
      </div>
    </div>
  );
}
