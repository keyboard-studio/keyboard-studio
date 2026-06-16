// MechanismGallery — Phase C "add a key" flow (two-pane redesign).
//
// LEFT pane: one-character-at-a-time assignment loop.
//   - Walks lettersToAdd in order; the first uncovered+unskipped char is current.
//   - Offers up to two methods: S-03 (sequence) always; S-02 (deadkey) only for
//     decomposable accented letters (NFD has exactly 2 code points, second is
//     a combining mark U+0300-U+036F).
//   - "Add key" records a MechanismAssignment(scope:"individual") and auto-advances.
//   - "Skip" advances without recording (skipped chars count toward Done gate).
//   - Done when every char in lettersToAdd is either covered or skipped.
//
// RIGHT pane: GalleryPreviewWithPatterns — live OSK preview, unchanged.
//
// Contract shapes: see packages/contracts/src/assignmentMap.ts
// Pattern IDs/strategyIds: multi_char_sequence (S-03),
//                           deadkey_single_tap (S-02)
// (must match the `id:` fields in content/patterns/ — see PATTERN_* constants)

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
} from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  BaseKeyboard,
  Pattern,
  PatternMatch,
  MechanismAssignment,
} from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { getPatternLibraryService } from "../lib/services.ts";
import type { DiscoveryAxisVector } from "@keyboard-studio/contracts";
import { useKeyboardArtifact, type ScaffoldSpec } from "../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { useInventoryDiff } from "../hooks/useInventoryDiff.ts";
import { OSKFrame } from "./OSKFrame.tsx";
import { OskModeToggle } from "./OskModeToggle.tsx";
import type { OskMode } from "./OskModeToggle.tsx";

// ---------------------------------------------------------------------------
// Style constants — dark palette matching PhaseB
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
// Helpers
// ---------------------------------------------------------------------------

function cpStr(char: string): string {
  const cp = char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0");
  return `U+${cp ?? "????"}`;
}

// Pattern IDs as they exist in the browser pattern library (content/patterns/).
// These MUST match the `id:` fields in the YAML — a mismatch means getById()
// returns undefined, the assignment can't resolve, and the live preview never
// reflects the added key.
const PATTERN_SEQUENCE = "multi_char_sequence"; // S-03
const PATTERN_DEADKEY = "deadkey_single_tap"; // S-02

/**
 * A KMN-identifier-safe, per-target deadkey state name. Derived from the target
 * codepoint so each accented character gets a unique deadkey state (avoids
 * duplicate store() declarations when several accented letters are added).
 */
function deadkeyNameFor(char: string): string {
  const cp = char.codePointAt(0)?.toString(16) ?? "x";
  return `dk_${cp}`;
}

/** Returns true when char is an accented letter decomposable to base + combining mark. */
function isDecomposableAccented(char: string): boolean {
  const nfd = char.normalize("NFD");
  const cps = [...nfd];
  if (cps.length !== 2) return false;
  const secondCp = cps[1]?.codePointAt(0) ?? 0;
  return secondCp >= 0x0300 && secondCp <= 0x036f;
}

// ---------------------------------------------------------------------------
// GalleryPreviewWithPatterns — right pane (kept AS-IS from original)
// ---------------------------------------------------------------------------

interface GalleryPreviewWithPatternsProps {
  selectedBaseKeyboard: BaseKeyboard;
  patternMap: Map<string, Pattern>;
}

function GalleryPreviewWithPatterns({
  selectedBaseKeyboard,
  patternMap,
}: GalleryPreviewWithPatternsProps) {
  const [oskMode, setOskMode] = useState<OskMode>("desktop");

  const identity = useWorkingCopyStore((s) => s.identity);
  const scaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity?.keyboardId, identity?.displayName],
  );

  const vfsTransform = useWorkingCopyTransform({ patternMap });

  // eslint-disable-next-line no-console
  console.log(`[DIAG:GalleryPreview] render. kb=${selectedBaseKeyboard.id}, scaffoldSpec=${scaffoldSpec != null ? scaffoldSpec.keyboardId : "null"}, vfsTransform=${vfsTransform != null ? "SET" : "null"}`);

  const { stage, retry } = useKeyboardArtifact(
    selectedBaseKeyboard,
    scaffoldSpec,
    vfsTransform,
  );

  // eslint-disable-next-line no-console
  console.log(`[DIAG:GalleryPreview] stage.kind=${stage.kind}`);

  const applyWarnings =
    stage.kind === "ready" && stage.scaffoldWarnings.length > 0
      ? stage.scaffoldWarnings
      : [];

  return (
    <section
      aria-label="Live keyboard preview with mechanisms applied"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "100%",
        boxSizing: "border-box",
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
          Live preview
        </h2>
        <OskModeToggle
          value={oskMode}
          onChange={setOskMode}
          disabled={stage.kind !== "ready"}
        />
      </div>

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

      {(stage.kind === "fetching" ||
        stage.kind === "vfs-loading" ||
        stage.kind === "compiling") && (
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
                border: "1px solid #f85149",
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

      <div style={{ display: stage.kind === "error" ? "none" : "block" }}>
        <OSKFrame
          baseKeyboard={selectedBaseKeyboard}
          oskMode={oskMode}
          stage={stage}
          retry={retry}
        />
      </div>

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
// MethodChooser — S-03 / S-02 radio-style selection + slot inputs
// ---------------------------------------------------------------------------

type Method = "sequence" | "deadkey";

interface MethodChooserProps {
  currentChar: string;
  method: Method;
  onMethodChange: (m: Method) => void;
  seqFirst: string;
  seqSecond: string;
  onSeqFirstChange: (v: string) => void;
  onSeqSecondChange: (v: string) => void;
  triggerKey: string;
  onTriggerKeyChange: (v: string) => void;
}

const DEADKEY_OPTIONS = [
  { value: "K_QUOTE", label: "K_QUOTE (apostrophe)" },
  { value: "K_GRAVE", label: "K_GRAVE (backtick)" },
  { value: "K_BKQUOTE", label: "K_BKQUOTE (grave)" },
  { value: "K_SEMI", label: "K_SEMI (semicolon)" },
] as const;

function MethodChooser({
  currentChar,
  method,
  onMethodChange,
  seqFirst,
  seqSecond,
  onSeqFirstChange,
  onSeqSecondChange,
  triggerKey,
  onTriggerKeyChange,
}: MethodChooserProps) {
  const showDeadkey = isDecomposableAccented(currentChar);
  const nfd = currentChar.normalize("NFD");
  const nfdCps = [...nfd];
  const base = nfdCps[0] ?? "";

  const btnBase: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: BG_PAGE,
    color: TEXT_MAIN,
    fontSize: 13,
    fontFamily: FONT,
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    transition: "border-color 120ms ease, background 120ms ease",
  };

  const inputStyle: CSSProperties = {
    width: 52,
    padding: "6px 8px",
    background: BG_PAGE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT_MAIN,
    fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
    fontSize: 20,
    textAlign: "center",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}
      >
        How to type it:
      </p>

      {/* S-03 option — always shown */}
      <button
        type="button"
        aria-pressed={method === "sequence"}
        onClick={() => onMethodChange("sequence")}
        style={{
          ...btnBase,
          borderColor: method === "sequence" ? ACCENT : BORDER,
          background: method === "sequence" ? "#0d2840" : BG_PAGE,
        }}
      >
        <span style={{ fontWeight: 600, color: method === "sequence" ? ACCENT : TEXT_MAIN }}>
          Type a sequence
        </span>
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          Two keys in a row produce {currentChar}
        </span>
      </button>

      {method === "sequence" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "#0d2840",
            borderRadius: 8,
            border: `1px solid ${ACCENT}`,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: TEXT_DIM, fontFamily: FONT, whiteSpace: "nowrap" }}>
            Type these two keys to get{" "}
            <span style={{ color: TEXT_MAIN, fontFamily: "monospace", fontSize: 16 }}>
              {currentChar}
            </span>
            :
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="text"
              value={seqFirst}
              onChange={(e) => onSeqFirstChange(e.target.value)}
              aria-label="First key in sequence"
              maxLength={2}
              style={inputStyle}
            />
            <span style={{ color: TEXT_DIM, fontSize: 14, fontFamily: FONT }}>then</span>
            <input
              type="text"
              value={seqSecond}
              onChange={(e) => onSeqSecondChange(e.target.value)}
              aria-label="Second key in sequence"
              maxLength={2}
              style={inputStyle}
            />
            <span style={{ color: TEXT_DIM, fontSize: 14, fontFamily: FONT }}>
              &rarr;{" "}
              <span style={{ color: TEXT_MAIN, fontFamily: "monospace", fontSize: 18 }}>
                {currentChar}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* S-02 option — only for decomposable accented chars */}
      {showDeadkey && (
        <>
          <button
            type="button"
            aria-pressed={method === "deadkey"}
            onClick={() => onMethodChange("deadkey")}
            style={{
              ...btnBase,
              borderColor: method === "deadkey" ? ACCENT : BORDER,
              background: method === "deadkey" ? "#0d2840" : BG_PAGE,
            }}
          >
            <span style={{ fontWeight: 600, color: method === "deadkey" ? ACCENT : TEXT_MAIN }}>
              Tap an accent, then the letter
            </span>
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Press the trigger key, then{" "}
              <span style={{ fontFamily: "monospace" }}>{base}</span>, to get{" "}
              <span style={{ fontFamily: "monospace" }}>{currentChar}</span>
            </span>
          </button>

          {method === "deadkey" && (
            <div
              style={{
                padding: "10px 14px",
                background: "#0d2840",
                borderRadius: 8,
                border: `1px solid ${ACCENT}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}>
                Tap the accent key, then{" "}
                <span style={{ fontFamily: "monospace", color: TEXT_MAIN }}>
                  {base}
                </span>
                , to get{" "}
                <span style={{ fontFamily: "monospace", color: TEXT_MAIN, fontSize: 16 }}>
                  {currentChar}
                </span>
                .
              </p>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: TEXT_DIM,
                  fontFamily: FONT,
                }}
              >
                Trigger key:
                <select
                  value={triggerKey}
                  onChange={(e) => onTriggerKeyChange(e.target.value)}
                  aria-label="Trigger key for deadkey"
                  style={{
                    background: BG_PAGE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    color: TEXT_MAIN,
                    fontSize: 12,
                    padding: "4px 8px",
                    fontFamily: FONT,
                  }}
                >
                  {DEADKEY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MechanismGallery — main component
// ---------------------------------------------------------------------------

export interface MechanismGalleryProps {
  selectedBaseKeyboard: BaseKeyboard | null;
  onComplete?: () => void;
  onBack?: () => void;
}

export function MechanismGallery({
  selectedBaseKeyboard,
  onComplete,
  onBack,
}: MechanismGalleryProps) {
  const recordAssignments = useWorkingCopyStore((s) => s.recordAssignments);
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const rawAssignments = useWorkingCopyStore((s) => s.session.assignments);
  const axes = useWorkingCopyStore(
    useShallow((s) => s.session.axes as Partial<DiscoveryAxisVector>),
  );

  const { lettersToAdd, alreadyProduced } = useInventoryDiff();

  const sessionAssignments = useMemo(
    () => rawAssignments.filter((a) => a.modality === "physical"),
    [rawAssignments],
  );

  // The covered set: individual-scope assignments for chars in lettersToAdd.
  const coveredChars = useMemo(
    () =>
      new Set(
        sessionAssignments
          .filter((a) => a.scope === "individual")
          .map((a) => a.target)
          .filter((t) => lettersToAdd.includes(t)),
      ),
    [sessionAssignments, lettersToAdd],
  );

  // Skipped chars — tracked in local state; these advance currentChar without
  // recording an assignment. They count for the Done gate (done = covered | skipped).
  const [skippedChars, setSkippedChars] = useState<Set<string>>(new Set());

  // The current character: first in lettersToAdd that is neither covered nor skipped.
  const currentChar = useMemo(
    () =>
      lettersToAdd.find((c) => !coveredChars.has(c) && !skippedChars.has(c)) ??
      null,
    [lettersToAdd, coveredChars, skippedChars],
  );

  // Done = every char in lettersToAdd is covered or skipped.
  const isDone = useMemo(
    () =>
      lettersToAdd.length === 0 ||
      lettersToAdd.every((c) => coveredChars.has(c) || skippedChars.has(c)),
    [lettersToAdd, coveredChars, skippedChars],
  );

  // ---------------------------------------------------------------------------
  // Pattern loading — needed for patternMap (GalleryPreviewWithPatterns)
  // ---------------------------------------------------------------------------

  const [patternMap, setPatternMap] = useState<Map<string, Pattern>>(
    new Map(),
  );
  const [_matches, setMatches] = useState<PatternMatch[]>([]);
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

    svc
      .filterFor(selectedBaseKeyboard, fullAxes)
      .then((ranked) => {
        setMatches(ranked);
        // Load ranked patterns PLUS the two the add-a-key UI offers. Axis-based
        // ranking (rankPatterns) excludes off-strategy patterns, so S-02/S-03
        // may be absent from `ranked`; load them explicitly so the preview
        // transform can always resolve an applied assignment.
        const ids = new Set<string>(ranked.map((m) => m.patternId));
        ids.add(PATTERN_SEQUENCE);
        ids.add(PATTERN_DEADKEY);
        return Promise.all([...ids].map((id) => svc.getById(id)));
      })
      .then((patterns) => {
        const map = new Map<string, Pattern>();
        for (const p of patterns) {
          if (p !== undefined) {
            map.set(p.id, p);
          } else {
            console.warn(
              "[MechanismGallery] getById() returned undefined for a patternId",
            );
          }
        }
        setPatternMap(map);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MechanismGallery] filterFor error:", err);
        setLoadError(msg);
        setLoading(false);
      });
  }, [selectedBaseKeyboard, axes]);

  // ---------------------------------------------------------------------------
  // Per-char method state — reset when currentChar changes
  // ---------------------------------------------------------------------------

  const [method, setMethod] = useState<Method>("sequence");
  const [seqFirst, setSeqFirst] = useState("");
  const [seqSecond, setSeqSecond] = useState("");
  const [triggerKey, setTriggerKey] = useState("K_QUOTE");

  // Reset inputs whenever currentChar changes.
  useEffect(() => {
    setMethod("sequence");
    setSeqFirst("");
    setSeqSecond("");
    setTriggerKey("K_QUOTE");
  }, [currentChar]);

  // ---------------------------------------------------------------------------
  // Apply action
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "sequence") {
      // Both must be single graphemes (non-empty).
      return seqFirst.trim().length > 0 && seqSecond.trim().length > 0;
    }
    // deadkey: triggerKey always has a value.
    return true;
  }, [currentChar, method, seqFirst, seqSecond]);

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;

    let assignment: MechanismAssignment;

    if (method === "sequence") {
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: {
              firstLetterOut: seqFirst.trim(),
              secondLetter: seqSecond.trim(),
              collapsedChar: currentChar,
            },
          },
        ],
        source: "user",
      };
    } else {
      const nfd = currentChar.normalize("NFD");
      const nfdCps = [...nfd];
      const base = nfdCps[0] ?? "";
      const accentChar = nfdCps[1] ?? "";
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_DEADKEY,
            strategyId: "S-02",
            slotValues: {
              triggerKey,
              deadkeyName: deadkeyNameFor(currentChar),
              baseLetters: base,
              accentedForms: currentChar,
              accentChar,
            },
          },
        ],
        source: "user",
      };
    }

    // eslint-disable-next-line no-console
    console.log(`[DIAG:handleApply] recording assignment for "${currentChar}", method=${method}, total=${sessionAssignments.length + 1}`);
    recordAssignments([...sessionAssignments, assignment]);
    // currentChar auto-advances because coveredChars will now include it.
  }, [
    currentChar,
    canApply,
    method,
    seqFirst,
    seqSecond,
    triggerKey,
    recordAssignments,
    sessionAssignments,
  ]);

  const handleSkip = useCallback(() => {
    if (currentChar === null) return;
    setSkippedChars((prev) => new Set([...prev, currentChar]));
  }, [currentChar]);

  const handleRemoveCovered = useCallback(
    (char: string) => {
      const next = sessionAssignments.filter(
        (a) => !(a.scope === "individual" && a.target === char),
      );
      recordAssignments(next);
    },
    [sessionAssignments, recordAssignments],
  );

  // ---------------------------------------------------------------------------
  // AlreadyProduced collapsed section
  // ---------------------------------------------------------------------------

  const [alreadyExpanded, setAlreadyExpanded] = useState(false);

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------

  const pageStyle: CSSProperties = {
    background: BG_PAGE,
    height: "100%",
    boxSizing: "border-box",
    fontFamily: FONT,
    color: TEXT_MAIN,
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

  // ---------------------------------------------------------------------------
  // Guard: no base keyboard
  // ---------------------------------------------------------------------------

  if (selectedBaseKeyboard === null) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            maxWidth: 560,
            margin: "60px auto",
            textAlign: "center",
            color: TEXT_DIM,
            padding: "0 24px",
          }}
        >
          <p style={{ fontSize: 15 }}>
            No base keyboard selected. Go back to choose a starting point.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Guard: no inventory
  // ---------------------------------------------------------------------------

  if (inventory.length === 0) {
    return (
      <div style={{ ...pageStyle, padding: "24px 32px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {onBack !== undefined && (
            <button type="button" onClick={onBack} style={ghostBtn}>
              &larr; Back
            </button>
          )}
          <div
            style={{
              maxWidth: 560,
              margin: "60px auto",
              textAlign: "center",
              color: TEXT_DIM,
            }}
          >
            <p style={{ fontSize: 15 }}>
              No inventory confirmed yet. Complete the Survey (Phase B) to
              confirm which characters your keyboard must produce.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Compute coverage line: covered-in-lettersToAdd count / lettersToAdd.length
  // ---------------------------------------------------------------------------

  const coveredCount = lettersToAdd.filter((c) => coveredChars.has(c)).length;

  // ---------------------------------------------------------------------------
  // Left pane content
  // ---------------------------------------------------------------------------

  const leftContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "24px 20px",
        overflowY: "auto",
        boxSizing: "border-box",
        height: "100%",
      }}
    >
      {/* Small coverage line */}
      {lettersToAdd.length > 0 && (
        <p
          role="status"
          aria-live="polite"
          aria-label={`${coveredCount} of ${lettersToAdd.length} added`}
          style={{
            margin: 0,
            fontSize: 12,
            color: TEXT_DIM,
            fontFamily: FONT,
          }}
        >
          {coveredCount} of {lettersToAdd.length} added
        </p>
      )}

      {/* Back button */}
      {onBack !== undefined && !isDone && (
        <button
          type="button"
          onClick={onBack}
          style={{ ...ghostBtn, alignSelf: "flex-start", fontSize: 13 }}
        >
          &larr; Back
        </button>
      )}

      {/* All-done / empty states */}
      {lettersToAdd.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            color: TEXT_DIM,
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            No new characters to add.
          </p>
          <button
            type="button"
            onClick={onComplete}
            style={{
              padding: "10px 24px",
              background: BLUE_ACTION,
              border: "none",
              borderRadius: 6,
              color: "#e6edf3",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONT,
              alignSelf: "flex-start",
            }}
          >
            Done
          </button>
        </div>
      )}

      {lettersToAdd.length > 0 && isDone && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_DIM }}>
            All keys added.
          </p>
          <button
            type="button"
            onClick={onComplete}
            style={{
              padding: "10px 24px",
              background: BLUE_ACTION,
              border: "none",
              borderRadius: 6,
              color: "#e6edf3",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONT,
              alignSelf: "flex-start",
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* Per-char UI */}
      {currentChar !== null && (
        <>
          {/* Character heading */}
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Add a key
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                style={{ fontSize: 36, fontFamily: "monospace", lineHeight: 1 }}
                aria-label={`${cpStr(currentChar)} ${currentChar}`}
              >
                {currentChar}
              </span>
              <span style={{ fontSize: 13, color: TEXT_DIM }}>
                {cpStr(currentChar)}
              </span>
            </div>
          </div>

          {/* Method chooser */}
          <MethodChooser
            currentChar={currentChar}
            method={method}
            onMethodChange={setMethod}
            seqFirst={seqFirst}
            seqSecond={seqSecond}
            onSeqFirstChange={setSeqFirst}
            onSeqSecondChange={setSeqSecond}
            triggerKey={triggerKey}
            onTriggerKeyChange={setTriggerKey}
          />

          {/* Apply + Skip actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              aria-label={`Add key for ${currentChar}`}
              style={{
                padding: "9px 20px",
                background: canApply ? BLUE_ACTION : "#21262d",
                border: "none",
                borderRadius: 6,
                color: canApply ? "#e6edf3" : TEXT_DIM,
                fontSize: 13,
                fontWeight: 600,
                cursor: canApply ? "pointer" : "not-allowed",
                fontFamily: FONT,
              }}
            >
              Add {currentChar}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              aria-label={`Skip ${currentChar}`}
              style={{
                background: "transparent",
                border: "none",
                color: TEXT_DIM,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: FONT,
                padding: "4px 8px",
                textDecoration: "underline",
              }}
            >
              Skip this character
            </button>
          </div>
        </>
      )}

      {/* Added chip row — characters already configured, removable */}
      {coveredChars.size > 0 && (
        <div>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              color: TEXT_DIM,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Added
          </p>
          <div
            role="group"
            aria-label="Added characters — click to remove"
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {[...coveredChars].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleRemoveCovered(c)}
                aria-label={`Remove ${cpStr(c)} ${c}`}
                title={`${cpStr(c)} — click to remove`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: "#0d2218",
                  border: "1px solid #238636",
                  borderRadius: 16,
                  color: "#56d364",
                  fontSize: 13,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  lineHeight: 1.3,
                }}
              >
                {c}
                <span
                  aria-hidden="true"
                  style={{ fontSize: 11, color: "#56d364", opacity: 0.7 }}
                >
                  &times;
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Already on this keyboard — collapsed by default */}
      {alreadyProduced.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 12,
          }}
        >
          <button
            type="button"
            aria-expanded={alreadyExpanded}
            aria-controls="already-produced-chars"
            onClick={() => setAlreadyExpanded((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: TEXT_DIM,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: FONT,
              padding: 0,
            }}
          >
            {alreadyExpanded ? "Hide" : "Show"} {alreadyProduced.length}{" "}
            characters already covered &#9658;
          </button>

          {alreadyExpanded && (
            <div
              id="already-produced-chars"
              role="list"
              aria-label={`${alreadyProduced.length} characters already produced by the base keyboard`}
              style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}
            >
              {alreadyProduced.map((char) => (
                <span
                  key={char}
                  role="listitem"
                  title={`${cpStr(char)} — already produced by base keyboard`}
                  aria-label={`${cpStr(char)} ${char} — base keyboard`}
                  style={{
                    padding: "2px 6px",
                    background: BG_PAGE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: TEXT_DIM,
                    opacity: 0.7,
                  }}
                >
                  {char}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Load error for patterns (non-blocking; preview won't show transform) */}
      {loadError !== null && (
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
          Pattern load error — preview transform may be incomplete.
          <br />
          <span style={{ fontSize: 11, color: TEXT_DIM }}>{loadError}</span>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Two-pane layout
  // ---------------------------------------------------------------------------

  return (
    <div
      style={{
        ...pageStyle,
        display: "flex",
        flexDirection: "row",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* LEFT pane */}
      <div
        style={{
          flexBasis: "45%",
          flexShrink: 0,
          borderRight: `1px solid ${BORDER}`,
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        {leftContent}
      </div>

      {/* RIGHT pane */}
      <div
        style={{
          flexGrow: 1,
          overflowY: "auto",
          padding: "24px 20px",
          boxSizing: "border-box",
        }}
      >
        {!loading && loadError === null ? (
          <GalleryPreviewWithPatterns
            selectedBaseKeyboard={selectedBaseKeyboard}
            patternMap={patternMap}
          />
        ) : loading ? (
          <p style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
            Loading patterns...
          </p>
        ) : null}
      </div>
    </div>
  );
}
