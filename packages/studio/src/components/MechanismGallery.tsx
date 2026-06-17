// MechanismGallery — Phase C "add a key" flow (two-pane redesign).
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
const PATTERN_SWAP = "simple_swap"; // S-01
const PATTERN_RALT = "modifier_as_layer_switch"; // S-08

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

// Physical key options for the S-01 and S-08 key selectors.
const KEY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "-- choose a key --" },
  { value: "K_A", label: "K_A (A)" }, { value: "K_B", label: "K_B (B)" },
  { value: "K_C", label: "K_C (C)" }, { value: "K_D", label: "K_D (D)" },
  { value: "K_E", label: "K_E (E)" }, { value: "K_F", label: "K_F (F)" },
  { value: "K_G", label: "K_G (G)" }, { value: "K_H", label: "K_H (H)" },
  { value: "K_I", label: "K_I (I)" }, { value: "K_J", label: "K_J (J)" },
  { value: "K_K", label: "K_K (K)" }, { value: "K_L", label: "K_L (L)" },
  { value: "K_M", label: "K_M (M)" }, { value: "K_N", label: "K_N (N)" },
  { value: "K_O", label: "K_O (O)" }, { value: "K_P", label: "K_P (P)" },
  { value: "K_Q", label: "K_Q (Q)" }, { value: "K_R", label: "K_R (R)" },
  { value: "K_S", label: "K_S (S)" }, { value: "K_T", label: "K_T (T)" },
  { value: "K_U", label: "K_U (U)" }, { value: "K_V", label: "K_V (V)" },
  { value: "K_W", label: "K_W (W)" }, { value: "K_X", label: "K_X (X)" },
  { value: "K_Y", label: "K_Y (Y)" }, { value: "K_Z", label: "K_Z (Z)" },
  { value: "K_0", label: "K_0 (0)" }, { value: "K_1", label: "K_1 (1)" },
  { value: "K_2", label: "K_2 (2)" }, { value: "K_3", label: "K_3 (3)" },
  { value: "K_4", label: "K_4 (4)" }, { value: "K_5", label: "K_5 (5)" },
  { value: "K_6", label: "K_6 (6)" }, { value: "K_7", label: "K_7 (7)" },
  { value: "K_8", label: "K_8 (8)" }, { value: "K_9", label: "K_9 (9)" },
  { value: "K_LBRKT", label: "K_LBRKT ([)" }, { value: "K_RBRKT", label: "K_RBRKT (])" },
  { value: "K_BKSLASH", label: "K_BKSLASH (\\)" }, { value: "K_SEMI", label: "K_SEMI (;)" },
  { value: "K_QUOTE", label: "K_QUOTE (')" }, { value: "K_COMMA", label: "K_COMMA (,)" },
  { value: "K_PERIOD", label: "K_PERIOD (.)" }, { value: "K_SLASH", label: "K_SLASH (/)" },
  { value: "K_BKQUOTE", label: "K_BKQUOTE (`)" },
];

const selectStyle: CSSProperties = {
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#e6edf3",
  fontSize: 12,
  padding: "4px 8px",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
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
}

export function MechanismGallery({
  selectedBaseKeyboard,
  onComplete,
  onBack,
}: MechanismGalleryProps) {
  const recordAssignments = useWorkingCopyStore((s) => s.recordAssignments);
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const axes = useWorkingCopyStore(
    useShallow((s) => s.session.axes as Partial<DiscoveryAxisVector>),
  );

  const { lettersToAdd, alreadyProduced } = useInventoryDiff();

  const [coveredPhase, setCoveredPhase] = useState<"asking" | "decided">(() =>
    alreadyProduced.length > 0 ? "asking" : "decided"
  );
  const [selectedForRemap, setSelectedForRemap] = useState<Set<string>>(new Set());
  const [remapChars, setRemapChars] = useState<string[]>([]);

  useEffect(() => {
    setCoveredPhase(alreadyProduced.length > 0 ? "asking" : "decided");
    setSelectedForRemap(new Set());
    setRemapChars([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBaseKeyboard?.id]);

  const effectiveLettersToAdd = useMemo(
    () => [
      ...lettersToAdd,
      ...remapChars.filter((c) => !lettersToAdd.includes(c)),
    ],
    [lettersToAdd, remapChars],
  );

  // Read Phase C assignments directly (not the merged session.assignments view)
  // so multiple methods per character are preserved.
  const sessionAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical",
      ),
    [phaseResults],
  );

  // The covered set: chars in effectiveLettersToAdd that have at least one assignment.
  const coveredChars = useMemo(
    () =>
      new Set(
        sessionAssignments
          .filter((a) => a.scope === "individual")
          .map((a) => a.target)
          .filter((t) => effectiveLettersToAdd.includes(t)),
      ),
    [sessionAssignments, effectiveLettersToAdd],
  );

  // Skipped chars — tracked in local state; count toward Done gate.
  const [skippedChars, setSkippedChars] = useState<Set<string>>(new Set());

  // currentChar: explicit state — does NOT auto-advance when a method is applied.
  // Only advances when the user clicks "Next character →" or "Skip".
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const lettersKey = effectiveLettersToAdd.join("\0");
  useEffect(() => {
    setCurrentChar((prev) => {
      // Keep current char if it's still in the list (e.g., inventory refresh).
      if (prev !== null && effectiveLettersToAdd.includes(prev)) return prev;
      // Pick the first uncovered+unskipped char, or the very first if all covered.
      return (
        effectiveLettersToAdd.find(
          (c) => !coveredChars.has(c) && !skippedChars.has(c),
        ) ??
        effectiveLettersToAdd[0] ??
        null
      );
    });
    // Intentionally omit coveredChars/skippedChars — only re-run when the
    // inventory list itself changes, not when methods are applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettersKey]);

  // Done = every char in effectiveLettersToAdd is covered or skipped.
  const isDone = useMemo(
    () =>
      effectiveLettersToAdd.length === 0 ||
      effectiveLettersToAdd.every((c) => coveredChars.has(c) || skippedChars.has(c)),
    [effectiveLettersToAdd, coveredChars, skippedChars],
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
  // Per-char method state — reset when currentChar changes
  // ---------------------------------------------------------------------------

  const [method, setMethod] = useState<Method>("sequence");
  const [seqFirst, setSeqFirst] = useState("");
  const [seqSecond, setSeqSecond] = useState("");
  const [triggerKey, setTriggerKey] = useState("K_COLON");
  const [deadkeyBaseLetter, setDeadkeyBaseLetter] = useState("");
  const [selectedSwapKey, setSelectedSwapKey] = useState("");
  const [selectedRaltKey, setSelectedRaltKey] = useState("");

  // Reset inputs whenever currentChar changes.
  useEffect(() => {
    setMethod("sequence");
    setSeqFirst("");
    setSeqSecond("");
    setTriggerKey("K_COLON");
    setSelectedSwapKey("");
    setSelectedRaltKey("");
    if (currentChar !== null && isDecomposableAccented(currentChar)) {
      setDeadkeyBaseLetter([...currentChar.normalize("NFD")][0] ?? "");
    } else {
      setDeadkeyBaseLetter("");
    }
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

    // eslint-disable-next-line no-console
    console.log(`[DIAG:handleApply] recording assignment for "${currentChar}", method=${method}, total=${sessionAssignments.length + 1}`);
    recordAssignments([...sessionAssignments, assignment]);
    // Reset method inputs but stay on currentChar — user must click Next to advance.
    setMethod("sequence");
    setSeqFirst("");
    setSeqSecond("");
    setTriggerKey("K_COLON");
    setDeadkeyBaseLetter("");
    setSelectedSwapKey("");
    setSelectedRaltKey("");
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
    const idx = effectiveLettersToAdd.indexOf(currentChar);
    const next =
      effectiveLettersToAdd
        .slice(idx + 1)
        .find((c) => !coveredChars.has(c) && !skippedChars.has(c)) ??
      effectiveLettersToAdd
        .slice(0, idx)
        .find((c) => !coveredChars.has(c) && !skippedChars.has(c)) ??
      null;
    setCurrentChar(next);
  }, [currentChar, effectiveLettersToAdd, coveredChars, skippedChars]);

  const canGoBack = useMemo(() => {
    if (currentChar === null) return false;
    return effectiveLettersToAdd.indexOf(currentChar) > 0;
  }, [currentChar, effectiveLettersToAdd]);

  const handleBack = useCallback(() => {
    if (currentChar === null) return;
    const idx = effectiveLettersToAdd.indexOf(currentChar);
    if (idx <= 0) return;
    setCurrentChar(effectiveLettersToAdd[idx - 1] ?? null);
  }, [currentChar, effectiveLettersToAdd]);

  const handleSkip = useCallback(() => {
    if (currentChar === null) return;
    setSkippedChars((prev) => new Set([...prev, currentChar]));
    const idx = effectiveLettersToAdd.indexOf(currentChar);
    const next =
      effectiveLettersToAdd
        .slice(idx + 1)
        .find(
          (c) =>
            !coveredChars.has(c) &&
            !skippedChars.has(c) &&
            c !== currentChar,
        ) ??
      effectiveLettersToAdd
        .slice(0, idx)
        .find(
          (c) =>
            !coveredChars.has(c) &&
            !skippedChars.has(c) &&
            c !== currentChar,
        ) ??
      null;
    setCurrentChar(next);
  }, [currentChar, effectiveLettersToAdd, coveredChars, skippedChars]);

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

  const coveredCount = effectiveLettersToAdd.filter((c) => coveredChars.has(c)).length;

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
      {/* Upfront "already covered" phase — ask about remapping before the loop */}
      {coveredPhase === "asking" && alreadyProduced.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_MAIN, fontFamily: FONT }}>
            These characters are already produced by your base keyboard.
            Do you want to remap any to different keys?
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {alreadyProduced.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  setSelectedForRemap((prev) => {
                    const next = new Set(prev);
                    if (next.has(c)) next.delete(c); else next.add(c);
                    return next;
                  })
                }
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${selectedForRemap.has(c) ? ACCENT : BORDER}`,
                  background: selectedForRemap.has(c) ? "#0d2840" : BG_CARD,
                  color: selectedForRemap.has(c) ? ACCENT : TEXT_MAIN,
                  fontSize: 16,
                  fontFamily: "monospace",
                  cursor: "pointer",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setRemapChars([...selectedForRemap]);
              setCoveredPhase("decided");
            }}
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
            {selectedForRemap.size > 0
              ? `Continue (remapping ${selectedForRemap.size})`
              : "Continue (no changes)"}
          </button>
        </div>
      )}

      {coveredPhase === "decided" && (
        <>
          {/* Small coverage line */}
          {effectiveLettersToAdd.length > 0 && (
            <p
              role="status"
              aria-live="polite"
              aria-label={`${coveredCount} of ${effectiveLettersToAdd.length} added`}
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              {coveredCount} of {effectiveLettersToAdd.length} added
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
          {effectiveLettersToAdd.length === 0 && (
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

          {effectiveLettersToAdd.length > 0 && isDone && currentChar === null && (
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
                  role="list"
                  aria-label="Applied methods"
                  style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}
                >
                  {sessionAssignments
                    .filter((a) => a.scope === "individual" && a.target === currentChar)
                    .flatMap((a) => a.mechanisms)
                    .map((ref, i) => (
                      <span
                        key={i}
                        role="listitem"
                        style={{
                          padding: "3px 8px",
                          background: "#0d2218",
                          border: "1px solid #238636",
                          borderRadius: 12,
                          color: "#56d364",
                          fontSize: 11,
                          fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
                        }}
                      >
                        {methodLabel(ref)}
                      </span>
                    ))}
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
                  disabled={!canApply}
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
                  disabled={!canGoNext}
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
        </>
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
