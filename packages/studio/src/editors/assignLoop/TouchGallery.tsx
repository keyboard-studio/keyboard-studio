// TODO(P4a shell extraction): see MechanismGallery.tsx for the extraction note.

// TouchGallery — Phase E "touch mechanisms" flow (character-by-character redesign).
//
// Mirrors MechanismGallery's character-by-character loop — adapted for touch
// modality assignments instead of physical key assignments.
//
// On first entry a brief intro splash explains the move from the desktop
// (physical) gallery to touch; "Get started" dismisses it for the rest of the
// working-copy session.
//
// LEFT pane: one-character-at-a-time iteration over session.confirmedInventory.
//   - When a suggestion applies (long-press / replace / "already in layout"),
//     shows a suggestion card: Accept applies it and advances; Deny shows the
//     method chooser. When there is no suggestion, the method chooser is shown
//     directly (no intermediate card).
//   - Method chooser offers 4 expandable cards (longpress, flick, multitap,
//     replace). "Apply method" + "Next character →" + "Skip" follow
//     MechanismGallery's pattern. There is no manual "already in layout" card:
//     the auto-detected "already" suggestion records inherited characters, and
//     Skip moves on without an assignment.
//   - Done when every character has been either configured or skipped.
//   - Desktop edits are NOT transferred to mobile — the touch layout is
//     seeded from a fixed minimal QWERTY layout, not derived from IR rules.
//
// RIGHT pane: live phone-mode OSK preview.
//   - useKeyboardArtifact + OSKFrame wiring. Runs exclusively in touch mode.
//   - VFS transform injects a minimal hardcoded phone layout when the keyboard
//     has no existing .keyman-touch-layout; existing touch files are left as-is.
//   - "Touch preview" label matches MechanismGallery's "Live preview" label style.
//
// Touch lint (Layer C checks 18.1–18.5) stays below the character cards,
// same position as before.
//
// Single 300 ms debounce contract upheld — no second timer introduced.

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import type { TouchAssignment } from "@keyboard-studio/contracts";
import { createVirtualFS, toUPlusNotation, isDecomposableAccented } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "../../lib/buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { LintSummary } from "../../lint/index.ts";
import { useTouchLint } from "../../hooks/useTouchLint.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec, VfsTransform } from "../../hooks/useKeyboardArtifact.ts";
import { scaffoldTouchLayout } from "@keyboard-studio/engine";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import { KEY_OPTIONS, VALID_HOST_KEYS } from "../../lib/keyOptions.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip K_ prefix from a key id for user-facing display. */
function hostKeyShortLabel(keyId: string): string {
  return keyId.startsWith("K_") ? keyId.slice(2) : keyId;
}

/** Direction code to arrow character. */
function dirArrow(dir: string): string {
  if (dir === "n") return "↑"; // up
  if (dir === "s") return "↓"; // down
  if (dir === "e") return "→"; // right
  if (dir === "w") return "←"; // left
  return dir;
}

/** Produce a human-readable label for a configured TouchAssignment chip. */
function touchMethodLabel(a: TouchAssignment): string {
  const m = a.mechanisms[0];
  if (!m) return a.target;
  const patternId = m.patternId;
  const sv = m.slotValues ?? {};
  const hkShort = sv["hostKey"] ? hostKeyShortLabel(sv["hostKey"]) : "";
  if (patternId === "touch_inherited") return `${a.target} · inherited`;
  if (patternId === "longpress_alternates") return `${a.target} · long-press ${hkShort}`;
  if (patternId === "flick_gestures") {
    const dir = sv["direction"] ?? "";
    return `${a.target} · flick ${hkShort} ${dirArrow(dir)}`.trimEnd();
  }
  if (patternId === "multitap") return `${a.target} · multitap ${hkShort}`;
  if (patternId === "touch_key_replace") return `${a.target} · replace ${hkShort}`;
  return a.target;
}

const selectStyle: CSSProperties = {
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_MAIN,
  fontSize: 12,
  padding: "4px 8px",
  fontFamily: FONT,
};

// ---------------------------------------------------------------------------
// Touch method type
// ---------------------------------------------------------------------------

// Selectable methods in the chooser. `touch_inherited` is intentionally NOT a
// chooser option — inherited characters are recorded via the auto-detected
// "already" suggestion (handleSuggestionAccept), and Skip moves on without an
// assignment. The pattern-apply engine still understands the touch_inherited
// patternId those suggestions produce.
type TouchMethod = "touch_key_replace" | "longpress_alternates" | "flick_gestures" | "multitap";

// ---------------------------------------------------------------------------
// TouchMethodChooser — 4 expandable cards
// ---------------------------------------------------------------------------

interface TouchMethodChooserProps {
  currentChar: string;
  method: TouchMethod;
  onMethodChange: (m: TouchMethod) => void;
  hostKey: string;
  onHostKeyChange: (v: string) => void;
  flickDirection: string;
  onFlickDirectionChange: (v: string) => void;
}

const FLICK_DIRECTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "",  label: "-- choose direction --" },
  { value: "n", label: "Up (north)" },
  { value: "s", label: "Down (south)" },
  { value: "e", label: "Right (east)" },
  { value: "w", label: "Left (west)" },
];

function TouchMethodChooser({
  currentChar,
  method,
  onMethodChange,
  hostKey,
  onHostKeyChange,
  flickDirection,
  onFlickDirectionChange,
}: TouchMethodChooserProps) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        How to reach it on touch:
      </p>

      {/* 1. Long-press on a key */}
      <div style={cardStyle(method === "longpress_alternates")}>
        <button
          type="button"
          aria-pressed={method === "longpress_alternates"}
          onClick={() => onMethodChange("longpress_alternates")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "longpress_alternates" ? ACCENT : TEXT_MAIN }}>
            Long-press on a key
          </span>
          {method !== "longpress_alternates" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Hold a key to reveal {currentChar} as a long-press option.
            </span>
          )}
        </button>
        {method === "longpress_alternates" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key for long-press"
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

      {/* 2. Swipe a key (flick) */}
      <div style={cardStyle(method === "flick_gestures")}>
        <button
          type="button"
          aria-pressed={method === "flick_gestures"}
          onClick={() => onMethodChange("flick_gestures")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "flick_gestures" ? ACCENT : TEXT_MAIN }}>
            Swipe a key (flick)
          </span>
          {method !== "flick_gestures" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Swipe a key in a direction to produce {currentChar}.
            </span>
          )}
        </button>
        {method === "flick_gestures" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key for flick"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
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
              Direction:
              <select
                value={flickDirection}
                onChange={(e) => onFlickDirectionChange(e.target.value)}
                aria-label="Flick direction"
                style={selectStyle}
              >
                {FLICK_DIRECTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* 3. Tap multiple times (multitap) */}
      <div style={cardStyle(method === "multitap")}>
        <button
          type="button"
          aria-pressed={method === "multitap"}
          onClick={() => onMethodChange("multitap")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "multitap" ? ACCENT : TEXT_MAIN }}>
            Tap multiple times (multitap)
          </span>
          {method !== "multitap" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Tap a key rapidly more than once to reach {currentChar}.
            </span>
          )}
        </button>
        {method === "multitap" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key for multitap"
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

      {/* 4. Replace a key */}
      <div style={cardStyle(method === "touch_key_replace")}>
        <button
          type="button"
          aria-pressed={method === "touch_key_replace"}
          onClick={() => onMethodChange("touch_key_replace")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "touch_key_replace" ? ACCENT : TEXT_MAIN }}>
            Replace a key
          </span>
          {method !== "touch_key_replace" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Make a key type {currentChar} directly on the touch keyboard.
            </span>
          )}
        </button>
        {method === "touch_key_replace" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key to replace"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
              Make a key type {currentChar} directly on the touch keyboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// TouchPreviewPane is now GalleryPreviewPane (shared component) — see GalleryPreviewPane.tsx.

// ---------------------------------------------------------------------------
// TouchGallery — main component
// ---------------------------------------------------------------------------

export interface TouchGalleryProps {
  onComplete: (assignments: TouchAssignment[]) => void;
  /**
   * Called when the user clicks Back on the very first character (or from the
   * empty-inventory guard). Should navigate back to Phase C ("mechanisms").
   * Phase C will be in its locked/read-only state — no unlock is performed.
   */
  onBack: () => void;
}

export function TouchGallery({ onComplete, onBack }: TouchGalleryProps) {
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  // Character inventory — same source MechanismGallery uses.
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);

  // Draft persistence — read on mount; write on every charTouch/skippedChars change.
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);
  const setTouchDraft = useWorkingCopyStore((s) => s.setTouchDraft);

  // One-time intro splash — read the seen flag on mount; mark it on "Get started".
  const touchIntroSeen = useWorkingCopyStore((s) => s.galleryIntrosSeen.touch);
  const markGalleryIntroSeen = useWorkingCopyStore((s) => s.markGalleryIntroSeen);

  // Derive keyboardId from identity (Track 1) or baseKeyboard (Track 2).
  const keyboardId = identity?.keyboardId ?? baseKeyboard?.id ?? null;

  // ---------------------------------------------------------------------------
  // Live OSK preview — right pane wiring
  // ---------------------------------------------------------------------------

  const scaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );

  // ---------------------------------------------------------------------------
  // Per-character touch assignment state (declared early — memos below depend on it)
  // ---------------------------------------------------------------------------

  // Local map of explicitly-configured characters: char -> TouchAssignment.
  // Rehydrated from the store draft on mount so back-navigation from Phase C
  // preserves work already done in Phase E.
  const [charTouch, setCharTouch] = useState<Map<string, TouchAssignment>>(() =>
    touchDraft !== null
      ? new Map(touchDraft.charTouchEntries)
      : new Map(),
  );

  // Stable primitive key serializing the current charTouch map so useMemo fires
  // exactly when the author's edits change (mirrors assignmentsKey in
  // useWorkingCopyTransform.ts lines ~100-111 — same pattern, different source).
  const touchKey = useMemo(
    () =>
      [...charTouch.values()]
        .map(
          (a) =>
            `${a.target}:${a.mechanisms
              .map((m) => `${m.patternId}/${JSON.stringify(m.slotValues ?? {})}`)
              .join(",")}`,
        )
        .join("|"),
    [charTouch],
  );

  // Build applied touch layout JSON only when the author has made real (non-inherited)
  // touch edits. When there are no such edits, return null so the VFS is left
  // untouched and KMW renders its own polished native default (or the keyboard's
  // shipped .keyman-touch-layout file is used verbatim).
  //
  // "Real edit" = at least one assignment whose patternId !== "touch_inherited".
  // This filter matches handleContinue exactly (the single source of truth).
  const touchLayoutJson = useMemo(() => {
    const appliedEdits = [...charTouch.values()].filter(
      (a) => a.mechanisms[0]?.patternId !== "touch_inherited",
    );
    if (appliedEdits.length === 0) return null;
    if (baseIr === null) return null;
    // Case B: base ships a touch layout → apply faithfully onto raw JSON copy.
    // Case A: no shipped touch layout (or baseVfs not yet loaded) → IR-based path.
    return buildTouchLayoutJson(baseIr, appliedEdits, resolveBaseTouchJson(baseVfs)).json;
    // touchKey drives re-evaluation when charTouch changes (Map identity is
    // not stable; the key is). baseIr is a stable snapshot post-lockDesktop.
    // baseVfs is stable after instantiation but included for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, touchKey, baseVfs]);

  // VFS transform: inject the generated touch layout only when the author has
  // made real (non-inherited) touch edits. When touchLayoutJson is null — either
  // because no real edits exist or because the emit pipeline failed — leave the
  // VFS untouched so KMW renders its own polished native default (or the
  // keyboard's shipped .keyman-touch-layout file is used verbatim).
  const vfsTransform = useMemo<VfsTransform>(
    () => (vfs, kbId) => {
      if (touchLayoutJson !== null) {
        vfs.set(`source/${kbId}.keyman-touch-layout`, touchLayoutJson);
      }
      return { warnings: [] };
    },
    [touchLayoutJson],
  );

  const { stage, retry } = useKeyboardArtifact(baseKeyboard, scaffoldSpec, vfsTransform);

  // Skipped characters. Rehydrated from store draft on mount.
  const [skippedChars, setSkippedChars] = useState<Set<string>>(() =>
    touchDraft !== null
      ? new Set(touchDraft.skippedChars)
      : new Set(),
  );

  // Visited-character history stack (most-recently-visited at the end).
  // Populated by forward navigation; popped by the Back handler.
  // Using a history stack rather than index-1 arithmetic because the per-char
  // loop uses wrap-around logic (advanceToNext can skip already-configured chars),
  // so the actual sequence visited is not simply inventory[i-1].
  const [charHistory, setCharHistory] = useState<string[]>([]);

  // Intro splash — shown once when the author first enters the touch gallery so
  // the move from the desktop (physical) gallery to touch is explicit. The
  // store flag persists "seen" across unmount/remount, so the intro shows once
  // and not again on back-and-forth navigation to Phase C.
  const [showIntro, setShowIntro] = useState(() => !touchIntroSeen);

  // Write charTouch + skippedChars back to the store draft whenever they change
  // so that back-navigation (unmount) preserves in-progress work.
  useEffect(() => {
    setTouchDraft({
      charTouchEntries: [...charTouch.entries()],
      skippedChars: [...skippedChars],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charTouch, skippedChars]);

  // Current character index.
  const [currentChar, setCurrentChar] = useState<string | null>(null);

  // Sync currentChar when inventory loads or changes.
  const inventoryKey = inventory.join("\0");
  useEffect(() => {
    setCurrentChar((prev) => {
      if (inventory.length === 0) return null;
      // Keep current char if it's still in the list.
      if (prev !== null && inventory.includes(prev)) return prev;
      // Pick the first unconfigured+unskipped char.
      return (
        inventory.find((c) => !charTouch.has(c) && !skippedChars.has(c)) ??
        inventory[0] ??
        null
      );
    });
    // Only re-run when the inventory list itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryKey]);

  // Done = every char is configured or skipped.
  const isDone = useMemo(
    () =>
      inventory.length > 0 &&
      inventory.every((c) => charTouch.has(c) || skippedChars.has(c)),
    [inventory, charTouch, skippedChars],
  );

  // ---------------------------------------------------------------------------
  // Phase C desktop assignments + detected-chars from scaffoldTouchLayout
  // ---------------------------------------------------------------------------

  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);

  const desktopAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical" && a.scope === "individual",
      ),
    [phaseResults],
  );

  const detectedChars = useMemo<Set<string>>(() => {
    if (baseIr === null) return new Set<string>();
    try {
      const layout = scaffoldTouchLayout(baseIr);
      const set = new Set<string>();
      const push = (t?: string) => {
        if (t && t.length > 0 && !t.startsWith("*")) set.add(t);
      };
      for (const p of layout.platforms) {
        for (const layer of p.layers) {
          for (const row of layer.rows) {
            for (const k of row.keys) {
              push(k.text);
              push(k.output);
              (k.sk ?? []).forEach((s) => { push(s.text); push(s.output); });
              (k.multitap ?? []).forEach((s) => { push(s.text); push(s.output); });
              if (k.flick) {
                Object.values(k.flick).forEach((s) => {
                  if (s) { push(s.text); push(s.output); }
                });
              }
            }
          }
        }
      }
      return set;
    } catch {
      return new Set<string>();
    }
  }, [baseIr]);

  // ---------------------------------------------------------------------------
  // Per-character suggestion computation
  // ---------------------------------------------------------------------------

  type Suggestion =
    | { kind: "longpress"; hostKey: string }
    | { kind: "replace"; hostKey: string }
    | { kind: "already" }
    | { kind: "none" };

  const suggestion = useMemo<Suggestion>(() => {
    if (currentChar === null) return { kind: "none" };

    // Find Phase C desktop assignment for this character.
    const da = desktopAssignments.find((a) => a.target === currentChar);
    if (da) {
      const m = da.mechanisms[0];
      if (!m) return { kind: "none" };
      const pid = m.patternId;
      const sid = m.strategyId ?? "";
      const sv = m.slotValues ?? {};

      // simple_swap / S-01 → replace suggestion
      if (pid === "simple_swap" || sid === "S-01") {
        const match = (sv["kmnRules"] ?? "").match(/\+\s*\[([A-Z0-9_]+)\]/);
        const hk = match?.[1] ?? "";
        return { kind: "replace", hostKey: hk };
      }

      // deadkey_single_tap / S-02 → longpress from baseLetters
      if (pid === "deadkey_single_tap" || sid === "S-02") {
        const baseLetters = sv["baseLetters"] ?? "";
        const firstLetter = baseLetters[0];
        let hk = "";
        if (firstLetter && /^[a-zA-Z]$/.test(firstLetter)) {
          hk = `K_${firstLetter.toUpperCase()}`;
        }
        return { kind: "longpress", hostKey: hk };
      }

      // modifier_as_layer_switch / S-08 → longpress from altgrKeyList
      if (pid === "modifier_as_layer_switch" || sid === "S-08") {
        const match = (sv["altgrKeyList"] ?? "").match(/\[RALT\s+([A-Z0-9_]+)\]/);
        const hk = match?.[1] ?? "";
        return { kind: "longpress", hostKey: hk };
      }

      // multi_char_sequence / S-03 → longpress best-effort
      if (pid === "multi_char_sequence" || sid === "S-03") {
        const firstOut = sv["firstLetterOut"] ?? "";
        const firstChar = firstOut[0];
        let hk = "";
        if (firstChar && /^[a-zA-Z]$/.test(firstChar)) {
          hk = `K_${firstChar.toUpperCase()}`;
        }
        return { kind: "longpress", hostKey: hk };
      }

      // Assignment exists but unrecognized pattern
      return { kind: "none" };
    }

    // No desktop assignment
    if (detectedChars.has(currentChar)) {
      return { kind: "already" };
    }

    if (isDecomposableAccented(currentChar)) {
      const nfd = currentChar.normalize("NFD");
      const baseLetter = [...nfd][0] ?? "";
      let hk = "";
      if (baseLetter && /^[a-zA-Z]$/.test(baseLetter)) {
        hk = `K_${baseLetter.toUpperCase()}`;
      }
      return { kind: "longpress", hostKey: hk };
    }

    return { kind: "none" };
  }, [currentChar, desktopAssignments, detectedChars]);

  // ---------------------------------------------------------------------------
  // Per-character method state — reset when currentChar changes
  // ---------------------------------------------------------------------------

  const [method, setMethod] = useState<TouchMethod>("longpress_alternates");
  const [hostKey, setHostKey] = useState("");
  const [flickDirection, setFlickDirection] = useState("");

  // Whether the suggestion card has been dismissed for the current character.
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Whether the method has been applied (enables "Next character ->").
  const [appliedForCurrentChar, setAppliedForCurrentChar] = useState(false);

  // Reset method state and suggestion dismissal when currentChar changes.
  useEffect(() => {
    setSuggestionDismissed(false);
    setMethod("longpress_alternates");
    setHostKey("");
    setFlickDirection("");
    setAppliedForCurrentChar(false);
  }, [currentChar]);

  // Also mark as applied if the char already has an entry in charTouch
  // (handles re-visiting a character).
  useEffect(() => {
    if (currentChar !== null && charTouch.has(currentChar)) {
      setAppliedForCurrentChar(true);
    }
  }, [currentChar, charTouch]);

  // ---------------------------------------------------------------------------
  // canApply
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "flick_gestures") return hostKey !== "" && flickDirection !== "";
    // longpress_alternates, multitap, and touch_key_replace require a host key.
    return hostKey !== "";
  }, [currentChar, method, hostKey, flickDirection]);

  // ---------------------------------------------------------------------------
  // Build assignment from current method state
  // ---------------------------------------------------------------------------

  function buildTouchAssignment(char: string): TouchAssignment {
    if (method === "longpress_alternates") {
      return {
        scope: "individual",
        target: char,
        modality: "touch",
        mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey, char } }],
        source: "user",
      };
    }
    if (method === "flick_gestures") {
      return {
        scope: "individual",
        target: char,
        modality: "touch",
        mechanisms: [{ patternId: "flick_gestures", slotValues: { hostKey, direction: flickDirection, char } }],
        source: "user",
      };
    }
    if (method === "touch_key_replace") {
      return {
        scope: "individual",
        target: char,
        modality: "touch",
        mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey, char } }],
        source: "user",
      };
    }
    // multitap
    return {
      scope: "individual",
      target: char,
      modality: "touch",
      mechanisms: [{ patternId: "multitap", slotValues: { hostKey, char } }],
      source: "user",
    };
  }

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  function advanceToNext(afterChar: string, nextCharTouch: Map<string, TouchAssignment>, nextSkipped: Set<string>) {
    const idx = inventory.indexOf(afterChar);
    const after = inventory
      .slice(idx + 1)
      .find((c) => !nextCharTouch.has(c) && !nextSkipped.has(c));
    if (after !== undefined) {
      setCharHistory((h) => [...h, afterChar]);
      setCurrentChar(after);
      return;
    }
    const wrap = inventory
      .slice(0, idx)
      .find((c) => !nextCharTouch.has(c) && !nextSkipped.has(c));
    if (wrap !== undefined) {
      setCharHistory((h) => [...h, afterChar]);
      setCurrentChar(wrap);
      return;
    }
    // All done — push afterChar so Back from the all-done panel returns here,
    // then clear currentChar so the all-done panel (with its Done button) shows.
    setCharHistory((h) => [...h, afterChar]);
    setCurrentChar(null);
  }

  // ---------------------------------------------------------------------------
  // Suggestion card handlers
  // ---------------------------------------------------------------------------

  const handleSuggestionAccept = useCallback(() => {
    if (currentChar === null) return;
    const assignment: TouchAssignment = {
      scope: "individual",
      target: currentChar,
      modality: "touch",
      mechanisms: [{ patternId: "touch_inherited" }],
      source: "user",
    };
    const next = new Map(charTouch);
    next.set(currentChar, assignment);
    setCharTouch(next);
    setSuggestionDismissed(true);
    setAppliedForCurrentChar(true);
    advanceToNext(currentChar, next, skippedChars);
  // inventory is included so the handler re-captures the latest advanceToNext
  // (which closes over inventory) if the confirmed inventory ever changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar, charTouch, skippedChars, inventory]);

  // Accept the suggestion: build the suggested assignment and apply it
  // immediately, then advance to the next character. If no host key could be
  // derived, fall back to opening the chooser pre-filled at the suggested
  // method so the user can pick a key.
  const handleUseSuggestion = useCallback(() => {
    if (currentChar === null) return;
    if (suggestion.kind !== "longpress" && suggestion.kind !== "replace") {
      setSuggestionDismissed(true);
      return;
    }
    const nextMethod: TouchMethod =
      suggestion.kind === "longpress" ? "longpress_alternates" : "touch_key_replace";
    const hk = suggestion.hostKey;
    if (hk === "") {
      setMethod(nextMethod);
      setHostKey("");
      setFlickDirection("");
      setSuggestionDismissed(true);
      return;
    }
    const assignment: TouchAssignment = {
      scope: "individual",
      target: currentChar,
      modality: "touch",
      mechanisms: [{ patternId: nextMethod, slotValues: { hostKey: hk, char: currentChar } }],
      source: "user",
    };
    const next = new Map(charTouch);
    next.set(currentChar, assignment);
    setCharTouch(next);
    setSuggestionDismissed(true);
    setAppliedForCurrentChar(true);
    advanceToNext(currentChar, next, skippedChars);
  // inventory is included so the handler re-captures the latest advanceToNext
  // (which closes over inventory) if the confirmed inventory ever changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, currentChar, charTouch, skippedChars, inventory]);

  const handleSuggestionChange = useCallback(() => {
    setSuggestionDismissed(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Apply / Next / Skip handlers
  // ---------------------------------------------------------------------------

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;
    const assignment = buildTouchAssignment(currentChar);
    const next = new Map(charTouch);
    next.set(currentChar, assignment);
    setCharTouch(next);
    setAppliedForCurrentChar(true);
    // Reset method inputs but stay on currentChar — user must click Next to advance.
    setMethod("longpress_alternates");
    setHostKey("");
    setFlickDirection("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar, canApply, method, hostKey, flickDirection, charTouch]);

  const handleNext = useCallback(() => {
    if (currentChar === null) return;
    advanceToNext(currentChar, charTouch, skippedChars);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar, charTouch, skippedChars, inventory]);

  const handleSkip = useCallback(() => {
    if (currentChar === null) return;
    const skippedFrom = currentChar;
    const next = new Set([...skippedChars, currentChar]);
    setSkippedChars(next);
    const idx = inventory.indexOf(currentChar);
    const after = inventory
      .slice(idx + 1)
      .find((c) => !charTouch.has(c) && !next.has(c) && c !== currentChar);
    if (after !== undefined) {
      setCharHistory((h) => [...h, skippedFrom]);
      setCurrentChar(after);
      return;
    }
    const wrap = inventory
      .slice(0, idx)
      .find((c) => !charTouch.has(c) && !next.has(c) && c !== currentChar);
    if (wrap !== undefined) {
      setCharHistory((h) => [...h, skippedFrom]);
      setCurrentChar(wrap);
      return;
    }
    setCharHistory((h) => [...h, skippedFrom]);
    setCurrentChar(null);
  }, [currentChar, inventory, charTouch, skippedChars]);

  // Back handler — pops the history stack to return to the previous character.
  // When history is empty (first character or empty-inventory guard) calls onBack
  // to return to Phase C (locked/read-only; no unlock is performed).
  const handleBack = useCallback(() => {
    if (charHistory.length === 0) {
      onBack();
      return;
    }
    const prev = charHistory[charHistory.length - 1] ?? null;
    setCharHistory((h) => h.slice(0, -1));
    setCurrentChar(prev);
  }, [charHistory, onBack]);

  const handleRemoveConfigured = useCallback((char: string) => {
    setCharTouch((prev) => {
      const next = new Map(prev);
      next.delete(char);
      return next;
    });
  }, []);

  // Tap-to-select routing: when a valid host-key-capable method is active and
  // the user taps a key in the OSK preview, route that key id to the host key
  // selector. Ignored for touch_inherited (no host key concept).
  const handleKeyTap = useCallback(
    (keyId: string) => {
      if (!VALID_HOST_KEYS.has(keyId)) return;
      if (
        method === "longpress_alternates" ||
        method === "flick_gestures" ||
        method === "multitap" ||
        method === "touch_key_replace"
      ) {
        setHostKey(keyId);
      }
    },
    [method],
  );

  // ---------------------------------------------------------------------------
  // onComplete — emit only explicitly-configured characters
  // ---------------------------------------------------------------------------

  const handleContinue = useCallback(() => {
    // Emit only chars where a real (non-inherited) or inherited assignment was
    // explicitly accepted — everything in charTouch was put there by the user.
    const assignments: TouchAssignment[] = [...charTouch.values()].filter(
      (a) => a.mechanisms[0]?.patternId !== "touch_inherited",
    );
    onComplete(assignments);
  }, [charTouch, onComplete]);

  // Projected VFS for lint — clones baseVfs and overwrites the touch layout path
  // with the same touchLayoutJson the preview uses (lint, preview, output agree).
  // When touchLayoutJson is null (baseIr not yet set) lint sees the raw baseVfs.
  // keyboardId in deps so the path key stays correct if the id changes.
  const editedVfsForLint = useMemo(() => {
    if (baseVfs === null) return null;
    if (touchLayoutJson === null || keyboardId === null) return baseVfs;
    const cloned = createVirtualFS(baseVfs.entries());
    cloned.set(`source/${keyboardId}.keyman-touch-layout`, touchLayoutJson);
    return cloned;
  }, [baseVfs, touchLayoutJson, keyboardId]);

  // Touch lint — runs on the projected (edited) VFS so checks 18.1–18.5 reflect
  // Phase E edits. The existing 300ms debounce inside useTouchLint is unchanged.
  const { touchFindings, touchLintRunning } = useTouchLint(editedVfsForLint, keyboardId);

  // ---------------------------------------------------------------------------
  // Shared styles — defined before guards so they can be referenced in guard renders
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

  const totalChars = inventory.length;
  const currentCharIndex = currentChar !== null ? inventory.indexOf(currentChar) : -1;

  // When there is no suggestion to offer for the current character, skip the
  // suggestion card entirely and show the method chooser directly. Otherwise the
  // chooser appears once the suggestion is accepted or dismissed.
  const showChooser = suggestionDismissed || suggestion.kind === "none";

  // ---------------------------------------------------------------------------
  // Guard: no inventory
  // ---------------------------------------------------------------------------

  if (inventory.length === 0) {
    return (
      <div style={{ ...pageStyle, padding: "24px 32px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to mechanisms"
            style={ghostBtn}
          >
            &larr; Back
          </button>
          <div
            style={{
              margin: "60px auto",
              textAlign: "center",
              color: TEXT_DIM,
            }}
          >
            <p style={{ fontSize: 15 }}>
              No characters in inventory yet. Complete the Survey (Phase B) to
              confirm which characters your keyboard must produce.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Intro splash — first entry to the touch gallery only
  // ---------------------------------------------------------------------------

  if (showIntro) {
    return (
      <GalleryIntroSplash
        eyebrow="Next step · Touch"
        title="Welcome to the Touch Gallery"
        body={
          <>
            Your desktop layout is locked in. Now you&rsquo;ll set how each
            character is reached on phones and tablets, where there is no
            physical keyboard.
          </>
        }
        bullets={[
          <>You&rsquo;ll go character by character, just like the desktop gallery.</>,
          <>
            Pick a touch method &mdash; long-press, flick, multitap, or replace
            &mdash; or Skip characters that already work.
          </>,
          <>These choices apply to touch only and never change your desktop layout.</>,
        ]}
        startAriaLabel="Start the touch gallery"
        onStart={() => {
          markGalleryIntroSeen("touch");
          setShowIntro(false);
        }}
        onBack={onBack}
        backAriaLabel="Back to mechanisms (Phase C)"
      />
    );
  }

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
      {/* Coverage line */}
      <p
        role="status"
        aria-live="polite"
        aria-label={`${charTouch.size} of ${totalChars} characters configured`}
        style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}
      >
        {charTouch.size} of {totalChars} configured
      </p>

      {/* All-done state */}
      {isDone && currentChar === null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_DIM }}>
            All characters configured for touch.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back to previous character"
              style={ghostBtn}
            >
              &larr; Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              aria-label="Continue to next phase"
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
        </div>
      )}

      {/* Per-char UI */}
      {currentChar !== null && (
        <>
          {/* Character heading card (identical to MechanismGallery's) */}
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
              Touch mapping
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

          {/* Back button — present in both sub-states for consistent placement */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleBack}
              aria-label={
                charHistory.length === 0
                  ? "Back to mechanisms (Phase C)"
                  : "Back to previous character"
              }
              style={ghostBtn}
            >
              &larr; Back
            </button>
          </div>

          {/* Suggestion card (shown until accepted/dismissed; skipped entirely
              when there is no suggestion to offer) */}
          {!showChooser && (
            <div
              role="note"
              aria-label="Touch access method suggestion"
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
              {suggestion.kind === "longpress" && (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    Suggested: long-press{" "}
                    {suggestion.hostKey ? hostKeyShortLabel(suggestion.hostKey) : "a key"}{" "}
                    to reach {currentChar}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      aria-label={`Use suggested long-press method for ${toUPlusNotation(currentChar)} ${currentChar}`}
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
                      aria-label="Choose a different touch method"
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
                </>
              )}
              {suggestion.kind === "replace" && (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    Suggested: replace{" "}
                    {suggestion.hostKey ? hostKeyShortLabel(suggestion.hostKey) : "a key"}{" "}
                    with {currentChar}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      aria-label={`Use suggested replace method for ${toUPlusNotation(currentChar)} ${currentChar}`}
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
                      aria-label="Choose a different touch method"
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
                </>
              )}
              {suggestion.kind === "already" && (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    {currentChar} is already on the touch keyboard. Keep it as is?
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleSuggestionAccept}
                      aria-label={`Keep ${toUPlusNotation(currentChar)} ${currentChar} as already in touch layout`}
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
                      aria-label="Make changes to touch method"
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
                </>
              )}
            </div>
          )}

          {/* Method chooser (shown after the suggestion is accepted/dismissed,
              or immediately when there is no suggestion) */}
          {showChooser && (
            <TouchMethodChooser
              currentChar={currentChar}
              method={method}
              onMethodChange={setMethod}
              hostKey={hostKey}
              onHostKeyChange={setHostKey}
              flickDirection={flickDirection}
              onFlickDirectionChange={setFlickDirection}
            />
          )}

          {/* Apply + Next + Skip button row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {showChooser && (
              <button
                type="button"
                onClick={handleApply}
                disabled={!canApply}
                aria-label={`Apply touch method for ${toUPlusNotation(currentChar)} ${currentChar}`}
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
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!appliedForCurrentChar}
              aria-label={
                isDone && appliedForCurrentChar
                  ? "All characters configured, finish"
                  : "Next character"
              }
              style={{
                padding: "9px 20px",
                background: appliedForCurrentChar ? "#238636" : "#21262d",
                border: "none",
                borderRadius: 6,
                color: appliedForCurrentChar ? "#e6edf3" : TEXT_DIM,
                fontSize: 13,
                fontWeight: 600,
                cursor: appliedForCurrentChar ? "pointer" : "not-allowed",
                fontFamily: FONT,
              }}
            >
              {isDone && appliedForCurrentChar ? "All done →" : "Next character →"}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              aria-label={`Skip ${toUPlusNotation(currentChar)} ${currentChar}`}
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

      {/* Configured chip row */}
      {charTouch.size > 0 && (
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
            Configured
          </p>
          <div
            role="group"
            aria-label="Configured characters — click to remove"
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {[...charTouch.entries()].map(([c, assignment]) => (
              <button
                key={c}
                type="button"
                onClick={() => handleRemoveConfigured(c)}
                aria-label={`Remove ${toUPlusNotation(c)} ${c}`}
                title={`${toUPlusNotation(c)} — click to remove`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  background: "#0d2218",
                  border: "1px solid #238636",
                  borderRadius: 16,
                  color: "#56d364",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                }}
              >
                {touchMethodLabel(assignment)}
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
  );

  // ---------------------------------------------------------------------------
  // Two-pane layout (matching MechanismGallery exactly)
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
      {/* Header */}
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
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Mechanism Gallery
          <span
            style={{
              fontSize: 12,
              color: TEXT_DIM,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
              fontWeight: 400,
            }}
          >
            Touch
          </span>
        </h1>
        <span
          style={{
            fontSize: 13,
            color: TEXT_DIM,
            fontFamily: FONT,
            flex: 1,
            minWidth: 0,
          }}
        >
          For each character, choose how it appears on the touch keyboard. Your
          desktop layout is locked — these apply to phone and tablet only.
        </span>
        {totalChars > 0 && (
          <span
            aria-label={`Character ${currentCharIndex + 1} of ${totalChars}`}
            style={{
              fontSize: 12,
              color: TEXT_DIM,
              fontFamily: FONT,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Character {isDone ? totalChars : Math.max(currentCharIndex + 1, 1)} of{" "}
            {totalChars}
          </span>
        )}
      </div>

      {/* Two-pane body */}
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
          <GalleryPreviewPane
            baseKeyboard={baseKeyboard}
            stage={stage}
            retry={retry}
            {...(handleKeyTap !== undefined ? { onKeyTap: handleKeyTap } : {})}
            defaultOskMode="touch"
            heading="Touch preview"
            warningLabel="Preview warnings:"
          />
        </div>
      </div>
    </div>
  );
}
