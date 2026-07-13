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
//     shows a suggestion card: Accept records/applies the suggested method
//     but does NOT advance — the author stays on the character and may keep
//     editing; advancing to the next character always requires an explicit
//     click on the header's "Next character" button. Deny shows the method
//     chooser. When there is no suggestion, the method chooser is shown
//     directly (no intermediate card).
//   - Method chooser offers 4 expandable cards (longpress, flick, multitap,
//     replace). "Apply method" + "Next character →" + "Skip this character"
//     follow MechanismGallery's pattern. There is no manual "already in
//     layout" card: the auto-detected "already" suggestion records inherited
//     characters. "Skip this character" is pure forward navigation — it
//     records nothing; only Apply (or accepting a suggestion) marks a
//     character configured.
//   - Positional Back/Next/last-character navigation walks inventory by
//     index; a skipped-over character is never treated as resolved.
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
import type { TouchAssignment, MechanismRef } from "@keyboard-studio/contracts";
import { createVirtualFS, toUPlusNotation, isDecomposableAccented } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "../../lib/buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { promoteOnManualEdit } from "./touchBehavior.ts";
import { isMutateSeamEnabled } from "../../flags/mutateFlag.ts";
import { LintSummary } from "../../lint/index.ts";
import { useTouchLint } from "../../hooks/useTouchLint.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec, VfsTransform } from "../../hooks/useKeyboardArtifact.ts";
import { scaffoldTouchLayout } from "@keyboard-studio/engine";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { KeyPickerField } from "./KeyPickerField.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import { usePositionalCharNav } from "./usePositionalCharNav.ts";
import { KEY_OPTIONS, VALID_HOST_KEYS } from "../../lib/keyOptions.ts";
import { resolveKeyPickerSelection, resolvedVkeyOf } from "../../lib/charInput.ts";
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

/** Produce a human-readable label for a single configured mechanism chip. */
function touchMechanismLabel(target: string, m: MechanismRef): string {
  const patternId = m.patternId;
  const sv = m.slotValues ?? {};
  const hkShort = sv["hostKey"] ? hostKeyShortLabel(sv["hostKey"]) : "";
  if (patternId === "touch_inherited") return `${target} · inherited`;
  if (patternId === "longpress_alternates") return `${target} · long-press ${hkShort}`;
  if (patternId === "flick_gestures") {
    const dir = sv["direction"] ?? "";
    return `${target} · flick ${hkShort} ${dirArrow(dir)}`.trimEnd();
  }
  if (patternId === "multitap") return `${target} · multitap ${hkShort}`;
  if (patternId === "touch_key_replace") return `${target} · replace ${hkShort}`;
  return target;
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

// Static styles shared across TouchMethodChooser renders — none depend on
// props or state, so they are hoisted to module scope rather than recreated
// per render.
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

// Static page-level styles shared by TouchGallery's guard/content branches —
// none depend on props or state.
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
// Touch method type
// ---------------------------------------------------------------------------

// Selectable methods in the chooser. `touch_inherited` is intentionally NOT a
// chooser option — inherited characters are recorded via the auto-detected
// "already" suggestion (handleSuggestionAccept), and Skip moves on without an
// assignment. The pattern-apply engine still understands the touch_inherited
// patternId those suggestions produce.
export type TouchMethod = "touch_key_replace" | "longpress_alternates" | "flick_gestures" | "multitap";

// ---------------------------------------------------------------------------
// buildTouchMechanismRef — pure mechanism builder (exported for direct unit
// testing of the resolved-vkey invariant below).
//
// Always writes the RESOLVED physical key into slotValues.hostKey — never the
// raw "__custom__" sentinel or unresolved typed text. Returns null when
// `resolvedHostKey` is null, so the invariant is enforced HERE rather than
// solely by the canApply gate at the call site (see TouchGallery's
// buildMechanismRef closure and handleApply below, which mirror
// MechanismGallery's `if (resolvedSwapVkey === null) return;` style).
// ---------------------------------------------------------------------------

export function buildTouchMechanismRef(
  method: TouchMethod,
  resolvedHostKey: string | null,
  flickDirection: string,
  char: string,
): MechanismRef | null {
  if (resolvedHostKey === null) return null;
  const hk = resolvedHostKey;
  if (method === "longpress_alternates") {
    return { patternId: "longpress_alternates", slotValues: { hostKey: hk, char } };
  }
  if (method === "flick_gestures") {
    return { patternId: "flick_gestures", slotValues: { hostKey: hk, direction: flickDirection, char } };
  }
  if (method === "touch_key_replace") {
    return { patternId: "touch_key_replace", slotValues: { hostKey: hk, char } };
  }
  // multitap
  return { patternId: "multitap", slotValues: { hostKey: hk, char } };
}

// ---------------------------------------------------------------------------
// TouchMethodChooser — 4 expandable cards
// ---------------------------------------------------------------------------

interface TouchMethodChooserProps {
  currentChar: string;
  method: TouchMethod;
  onMethodChange: (m: TouchMethod) => void;
  hostKey: string;
  onHostKeyChange: (v: string) => void;
  hostKeyCustomChar: string;
  onHostKeyCustomCharChange: (v: string) => void;
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
  hostKeyCustomChar,
  onHostKeyCustomCharChange,
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
                flexWrap: "wrap",
              }}
            >
              <span>Host key:</span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel="Host key for long-press"
                customInputAriaLabel="Custom character for long-press host key"
              />
            </div>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
                flexWrap: "wrap",
              }}
            >
              <span>Host key:</span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel="Host key for flick"
                customInputAriaLabel="Custom character for flick host key"
              />
            </div>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
                flexWrap: "wrap",
              }}
            >
              <span>Host key:</span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel="Host key for multitap"
                customInputAriaLabel="Custom character for multitap host key"
              />
            </div>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
                flexWrap: "wrap",
              }}
            >
              <span>Host key:</span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel="Host key to replace"
                customInputAriaLabel="Custom character for the key to replace"
              />
            </div>
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

  // Draft persistence — read on mount; write on every charTouch change.
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
  // "Real edit" = an assignment with at least one mechanism whose patternId
  // !== "touch_inherited" (an assignment may carry several mechanisms — issue
  // 3, multiple methods per character). This filter matches handleContinue
  // exactly (the single source of truth).
  const touchLayoutJson = useMemo(() => {
    const appliedEdits = [...charTouch.values()].filter((a) =>
      a.mechanisms.some((m) => m.patternId !== "touch_inherited"),
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

  // Current character index — synced with inventory. Declared here (moved up
  // from its later position) so both handleContinue and usePositionalCharNav
  // below can reference it; this state is otherwise independent of the
  // intervening code, so the reorder carries no behavior change.
  const [currentChar, setCurrentChar] = useState<string | null>(null);

  // Sync currentChar when inventory loads or changes.
  const inventoryKey = inventory.join("\0");
  useEffect(() => {
    setCurrentChar((prev) => {
      if (inventory.length === 0) return null;
      // Keep current char if it's still in the list.
      if (prev !== null && inventory.includes(prev)) return prev;
      // Pick the first unconfigured char.
      return (
        inventory.find((c) => !charTouch.has(c)) ??
        inventory[0] ??
        null
      );
    });
    // Only re-run when the inventory list itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryKey]);

  // Completion — emit only explicitly-configured characters. Declared before
  // usePositionalCharNav below because the hook calls it directly when
  // forward navigation reaches the last character (the last character's
  // forward button IS the phase completion, not a further navigation step).
  const handleContinue = useCallback(() => {
    // Emit only chars where a real (non-inherited) or inherited assignment was
    // explicitly accepted — everything in charTouch was put there by the user.
    // `.some()` rather than `mechanisms[0]` (regression 3, multi-method): a
    // character can carry several mechanisms, so any real (non-inherited) one
    // qualifies it, not just whichever happens to be first in the array.
    const assignments: TouchAssignment[] = [...charTouch.values()].filter((a) =>
      a.mechanisms.some((m) => m.patternId !== "touch_inherited"),
    );
    onComplete(assignments);
  }, [charTouch, onComplete]);

  // Positional Back/Next/Skip/Previous navigation + suggestion-dismissal
  // tracking — shared with MechanismGallery via usePositionalCharNav so the
  // two galleries cannot drift (see that hook for the Back/Next/Previous
  // rationale, including the idx === -1 defense-in-depth guard).
  // initialSuggestionResolved rehydrates the resolved set from the store
  // draft on mount (mirrors charTouch) so a resolved suggestion never
  // reappears after back-navigation + unmount/remount.
  const {
    currentIdx,
    hasAnotherCharAfterCurrent,
    handleNext,
    handleBack,
    handlePreviousChar,
    suggestionResolved,
    markSuggestionResolved,
  } = usePositionalCharNav({
    list: inventory,
    currentChar,
    setCurrentChar,
    onComplete: handleContinue,
    onBack,
    initialSuggestionResolved: touchDraft?.suggestionResolvedChars,
  });

  // Intro splash — shown once when the author first enters the touch gallery so
  // the move from the desktop (physical) gallery to touch is explicit. The
  // store flag persists "seen" across unmount/remount, so the intro shows once
  // and not again on back-and-forth navigation to Phase C.
  const [showIntro, setShowIntro] = useState(() => !touchIntroSeen);

  // Write charTouch + suggestionResolved back to the store draft whenever
  // they change so that back-navigation (unmount) preserves in-progress
  // work, including which suggestion cards are already decided. Skip
  // records nothing, so there is no skipped-chars set to persist, and
  // navigation is purely positional so there is no history stack to persist
  // either.
  useEffect(() => {
    setTouchDraft({
      charTouchEntries: [...charTouch.entries()],
      suggestionResolvedChars: [...suggestionResolved],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charTouch, suggestionResolved]);

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
  const [hostKeyCustomChar, setHostKeyCustomChar] = useState("");
  const [flickDirection, setFlickDirection] = useState("");

  // Resolved host key — shared by canApply, buildMechanismRef, and the
  // manual-edit promotion below. One resolution helper (charInput.ts),
  // consulted here and by KeyPickerField's own feedback rendering, so there
  // is exactly one place the "__custom__" -> real vkey mapping lives.
  const resolvedHostKey = useMemo(
    () => resolvedVkeyOf(resolveKeyPickerSelection(hostKey, hostKeyCustomChar)),
    [hostKey, hostKeyCustomChar],
  );

  // Whether the suggestion card must stay hidden for the current character —
  // true once explicitly resolved (Accept/Deny — persisted in
  // suggestionResolved, see above), or once the character is already
  // configured (a configured char never re-prompts). Skipping does not
  // resolve a suggestion — Skip records nothing, so a skipped-over character
  // still shows its suggestion card if revisited. Derived rather than
  // reset-on-navigate, so returning to an already-decided character never
  // re-shows its suggestion card.
  const suggestionDismissed =
    currentChar !== null &&
    (suggestionResolved.has(currentChar) || charTouch.has(currentChar));

  // Forward gate (enables "Next character ->"/"Done"): an untouched
  // character needs an explicit Apply first — but revisiting an
  // already-configured character always re-enables it, so Back-then-Next
  // over a finished character never traps the author. "Skip this character"
  // is pure navigation (see handleNext, which the Skip button also calls)
  // and records nothing, so a skipped-over character stays gated here until
  // it is actually configured. Named to match MechanismGallery's canGoNext
  // (cross-gallery naming parity — this gallery has no separate
  // applied-method count, so the gate itself carries the name).
  const canGoNext = useMemo(
    () => currentChar !== null && charTouch.has(currentChar),
    [currentChar, charTouch],
  );

  // Reset method inputs (not suggestionResolved — that persists per char)
  // when currentChar changes.
  //
  // P1 fix (regression: a char revisited after it already has a real
  // non-inherited mechanism must NOT re-show the suggestion card): handled
  // without extra state here — `suggestionDismissed` above is DERIVED from
  // `suggestionResolved.has(currentChar) || charTouch.has(currentChar)`, so a
  // revisited configured character is dismissed automatically on every
  // render; there is nothing to reset on navigation.
  useEffect(() => {
    setMethod("longpress_alternates");
    setHostKey("");
    setHostKeyCustomChar("");
    setFlickDirection("");
  }, [currentChar]);

  // ---------------------------------------------------------------------------
  // canApply
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "flick_gestures") return resolvedHostKey !== null && flickDirection !== "";
    // longpress_alternates, multitap, and touch_key_replace require a host key.
    return resolvedHostKey !== null;
  }, [currentChar, method, resolvedHostKey, flickDirection]);

  // ---------------------------------------------------------------------------
  // Build a mechanism from current method state
  // ---------------------------------------------------------------------------

  /**
   * Build just the `{ patternId, slotValues }` mechanism for the current
   * method/hostKey/flickDirection state. Callers append this to a char's
   * existing `mechanisms[]` via {@link appendMechanismToChar} (regression 3,
   * multi-method — multiple methods per character) rather than overwriting the assignment.
   *
   * Thin wrapper over {@link buildTouchMechanismRef} (module scope, exported
   * for direct unit testing) using current component state — see that
   * function for the resolved-vkey invariant this delegates to.
   */
  function buildMechanismRef(char: string): MechanismRef | null {
    return buildTouchMechanismRef(method, resolvedHostKey, flickDirection, char);
  }

  /**
   * Structural equality for a MechanismRef: same `patternId` and the same
   * `slotValues` (compared by key set + per-key value, order-independent).
   * Deliberately not `JSON.stringify` — key order in `slotValues` is not
   * semantically meaningful, and two refs built from differently-ordered
   * object literals must still dedupe to one chip.
   */
  function mechanismRefEquals(a: MechanismRef, b: MechanismRef): boolean {
    if (a.patternId !== b.patternId) return false;
    const aSlots = a.slotValues ?? {};
    const bSlots = b.slotValues ?? {};
    const aKeys = Object.keys(aSlots);
    const bKeys = Object.keys(bSlots);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => aSlots[key] === bSlots[key]);
  }

  /**
   * Append `ref` to `char`'s mechanisms[] in `prev`, returning a new Map
   * (immutable update — regression 3, multi-method, multiple methods per character).
   *
   * Total invariants (hold regardless of call site — prior-QC P1 finding):
   * - No existing entry for `char` → create a new single-mechanism assignment.
   * - `touch_inherited` is mutually exclusive with a real configured method —
   *   appending it when the char already has a real (non-inherited)
   *   mechanism is a no-op.
   * - A `ref` that deep-equals a mechanism the char already has is a no-op
   *   (never append/duplicate an identical MechanismRef — covers re-accepting
   *   a suggestion or re-applying the same method+hostKey via the chooser).
   * - A real method REPLACES an existing inherited-only placeholder (`[{
   *   patternId: "touch_inherited" }]`) rather than sitting alongside it.
   * - Otherwise → append `ref` to the existing mechanisms[] array.
   */
  function appendMechanismToChar(
    prev: Map<string, TouchAssignment>,
    char: string,
    ref: MechanismRef,
  ): Map<string, TouchAssignment> {
    const next = new Map(prev);
    const existing = next.get(char);
    if (existing === undefined) {
      next.set(char, {
        scope: "individual",
        target: char,
        modality: "touch",
        mechanisms: [ref],
        source: "user",
      });
      return next;
    }
    const hasRealMechanism = existing.mechanisms.some((m) => m.patternId !== "touch_inherited");
    if (ref.patternId === "touch_inherited" && hasRealMechanism) {
      return next;
    }
    if (existing.mechanisms.some((m) => mechanismRefEquals(m, ref))) {
      return next;
    }
    if (
      ref.patternId !== "touch_inherited" &&
      existing.mechanisms.length === 1 &&
      existing.mechanisms[0]?.patternId === "touch_inherited"
    ) {
      next.set(char, { ...existing, mechanisms: [ref] });
      return next;
    }
    next.set(char, { ...existing, mechanisms: [...existing.mechanisms, ref] });
    return next;
  }

  // ---------------------------------------------------------------------------
  // Suggestion card handlers
  // ---------------------------------------------------------------------------

  // Accept the "already in touch layout" suggestion: records a touch_inherited
  // mechanism (or replaces an existing touch_inherited-only entry — this is a
  // re-accept, not a second method — regression 3, multi-method) via
  // appendMechanismToChar rather than overwriting the assignment (regression:
  // replace), and marks the suggestion resolved. Stays on currentChar — the
  // user may still want to make further edits; advancing happens only via
  // the explicit Next button (gallery-QoL / regression 4, stay-on-char:
  // answering a suggestion must not force the user forward). The chooser
  // (via suggestionDismissed → showChooser) is available afterward to add a
  // real method alongside it.
  const handleSuggestionAccept = useCallback(() => {
    if (currentChar === null) return;
    const ref: MechanismRef = { patternId: "touch_inherited" };
    setCharTouch((prev) => appendMechanismToChar(prev, currentChar, ref));
    markSuggestionResolved(currentChar);
  }, [currentChar, markSuggestionResolved]);

  // Accept the suggestion: append the suggested mechanism immediately
  // (regression 3, multi-method — via appendMechanismToChar rather than
  // overwriting the assignment, regression: replace), then mark the
  // suggestion resolved and stay on currentChar (regression 4, stay-on-char)
  // so the user can keep editing (see handleSuggestionAccept above —
  // advancing happens only via the explicit Next button). If no host key
  // could be derived, fall back to opening the chooser pre-filled at the
  // suggested method so the user can pick a key.
  const handleUseSuggestion = useCallback(() => {
    if (currentChar === null) return;
    if (suggestion.kind !== "longpress" && suggestion.kind !== "replace") {
      markSuggestionResolved(currentChar);
      return;
    }
    const nextMethod: TouchMethod =
      suggestion.kind === "longpress" ? "longpress_alternates" : "touch_key_replace";
    const hk = suggestion.hostKey;
    if (hk === "") {
      setMethod(nextMethod);
      setHostKey("");
      setFlickDirection("");
      markSuggestionResolved(currentChar);
      return;
    }
    const ref: MechanismRef = { patternId: nextMethod, slotValues: { hostKey: hk, char: currentChar } };
    setCharTouch((prev) => appendMechanismToChar(prev, currentChar, ref));
    markSuggestionResolved(currentChar);
  }, [suggestion, currentChar, markSuggestionResolved]);

  const handleSuggestionChange = useCallback(() => {
    if (currentChar !== null) markSuggestionResolved(currentChar);
  }, [currentChar, markSuggestionResolved]);

  // ---------------------------------------------------------------------------
  // Apply / Next / Skip handlers
  // ---------------------------------------------------------------------------

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;
    // appendMechanismToChar (regression 3, multi-method) rather than
    // overwriting the assignment (regression: replace) — a second Apply for
    // the same character adds another chip instead of clobbering the first.
    // buildMechanismRef enforces the resolved-vkey invariant locally (returns
    // null when resolvedHostKey is null) — canApply already implies this on
    // the happy path, but this early-return is the defense-in-depth mirror of
    // that invariant, matching MechanismGallery's `if (resolvedSwapVkey ===
    // null) return;` style.
    const ref = buildMechanismRef(currentChar);
    if (ref === null) return;
    setCharTouch((prev) => appendMechanismToChar(prev, currentChar, ref));
    // spec-014 FR-014/R4: a manual edit to the host touch key PROMOTES it to
    // `hand-set` in the working IR so subsequent re-propagation never clobbers
    // the author's edit. Flag-gated — off ⇒ byte-identical to P4b (no IR write).
    // Logic lives in touchBehavior.ts; this call site stays thin.
    if (isMutateSeamEnabled() && resolvedHostKey !== null) {
      const store = useWorkingCopyStore.getState();
      const ir = store.ir;
      // INCREMENTAL patch (promote host key to hand-set) — use the
      // overlay-preserving setter so carve deletions are not wiped. setIR would
      // clear deletedNodeIds/deletedItemIds/undoStack. See workingCopyStore.
      if (ir !== null) store.setWorkingIR(promoteOnManualEdit(ir, resolvedHostKey));
    }
    // Reset method inputs but stay on currentChar — user must click Next to advance.
    setMethod("longpress_alternates");
    setHostKey("");
    setHostKeyCustomChar("");
    setFlickDirection("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar, canApply, method, hostKey, resolvedHostKey, flickDirection]);

  // "Skip this character" is pure forward navigation — it records nothing,
  // so it is identical to handleNext (advance one position, or complete from
  // the last character, both from usePositionalCharNav above). The Skip
  // button calls handleNext directly (see below) rather than duplicating
  // this logic.

  // Remove a single mechanism (by index within that char's mechanisms[]) from
  // the configured chip row (regression 3, multi-method — multiple methods per character). If the
  // removed mechanism was the char's only one, the whole char entry is deleted
  // from the map — folding what was previously a separate
  // "remove the whole configured character" handler into this one, since a
  // char with exactly one mechanism behaves identically either way.
  const handleRemoveMechanism = useCallback((char: string, idx: number) => {
    setCharTouch((prev) => {
      const existing = prev.get(char);
      if (existing === undefined) return prev;
      const nextMechanisms = existing.mechanisms.filter((_, i) => i !== idx);
      const next = new Map(prev);
      if (nextMechanisms.length === 0) {
        next.delete(char);
      } else {
        next.set(char, { ...existing, mechanisms: nextMechanisms });
      }
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
        // Tapping a real key sets the picker to that key; clear the paired
        // custom-char text so re-opening "Enter my own character..." starts
        // clean instead of re-showing stale (possibly invalid) text.
        setHostKeyCustomChar("");
      }
    },
    [method],
  );

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

  const totalChars = inventory.length;

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

          {/* Top toolbar row — Back (left) + a right-aligned forward cluster
              (right), on the same horizontal level. The cluster holds the
              previous-character button (rendered on every character,
              disabled on the first) immediately to the left of the primary
              forward action (Next character/Done); it carries marginLeft:
              "auto" (rather than each button) so it holds position. */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              width: "100%",
            }}
          >
            <button
              type="button"
              onClick={handleBack}
              aria-label={
                currentIdx <= 0
                  ? "Back to mechanisms (Phase C)"
                  : "Back to previous character"
              }
              style={ghostBtn}
            >
              &larr; Back
            </button>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {/* Previous character — rendered on every character, including
                  the first one, where it is DISABLED (there is nowhere
                  further back to step; the separate Back button handles
                  exiting the phase from the first character). Always steps
                  back exactly one position, ungated by configured status on
                  the character being left. This block is only reached when
                  currentChar !== null (per-char UI), so no separate null
                  check is needed here. */}
              <button
                type="button"
                data-testid="touch-prev-char"
                onClick={handlePreviousChar}
                disabled={currentIdx <= 0}
                aria-label="Previous character"
                style={{
                  ...ghostBtn,
                  fontSize: 13,
                  ...(currentIdx <= 0
                    ? { color: TEXT_DIM, opacity: 0.5, cursor: "not-allowed" }
                    : {}),
                }}
              >
                &laquo; Previous character
              </button>
              <button
                type="button"
                data-testid="touch-continue"
                onClick={handleNext}
                disabled={!canGoNext}
                aria-label={hasAnotherCharAfterCurrent ? "Next character" : "Done"}
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
                {hasAnotherCharAfterCurrent ? "Next character →" : "Done"}
              </button>
            </div>
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
              hostKeyCustomChar={hostKeyCustomChar}
              onHostKeyCustomCharChange={setHostKeyCustomChar}
              flickDirection={flickDirection}
              onFlickDirectionChange={setFlickDirection}
            />
          )}

          {/* Apply + Skip. Back and Next/Done live in the shared top toolbar
              row above so the forward-advance control is spatially
              separated from these editing actions. */}
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
              aria-label={`Skip this character (${toUPlusNotation(currentChar)} ${currentChar})`}
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
            {[...charTouch.entries()].flatMap(([c, assignment]) =>
              assignment.mechanisms.map((m, i) => (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  onClick={() => handleRemoveMechanism(c, i)}
                  aria-label={`Remove ${toUPlusNotation(c)} ${touchMechanismLabel(c, m)}`}
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
                  {touchMechanismLabel(c, m)}
                  <span
                    aria-hidden="true"
                    style={{ fontSize: 11, color: "#56d364", opacity: 0.7 }}
                  >
                    &times;
                  </span>
                </button>
              )),
            )}
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
      {/* Header — title + modality label, the character counter, and the
          description, all in a single row. The primary forward action now
          sits in the top toolbar row of the left pane (see leftContent),
          paired with the Back button, rather than here. */}
      <div
        style={{
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
          padding: "16px 24px 14px",
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
        {totalChars > 0 && (
          <span
            aria-label={`Character ${currentIdx + 1} of ${totalChars}`}
            style={{
              fontSize: 12,
              color: TEXT_DIM,
              fontFamily: FONT,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Character {Math.max(currentIdx + 1, 1)} of {totalChars}
          </span>
        )}
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
