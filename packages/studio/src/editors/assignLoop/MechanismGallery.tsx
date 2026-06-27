// TODO(P4a shell extraction): MechanismGallery and TouchGallery share a
// two-pane header+left+right shell. Extract AssignLoopShell.tsx (surface-
// parameterized) with separate physicalBehavior.ts / touchBehavior.ts in P4b.
// Kept as separate components here because the behavior divergence (modality,
// VFS transform, lint panel, navigation stack) is deep enough to warrant a
// dedicated extraction pass rather than risking a behavior diff in P4a.

// MechanismGallery — Phase C "add a key" flow (two-pane redesign).
//
// On first entry a brief intro splash orients the author to the desktop
// authoring flow; "Get started" dismisses it for the rest of the working-copy
// session (persisted via the galleryIntrosSeen store flag).
//
// LEFT pane: one-character-at-a-time assignment loop.
//   - Walks lettersToAdd in order; the first uncovered+unskipped char is current.
//   - Offers up to four methods:
//       S-03 (sequence) — always shown
//       S-02 (deadkey)  — only for decomposable accented letters
//       S-01 (swap)     — always shown; user picks a physical key
//       S-08 (ralt)     — always shown; user picks a base key for RAlt+key
//   - "Add key" records a MechanismAssignment(scope:"individual") and auto-advances.
//   - "Skip" advances without recording (skipped chars count toward Done gate).
//   - Done when every char in lettersToAdd is either covered or skipped.
//
// RIGHT pane: GalleryPreviewWithPatterns — live OSK preview, unchanged.
//
// Contract shapes: see packages/contracts/src/assignmentMap.ts
// Pattern IDs/strategyIds: multi_char_sequence (S-03),
//                           deadkey_single_tap (S-02),
//                           simple_swap (S-01),
//                           modifier_as_layer_switch (S-08)
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
  MechanismAssignment,
  PlacementMap,
} from "@keyboard-studio/contracts";
import { toUPlusNotation, isDecomposableAccented } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getPatternLibraryService } from "../../lib/services.ts";
import type { DiscoveryAxisVector } from "@keyboard-studio/contracts";
import { useKeyboardArtifact, type ScaffoldSpec, type Stage } from "../../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { useInventoryDiff } from "../../hooks/useInventoryDiff.ts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import { getSuggestionForChar } from "../../survey/placementSeeds.ts";
import { KEY_OPTIONS, ALL_PICKABLE_KEYS } from "../../lib/keyOptions.ts";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Pattern IDs as they exist in the browser pattern library (content/patterns/).
// These MUST match the `id:` fields in the YAML — a mismatch means getById()
// returns undefined, the assignment can't resolve, and the live preview never
// reflects the added key.
export const PATTERN_SEQUENCE = "multi_char_sequence"; // S-03
export const PATTERN_DEADKEY = "deadkey_single_tap"; // S-02
export const PATTERN_SWAP = "simple_swap"; // S-01
export const PATTERN_RALT = "modifier_as_layer_switch"; // S-08

function methodLabel(ref: { patternId: string; slotValues?: Record<string, string> }): string {
  const sv = ref.slotValues ?? {};
  switch (ref.patternId) {
    case "multi_char_sequence":
      return `Sequence: ${sv["firstLetterOut"] ?? "?"}+${sv["secondLetter"] ?? "?"}`;
    case "deadkey_single_tap":
      return `Deadkey: ${sv["triggerKey"] ?? "?"} + ${sv["baseLetters"] ?? "?"}`;
    case "simple_swap":
      return `Key: ${(sv["kmnRules"] ?? "").replace(/^\+ \[/, "").replace(/\].*/, "")}`;
    case "modifier_as_layer_switch":
      return `RAlt: ${(sv["altgrKeyList"] ?? "").split(" ").pop()?.replace(/^\[/, "").replace(/\]$/, "") ?? "?"}`;
    default:
      return ref.patternId;
  }
}

// Maps each DEADKEY_OPTIONS key value to the unshifted character it produces.
// Used to derive a deadkey ID matching the sil_cameroon_qwerty convention
// (dk ID = Unicode codepoint of the trigger key's character, e.g. dk(003b) for `;`).
const TRIGGER_KEY_CHARS: Record<string, string> = {
  "K_LBRKT":   "[", // left bracket [
  "K_RBRKT":   "]", // right bracket ]
  "K_BKQUOTE": "`", // backtick `
  "K_COLON":   ";", // semicolon ;
};

/**
 * Returns the hex deadkey ID for a given trigger key, following the convention
 * used in sil_cameroon_qwerty: `dk(003b)` for `;`, `dk(0027)` for `'`, etc.
 * Matches the character the key produces (unshifted) on US QWERTY.
 */
function deadkeyNameFor(triggerKey: string): string {
  const char = TRIGGER_KEY_CHARS[triggerKey];
  if (char !== undefined) {
    return char.codePointAt(0)!.toString(16).padStart(4, "0");
  }
  // Fallback: unknown key — use a generic ID.
  return "dead0";
}

// ---------------------------------------------------------------------------
// GalleryPreviewWithPatterns — right pane
//
// The compile pipeline (useKeyboardArtifact + useWorkingCopyTransform) is
// owned by MechanismGallery and passed in as props. During Phase C the outer
// SurveyView's useKeyboardArtifact hook is still mounted (React hooks cannot
// be conditional) but its OSK preview section is NOT rendered (SurveyView
// returns MechanismGallery full-screen). To avoid two concurrent WASM compiles
// for the same keyboard, MechanismGallery owns the single live pipeline and
// passes the resulting stage + retry down here. This satisfies the
// single-artifact invariant (decision D3 / spec §8).
// ---------------------------------------------------------------------------

interface GalleryPreviewWithPatternsProps {
  selectedBaseKeyboard: BaseKeyboard;
  stage: Stage;
  retry: () => void;
  onKeyTap?: (keyId: string) => void;
}

function GalleryPreviewWithPatterns({
  selectedBaseKeyboard,
  stage,
  retry,
  onKeyTap,
}: GalleryPreviewWithPatternsProps) {
  return (
    <GalleryPreviewPane
      baseKeyboard={selectedBaseKeyboard}
      stage={stage}
      retry={retry}
      {...(onKeyTap !== undefined ? { onKeyTap } : {})}
      defaultOskMode="desktop"
      heading="Live preview"
      warningLabel="Apply warnings:"
    />
  );
}

// ---------------------------------------------------------------------------
// MethodChooser — S-03 / S-02 / S-01 / S-08 single-card selection + inline config
// ---------------------------------------------------------------------------

type Method = "sequence" | "deadkey" | "swap" | "ralt";

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
  deadkeyBaseLetter: string;
  onDeadkeyBaseLetterChange: (v: string) => void;
  selectedSwapKey: string;
  onSwapKeyChange: (v: string) => void;
  selectedRaltKey: string;
  onRaltKeyChange: (v: string) => void;
}

const DEADKEY_OPTIONS = [
  { value: "K_COLON",   label: "K_COLON (semicolon ;)" },
  { value: "K_LBRKT",   label: "K_LBRKT (left bracket [)" },
  { value: "K_RBRKT",   label: "K_RBRKT (right bracket ])" },
  { value: "K_BKQUOTE", label: "K_BKQUOTE (backtick `)" },
] as const;

// Module-level Sets for O(1) membership checks in handleKeyTap.
// ALL_PICKABLE_KEYS is imported from keyOptions.ts.
const VALID_DEADKEY_TRIGGER_KEYS: ReadonlySet<string> = new Set(
  DEADKEY_OPTIONS.map((o) => o.value),
);

const selectStyle: CSSProperties = {
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_MAIN,
  fontSize: 12,
  padding: "4px 8px",
  fontFamily: FONT,
};

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
  deadkeyBaseLetter,
  onDeadkeyBaseLetterChange,
  selectedSwapKey,
  onSwapKeyChange,
  selectedRaltKey,
  onRaltKeyChange,
}: MethodChooserProps) {

  // Each method is one card: transparent header button + inline config when selected.
  const cardStyle = (active: boolean): CSSProperties => ({
    borderRadius: 8,
    border: `1px solid ${active ? ACCENT : BORDER}`,
    background: active ? "#0d2840" : BG_PAGE,
    overflow: "hidden",
    transition: "border-color 120ms ease, background 120ms ease",
  });

  const headerBtnStyle: CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    background: "transparent",
    border: "none",
    color: TEXT_MAIN,
    fontSize: 13,
    fontFamily: FONT,
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const configStyle: CSSProperties = {
    padding: "0 14px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        How to type it:
      </p>

      {/* S-03 — always shown */}
      <div style={cardStyle(method === "sequence")}>
        <button
          type="button"
          aria-pressed={method === "sequence"}
          onClick={() => onMethodChange("sequence")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "sequence" ? ACCENT : TEXT_MAIN }}>
            Type a sequence
          </span>
          {method !== "sequence" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Two keys in a row produce {currentChar}
            </span>
          )}
        </button>
        {method === "sequence" && (
          <div style={configStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
                Type these two keys:
              </span>
              <input
                type="text"
                value={seqFirst}
                onChange={(e) => onSeqFirstChange(e.target.value)}
                aria-label="First key in sequence"
                maxLength={2}
                style={inputStyle}
              />
              <span style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>then</span>
              <input
                type="text"
                value={seqSecond}
                onChange={(e) => onSeqSecondChange(e.target.value)}
                aria-label="Second key in sequence"
                maxLength={2}
                style={inputStyle}
              />
              <span style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
                &rarr;{" "}
                <span style={{ color: TEXT_MAIN, fontFamily: "monospace", fontSize: 16 }}>
                  {currentChar}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* S-02 — always shown */}
      <div style={cardStyle(method === "deadkey")}>
        <button
          type="button"
          aria-pressed={method === "deadkey"}
          onClick={() => onMethodChange("deadkey")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "deadkey" ? ACCENT : TEXT_MAIN }}>
            Tap a trigger key, then a letter
          </span>
          {method !== "deadkey" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Trigger &rarr;{" "}
              {deadkeyBaseLetter || "[base]"} &rarr;{" "}
              {currentChar}
            </span>
          )}
        </button>
        {method === "deadkey" && (
          <div style={configStyle}>
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
                style={selectStyle}
              >
                {DEADKEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
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
              Base letter:
              <input
                type="text"
                value={deadkeyBaseLetter}
                onChange={(e) => onDeadkeyBaseLetterChange(e.target.value)}
                aria-label="Base letter for deadkey"
                maxLength={2}
                style={inputStyle}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              Press {triggerKey}, then{" "}
              {deadkeyBaseLetter || "[base letter]"} &rarr;{" "}
              <span style={{ fontFamily: "monospace", color: TEXT_MAIN, fontSize: 16 }}>{currentChar}</span>
            </p>
          </div>
        )}
      </div>

      {/* S-01 — always shown */}
      <div style={cardStyle(method === "swap")}>
        <button
          type="button"
          aria-pressed={method === "swap"}
          onClick={() => onMethodChange("swap")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "swap" ? ACCENT : TEXT_MAIN }}>
            Assign to a key
          </span>
          {method !== "swap" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Dedicate one physical key to produce {currentChar}
            </span>
          )}
        </button>
        {method === "swap" && (
          <div style={configStyle}>
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
              Key:
              <select
                value={selectedSwapKey}
                onChange={(e) => onSwapKeyChange(e.target.value)}
                aria-label="Physical key for simple swap"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* S-08 — always shown */}
      <div style={cardStyle(method === "ralt")}>
        <button
          type="button"
          aria-pressed={method === "ralt"}
          onClick={() => onMethodChange("ralt")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "ralt" ? ACCENT : TEXT_MAIN }}>
            RAlt + key
          </span>
          {method !== "ralt" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Hold RAlt and press a base key to get {currentChar}
            </span>
          )}
        </button>
        {method === "ralt" && (
          <div style={configStyle}>
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
              Base key:
              <select
                value={selectedRaltKey}
                onChange={(e) => onRaltKeyChange(e.target.value)}
                aria-label="Base key for RAlt layer"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 11, color: "#d29922", fontFamily: FONT }}>
              Note: RAlt may conflict with system shortcuts on macOS.
            </p>
          </div>
        )}
      </div>
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
  /**
   * Optional kbgen placement map. When supplied, MechanismGallery shows a
   * suggestion row above the method chooser for any character that has a
   * qualifying placement candidate (confidence >= default threshold).
   * No kbgen data => no row; gallery behaves exactly as today.
   */
  placementMap?: PlacementMap;
}

export function MechanismGallery({
  selectedBaseKeyboard,
  onComplete,
  onBack,
  placementMap,
}: MechanismGalleryProps) {
  const locked = useWorkingCopyStore((s) => s.desktopLocked);
  const recordAssignments = useWorkingCopyStore((s) => s.recordAssignments);
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const axes = useWorkingCopyStore(
    useShallow((s) => s.session.axes as Partial<DiscoveryAxisVector>),
  );

  // One-time intro splash — read the seen flag on mount; mark it on "Get started".
  const mechIntroSeen = useWorkingCopyStore((s) => s.galleryIntrosSeen.mechanism);
  const markGalleryIntroSeen = useWorkingCopyStore((s) => s.markGalleryIntroSeen);

  const { lettersToAdd } = useInventoryDiff();

  // Read Phase C assignments directly (not the merged session.assignments view)
  // so multiple methods per character are preserved.
  const sessionAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical",
      ),
    [phaseResults],
  );

  // The covered set: chars in lettersToAdd that have at least one assignment.
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

  // Skipped chars — tracked in local state; count toward Done gate.
  const [skippedChars, setSkippedChars] = useState<Set<string>>(new Set());

  // One-time intro splash — shown on first entry to the desktop gallery so the
  // move into the authoring flow is explicit. The store flag persists "seen"
  // across unmount/remount (e.g. navigating to the touch gallery and back), so
  // it shows once and not again.
  const [showIntro, setShowIntro] = useState(() => !mechIntroSeen);

  // currentChar: explicit state — does NOT auto-advance when a method is applied.
  // Only advances when the user clicks "Next character →" or "Skip".
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const lettersKey = lettersToAdd.join("\0");
  useEffect(() => {
    setCurrentChar((prev) => {
      // Keep current char if it's still in the list (e.g., inventory refresh).
      if (prev !== null && lettersToAdd.includes(prev)) return prev;
      // Pick the first uncovered+unskipped char, or the very first if all covered.
      return (
        lettersToAdd.find(
          (c) => !coveredChars.has(c) && !skippedChars.has(c),
        ) ??
        lettersToAdd[0] ??
        null
      );
    });
    // Intentionally omit coveredChars/skippedChars — only re-run when the
    // inventory list itself changes, not when methods are applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettersKey]);

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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBaseKeyboard === null) {
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
        // Load ranked patterns PLUS all four methods the add-a-key UI offers.
        // Axis-based ranking may exclude off-strategy patterns, so load them
        // explicitly so the preview transform can always resolve an applied
        // assignment.
        const ids = new Set<string>(ranked.map((m) => m.patternId));
        ids.add(PATTERN_SEQUENCE);
        ids.add(PATTERN_DEADKEY);
        ids.add(PATTERN_SWAP);
        ids.add(PATTERN_RALT);
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
  // Keyboard artifact pipeline — owns the single WASM compile for Phase C.
  //
  // MechanismGallery is rendered full-screen (SurveyView returns early at
  // stage === "mechanisms"). SurveyView's useKeyboardArtifact hook remains
  // mounted but its OSK output section is not rendered. To prevent two
  // concurrent WASM compiles we own the pipeline here and pass stage+retry
  // down to GalleryPreviewWithPatterns as props (single-artifact invariant).
  // ---------------------------------------------------------------------------

  const identity = useWorkingCopyStore((s) => s.identity);
  const galleryScaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );
  const galleryVfsTransform = useWorkingCopyTransform({ patternMap });
  const { stage: artifactStage, retry: artifactRetry } = useKeyboardArtifact(
    selectedBaseKeyboard,
    galleryScaffoldSpec,
    galleryVfsTransform,
  );

  // ---------------------------------------------------------------------------
  // Per-char method state — reset when currentChar changes
  // ---------------------------------------------------------------------------

  const [method, setMethod] = useState<Method>("sequence");
  const [seqFirst, setSeqFirst] = useState("");
  const [seqSecond, setSeqSecond] = useState("");
  const [triggerKey, setTriggerKey] = useState("K_COLON");
  const [deadkeyBaseLetter, setDeadkeyBaseLetter] = useState("");
  const [selectedSwapKey, setSelectedSwapKey] = useState("");
  const [selectedRaltKey, setSelectedRaltKey] = useState("");

  // kbgen placement suggestion for the current character (null when no map or
  // no qualifying candidate). Memoized against currentChar + placementMap so it
  // only recomputes on actual input changes, not on unrelated re-renders.
  const suggestion = useMemo(
    (): PlacementSeedEntry | null =>
      placementMap !== undefined && currentChar !== null
        ? getSuggestionForChar(currentChar, placementMap)
        : null,
    [currentChar, placementMap],
  );

  // Whether the author has dismissed the suggestion row for the current char.
  // Reset to false whenever currentChar changes (see effect below).
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // ---------------------------------------------------------------------------
  // Method-input reset — called after apply or suggestion accept
  // ---------------------------------------------------------------------------

  const resetMethodState = useCallback(() => {
    setMethod("sequence");
    setSeqFirst("");
    setSeqSecond("");
    setTriggerKey("K_COLON");
    setDeadkeyBaseLetter("");
    setSelectedSwapKey("");
    setSelectedRaltKey("");
  }, []);

  // Reset inputs whenever currentChar changes.
  useEffect(() => {
    setSuggestionDismissed(false);
    resetMethodState();
    if (currentChar !== null && isDecomposableAccented(currentChar)) {
      // §3c defaults-first: for a decomposable accented letter the natural method
      // is deadkey (S-02) — propose-then-confirm. resetMethodState sets "sequence"
      // unconditionally, so override here after the reset.
      setDeadkeyBaseLetter([...currentChar.normalize("NFD")][0] ?? "");
      setMethod("deadkey");
    }
  }, [currentChar, resetMethodState]);

  // ---------------------------------------------------------------------------
  // Suggestion row handlers
  // ---------------------------------------------------------------------------

  // Accept: immediately apply the suggested assignment (same logic as handleApply
  // for swap/ralt, but using the candidate's vkey directly to avoid the async
  // state-update window that would occur if we pre-filled pickers first).
  const handleSuggestionAccept = useCallback(() => {
    if (suggestion === null || currentChar === null) return;
    const { vkey } = suggestion.topCandidate;
    let assignment: MechanismAssignment;
    if (suggestion.strategyId === "S-01") {
      const cp = currentChar.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "0000";
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_SWAP, strategyId: "S-01", slotValues: { kmnRules: `+ [${vkey}] > U+${cp}` } }],
        source: "user",
      };
    } else if (suggestion.strategyId === "S-08") {
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_RALT, strategyId: "S-08", slotValues: { altgrKeyList: `[RALT ${vkey}]`, altgrOutputList: currentChar } }],
        source: "user",
      };
    } else {
      setSuggestionDismissed(true);
      console.warn(`[MechanismGallery] handleSuggestionAccept: unrecognised strategyId "${suggestion.strategyId}" — dismissing suggestion`);
      return;
    }
    recordAssignments([...sessionAssignments, assignment]);
    setSuggestionDismissed(true);
    resetMethodState();
  }, [suggestion, currentChar, sessionAssignments, recordAssignments, resetMethodState]);

  // Change: dismiss the suggestion row; pickers stay blank for manual selection.
  const handleSuggestionChange = useCallback(() => {
    setSuggestionDismissed(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Apply action
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "sequence") {
      // Both must be single graphemes (non-empty).
      return seqFirst.trim().length > 0 && seqSecond.trim().length > 0;
    }
    if (method === "swap") {
      return selectedSwapKey !== "";
    }
    if (method === "ralt") {
      return selectedRaltKey !== "";
    }
    // deadkey: triggerKey always has a value; base letter must be non-empty.
    return deadkeyBaseLetter.trim().length > 0;
  }, [currentChar, method, seqFirst, seqSecond, deadkeyBaseLetter, selectedSwapKey, selectedRaltKey]);

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
    } else if (method === "deadkey") {
      const base = deadkeyBaseLetter.trim();
      // accentChar: the character emitted when the trigger key is pressed twice.
      // Always use the trigger key's literal character (e.g. ';' for K_COLON)
      // so that pressing trigger+trigger escapes back to the bare character.
      const accentChar = TRIGGER_KEY_CHARS[triggerKey] ?? "";
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
              deadkeyName: deadkeyNameFor(triggerKey),
              baseLetters: base,
              accentedForms: currentChar,
              accentChar,
            },
          },
        ],
        source: "user",
      };
    } else if (method === "swap") {
      // S-01: simple_swap — kmnFragment uses {{kmnRules}}.
      // Build the single KMN rule for this character: `+ [K_X] > U+XXXX`.
      const cp = currentChar.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "0000";
      const kmnRules = `+ [${selectedSwapKey}] > U+${cp}`;
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SWAP,
            strategyId: "S-01",
            slotValues: {
              kmnRules,
            },
          },
        ],
        source: "user",
      };
    } else {
      // method === "ralt"
      // S-08: modifier_as_layer_switch — kmnFragment uses {{altgrKeyList}} and {{altgrOutputList}}.
      // Build a single-entry held-layer rule for this character.
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_RALT,
            strategyId: "S-08",
            slotValues: {
              altgrKeyList: `[RALT ${selectedRaltKey}]`,
              altgrOutputList: currentChar,
            },
          },
        ],
        source: "user",
      };
    }

    recordAssignments([...sessionAssignments, assignment]);
    resetMethodState();
  }, [
    currentChar,
    canApply,
    method,
    seqFirst,
    seqSecond,
    triggerKey,
    deadkeyBaseLetter,
    selectedSwapKey,
    selectedRaltKey,
    recordAssignments,
    sessionAssignments,
    resetMethodState,
  ]);

  // How many methods have already been applied to the current character.
  const appliedForCurrentChar = useMemo(
    () =>
      sessionAssignments.filter(
        (a) => a.scope === "individual" && a.target === currentChar,
      ).length,
    [sessionAssignments, currentChar],
  );
  const canGoNext = appliedForCurrentChar > 0;

  const handleNext = useCallback(() => {
    if (currentChar === null) return;
    const idx = lettersToAdd.indexOf(currentChar);
    const next =
      lettersToAdd
        .slice(idx + 1)
        .find((c) => !coveredChars.has(c) && !skippedChars.has(c)) ??
      lettersToAdd
        .slice(0, idx)
        .find((c) => !coveredChars.has(c) && !skippedChars.has(c)) ??
      null;
    // When no uncovered+unskipped char remains, explicitly land on null so the
    // "All done" branch (currentChar === null && isDone) becomes visible.
    setCurrentChar(next);
  }, [currentChar, lettersToAdd, coveredChars, skippedChars]);

  const canGoBack = useMemo(() => {
    if (currentChar === null) return false;
    return lettersToAdd.indexOf(currentChar) > 0;
  }, [currentChar, lettersToAdd]);

  const handleBack = useCallback(() => {
    if (currentChar === null) return;
    const idx = lettersToAdd.indexOf(currentChar);
    if (idx <= 0) return;
    setCurrentChar(lettersToAdd[idx - 1] ?? null);
  }, [currentChar, lettersToAdd]);

  const handleSkip = useCallback(() => {
    if (currentChar === null) return;
    setSkippedChars((prev) => new Set([...prev, currentChar]));
    const idx = lettersToAdd.indexOf(currentChar);
    const next =
      lettersToAdd
        .slice(idx + 1)
        .find(
          (c) =>
            !coveredChars.has(c) &&
            !skippedChars.has(c) &&
            c !== currentChar,
        ) ??
      lettersToAdd
        .slice(0, idx)
        .find(
          (c) =>
            !coveredChars.has(c) &&
            !skippedChars.has(c) &&
            c !== currentChar,
        ) ??
      null;
    setCurrentChar(next);
  }, [currentChar, lettersToAdd, coveredChars, skippedChars]);

  const handleRemoveCovered = useCallback(
    (char: string) => {
      const next = sessionAssignments.filter(
        (a) => !(a.scope === "individual" && a.target === char),
      );
      recordAssignments(next);
    },
    [sessionAssignments, recordAssignments],
  );

  const handleRemoveMechanism = useCallback(
    (assignment: MechanismAssignment) => {
      recordAssignments(sessionAssignments.filter((a) => a !== assignment));
    },
    [sessionAssignments, recordAssignments],
  );

  const handleKeyTap = useCallback(
    (keyId: string) => {
      if (locked) return;
      if (method === "swap" && ALL_PICKABLE_KEYS.has(keyId)) {
        setSelectedSwapKey(keyId);
      } else if (method === "ralt" && ALL_PICKABLE_KEYS.has(keyId)) {
        setSelectedRaltKey(keyId);
      } else if (method === "deadkey" && VALID_DEADKEY_TRIGGER_KEYS.has(keyId)) {
        setTriggerKey(keyId);
      }
      // method === "sequence" or unrecognised key: ignore
    },
    [method, locked],
  );

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
  // Intro splash — first entry to the desktop mechanism gallery only
  // ---------------------------------------------------------------------------

  if (showIntro) {
    return (
      <GalleryIntroSplash
        eyebrow="Getting started · Desktop"
        title="Welcome to the Mechanism Gallery"
        body={
          <>
            This is where you build your keyboard. For each character your
            language needs that the base layout doesn&rsquo;t already have,
            you&rsquo;ll choose how to type it on a physical (desktop) keyboard.
          </>
        }
        bullets={[
          <>You&rsquo;ll go character by character through the list from your survey.</>,
          <>
            Pick a method &mdash; type a sequence, use a dead key, swap a key, or
            use AltGr &mdash; or Skip characters you don&rsquo;t need.
          </>,
          <>Phones and tablets come later, in the Touch gallery.</>,
        ]}
        startAriaLabel="Start the mechanism gallery"
        onStart={() => {
          markGalleryIntroSeen("mechanism");
          setShowIntro(false);
        }}
        {...(onBack !== undefined ? { onBack } : {})}
      />
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
      {locked && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: "10px 14px",
            background: "#1a1209",
            border: "1px solid #d29922",
            borderRadius: 6,
            color: "#d29922",
            fontSize: 13,
            fontFamily: FONT,
          }}
        >
          Desktop layout locked — editing disabled
        </div>
      )}
      <>
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

          {/* Locked — always show a forward escape so the user cannot be trapped
              after navigating back from Phase E. Editing is disabled by locked but
              onComplete is always callable. */}
          {locked && onComplete !== undefined && (
            <button
              type="button"
              onClick={onComplete}
              aria-label="Continue to touch layout (desktop layout locked)"
              style={{
                padding: "9px 20px",
                background: BLUE_ACTION,
                border: "none",
                borderRadius: 6,
                color: "#e6edf3",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: FONT,
                alignSelf: "flex-start",
              }}
            >
              Continue to touch layout &rarr;
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

          {lettersToAdd.length > 0 && isDone && currentChar === null && (
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
                    aria-label={`${toUPlusNotation(currentChar)} ${currentChar}`}
                  >
                    {currentChar}
                  </span>
                  <span style={{ fontSize: 13, color: TEXT_DIM }}>
                    {toUPlusNotation(currentChar)}
                  </span>
                </div>
              </div>

              {/* kbgen suggestion row — shown above method chooser when a
                  qualifying placement candidate exists and hasn't been dismissed.
                  [Accept] pre-fills method + key picker; [Change] dismisses the
                  row so the author can select manually. No kbgen data => null =>
                  row is absent and gallery behaves exactly as today. */}
              {suggestion !== null && !suggestionDismissed && (
                <div
                  role="note"
                  aria-label="Placement suggestion from kbgen seeder"
                  style={{
                    background: "#0d2218",
                    border: "1px solid #238636",
                    borderRadius: 8,
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    {(() => {
                      const keyName = suggestion.topCandidate.vkey.replace(/^K_/, "");
                      return suggestion.strategyId === "S-01"
                        ? `Suggested: Replace ${keyName} with ${currentChar ?? ""}`
                        : `Suggested: Right Alt + ${keyName} for ${currentChar ?? ""}`;
                    })()}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={handleSuggestionAccept}
                      aria-label={
                        suggestion.strategyId === "S-01"
                          ? `Accept suggestion: assign ${currentChar} to ${suggestion.topCandidate.vkey}`
                          : `Accept suggestion: RAlt + ${suggestion.topCandidate.vkey} for ${currentChar}`
                      }
                      style={{
                        padding: "5px 14px",
                        background: "#238636",
                        border: "none",
                        borderRadius: 5,
                        color: "#e6edf3",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={handleSuggestionChange}
                      aria-label="Deny suggestion and choose method manually"
                      style={{
                        padding: "5px 14px",
                        background: "transparent",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 5,
                        color: TEXT_DIM,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              )}

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
                deadkeyBaseLetter={deadkeyBaseLetter}
                onDeadkeyBaseLetterChange={setDeadkeyBaseLetter}
                selectedSwapKey={selectedSwapKey}
                onSwapKeyChange={setSelectedSwapKey}
                selectedRaltKey={selectedRaltKey}
                onRaltKeyChange={setSelectedRaltKey}
              />

              {/* Apply + Next + Skip actions */}
              {appliedForCurrentChar > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "#56d364", fontFamily: FONT }}>
                  {appliedForCurrentChar} method{appliedForCurrentChar !== 1 ? "s" : ""} applied
                </p>
              )}
              {appliedForCurrentChar > 0 && (
                <div
                  role="group"
                  aria-label="Applied methods — click to remove"
                  style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}
                >
                  {sessionAssignments
                    .filter((a) => a.scope === "individual" && a.target === currentChar)
                    .map((a, i) => {
                      const ref = a.mechanisms[0];
                      const label = ref !== undefined ? methodLabel(ref) : a.mechanisms.map(methodLabel).join(", ");
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleRemoveMechanism(a)}
                          disabled={locked}
                          aria-label={`Remove method ${label} for ${currentChar}`}
                          title="click to remove"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            background: "#0d2218",
                            border: "1px solid #238636",
                            borderRadius: 12,
                            color: "#56d364",
                            fontSize: 11,
                            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
                            cursor: locked ? "not-allowed" : "pointer",
                          }}
                        >
                          {label}
                          <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>
                            {" ×"}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {canGoBack && (
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label="Go back to previous character"
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
                    &larr; Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canApply || locked}
                  aria-label={`Apply method for ${currentChar}`}
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
                  Apply method
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext || locked}
                  aria-label={
                    isDone && canGoNext
                      ? "All methods applied, finish"
                      : `Next character`
                  }
                  style={{
                    padding: "9px 20px",
                    background: canGoNext ? "#238636" : "#21262d",
                    border: "none",
                    borderRadius: 6,
                    color: canGoNext ? "#e6edf3" : TEXT_DIM,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: canGoNext ? "pointer" : "not-allowed",
                    fontFamily: FONT,
                  }}
                >
                  {isDone && canGoNext ? "All done →" : "Next character →"}
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={locked}
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
                  Skip
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
                    aria-label={`Remove ${toUPlusNotation(c)} ${c}`}
                    title={`${toUPlusNotation(c)} — click to remove`}
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
      </>

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
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: "16px 24px 14px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.05rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
          }}
        >
          Mechanism Gallery
        </h1>
        <span
          style={{
            fontSize: 12,
            color: TEXT_DIM,
            fontFamily: FONT,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Desktop
        </span>
      </div>

      {/* Two-pane row */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
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
              stage={artifactStage}
              retry={artifactRetry}
              onKeyTap={handleKeyTap}
            />
          ) : loading ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
              Loading patterns...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
