// MechanismGallery — §7.7 physical mechanism-assignment gallery.
// Mounted at the #mechanisms route in StudioShell (see StudioShell.tsx routing
// comment for placement rationale). Reads confirmedInventory + axes from the
// survey-results store; calls getPatternLibraryService().filterFor(base, axes)
// to get strategy-ranked matches; renders mechanism cards with apply/scope UI
// and a live coverage indicator (criterion 18.6).
//
// Preview wiring (this cycle): useKeyboardArtifact (open-base fetch path) +
// vfsTransform (applyAssignmentsToVfs) feeds the compiled result into OSKFrame,
// giving the author a live view of the base keyboard WITH their mechanisms
// applied. Recomputes when selectedBaseKeyboard or sessionAssignments change.
//
// Scope support: keyboard-default and individual (character-class is OPTIONAL
// for this slice and is not implemented — documented as a follow-up).

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
} from "react";
import type {
  BaseKeyboard,
  Pattern,
  PatternMatch,
  MechanismAssignment,
  DemoObject,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { uncoveredTargets } from "@keyboard-studio/contracts";
import { useSurveyResultsStore } from "../stores/surveyResultsStore.ts";
import { getPatternLibraryService } from "../lib/services.ts";
import type { DiscoveryAxisVector } from "@keyboard-studio/contracts";
import { applyAssignmentsToVfs } from "@keyboard-studio/engine";
import { useKeyboardArtifact } from "../hooks/useKeyboardArtifact.ts";
import type { VfsTransform } from "../hooks/useKeyboardArtifact.ts";
import { OSKFrame } from "./OSKFrame.tsx";
import { OskModeToggle } from "./OskModeToggle.tsx";
import type { OskMode } from "./OskModeToggle.tsx";

// ---------------------------------------------------------------------------
// Style constants (dark palette from studio CLAUDE.md)
// ---------------------------------------------------------------------------

const BG_PAGE = "#0d1117";
const BG_CARD = "#161b22";
const BG_CARD_HOVER = "#1c2230";
const BORDER = "#30363d";
const ACCENT = "#6ea8fe";
const TEXT_DIM = "#8b949e";
const TEXT_MAIN = "#e6edf3";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Fallback badge for any reason not in the map (e.g. future additions).
const BADGE_FALLBACK = { bg: "#1a1a1a", text: TEXT_DIM };

const BADGE_COLORS: Partial<Record<PatternMatch["reason"], { bg: string; text: string }>> = {
  "primary-strategy": { bg: "#0d2840", text: "#6ea8fe" },
  "secondary-strategy": { bg: "#1a2a1a", text: "#56d364" },
  "appliesTo-match": { bg: "#1a1a2a", text: "#8b949e" },
  "user-expanded": { bg: "#2a1a2a", text: "#d2a8ff" },
};

// ---------------------------------------------------------------------------
// Demo mini-preview helper
// ---------------------------------------------------------------------------

function getDemoText(demo: Pattern["demo"]): string | null {
  if (!demo) return null;
  if (typeof demo === "string") return demo.slice(0, 300);
  const d = demo as DemoObject;
  // sample_output is string[] | null | undefined
  if (Array.isArray(d.sample_output) && d.sample_output.length > 0) {
    return d.sample_output.slice(0, 6).join("  ").slice(0, 300);
  }
  // sample_keys is string[] | null — entries may be plain strings in YAML
  if (Array.isArray(d.sample_keys) && d.sample_keys.length > 0) {
    // The YAML demo.sample_keys field uses plain strings; just join the first few.
    return d.sample_keys.slice(0, 4).join(" + ").slice(0, 200);
  }
  if (typeof d.filled_kmn === "string") {
    return d.filled_kmn.slice(0, 300);
  }
  return null;
}

// ---------------------------------------------------------------------------
// SlotForm — collect slotValues for required questions
// ---------------------------------------------------------------------------

interface SlotFormProps {
  pattern: Pattern;
  slotValues: Record<string, string>;
  onSlotChange: (id: string, value: string) => void;
  disabled?: boolean;
}

function SlotForm({ pattern, slotValues, onSlotChange, disabled = false }: SlotFormProps) {
  if (pattern.questions.length === 0) {
    return (
      <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_DIM, fontStyle: "italic" }}>
        No slot parameters required.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {pattern.questions.map((q) => {
        const val = slotValues[q.id] ?? q.default ?? "";
        const isRequired = q.required !== false;
        return (
          <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label
              htmlFor={`slot-${pattern.id}-${q.id}`}
              style={{
                fontSize: 11,
                color: TEXT_DIM,
                fontFamily: FONT,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {q.prompt}
              {isRequired && (
                <span style={{ color: "#f85149", marginLeft: 4 }} aria-label="required">
                  *
                </span>
              )}
            </label>
            <input
              id={`slot-${pattern.id}-${q.id}`}
              type="text"
              value={val}
              onChange={(e) => onSlotChange(q.id, e.target.value)}
              disabled={disabled}
              style={{
                background: BG_PAGE,
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                color: TEXT_MAIN,
                fontFamily: FONT,
                fontSize: 12,
                padding: "4px 8px",
                outline: "none",
                boxSizing: "border-box",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "text",
              }}
              aria-required={isRequired}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MechanismCard — one card per PatternMatch + Pattern
// ---------------------------------------------------------------------------

interface MechanismCardProps {
  match: PatternMatch;
  pattern: Pattern;
  inventory: string[];
  isApplied: boolean;
  onApply: (assignment: MechanismAssignment) => void;
  onRemove: (patternId: string) => void;
  /** When true, all apply/remove/scope/slot controls are disabled (desktop layout locked). */
  disabled?: boolean;
}

function MechanismCard({
  match,
  pattern,
  inventory,
  isApplied,
  onApply,
  onRemove,
  disabled = false,
}: MechanismCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<"keyboard-default" | "individual">(
    "keyboard-default",
  );
  // Multi-select for individual scope — which inventory chars this applies to.
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  // Slot values seeded from question.default.
  const [slotValues, setSlotValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const q of pattern.questions) {
      if (q.default !== undefined) {
        defaults[q.id] = q.default;
      }
    }
    return defaults;
  });

  const badgeStyle = BADGE_COLORS[match.reason] ?? BADGE_FALLBACK;
  const demoText = getDemoText(pattern.demo);

  const handleSlotChange = useCallback((id: string, value: string) => {
    setSlotValues((prev) => ({ ...prev, [id]: value }));
  }, []);

  const toggleChar = useCallback((char: string) => {
    setSelectedChars((prev) => {
      const next = new Set(prev);
      if (next.has(char)) {
        next.delete(char);
      } else {
        next.add(char);
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    // Build the MechanismRef. slotValues only included when non-empty.
    const hasSlots = Object.keys(slotValues).length > 0;
    const mechanismRef = {
      patternId: pattern.id,
      ...(pattern.strategyId !== undefined ? { strategyId: pattern.strategyId } : {}),
      ...(hasSlots ? { slotValues: { ...slotValues } } : {}),
    };

    if (scope === "keyboard-default") {
      onApply({
        scope: "keyboard-default",
        target: "",
        modality: "physical",
        mechanisms: [mechanismRef],
        source: "user",
      });
    } else {
      // individual — one assignment per selected char.
      const targets = selectedChars.size > 0 ? [...selectedChars] : inventory;
      for (const char of targets) {
        onApply({
          scope: "individual",
          target: char,
          modality: "physical",
          mechanisms: [mechanismRef],
          source: "user",
        });
      }
    }
  }, [slotValues, pattern.id, pattern.strategyId, scope, selectedChars, inventory, onApply]);

  const handleRemoveClick = useCallback(() => {
    onRemove(pattern.id);
  }, [onRemove, pattern.id]);

  const cardStyle: CSSProperties = {
    background: BG_CARD,
    border: `1px solid ${isApplied ? ACCENT : BORDER}`,
    borderRadius: 8,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontFamily: FONT,
    color: TEXT_MAIN,
    transition: "border-color 150ms ease",
  };

  return (
    <article style={cardStyle} aria-label={`Mechanism: ${pattern.title}`}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: isApplied ? ACCENT : TEXT_MAIN,
              }}
            >
              {pattern.title}
            </h3>
            {/* Strategy badge */}
            <span
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 10,
                background: badgeStyle.bg,
                color: badgeStyle.text,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
              title={`Strategy: ${pattern.strategyId ?? "none"} — ${match.reason}`}
            >
              {pattern.strategyId ?? "general"}
            </span>
            {match.reason === "primary-strategy" && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: "#0d2840",
                  color: ACCENT,
                  fontWeight: 600,
                }}
              >
                recommended
              </span>
            )}
            {isApplied && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: "#0d2840",
                  color: "#56d364",
                  fontWeight: 500,
                }}
                aria-label="Applied"
              >
                applied
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
            {pattern.description}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`mechanism-detail-${pattern.id}`}
          onClick={() => setExpanded((v) => !v)}
          style={{
            flexShrink: 0,
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            color: TEXT_DIM,
            fontSize: 11,
            padding: "3px 8px",
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {expanded ? "collapse" : "configure"}
        </button>
      </div>

      {/* Mini demo */}
      {demoText !== null && (
        <pre
          style={{
            margin: 0,
            padding: "8px 10px",
            background: BG_PAGE,
            borderRadius: 4,
            border: `1px solid ${BORDER}`,
            fontSize: 11,
            color: TEXT_DIM,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
          aria-label={`Demo for ${pattern.title}`}
        >
          {demoText}
        </pre>
      )}

      {/* Expanded configuration panel */}
      {expanded && (
        <div
          id={`mechanism-detail-${pattern.id}`}
          style={{
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Scope selector */}
          <fieldset
            disabled={disabled}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: "8px 12px",
              margin: 0,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <legend style={{ fontSize: 11, color: TEXT_DIM, padding: "0 4px" }}>
              Apply at scope
            </legend>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {(["keyboard-default", "individual"] as const).map((s) => (
                <label
                  key={s}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: scope === s ? TEXT_MAIN : TEXT_DIM,
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: FONT,
                  }}
                >
                  <input
                    type="radio"
                    name={`scope-${pattern.id}`}
                    value={s}
                    checked={scope === s}
                    onChange={() => setScope(s)}
                    disabled={disabled}
                    style={{ accentColor: ACCENT }}
                  />
                  {s === "keyboard-default" ? "Keyboard default" : "Individual characters"}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Individual char picker */}
          {scope === "individual" && inventory.length > 0 && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: TEXT_DIM }}>
                Select characters (none = all inventory):
              </p>
              <div
                role="group"
                aria-label="Inventory characters"
                style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
              >
                {inventory.map((char) => {
                  const cp = char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0");
                  const sel = selectedChars.has(char);
                  return (
                    <button
                      key={char}
                      type="button"
                      aria-pressed={sel}
                      aria-label={`U+${cp ?? "????"} ${char}`}
                      onClick={() => toggleChar(char)}
                      disabled={disabled}
                      title={`U+${cp ?? "????"}`}
                      style={{
                        minWidth: 36,
                        padding: "4px 6px",
                        background: sel ? "#0d2840" : BG_PAGE,
                        border: `1px solid ${sel ? ACCENT : BORDER}`,
                        borderRadius: 4,
                        color: sel ? ACCENT : TEXT_MAIN,
                        fontSize: 14,
                        fontFamily: "monospace",
                        cursor: disabled ? "not-allowed" : "pointer",
                        lineHeight: 1.4,
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      {char}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Slot form */}
          <SlotForm
            pattern={pattern}
            slotValues={slotValues}
            onSlotChange={handleSlotChange}
            disabled={disabled}
          />

          {/* Apply / Remove buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleApply}
              disabled={disabled}
              style={{
                padding: "7px 16px",
                background: disabled ? "#1a2a40" : ACCENT,
                border: "none",
                borderRadius: 6,
                color: disabled ? TEXT_DIM : "#0d1117",
                fontSize: 12,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: FONT,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              Apply
            </button>
            {isApplied && (
              <button
                type="button"
                onClick={handleRemoveClick}
                disabled={disabled}
                style={{
                  padding: "7px 16px",
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  color: TEXT_DIM,
                  fontSize: 12,
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontFamily: FONT,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// CoverageIndicator — criterion 18.6
// ---------------------------------------------------------------------------

interface CoverageIndicatorProps {
  assignments: MechanismAssignment[];
  inventory: string[];
}

function CoverageIndicator({ assignments, inventory }: CoverageIndicatorProps) {
  if (inventory.length === 0) {
    return null;
  }

  // classesOf: no class-membership in this slice (character-class scope deferred).
  const uncovered = uncoveredTargets(assignments, inventory, "physical");
  const covered = inventory.length - uncovered.length;

  const allCovered = uncovered.length === 0;
  const indicatorColor = allCovered ? "#56d364" : "#f0883e";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Coverage: ${covered} of ${inventory.length} characters covered`}
      style={{
        background: BG_CARD,
        border: `1px solid ${allCovered ? "#1a3a1a" : "#3a2000"}`,
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: indicatorColor,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: indicatorColor }}>
          {allCovered
            ? `All ${inventory.length} characters covered`
            : `Covered ${covered} / ${inventory.length}`}
        </span>
      </div>

      {uncovered.length > 0 && (
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: TEXT_DIM }}>
            Not yet covered (dead-end per criterion 18.6):
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {uncovered.map((char) => {
              const cp = char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0");
              return (
                <span
                  key={char}
                  title={`U+${cp ?? "????"} — not covered`}
                  aria-label={`U+${cp ?? "????"} ${char} uncovered`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 6px",
                    background: BG_PAGE,
                    border: `1px solid #f0883e`,
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "#f0883e",
                  }}
                >
                  <span>{char}</span>
                  <span style={{ fontSize: 10, color: TEXT_DIM }}>U+{cp ?? "????"}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GalleryPreviewWithPatterns — wraps GalleryPreview, injects a real sync
// pattern resolver into the vfsTransform via a factory approach.
//
// The problem: applyAssignmentsToVfs needs a synchronous (id: string) =>
// Pattern | undefined resolver, but PatternLibraryService.getById() is async.
// BrowserPatternLibraryService is synchronously backed (Promise.resolve of an
// in-memory array) but the interface is async. We solve this by passing the
// already-loaded patternMap from the gallery's existing async load as the
// resolver, so the transform always has the patterns it needs.
// ---------------------------------------------------------------------------

interface GalleryPreviewWithPatternsProps {
  selectedBaseKeyboard: BaseKeyboard;
  sessionAssignments: MechanismAssignment[];
  patternMap: Map<string, Pattern>;
}

function GalleryPreviewWithPatterns({
  selectedBaseKeyboard,
  sessionAssignments,
  patternMap,
}: GalleryPreviewWithPatternsProps) {
  const [oskMode, setOskMode] = useState<OskMode>("desktop");

  // Build a stable memoization key from the assignment list.
  const assignmentsKey = useMemo(
    () =>
      sessionAssignments
        .map(
          (a) =>
            `${a.scope}:${a.target}:${a.mechanisms.map((m) => `${m.patternId}/${JSON.stringify(m.slotValues ?? {})}`).join(",")}`,
        )
        .join("|"),
    [sessionAssignments],
  );

  // vfsTransform: stable per assignmentsKey + patternMap. Uses patternMap
  // directly for synchronous pattern resolution without an async service round-trip.
  // patternMap is a useState ref so it is already stable across renders when
  // the loaded patterns have not changed.
  const vfsTransform = useMemo<VfsTransform>(
    () =>
      (vfs: VirtualFS, keyboardId: string) =>
        applyAssignmentsToVfs(
          vfs,
          keyboardId,
          sessionAssignments,
          (id) => patternMap.get(id),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignmentsKey, patternMap],
  );

  const { stage, retry } = useKeyboardArtifact(
    selectedBaseKeyboard,
    null,
    vfsTransform,
  );

  const applyWarnings =
    stage.kind === "ready" && stage.scaffoldWarnings.length > 0
      ? stage.scaffoldWarnings
      : [];

  return (
    <section
      aria-label="Live keyboard preview with mechanisms applied"
      style={{
        marginTop: 28,
        borderTop: `1px solid ${BORDER}`,
        paddingTop: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
          }}
        >
          Live preview — base with mechanisms
        </h2>
        <OskModeToggle
          value={oskMode}
          onChange={setOskMode}
          disabled={stage.kind !== "ready"}
        />
      </div>

      {/* Apply warnings */}
      {applyWarnings.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            background: "#2a1a00",
            border: "1px solid #f0883e",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            color: "#f0883e",
            fontFamily: FONT,
          }}
        >
          <strong>Apply warnings:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {applyWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Loading state */}
      {(stage.kind === "fetching" || stage.kind === "vfs-loading" || stage.kind === "compiling") && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading keyboard preview"
          style={{
            padding: "24px 0",
            textAlign: "center",
            color: TEXT_DIM,
            fontSize: 13,
            fontFamily: FONT,
          }}
        >
          {stage.kind === "fetching"
            ? "Fetching keyboard source..."
            : stage.kind === "compiling"
              ? `Compiling${stage.isWarmCompile ? "" : " (loading WASM)"}...`
              : "Loading..."}
        </div>
      )}

      {/* Error state */}
      {stage.kind === "error" && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "16px 20px",
            background: "#2a0a0a",
            border: "1px solid #f85149",
            borderRadius: 8,
            color: "#f85149",
            fontSize: 13,
            fontFamily: FONT,
          }}
        >
          <strong>[ERROR]</strong> Preview failed ({stage.step}): {stage.message}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={retry}
              style={{
                padding: "5px 12px",
                background: "transparent",
                border: `1px solid #f85149`,
                borderRadius: 4,
                color: "#f85149",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* OSKFrame — always mounted so KMW stays warm; overlay handles non-ready states */}
      <div style={{ display: stage.kind === "error" ? "none" : "block" }}>
        <OSKFrame
          baseKeyboard={selectedBaseKeyboard}
          oskMode={oskMode}
          stage={stage}
          retry={retry}
        />
      </div>

      {/* Compile diagnostics */}
      {stage.kind === "ready" && stage.compileResult.diagnostics.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`${stage.compileResult.diagnostics.length} compiler diagnostic(s)`}
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 11,
            color: TEXT_DIM,
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
          }}
        >
          <span style={{ color: "#d29922" }}>
            {stage.compileResult.diagnostics.length} compiler diagnostic(s).
          </span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// MechanismGallery — main component
// ---------------------------------------------------------------------------

export interface MechanismGalleryProps {
  selectedBaseKeyboard: BaseKeyboard | null;
}

export function MechanismGallery({ selectedBaseKeyboard }: MechanismGalleryProps) {
  const session = useSurveyResultsStore((s) => s.session);
  const recordAssignments = useSurveyResultsStore((s) => s.recordAssignments);
  const desktopLocked = useSurveyResultsStore((s) => s.desktopLocked);
  const lockDesktop = useSurveyResultsStore((s) => s.lockDesktop);
  const unlockDesktop = useSurveyResultsStore((s) => s.unlockDesktop);

  const inventory = session.confirmedInventory;

  // Memoize the axes object so the filterFor effect only re-fires when the
  // underlying axis values actually change, not on every store update.
  const rawAxes = session.axes as Partial<DiscoveryAxisVector>;
  const axes = useMemo<Partial<DiscoveryAxisVector>>(
    () => rawAxes,
    // Enumerate all seven axis keys so the memo key is primitive-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      rawAxes.scale,
      rawAxes.scriptClass,
      rawAxes.phoneticIntuition,
      rawAxes.diacriticBehavior,
      rawAxes.multiMode,
      rawAxes.constraintEnforcement,
      rawAxes.spareKeyAvailability,
    ],
  );

  // All current physical assignments from the session.
  const sessionAssignments = session.assignments.filter(
    (a) => a.modality === "physical",
  );

  // Gallery state: ranked matches + their full patterns.
  const [matches, setMatches] = useState<PatternMatch[]>([]);
  const [patternMap, setPatternMap] = useState<Map<string, Pattern>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBaseKeyboard === null) {
      setMatches([]);
      setPatternMap(new Map());
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const svc = getPatternLibraryService();

    // Cast Partial<DiscoveryAxisVector> to DiscoveryAxisVector only when all
    // required fields are present. The axes may be partial when Phase B is
    // incomplete; in that case we pass undefined and get appliesTo-only ranking.
    const fullAxes: DiscoveryAxisVector | undefined =
      axes.scale !== undefined &&
      axes.scriptClass !== undefined &&
      axes.phoneticIntuition !== undefined &&
      axes.diacriticBehavior !== undefined &&
      axes.multiMode !== undefined &&
      axes.constraintEnforcement !== undefined &&
      axes.spareKeyAvailability !== undefined
        ? (axes as DiscoveryAxisVector)
        : undefined;

    svc.filterFor(selectedBaseKeyboard, fullAxes).then((ranked) => {
      setMatches(ranked);
      // Fetch full patterns for all matches.
      return Promise.all(ranked.map((m) => svc.getById(m.patternId)));
    }).then((patterns) => {
      const map = new Map<string, Pattern>();
      for (const p of patterns) {
        if (p !== undefined) {
          map.set(p.id, p);
        } else {
          console.warn("[MechanismGallery] getById() returned undefined for a ranked patternId — the catalog may be out of sync");
        }
      }
      setPatternMap(map);
      setLoading(false);
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MechanismGallery] filterFor error:", err);
      setLoadError(msg);
      setLoading(false);
    });
  }, [selectedBaseKeyboard, axes]);

  // Track which patternIds currently have at least one applied assignment.
  const appliedPatternIds = new Set(
    sessionAssignments.flatMap((a) => a.mechanisms.map((m) => m.patternId)),
  );

  // handleApply: merge the new assignment into the full physical assignment list
  // and route through recordAssignments so the find/create-Phase-C logic lives
  // only in the store. Defense-in-depth: bail early when locked even if a caller
  // somehow bypasses the disabled controls.
  const handleApply = useCallback((assignment: MechanismAssignment) => {
    if (desktopLocked) return;
    const next = [...sessionAssignments, assignment];
    recordAssignments(next);
  }, [desktopLocked, sessionAssignments, recordAssignments]);

  // handleRemove: drop all assignments for this patternId from the physical list.
  // Defense-in-depth: bail early when locked.
  const handleRemove = useCallback((patternId: string) => {
    if (desktopLocked) return;
    const next = sessionAssignments.filter(
      (a) => !a.mechanisms.some((m) => m.patternId === patternId),
    );
    recordAssignments(next);
  }, [desktopLocked, sessionAssignments, recordAssignments]);

  // ---------------------------------------------------------------------------
  // Render — empty/error states
  // ---------------------------------------------------------------------------

  const pageStyle: CSSProperties = {
    background: BG_PAGE,
    height: "100%",
    overflowY: "auto",
    padding: "24px 32px",
    boxSizing: "border-box",
    fontFamily: FONT,
    color: TEXT_MAIN,
  };

  if (selectedBaseKeyboard === null) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            maxWidth: 560,
            margin: "60px auto",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            color: TEXT_DIM,
          }}
        >
          <p style={{ fontSize: 15 }}>
            No base keyboard selected. Go to{" "}
            <a href="#pick-base" style={{ color: ACCENT, textDecoration: "none" }}>
              Pick Base
            </a>{" "}
            to choose a starting point.
          </p>
        </div>
      </div>
    );
  }

  if (inventory.length === 0) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            maxWidth: 560,
            margin: "60px auto",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            color: TEXT_DIM,
          }}
        >
          <p style={{ fontSize: 15 }}>
            No inventory confirmed yet. Complete the{" "}
            <a href="#survey" style={{ color: ACCENT, textDecoration: "none" }}>
              Survey
            </a>{" "}
            (Phase B) to confirm which characters your keyboard must produce.
          </p>
        </div>
      </div>
    );
  }

  // True only when there is at least one physical assignment — the lock button
  // is disabled until the layout has content to lock.
  const hasAssignments = sessionAssignments.length > 0;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {/* Page header */}
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: "1.2rem", color: ACCENT, fontWeight: 600 }}>
            Mechanism Gallery
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
            Choose how each character in your inventory is typed. Apply one or more
            mechanisms; the coverage indicator tracks which characters are still uncovered.
            Base keyboard:{" "}
            <strong style={{ color: TEXT_MAIN }}>{selectedBaseKeyboard.displayName}</strong>
            {" — modality: physical"}
          </p>
        </header>

        {/* Desktop-lock banner — shown when locked (role=status so screen
            readers are notified when it appears). */}
        {desktopLocked && (
          <div
            role="status"
            aria-live="polite"
            aria-label="Desktop layout locked"
            style={{
              background: "#0d2218",
              border: "1px solid #238636",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              fontFamily: FONT,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#56d364",
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#56d364" }}>
                Desktop layout locked
              </span>
              <span style={{ fontSize: 12, color: TEXT_DIM }}>
                — controls are read-only; unlock to make further changes
              </span>
            </div>
            <button
              type="button"
              onClick={unlockDesktop}
              style={{
                padding: "5px 14px",
                background: "transparent",
                border: "1px solid #30363d",
                borderRadius: 6,
                color: TEXT_DIM,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: FONT,
                whiteSpace: "nowrap",
              }}
            >
              Unlock to edit
            </button>
          </div>
        )}

        {/* Coverage indicator (criterion 18.6) */}
        <div style={{ marginBottom: 20 }}>
          <CoverageIndicator
            assignments={sessionAssignments}
            inventory={inventory}
          />
        </div>

        {/* Gallery grid */}
        {loading ? (
          <p style={{ color: TEXT_DIM, fontSize: 13 }}>Loading patterns...</p>
        ) : loadError !== null ? (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: "16px 20px",
              background: "#2a0a0a",
              border: "1px solid #f85149",
              borderRadius: 8,
              color: "#f85149",
              fontSize: 13,
            }}
          >
            Could not load patterns — see the browser console.
            <br />
            <span style={{ fontSize: 11, color: TEXT_DIM }}>{loadError}</span>
          </div>
        ) : matches.length === 0 ? (
          <div
            style={{
              padding: "20px 0",
              color: TEXT_DIM,
              fontSize: 13,
              borderTop: `1px solid ${BORDER}`,
            }}
          >
            No patterns found for this base keyboard.
          </div>
        ) : (
          <div
            role="list"
            aria-label="Mechanism patterns"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {matches.map((match) => {
              const pattern = patternMap.get(match.patternId);
              if (pattern === undefined) return null;
              return (
                <div role="listitem" key={pattern.id}>
                  <MechanismCard
                    match={match}
                    pattern={pattern}
                    inventory={inventory}
                    isApplied={appliedPatternIds.has(pattern.id)}
                    onApply={handleApply}
                    onRemove={handleRemove}
                    disabled={desktopLocked}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Lock desktop layout action — shown when not yet locked.
            Enabled only when there is at least one physical assignment so the
            author cannot lock an empty layout. */}
        {!desktopLocked && (
          <div
            style={{
              marginTop: 28,
              borderTop: `1px solid ${BORDER}`,
              paddingTop: 20,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
              When you are satisfied with your mechanism assignments, lock the
              desktop layout to proceed to the touch gallery.
            </p>
            <button
              type="button"
              onClick={lockDesktop}
              disabled={!hasAssignments}
              title={
                hasAssignments
                  ? "Lock the desktop layout and enable the touch gallery"
                  : "Apply at least one mechanism before locking"
              }
              style={{
                padding: "8px 20px",
                background: hasAssignments ? "#238636" : "#1a2a1a",
                border: `1px solid ${hasAssignments ? "#2ea043" : BORDER}`,
                borderRadius: 6,
                color: hasAssignments ? "#ffffff" : TEXT_DIM,
                fontSize: 13,
                fontWeight: 600,
                cursor: hasAssignments ? "pointer" : "not-allowed",
                fontFamily: FONT,
                width: "fit-content",
                opacity: hasAssignments ? 1 : 0.55,
              }}
            >
              Lock desktop layout
            </button>
            {!hasAssignments && (
              <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM, fontStyle: "italic" }}>
                Apply at least one mechanism to enable locking.
              </p>
            )}
          </div>
        )}

        {/* §7.7 OSK preview: scaffold→fetch→applyAssignmentsToVfs→compile→OSKFrame.
            Shown once patterns have loaded (patternMap available for sync resolver).
            Empty-assignments state: the preview still renders the unmodified base
            so the author sees what they are building on top of. */}
        {!loading && loadError === null && (
          <GalleryPreviewWithPatterns
            selectedBaseKeyboard={selectedBaseKeyboard}
            sessionAssignments={sessionAssignments}
            patternMap={patternMap}
          />
        )}
      </div>
    </div>
  );
}
