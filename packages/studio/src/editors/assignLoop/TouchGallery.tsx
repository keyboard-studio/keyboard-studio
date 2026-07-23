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
//   - Desktop work (carve removals + Phase C letter placements) IS replayed
//     onto the touch seed (spec 035 R3/R11): the touch layout is derived from
//     scaffoldTouchLayout(baseIr) (reseed) or the shipped .keyman-touch-layout
//     (import-adapt), with the locked desktop modifications applied on BOTH
//     paths — see the `mods`/`touchLayoutJson` memos below.
//   - The "already in touch layout" detection seed (`detectionSeedLayout`,
//     powering the auto-detected "already" suggestion and the "already
//     covered" chars in the coverage guard below) is SEED-SOURCE-AWARE
//     (spec 035 contracts/simplification.md): import-adapt walks the shipped
//     layout with desktop mods replayed, reseed walks a fresh scaffold with
//     mods replayed — never the author's own Phase E edits (see
//     `deriveSeedLayout` in buildTouchLayoutJson.ts, and the
//     `detectionSeedLayout` memo below).
//
// RIGHT pane: live phone-mode OSK preview.
//   - useKeyboardArtifact + OSKFrame wiring. Runs exclusively in touch mode.
//   - VFS transform injects the derived touch layout per the spec 035 R11
//     emission matrix (reseed always; import-adapt when mods/edits warrant
//     it); a truly-untouched import-adapt leaves the shipped file verbatim.
//   - "Touch preview" label matches MechanismGallery's "Live preview" label style.
//
// Touch lint (Layer C checks 18.1–18.6, including the KM_LINT_TOUCH_UNCOVERED
// coverage guard) stays below the character cards, same position as before.
// FR-008 completion gate: handleContinue re-runs touchCoverage on the same
// layout lint audits and refuses to complete (surfacing an inline message)
// while any inventory char is unreachable — see `layoutForLintAndGate` and
// `uncoveredMessage` below.
//
// Single 300 ms debounce contract upheld — no second timer introduced.

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { TouchAssignment, MechanismRef, TouchLayoutIR } from "@keyboard-studio/contracts";
import { createVirtualFS, toUPlusNotation, isDecomposableAccented, formatUncoveredTouchMessage } from "@keyboard-studio/contracts";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { parseTouchLayout, touchCoverage } from "@keyboard-studio/engine";
import { buildTouchLayoutJson, deriveSeedLayout } from "../../lib/buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import { deriveDesktopModifications } from "../../lib/deriveDesktopModifications.ts";
import { extractMechanismHostKey } from "../../lib/extractMechanismHostKey.ts";
import { shouldEmitTouchLayout, resolveTouchSeedSource } from "../../lib/touchEmission.ts";
import { ErrorText } from "../../ui/index.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { promoteOnManualEdit } from "./touchBehavior.ts";
import { displayChar } from "../../lib/irToCarveNodes.ts";
import { isMutateSeamEnabled } from "../../flags/mutateFlag.ts";
import { LintSummary } from "../../lint/index.ts";
import { useTouchLint } from "../../hooks/useTouchLint.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec, VfsTransform } from "../../hooks/useKeyboardArtifact.ts";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { KeyPickerField } from "./KeyPickerField.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import { usePositionalCharNav } from "./usePositionalCharNav.ts";
import { AssignLoopShell } from "./AssignLoopShell.tsx";
import { CharScrollStrip } from "./parts/CharScrollStrip.tsx";
import { getCharMechanisms } from "./parts/charMechanisms.ts";
import { KEY_OPTIONS, VALID_HOST_KEYS } from "../../lib/keyOptions.ts";
import { resolveKeyPickerSelection, resolvedVkeyOf } from "../../lib/charInput.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
  galleryPageStyle as pageStyle,
  galleryGhostBtn as ghostBtn,
  gallerySelectStyle as selectStyle,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The empty/no-op DesktopModifications — the mods memo's fallback when baseIr is null. */
const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };

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
function touchMechanismLabel(
  target: string,
  m: MechanismRef,
  t: (descriptor: { id: string; message: string }) => string,
): string {
  const patternId = m.patternId;
  const sv = m.slotValues ?? {};
  const hkShort = sv["hostKey"] ? hostKeyShortLabel(sv["hostKey"]) : "";
  if (patternId === "touch_inherited") {
    return `${target} · ${t({ id: "editor.assignLoop.touch.mechanismLabel.inherited", message: "inherited" })}`;
  }
  if (patternId === "longpress_alternates") {
    return `${target} · ${t({ id: "editor.assignLoop.touch.mechanismLabel.longpress", message: "long-press" })} ${hkShort}`;
  }
  if (patternId === "flick_gestures") {
    const dir = sv["direction"] ?? "";
    return `${target} · ${t({ id: "editor.assignLoop.touch.mechanismLabel.flick", message: "flick" })} ${hkShort} ${dirArrow(dir)}`.trimEnd();
  }
  if (patternId === "multitap") {
    return `${target} · ${t({ id: "editor.assignLoop.touch.mechanismLabel.multitap", message: "multitap" })} ${hkShort}`;
  }
  if (patternId === "touch_key_replace") {
    return `${target} · ${t({ id: "editor.assignLoop.touch.mechanismLabel.replace", message: "replace" })} ${hkShort}`;
  }
  return target;
}


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

// pageStyle and ghostBtn are imported (aliased) from ../../lib/galleryTheme.ts
// — shared byte-for-byte with MechanismGallery.tsx/SequenceGallery.tsx rather
// than redefined here.

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

// Chrome (option labels); built per-render from t() below since this needs an
// active useLingui() context — see buildFlickDirections.
function buildFlickDirections(
  t: (descriptor: { id: string; message: string }) => string,
): ReadonlyArray<{ value: string; label: string }> {
  return [
    { value: "", label: t({ id: "editor.assignLoop.touch.flickChoosePlaceholder", message: "-- choose direction --" }) },
    { value: "n", label: t({ id: "editor.assignLoop.touch.flickUp", message: "Up (north)" }) },
    { value: "s", label: t({ id: "editor.assignLoop.touch.flickDown", message: "Down (south)" }) },
    { value: "e", label: t({ id: "editor.assignLoop.touch.flickRight", message: "Right (east)" }) },
    { value: "w", label: t({ id: "editor.assignLoop.touch.flickLeft", message: "Left (west)" }) },
  ];
}

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
  const { t } = useLingui();
  const flickDirections = buildFlickDirections(t);
  // Named local for the dotted-circle-wrapped char used in the <Trans> macros
  // below — a simple identifier extracts as a NAMED lingui placeholder (e.g.
  // {currentCharDisplay}), whereas calling displayChar() inline inside the
  // macro collapses it to a POSITIONAL {0}/{1}, which is what broke the fr
  // catalog (see the module-level fix note near MechanismGallery's twin).
  const currentCharDisplay = displayChar(currentChar);
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
        <Trans id="editor.assignLoop.touch.howToReachIt">How to reach it on touch:</Trans>
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
            <Trans id="editor.assignLoop.touch.method.longpress.title">Long-press on a key</Trans>
          </span>
          {method !== "longpress_alternates" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.touch.method.longpress.summary">
                Hold a key to reveal {currentCharDisplay} as a long-press option.
              </Trans>
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
              <span><Trans id="editor.assignLoop.touch.hostKeyLabel">Host key:</Trans></span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({ id: "editor.assignLoop.touch.longpress.hostKeySelectAriaLabel", message: "Host key for long-press" })}
                customInputAriaLabel={t({ id: "editor.assignLoop.touch.longpress.hostKeyCustomAriaLabel", message: "Custom character for long-press host key" })}
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
            <Trans id="editor.assignLoop.touch.method.flick.title">Swipe a key (flick)</Trans>
          </span>
          {method !== "flick_gestures" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.touch.method.flick.summary">
                Swipe a key in a direction to produce {currentCharDisplay}.
              </Trans>
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
              <span><Trans id="editor.assignLoop.touch.hostKeyLabel">Host key:</Trans></span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({ id: "editor.assignLoop.touch.flick.hostKeySelectAriaLabel", message: "Host key for flick" })}
                customInputAriaLabel={t({ id: "editor.assignLoop.touch.flick.hostKeyCustomAriaLabel", message: "Custom character for flick host key" })}
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
              <Trans id="editor.assignLoop.touch.directionLabel">Direction:</Trans>
              <select
                value={flickDirection}
                onChange={(e) => onFlickDirectionChange(e.target.value)}
                aria-label={t({ id: "editor.assignLoop.touch.flickDirectionAriaLabel", message: "Flick direction" })}
                style={selectStyle}
              >
                {flickDirections.map((o) => (
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
            <Trans id="editor.assignLoop.touch.method.multitap.title">Tap multiple times (multitap)</Trans>
          </span>
          {method !== "multitap" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.touch.method.multitap.summary">
                Tap a key rapidly more than once to reach {currentCharDisplay}.
              </Trans>
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
              <span><Trans id="editor.assignLoop.touch.hostKeyLabel">Host key:</Trans></span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({ id: "editor.assignLoop.touch.multitap.hostKeySelectAriaLabel", message: "Host key for multitap" })}
                customInputAriaLabel={t({ id: "editor.assignLoop.touch.multitap.hostKeyCustomAriaLabel", message: "Custom character for multitap host key" })}
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
            <Trans id="editor.assignLoop.touch.method.replace.title">Replace a key</Trans>
          </span>
          {method !== "touch_key_replace" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.touch.method.replace.summary">
                Make a key type {currentCharDisplay} directly on the touch keyboard.
              </Trans>
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
              <span><Trans id="editor.assignLoop.touch.hostKeyLabel">Host key:</Trans></span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({ id: "editor.assignLoop.touch.replace.hostKeySelectAriaLabel", message: "Host key to replace" })}
                customInputAriaLabel={t({ id: "editor.assignLoop.touch.replace.hostKeyCustomAriaLabel", message: "Custom character for the key to replace" })}
              />
            </div>
            <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
              <Trans id="editor.assignLoop.touch.method.replace.summary">
                Make a key type {currentCharDisplay} directly on the touch keyboard.
              </Trans>
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
   * empty-inventory guard). Spec 035 R12 (re-entry path): the host wires this
   * to the "touch_seed_source" chooser step — NOT directly to "mechanisms" —
   * so a returning author can reconsider Import vs Reseed even when the fork
   * was skipped this pass (a recorded, non-stale choice routes straight from
   * mechanisms to touch). The chooser's own Back is what reaches "mechanisms"
   * (locked/read-only; no unlock is performed).
   */
  onBack: () => void;
}

export function TouchGallery({ onComplete, onBack }: TouchGalleryProps) {
  const { t } = useLingui();
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  // spec 035 R3/R11 — the carve overlay + Phase C assignments feed
  // deriveDesktopModifications (mods memo below); touchSeedSource feeds the
  // R11 emission matrix. Read here (not inline in the memo) so the mods/
  // emission memos below can depend on stable primitives.
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const touchSeedSourceStored = useSurveySessionStore((s) => s.touchSeedSource);

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

  // Stable array of charTouch's values, memoized on the Map reference itself
  // (charTouch is only ever replaced immutably on a real edit — see
  // setCharTouch call sites — so this recomputes exactly when touchKey would,
  // not on every unrelated render). Fed to CharScrollStrip's `assignments`
  // prop: passing `[...charTouch.values()]` inline there would build a new
  // array identity every render and thrash that component's own
  // useMemo([chars, assignments, modality]).
  const charTouchAssignments = useMemo(() => [...charTouch.values()], [charTouch]);

  // Stable primitive key so the mods memo only recomputes when the carve
  // overlay or Phase C assignments actually change (the Set/array identities
  // are replaced immutably on every mutation, so a size/length-based key is a
  // cheap, correct proxy — same precedent as touchKey above).
  const modsDepsKey = `${deletedNodeIds.size}:${deletedItemIds.size}:${phaseResults.length}`;

  // Desktop modifications to replay onto the touch seed (spec 035 R3) — carve
  // removals (Phase D) + Phase C individual letter placements. Fed to
  // buildTouchLayoutJson on BOTH derivation paths and to the R11 emission
  // matrix below (mods.length > 0 can trigger emission even with zero Phase E
  // edits).
  const mods = useMemo<DesktopModifications>(() => {
    if (baseIr === null) return EMPTY_MODS;
    return deriveDesktopModifications(baseIr, deletedNodeIds, deletedItemIds, phaseResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, modsDepsKey]);

  // Resolved seed-source choice (spec 035 R4/R11) — the raw store value may be
  // null (defensive: author somehow reached touch without the fork); the
  // Entity-5 default is applied here via resolveTouchSeedSource so preview,
  // lint, and this component's own emission decision agree.
  const resolvedSeedSource = useMemo(
    () => resolveTouchSeedSource(touchSeedSourceStored, resolveBaseTouchJson(baseVfs) !== undefined),
    [touchSeedSourceStored, baseVfs],
  );

  // Build the derived touch layout JSON per the spec 035 R11 emission matrix:
  //   - "reseed-from-desktop" -> ALWAYS derive + emit (even with zero Phase E
  //     edits and empty mods — SC-002 requires the file to exist).
  //   - "import-adapt" AND (mods non-empty OR >=1 real Phase E edit) -> derive
  //     + emit.
  //   - "import-adapt" with empty mods and no real edit -> emit NOTHING (the
  //     shipped file, if any, is used verbatim — a byte-preserving no-op).
  //   - buildTouchLayoutJson returning null (engine failure) -> emit nothing.
  //
  // "Real edit" = an assignment with at least one mechanism whose patternId
  // !== "touch_inherited" (an assignment may carry several mechanisms — issue
  // 3, multiple methods per character). This filter matches handleContinue
  // exactly (the single source of truth).
  const touchLayoutJson = useMemo(() => {
    const appliedEdits = [...charTouch.values()].filter((a) =>
      a.mechanisms.some((m) => m.patternId !== "touch_inherited"),
    );
    if (baseIr === null) return null;
    if (!shouldEmitTouchLayout(resolvedSeedSource, mods, appliedEdits.length > 0)) return null;
    // Case B: base ships a touch layout AND the author chose import-adapt →
    // apply faithfully onto raw JSON copy. Case A (including reseed, which
    // must NOT receive the shipped layout — R10 discards it): IR-based path.
    const baseTouchJson =
      resolvedSeedSource === "reseed-from-desktop" ? undefined : resolveBaseTouchJson(baseVfs);
    return buildTouchLayoutJson(baseIr, appliedEdits, {
      ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
      mods,
      seedSource: resolvedSeedSource,
    }).json;
    // touchKey drives re-evaluation when charTouch changes (Map identity is
    // not stable; the key is). baseIr is a stable snapshot post-lockDesktop.
    // baseVfs is stable after instantiation but included for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, touchKey, baseVfs, mods, resolvedSeedSource]);

  // The seed layout for the chosen seed source, with desktop mods (spec 035
  // R3) replayed but NO Phase E edits — via `deriveSeedLayout`
  // (buildTouchLayoutJson.ts), the shared seed-derivation implementation
  // also used by buildTouchLayoutJson's own Case A branch; do not duplicate
  // the Case A/B branching inline here. Depends only on
  // baseIr/baseVfs/mods/resolvedSeedSource (NOT touchKey/charTouch — the
  // author's own edits are deliberately excluded, per spec 035
  // simplification.md: "already in layout" means already in the SEED). null
  // only when baseIr has not loaded yet.
  const detectionSeedLayout = useMemo<TouchLayoutIR | null>(() => {
    if (baseIr === null) return null;
    try {
      const baseTouchJson =
        resolvedSeedSource === "reseed-from-desktop" ? undefined : resolveBaseTouchJson(baseVfs);
      return deriveSeedLayout(baseIr, {
        ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
        mods,
        seedSource: resolvedSeedSource,
      }).layout;
    } catch (err) {
      console.error("[TouchGallery] detectionSeedLayout derivation failed:", err);
      return null;
    }
  }, [baseIr, baseVfs, mods, resolvedSeedSource]);

  // The layout the lint (18.6 touch-coverage guard) and the stage-completion
  // gate (FR-008) both audit: the derived layout INCLUDING current Phase E
  // edits when touchLayoutJson is non-null (the R11 matrix decided to emit),
  // else the effective seed (detectionSeedLayout) — a truly-untouched
  // import-adapt with a shipped layout still has a real layout to check
  // coverage against even though nothing is emitted yet.
  const layoutForLintAndGate = useMemo<TouchLayoutIR | null>(() => {
    if (touchLayoutJson !== null) {
      try {
        return parseTouchLayout(touchLayoutJson);
      } catch (err) {
        console.error("[TouchGallery] layoutForLintAndGate derivation failed:", err);
        return detectionSeedLayout;
      }
    }
    return detectionSeedLayout;
  }, [touchLayoutJson, detectionSeedLayout]);

  // VFS transform: inject the derived touch layout whenever touchLayoutJson
  // is non-null (the R11 matrix above already decided emission — reseed
  // always, import-adapt only when mods/edits warrant it). When
  // touchLayoutJson is null — either the R11 matrix said "don't emit" or the
  // emit pipeline failed — leave the VFS untouched so KMW renders its own
  // polished native default (or the keyboard's shipped .keyman-touch-layout
  // file is used verbatim, a byte-preserving no-op).
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

  // FR-008 completion gate: names of chars with no reachable touch mechanism
  // on the final layout, formatted for display near the completion control.
  // Set by handleContinue when it refuses to complete; cleared on the next
  // edit (see the touchKey-keyed effect below) rather than left stale once
  // the author starts fixing the gap.
  const [uncoveredMessage, setUncoveredMessage] = useState<string | null>(null);

  // Clear a stale gate message as soon as the author makes another edit —
  // "cleared when coverage passes or edits change" (T016b): re-running
  // handleContinue will re-surface the message if the edit didn't fix it.
  // Deliberately keyed on touchKey only (not currentChar): the message lists
  // ALL uncovered inventory chars at once, not per-character state, so simply
  // navigating to a different character must NOT clear it — only an actual
  // edit (or a fresh handleContinue re-check) should.
  useEffect(() => {
    setUncoveredMessage(null);
  }, [touchKey]);

  // Completion — emit only explicitly-configured characters. Declared before
  // usePositionalCharNav below because the hook calls it directly when
  // forward navigation reaches the last character (the last character's
  // forward button IS the phase completion, not a further navigation step).
  //
  // FR-008 gate: before completing, re-run touchCoverage on the same layout
  // lint audits (layoutForLintAndGate — includes current Phase E edits).
  // While any inventory char is uncovered, refuse to call onComplete and
  // surface an inline message naming the uncovered chars instead.
  const handleContinue = useCallback(() => {
    // Emit only chars where a real (non-inherited) or inherited assignment was
    // explicitly accepted — everything in charTouch was put there by the user.
    // `.some()` rather than `mechanisms[0]` (regression 3, multi-method): a
    // character can carry several mechanisms, so any real (non-inherited) one
    // qualifies it, not just whichever happens to be first in the array.
    const assignments: TouchAssignment[] = [...charTouch.values()].filter((a) =>
      a.mechanisms.some((m) => m.patternId !== "touch_inherited"),
    );
    if (layoutForLintAndGate !== null) {
      const { uncovered } = touchCoverage(layoutForLintAndGate, inventory);
      if (uncovered.length > 0) {
        setUncoveredMessage(uncovered.map((c) => formatUncoveredTouchMessage(c)).join("; "));
        return;
      }
    }
    onComplete(assignments);
  }, [charTouch, onComplete, layoutForLintAndGate, inventory]);

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
    handleSelectChar,
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
  // Phase C desktop assignments + detected-chars from the seed-source derivation
  // ---------------------------------------------------------------------------
  // (phaseResults is read near the top of the component alongside the other
  // spec 035 R3 mods inputs — deletedNodeIds/deletedItemIds/touchSeedSource.)
  //
  // detectedChars ("already in touch layout" — powers the "already" suggestion,
  // Accept → touch_inherited) is derived from detectionSeedLayout (the chosen
  // seed source + replayed desktop mods, see the `detectionSeedLayout` memo
  // above) via the shared engine touchCoverage traversal, rather than an
  // inline scaffoldTouchLayout(baseIr) walk — see spec 035
  // contracts/simplification.md. touchCoverage's `uncovered` set is inverted
  // against `inventory` (touchCoverage only ever answers "is this inventory
  // char reachable", so a covered-set derived this way is a faithful
  // replacement for the old any-char scaffold-walk set: the suggestion logic
  // below only ever queries inventory chars).

  const desktopAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical" && a.scope === "individual",
      ),
    [phaseResults],
  );

  const detectedChars = useMemo<Set<string>>(() => {
    if (detectionSeedLayout === null) return new Set<string>();
    try {
      const { uncovered } = touchCoverage(detectionSeedLayout, inventory);
      const uncoveredSet = new Set(uncovered);
      return new Set(inventory.filter((c) => !uncoveredSet.has(c)));
    } catch (err) {
      console.error("[TouchGallery] detectedChars coverage failed", err);
      return new Set<string>();
    }
    // inventoryKey is the stable primitive proxy for `inventory` (declared
    // above, before this memo) — same precedent as touchKey/modsDepsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionSeedLayout, inventoryKey]);

  // Part 3 (character-scroll-sequence-gallery) — every recorded sequence that
  // USES currentChar in any slot (content/indicator/output), across the whole
  // working copy. Sequences are always recorded with modality "physical"
  // (SequenceGallery never writes touch assignments), so this is sourced from
  // desktopAssignments (Phase C, physical) rather than the local charTouch
  // map — the `modality` argument only gates PRODUCES, which this section
  // does not use. Shares the getCharMechanisms selector with CharScrollStrip's
  // badge and MechanismGallery's own bottom list — see charMechanisms.ts.
  const currentCharUsesSequences = useMemo(
    () =>
      currentChar !== null
        ? getCharMechanisms(currentChar, desktopAssignments, "touch").usesSequences
        : [],
    [currentChar, desktopAssignments],
  );

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
      // Shared host-key extraction (packages/studio/src/lib/extractMechanismHostKey.ts) —
      // an unrecognized pattern/strategy returns undefined.
      const result = extractMechanismHostKey(m);
      if (!result) return { kind: "none" };
      return result;
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
  // with the same touchLayoutJson the preview uses (lint, preview, output agree
  // per the spec 035 R11 emission matrix — see the touchLayoutJson memo above).
  // When touchLayoutJson is null — baseIr not yet set, the R11 matrix said
  // "don't emit", or the emit pipeline failed — lint sees the raw baseVfs
  // (the shipped file, if any, stays verbatim — a byte-preserving no-op).
  // keyboardId in deps so the path key stays correct if the id changes.
  const editedVfsForLint = useMemo(() => {
    if (baseVfs === null) return null;
    if (touchLayoutJson === null || keyboardId === null) return baseVfs;
    const cloned = createVirtualFS(baseVfs.entries());
    cloned.set(`source/${keyboardId}.keyman-touch-layout`, touchLayoutJson);
    return cloned;
  }, [baseVfs, touchLayoutJson, keyboardId]);

  // Touch lint context (spec 035 FR-008/18.6) — feeds KM_LINT_TOUCH_UNCOVERED
  // alongside 18.1–18.5. `layoutForLintAndGate` is the SAME layout the
  // completion gate in handleContinue checks (edits included when
  // touchLayoutJson is non-null, else the effective seed) so lint and the
  // gate cannot drift. null when baseIr has not loaded — useTouchLint treats
  // a null/undefined context as "run the context-free checks only".
  const touchLintContext = useMemo(
    () => (layoutForLintAndGate !== null ? { layout: layoutForLintAndGate, inventory } : null),
    [layoutForLintAndGate, inventory],
  );

  // Touch lint — runs on the projected (edited) VFS so checks 18.1–18.5 reflect
  // Phase E edits. The existing 300ms debounce inside useTouchLint is unchanged
  // (fs + context are debounced together — Constitution IV, no second timer).
  const { touchFindings, touchLintRunning } = useTouchLint(editedVfsForLint, keyboardId, touchLintContext);

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
            aria-label={t({ id: "editor.assignLoop.touch.backToMechanismsAriaLabel", message: "Back to mechanisms" })}
            style={ghostBtn}
          >
            <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
          </button>
          <div
            style={{
              margin: "60px auto",
              textAlign: "center",
              color: TEXT_DIM,
            }}
          >
            <p style={{ fontSize: 15 }}>
              <Trans id="editor.assignLoop.touch.noInventory">
                No characters in inventory yet. Complete the Survey (Phase B) to
                confirm which characters your keyboard must produce.
              </Trans>
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
        eyebrow={t({ id: "editor.assignLoop.touch.intro.eyebrow", message: "Next step · Touch" })}
        title={t({ id: "editor.assignLoop.touch.intro.title", message: "Welcome to the Touch Gallery" })}
        body={
          <Trans id="editor.assignLoop.touch.intro.body">
            Your desktop layout is locked in. Now you&rsquo;ll set how each
            character is reached on phones and tablets, where there is no
            physical keyboard.
          </Trans>
        }
        bullets={[
          <Trans id="editor.assignLoop.touch.intro.bullet1" key="bullet1">
            You&rsquo;ll go character by character, just like the desktop gallery.
          </Trans>,
          <Trans id="editor.assignLoop.touch.intro.bullet2" key="bullet2">
            Pick a touch method &mdash; long-press, flick, multitap, or replace
            &mdash; or Skip characters that already work.
          </Trans>,
          <Trans id="editor.assignLoop.touch.intro.bullet3" key="bullet3">
            These choices apply to touch only and never change your desktop layout.
          </Trans>,
        ]}
        startAriaLabel={t({ id: "editor.assignLoop.touch.intro.startAriaLabel", message: "Start the touch gallery" })}
        onStart={() => {
          markGalleryIntroSeen("touch");
          setShowIntro(false);
        }}
        onBack={onBack}
        backAriaLabel={t({ id: "editor.assignLoop.touch.backToMechanismsPhaseCAriaLabel", message: "Back to mechanisms (Phase C)" })}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Left pane content
  // ---------------------------------------------------------------------------

  // Named local for the dotted-circle-wrapped current char, used inside the
  // <Trans> suggestion-card macros below. A simple identifier extracts as a
  // NAMED lingui placeholder; calling displayChar() inline in the macro
  // collapses it to a POSITIONAL {0}/{1} (the cause of the fr catalog
  // mismatch this fix addresses). Null only when currentChar is null, in
  // which case none of the guarded blocks below render it.
  const currentCharDisplay = currentChar !== null ? displayChar(currentChar) : null;

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
        aria-label={t({
          id: "editor.assignLoop.touch.coverageAriaLabel",
          message: `${{ configured: charTouch.size }} of ${{ total: totalChars }} characters configured`,
        })}
        style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}
      >
        <Trans id="editor.assignLoop.touch.coverageLine">
          {charTouch.size} of {totalChars} configured
        </Trans>
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
              <Trans id="editor.assignLoop.touch.mappingEyebrow">Touch mapping</Trans>
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                style={{ fontSize: 36, fontFamily: "monospace", lineHeight: 1 }}
                aria-label={`${toUPlusNotation(currentChar)} ${currentChar}`}
              >
                {displayChar(currentChar)}
              </span>
              <span style={{ fontSize: 13, color: TEXT_DIM }}>
                {toUPlusNotation(currentChar)}
              </span>
            </div>
          </div>

          {/* Top toolbar row — Back (left) + the primary forward action
              (right), on the same horizontal level; it carries marginLeft:
              "auto" so it holds position. The old "Previous character"
              button that used to sit in this cluster has been replaced by
              the CharScrollStrip below (any character, not just the
              immediately-previous one, is reachable via its chips). */}
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
                  ? t({ id: "editor.assignLoop.touch.backToMechanismsPhaseCAriaLabel", message: "Back to mechanisms (Phase C)" })
                  : t({ id: "editor.assignLoop.touch.backToPreviousCharacterAriaLabel", message: "Back to previous character" })
              }
              style={ghostBtn}
            >
              <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
            </button>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                type="button"
                data-testid="touch-continue"
                onClick={handleNext}
                disabled={!canGoNext}
                aria-label={
                  hasAnotherCharAfterCurrent
                    ? t({ id: "editor.assignLoop.nextCharacterAriaLabel", message: "Next character" })
                    : t({ id: "editor.assignLoop.doneButton", message: "Done" })
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
                {hasAnotherCharAfterCurrent
                  ? t({ id: "editor.assignLoop.nextCharacterButton", message: "Next character →" })
                  : t({ id: "editor.assignLoop.doneButton", message: "Done" })}
              </button>
            </div>
          </div>

          {/* Character scroll strip — horizontal, all of inventory; click
              any chip to jump straight to that character (replaces the old
              "Previous character" button, which only ever stepped back one
              position). Each chip's badge is the produces-count for that
              character in THIS gallery's modality (touch) — see
              charMechanisms.ts. */}
          <CharScrollStrip
            chars={inventory}
            currentChar={currentChar}
            onSelectChar={handleSelectChar}
            assignments={charTouchAssignments}
            modality="touch"
          />

          {/* FR-008 completion gate message — set by handleContinue when
              touchCoverage finds an inventory char with no reachable touch
              mechanism on the final layout; cleared on the next edit.
              ErrorText tone="warning" renders role="alert" + the canonical
              WARNING color (#d29922), matching other gate-message sites. */}
          {uncoveredMessage !== null && (
            <ErrorText tone="warning">
              <Trans id="editor.assignLoop.touch.cannotFinishYet">
                Cannot finish yet — {uncoveredMessage}.
              </Trans>
            </ErrorText>
          )}

          {/* Suggestion card (shown until accepted/dismissed; skipped entirely
              when there is no suggestion to offer) */}
          {!showChooser && (
            <div
              role="note"
              aria-label={t({ id: "editor.assignLoop.touch.suggestion.ariaLabel", message: "Touch access method suggestion" })}
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
                    <Trans id="editor.assignLoop.touch.suggestion.longpressText">
                      Suggested: long-press{" "}
                      {suggestion.hostKey
                        ? hostKeyShortLabel(suggestion.hostKey)
                        : t({ id: "editor.assignLoop.touch.aKeyPlaceholder", message: "a key" })}{" "}
                      to reach {currentCharDisplay}
                    </Trans>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      aria-label={t({
                        id: "editor.assignLoop.touch.suggestion.useLongpressAriaLabel",
                        message: `Use suggested long-press method for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                      })}
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
                      <Trans id="editor.assignLoop.suggestion.acceptButton">Accept</Trans>
                    </button>
                    <button
                      type="button"
                      onClick={handleSuggestionChange}
                      aria-label={t({ id: "editor.assignLoop.touch.chooseDifferentMethodAriaLabel", message: "Choose a different touch method" })}
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
                      <Trans id="editor.assignLoop.suggestion.denyButton">Deny</Trans>
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
                    <Trans id="editor.assignLoop.touch.suggestion.replaceText">
                      Suggested: replace{" "}
                      {suggestion.hostKey
                        ? hostKeyShortLabel(suggestion.hostKey)
                        : t({ id: "editor.assignLoop.touch.aKeyPlaceholder", message: "a key" })}{" "}
                      with {currentCharDisplay}
                    </Trans>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      aria-label={t({
                        id: "editor.assignLoop.touch.suggestion.useReplaceAriaLabel",
                        message: `Use suggested replace method for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                      })}
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
                      <Trans id="editor.assignLoop.suggestion.acceptButton">Accept</Trans>
                    </button>
                    <button
                      type="button"
                      onClick={handleSuggestionChange}
                      aria-label={t({ id: "editor.assignLoop.touch.chooseDifferentMethodAriaLabel", message: "Choose a different touch method" })}
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
                      <Trans id="editor.assignLoop.suggestion.denyButton">Deny</Trans>
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
                    <Trans id="editor.assignLoop.touch.suggestion.alreadyText">
                      {currentCharDisplay} is already on the touch keyboard. Keep it as is?
                    </Trans>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleSuggestionAccept}
                      aria-label={t({
                        id: "editor.assignLoop.touch.suggestion.keepAlreadyAriaLabel",
                        message: `Keep ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }} as already in touch layout`,
                      })}
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
                      <Trans id="editor.assignLoop.suggestion.acceptButton">Accept</Trans>
                    </button>
                    <button
                      type="button"
                      onClick={handleSuggestionChange}
                      aria-label={t({ id: "editor.assignLoop.touch.makeChangesAriaLabel", message: "Make changes to touch method" })}
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
                      <Trans id="editor.assignLoop.suggestion.denyButton">Deny</Trans>
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

          {/* Sequences using this character (Part 3) — every recorded
              multi_char_sequence where currentChar appears in ANY slot
              (content, indicator, or output). Sequences are a desktop-only
              (physical) concept — sourced from desktopAssignments — but
              still worth surfacing here: an author configuring touch access
              may need to know this character is already "in play" as a
              sequence's content/indicator/output on the desktop layout.
              Read-only — mirrors SequenceGallery's own "Recorded sequences"
              card style; editing a sequence stays owned by the Sequence
              Gallery. */}
          {currentCharUsesSequences.length > 0 && (
            <div
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: "10px 14px",
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
                <Trans id="editor.assignLoop.usesSequences.heading">
                  Sequences using this character
                </Trans>
              </p>
              {currentCharUsesSequences.map(({ target, ref }, idx) => {
                const seqContent = ref.slotValues?.["firstLetterOut"] ?? "";
                const seqIndicator = ref.slotValues?.["secondLetter"] ?? "";
                return (
                  <div
                    key={`${target}\0${seqContent}\0${seqIndicator}\0${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      fontFamily: FONT,
                    }}
                  >
                    <span style={{ color: TEXT_MAIN }}>
                      {displayChar(seqContent)}
                      {" + "}
                      {displayChar(seqIndicator)}
                      {" "}
                      &rarr;{" "}
                      <span style={{ fontFamily: "monospace", fontSize: 15 }}>
                        {displayChar(target)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
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
                aria-label={t({
                  id: "editor.assignLoop.touch.applyMethodAriaLabel",
                  message: `Apply touch method for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                })}
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
                <Trans id="editor.assignLoop.applyMethodButton">Apply method</Trans>
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              aria-label={t({
                id: "editor.assignLoop.skipCharacterAriaLabel",
                message: `Skip this character (${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }})`,
              })}
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
              <Trans id="editor.assignLoop.skipCharacterButton">Skip this character</Trans>
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
            <Trans id="editor.assignLoop.touch.configuredHeading">Configured</Trans>
          </p>
          <div
            role="group"
            aria-label={t({ id: "editor.assignLoop.touch.configuredGroupAriaLabel", message: "Configured characters — click to remove" })}
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {[...charTouch.entries()].flatMap(([c, assignment]) =>
              assignment.mechanisms.map((m, i) => (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  onClick={() => handleRemoveMechanism(c, i)}
                  aria-label={t({
                    id: "editor.assignLoop.touch.removeMechanismAriaLabel",
                    message: `Remove ${{ notation: toUPlusNotation(c) }} ${{ label: touchMechanismLabel(c, m, t) }}`,
                  })}
                  title={t({
                    id: "editor.assignLoop.removeCharacterTitle",
                    message: `${{ notation: toUPlusNotation(c) }} — click to remove`,
                  })}
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
                  {/* Visible chip label only — routes the target through
                      displayChar() so a standalone combining mark shows the
                      dotted circle; the aria-label above keeps the raw
                      target (via touchMechanismLabel(c, ...)) untouched. */}
                  {touchMechanismLabel(displayChar(c), m, t)}
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
          <Trans id="editor.assignLoop.touch.layoutChecksHeading">Touch layout checks</Trans>
          {touchLintRunning ? ` ${t({ id: "editor.assignLoop.touch.runningSuffix", message: "(running...)" })}` : ""}
        </p>
        <LintSummary findings={touchFindings} />
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Two-pane layout (via the shared AssignLoopShell)
  // ---------------------------------------------------------------------------

  const headerExtras = (
    <>
      {totalChars > 0 && (
        <span
          aria-label={t({
            id: "editor.assignLoop.touch.characterCounterAriaLabel",
            message: `Character ${{ n: currentIdx + 1 }} of ${{ total: totalChars }}`,
          })}
          style={{
            fontSize: 12,
            color: TEXT_DIM,
            fontFamily: FONT,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <Trans id="editor.assignLoop.touch.characterCounter">
            Character {Math.max(currentIdx + 1, 1)} of {totalChars}
          </Trans>
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
        <Trans id="editor.assignLoop.touch.headerDescription">
          For each character, choose how it appears on the touch keyboard. Your
          desktop layout is locked — these apply to phone and tablet only.
        </Trans>
      </span>
    </>
  );

  return (
    <AssignLoopShell
      headingText={t({ id: "editor.assignLoop.touchGalleryHeading", message: "Touch Gallery" })}
      modalityLabel={t({ id: "editor.assignLoop.modality.touch", message: "Touch" })}
      modalityLabelPlacement="inline"
      headerExtras={headerExtras}
      leftContent={leftContent}
      rightContent={
        <GalleryPreviewPane
          baseKeyboard={baseKeyboard}
          stage={stage}
          retry={retry}
          {...(handleKeyTap !== undefined ? { onKeyTap: handleKeyTap } : {})}
          defaultOskMode="touch"
          heading={t({ id: "editor.assignLoop.touch.previewHeading", message: "Touch preview" })}
          warningLabel={t({ id: "editor.assignLoop.touch.previewWarnings", message: "Preview warnings:" })}
        />
      }
    />
  );
}
