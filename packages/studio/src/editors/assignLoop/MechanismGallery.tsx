// MechanismGallery — Phase C "add a key" flow (two-pane redesign).
//
// On first entry a brief intro splash orients the author to the desktop
// authoring flow; "Get started" dismisses it for the rest of the working-copy
// session (persisted via the galleryIntrosSeen store flag).
//
// LEFT pane: one-character-at-a-time assignment loop.
//   - Walks lettersToAdd in strict positional order (index-based, not a
//     covered search) — Back/Next always move by one position, so an
//     already-covered character is never jumped over.
//   - Offers up to four methods:
//       S-03 (sequence) — always shown
//       S-02 (deadkey)  — only for decomposable accented letters
//       S-01 (swap)     — always shown; user picks a physical key
//       S-08 (ralt)     — always shown; user picks a base key + a modifier
//                         layer combo (up to four ModifierTokens — see
//                         @keyboard-studio/engine's modifierCombos.ts)
//   - "Add key" records a MechanismAssignment(scope:"individual"); the user
//     advances explicitly via "Next character"/"Done".
//   - "Skip this character" is pure forward navigation — it records nothing.
//     Only Apply marks a character handled; a skipped character stays
//     unimplemented and is never counted toward coverage.
//   - Forward from the LAST character is the phase completion ("Done" calls
//     onComplete) rather than landing on a null currentChar.
//   - Selecting the S-03 sequence method swaps the RIGHT pane's live preview
//     for SequenceBuilderPanel — a one-character sequence builder that
//     records a real multi_char_sequence MechanismAssignment on its own
//     Apply. There is no separate Sequence Gallery step; Apply/Cancel both
//     return the method to "swap", which swaps the right pane back to the
//     preview (see rightContent below).
//
// RIGHT pane: GalleryPreviewWithPatterns (live OSK preview), or
// SequenceBuilderPanel while method === "sequence" (see above).
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
import type { I18n } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg, plural } from "@lingui/core/macro";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import { useShallow } from "zustand/react/shallow";
import type {
  BaseKeyboard,
  Pattern,
  MechanismAssignment,
  PlacementMap,
  PlacementWorklist,
} from "@keyboard-studio/contracts";
import { toUPlusNotation, isDecomposableAccented } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { TOUCH_STEP_ID } from "../../steps/reducer.ts";
import { getPatternLibraryService } from "../../lib/services.ts";
import { displayChar } from "../../lib/irToCarveNodes.ts";
import type { AxisFill, DiscoveryAxisVector } from "@keyboard-studio/contracts";
import {
  defaultFillAxes,
  caseCounterpart,
  isMnemonicLayout,
  planShiftAssignment,
  buildShiftRuleLines,
  buildBaseRuleLines,
  buildCasePairRuleLines,
  MODIFIER_EXCLUSIONS,
  canonicalizeCombo,
  comboToKeySpec,
  collectModifierTokensInUse,
  type ModifierToken,
} from "@keyboard-studio/engine";
import { useKeyboardArtifact, type ScaffoldSpec, type Stage } from "../../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { useInventoryDiff } from "../../hooks/useInventoryDiff.ts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import { getSuggestionForChar } from "../../survey/placementSeeds.ts";
import { KEY_OPTIONS, ALL_PICKABLE_KEYS, CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import {
  resolveCharInput,
  resolveKeyPickerSelection,
  resolvedVkeyOf,
  isLoneCombiningMark,
  reflectCharInput,
  type ResolveCharInputOptions,
  type KeyPickerResolveOptions,
} from "../../lib/charInput.ts";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { KeyPickerField } from "./KeyPickerField.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import { usePositionalCharNav } from "./usePositionalCharNav.ts";
import { AssignLoopShell } from "./AssignLoopShell.tsx";
import { CharScrollStrip } from "./parts/CharScrollStrip.tsx";
import { UsesSequencesCard } from "./parts/UsesSequencesCard.tsx";
import { SequenceBuilderPanel, hasSequenceForChar } from "./SequenceBuilderPanel.tsx";
import { RadioGroup } from "../../ui/RadioGroup.tsx";
import {
  BG_PAGE, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
  galleryPageStyle as pageStyle,
  galleryGhostBtn as ghostBtn,
  galleryInputStyle as inputStyle,
  galleryForwardBtnStyle as forwardBtnStyle,
  gallerySelectStyle as selectStyle,
} from "../../lib/galleryTheme.ts";
import {
  PATTERN_SEQUENCE, PATTERN_DEADKEY, PATTERN_SWAP, PATTERN_RALT,
  isSequenceAssignmentForChar,
} from "./patternIds.ts";

// Re-exported for existing importers that reach the pattern id constants via
// this module; the canonical declarations now live in ./patternIds.ts.
export { PATTERN_SEQUENCE, PATTERN_DEADKEY, PATTERN_SWAP, PATTERN_RALT };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// deadkeyBaseLetter is substituted directly into a single-quoted KMN string
// literal with no escaping (substituteSlots in
// @keyboard-studio/engine/pattern-apply), so it blocks the ASCII
// straight-quote delimiters and accepts multi-token compose (e.g.
// "U+006E U+0303" -> a single composed character) — see charInput.ts.
// deadkeyBaseLetter stays single-grapheme — a multi-base deadkey needs a
// paired accented-output list, which is a separate future change (relaxing
// this alone is a hard compile error via Layer-A Check #9).
//
// singleGraphemeReason is user-facing chrome (an error string), but this
// object is constructed at module scope where no useLingui() is available —
// buildDeadkeyBaseLetterResolveOptions(i18n) below builds the localized
// version per-render; each component that needs it calls that with its own
// i18n instance. Takes an optional i18n + resolves via
// msg()/resolveMessage() rather than a bare `t` parameter — Lingui's macro
// tracks the specific binding introduced by useLingui(), so a re-bound `t`
// parameter is a distinct binding the extractor does not follow (see
// Inspector.tsx's storeBlurb for the same fix).
function buildDeadkeyBaseLetterResolveOptions(i18n?: I18n): ResolveCharInputOptions {
  return {
    multiToken: true,
    singleGrapheme: true,
    blockDelimiters: true,
    singleGraphemeReason: resolveMessage(i18n, msg({
      id: "editor.assignLoop.deadkeySingleGraphemeReason",
      message:
        "Enter one base character. (Covering several base letters with one dead key is coming later.)",
    })),
  };
}

// The S-02 deadkey trigger's resolved custom character is reused as
// `accentChar` — the deadkey's own literal output — so it needs the same
// delimiter guard as the character boxes above, unlike the SWAP/RALT/touch
// host-key pickers (which resolve solely to a K_ vkey id).
const TRIGGER_KEY_RESOLVE_OPTIONS: KeyPickerResolveOptions = {
  blockDelimiters: true,
};

/** Display label per ModifierToken for the S-08 covered-chip badge (methodLabel). */
const MODIFIER_TOKEN_LABELS: Record<string, string> = {
  SHIFT: "Shift",
  CTRL: "Ctrl",
  RCTRL: "RCtrl",
  LCTRL: "LCtrl",
  ALT: "Alt",
  RALT: "RAlt",
  LALT: "LAlt",
  CAPS: "Caps",
  NCAPS: "NCaps",
};

// Takes an optional i18n + resolves via msg()/resolveMessage() rather than a
// bare `t` parameter — Lingui's macro tracks the specific binding introduced
// by useLingui(), so a re-bound `t` parameter is a distinct binding the
// extractor does not follow (see Inspector.tsx's storeBlurb for the same fix).
function methodLabel(
  ref: { patternId: string; slotValues?: Record<string, string> },
  i18n?: I18n,
): string {
  const sv = ref.slotValues ?? {};
  switch (ref.patternId) {
    case "deadkey_single_tap": {
      const label = resolveMessage(i18n, msg({ id: "editor.assignLoop.methodLabel.deadkey", message: "Deadkey" }));
      return `${label}: ${sv["triggerKey"] ?? "?"} + ${sv["baseLetters"] ?? "?"}`;
    }
    case "simple_swap": {
      // kmnRules may be multiple lines (e.g. shift-layer CAPS/NCAPS pair) —
      // the badge only needs the bracketed vkey expression from the first line.
      const firstLine = (sv["kmnRules"] ?? "").split("\n")[0] ?? "";
      const label = resolveMessage(i18n, msg({ id: "editor.assignLoop.methodLabel.key", message: "Key" }));
      return `${label}: ${firstLine.replace(/^\+ \[/, "").replace(/\].*/, "")}`;
    }
    case "modifier_as_layer_switch": {
      // altgrKeyList is a bracket-notation combo spec — e.g. "[RALT K_E]" or
      // "[SHIFT CTRL RALT K_E]" for an arbitrary generalized S-08 combo
      // (modifierCombos.ts comboToKeySpec). The vkey is always the last token.
      const altgrKeyList = sv["altgrKeyList"] ?? "";
      const parts = altgrKeyList.replace(/^\[/, "").replace(/\]$/, "").split(/\s+/).filter(Boolean);
      const key = parts.pop() ?? "?";
      const prefix =
        parts.length > 0
          ? parts.map((tok) => MODIFIER_TOKEN_LABELS[tok] ?? tok).join("+")
          : resolveMessage(i18n, msg({ id: "editor.assignLoop.methodLabel.layer", message: "Layer" }));
      return `${prefix}: ${key}`;
    }
    case "multi_char_sequence":
      // Defensive fallback only — excludeSequenceMechanisms (below) keeps
      // PATTERN_SEQUENCE mechanisms out of every badge list this label feeds,
      // since sequences are tracked as a separate dimension (see the
      // "Sequences" chip row below) rather than the "Added"/"Applied methods"
      // rows. This branch exists so a raw patternId can never leak onto a
      // badge if that exclusion is ever bypassed.
      return resolveMessage(i18n, msg({ id: "editor.assignLoop.methodLabel.multiKeySequence", message: "Multi-key sequence" }));
    default:
      return ref.patternId;
  }
}

// ---------------------------------------------------------------------------
// excludeSequenceMechanisms — multi_char_sequence (PATTERN_SEQUENCE / S-03)
// mechanisms are tracked as a separate dimension (see the "Sequences" chip
// row and SequenceBuilderPanel below), even though they are recorded into the
// SAME Phase C assignments array (scope: "individual") this gallery reads via
// sessionAssignments. Without this filter, a char whose ONLY recorded
// mechanism is a sequence would show as "Added" in
// coveredChars/appliedForCurrentChar/the "Applied methods" badge row, and its
// covered-char chip's Remove control would silently delete the sequence work
// (the P1 this function fixes).
//
// An assignment made up ENTIRELY of PATTERN_SEQUENCE mechanisms is dropped
// outright — it never surfaces in this gallery's covered/applied view. An
// assignment that mixes a non-sequence mechanism with PATTERN_SEQUENCE
// mechanism(s) on the same target (permitted by the MechanismAssignment
// contract, though no current write path actually produces one — this
// gallery always appends a NEW assignment object per apply, and
// SequenceBuilderPanel's own partitionSequenceAssignment only ever touches
// the sequence-only assignment for a char) keeps just its non-sequence
// mechanisms, so a genuinely mechanism-covered char is never hidden merely
// because it also carries a sequence.
function excludeSequenceMechanisms(
  assignments: MechanismAssignment[],
): MechanismAssignment[] {
  const result: MechanismAssignment[] = [];
  for (const a of assignments) {
    if (a.scope !== "individual") {
      result.push(a);
      continue;
    }
    const nonSequence = a.mechanisms.filter((m) => m.patternId !== PATTERN_SEQUENCE);
    if (nonSequence.length === 0) continue;
    result.push(nonSequence.length === a.mechanisms.length ? a : { ...a, mechanisms: nonSequence });
  }
  return result;
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
  const { t } = useLingui();
  return (
    <GalleryPreviewPane
      baseKeyboard={selectedBaseKeyboard}
      stage={stage}
      retry={retry}
      {...(onKeyTap !== undefined ? { onKeyTap } : {})}
      defaultOskMode="desktop"
      heading={t({ id: "editor.assignLoop.preview.heading", message: "Live preview" })}
      warningLabel={t({ id: "editor.assignLoop.preview.applyWarnings", message: "Apply warnings:" })}
    />
  );
}

// ---------------------------------------------------------------------------
// MethodChooser — S-03 / S-02 / S-01 / S-08 single-card selection + inline config
// ---------------------------------------------------------------------------

type Method = "sequence" | "deadkey" | "swap" | "ralt";

// S-01 "assign to a key" target layer. 'base' is the long-standing default
// (`+ [K_X] > ...`); 'shift' targets the shift layer of the same physical key
// (`+ [SHIFT K_X] > ...`, or the NCAPS/CAPS pair when the key already has
// explicit CAPS handling — see buildShiftRuleLines in @keyboard-studio/engine).
// Labels follow the same 'Base'/'Shift' vocabulary as MOD_GROUP_DEFS
// (packages/studio/src/lib/irToCarveNodes.ts) so the terminology matches the
// carve gallery's Inspector/Rail.
type SwapLayer = "base" | "shift";

// S-08 "layer + key" target combo. A list of up to four ModifierTokens
// (SHIFT / CAPS / the alt family / the ctrl family — NCAPS is not offered,
// see computeModifierPool), generalized beyond the old binary
// 'ralt'|'shift-ralt' toggle (engine's modifierCombos.ts,
// `modifier_as_layer_switch`). A ctrl-family + chiral-alt-family pick (e.g.
// Ctrl+RAlt) unifies to the all-generic Ctrl+Alt at apply time
// (modifierCombos.ts's canonicalizeCombo — a mixed generic+chiral combo is
// kmcmplib-invalid and undeliverable by any real keypress, while the
// all-generic form matches both a physical Ctrl+Alt press and a Windows
// AltGr press via Keyman core's IsEquivalentShift).
// Unlike the S-01 Shift toggle, the layer combo
// is NOT gated on mnemonic layouts: `store(&mnemoniclayout)` changes only how
// the base character of a key spec is resolved (base-layout character vs
// physical position); a SHIFT flag inside the combo selects the shifted
// plane and does not re-apply the base layout's own shift semantics, so the
// combo is legitimate either way. Real mnemonic keyboards ship such rules:
// sil_euro_latin declares `store(&mnemoniclayout) '1'` and maps e.g.
// `[RALT SHIFT '<'] > U+00AB`.
//
// A slot value of "" means "not yet chosen" — only valid for a freshly-added
// slot (index > 0); the first slot always defaults to a non-empty token
// (generic ALT, or RALT once the keyboard already uses a chiral alt token —
// see raltDefaultToken) so the card still reads as a layer-combo method by
// default.
const MAX_RALT_SLOTS = 4;

/**
 * Per-family dropdown option pool, derived once per keyboard from the
 * modifier tokens already in use elsewhere in the IR. Product rule: default
 * to GENERIC ONLY for a family until the keyboard already distinguishes
 * chirality for that family — once a chiral token (L/R) is in use, offer
 * BOTH chiral options and drop the generic. There is no always-on exception
 * for AltGr (RALT): it is offered only once the keyboard already uses a
 * chiral alt token.
 *   - alt family:  generic ALT only, until the keyboard already uses RALT or
 *                  LALT — once either is in use, offer RALT and LALT (no
 *                  generic ALT).
 *   - ctrl family: mirrors alt — generic CTRL only, until the keyboard
 *                  already uses RCTRL or LCTRL — once either is in use,
 *                  offer LCTRL and RCTRL (no generic CTRL).
 * NCAPS is never offered: a rule with no caps token already matches caps-off,
 * so it is not a distinct selectable S-08 layer. (This is enforced here by the
 * product rule below — the pool simply never includes NCAPS — independent of
 * how modifierCombos.ts's scan path handles a NCAPS token found in an imported
 * keyboard's own rules.)
 */
function computeModifierPool(inUse: ReadonlySet<ModifierToken>): ModifierToken[] {
  // Alt: generic ALT only until the keyboard already uses a chiral alt
  // token; once RALT or LALT is in use, offer both chiral options.
  const altFamily: ModifierToken[] =
    inUse.has("RALT") || inUse.has("LALT") ? ["RALT", "LALT"] : ["ALT"];
  // Ctrl mirrors Alt.
  const ctrlFamily: ModifierToken[] =
    inUse.has("RCTRL") || inUse.has("LCTRL") ? ["LCTRL", "RCTRL"] : ["CTRL"];
  return ["SHIFT", ...ctrlFamily, ...altFamily, "CAPS"];
}

/**
 * Options available for dropdown `index`: the pool minus the exclusion set
 * of every EARLIER slot's chosen token (MODIFIER_EXCLUSIONS is self-inclusive,
 * so a token already chosen above never appears twice). Deliberately
 * one-directional (earlier slots constrain later ones, never the reverse) —
 * this is what makes "diminishing options" a per-row cascade and what makes
 * the "changing an earlier dropdown drops now-invalid later picks" behavior
 * (handleRaltTokenChange's forward-invalidation loop) both meaningful and
 * necessary: an earlier slot is never blocked by a later slot's pick, so a
 * change there can genuinely invalidate what a later slot already holds.
 */
function optionsForRaltSlot(
  pool: readonly ModifierToken[],
  tokens: readonly (ModifierToken | "")[],
  index: number,
): ModifierToken[] {
  const excluded = new Set<ModifierToken>();
  for (let i = 0; i < index; i++) {
    const t = tokens[i];
    if (t === undefined || t === "") continue;
    for (const e of MODIFIER_EXCLUSIONS[t]) excluded.add(e);
  }
  return pool.filter((t) => !excluded.has(t));
}

interface MethodChooserProps {
  currentChar: string;
  method: Method;
  onMethodChange: (m: Method) => void;
  triggerKey: string;
  onTriggerKeyChange: (v: string) => void;
  triggerKeyCustomChar: string;
  onTriggerKeyCustomCharChange: (v: string) => void;
  deadkeyBaseLetter: string;
  onDeadkeyBaseLetterChange: (v: string) => void;
  selectedSwapKey: string;
  onSwapKeyChange: (v: string) => void;
  selectedSwapKeyCustomChar: string;
  onSwapKeyCustomCharChange: (v: string) => void;
  selectedRaltKey: string;
  onRaltKeyChange: (v: string) => void;
  selectedRaltKeyCustomChar: string;
  onRaltKeyCustomCharChange: (v: string) => void;
  /** S-01 target layer — 'base' (default) or 'shift' (shift+key). */
  swapLayer: SwapLayer;
  onSwapLayerChange: (v: SwapLayer) => void;
  /**
   * S-08 target combo — a list of up to {@link MAX_RALT_SLOTS} chosen
   * ModifierTokens (one dropdown per slot; "" means "not yet chosen", only
   * valid past the first slot).
   */
  raltTokens: (ModifierToken | "")[];
  onRaltTokenChange: (index: number, value: string) => void;
  onAddRaltSlot: () => void;
  onRemoveRaltSlot: (index: number) => void;
  /** Per-family option pool for the layer-combo dropdowns (computeModifierPool). */
  modifierPool: ModifierToken[];
  /** Tokens already used elsewhere in the working IR — rendered bold + "(in use)". */
  modifierTokensInUse: ReadonlySet<ModifierToken>;
  /**
   * True when the working keyboard is mnemonic — shift behaviour comes from
   * the base layout, so the Shift toggle must be disabled (planShiftAssignment
   * from @keyboard-studio/engine returns allowed:false, reason:"mnemonic").
   */
  shiftLayerDisabled: boolean;
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

// selectStyle — used by the S-08 layer-combo dropdowns (the modifier-token
// <select>s); the base-key picker itself uses KeyPickerField, which carries its
// own internal style. Imported (aliased) from ../../lib/galleryTheme.ts so it
// stays byte-identical with TouchGallery's key/mechanism <select>s.

// Static styles shared across MethodChooser renders — none depend on props or
// state, so they are hoisted to module scope rather than recreated per render.
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

// pageStyle, ghostBtn, and inputStyle are imported (aliased) from
// ../../lib/galleryTheme.ts — shared byte-for-byte with SequenceBuilderPanel.tsx
// (and, for pageStyle/ghostBtn, TouchGallery.tsx) rather than redefined here.

function MethodChooser({
  currentChar,
  method,
  onMethodChange,
  triggerKey,
  onTriggerKeyChange,
  triggerKeyCustomChar,
  onTriggerKeyCustomCharChange,
  deadkeyBaseLetter,
  onDeadkeyBaseLetterChange,
  selectedSwapKey,
  onSwapKeyChange,
  selectedSwapKeyCustomChar,
  onSwapKeyCustomCharChange,
  selectedRaltKey,
  onRaltKeyChange,
  selectedRaltKeyCustomChar,
  onRaltKeyCustomCharChange,
  swapLayer,
  onSwapLayerChange,
  raltTokens,
  onRaltTokenChange,
  onAddRaltSlot,
  onRemoveRaltSlot,
  modifierPool,
  modifierTokensInUse,
  shiftLayerDisabled,
}: MethodChooserProps) {
  const { t, i18n } = useLingui();
  const deadkeyBaseLetterResolveOptions = buildDeadkeyBaseLetterResolveOptions(i18n);
  const triggerKeyPlaceholder = t({ id: "editor.assignLoop.triggerKeyPlaceholder", message: "[trigger key]" });

  // Resolved display values for the deadkey preview line — resolve at this
  // read point (not just canApply/handleApply) so a custom trigger character
  // or U+ base-letter notation shows the actual character in "Press X, then
  // Y -> Z" rather than the raw typed text or the "__custom__" sentinel.
  const triggerResolution = resolveKeyPickerSelection(
    triggerKey,
    triggerKeyCustomChar,
    TRIGGER_KEY_RESOLVE_OPTIONS,
  );
  // Never interpolate the raw "__custom__" sentinel into the preview text —
  // when custom mode is active but not yet resolved (customError/empty), fall
  // back to a neutral placeholder instead of the sentinel or unresolved typed
  // text.
  const triggerKeyDisplay =
    triggerResolution.kind === "customOk"
      ? triggerResolution.char
      : triggerKey === CUSTOM_KEY_OPTION_VALUE
        ? triggerKeyPlaceholder
        : triggerKey;
  const baseLetterResolution = resolveCharInput(
    deadkeyBaseLetter,
    deadkeyBaseLetterResolveOptions,
  );
  const deadkeyBaseLetterDisplay = baseLetterResolution.ok
    ? baseLetterResolution.value
    : deadkeyBaseLetter;
  // Warn (do NOT block) when the resolved base letter is a bare combining
  // mark on its own (e.g. U+0301) — canApply stays true; see the caution
  // rendered below the base-letter input.
  const deadkeyBaseLetterIsLoneCombiningMark =
    baseLetterResolution.ok && isLoneCombiningMark(baseLetterResolution.value);
  // Bidirectional char <-> U+ reflection (Fix 2) — reflectCharInput reuses
  // resolveCharInput with the SAME options as baseLetterResolution above, so
  // the reflection line and canApply's own validity check never disagree.
  const baseLetterReflection = reflectCharInput(
    deadkeyBaseLetter,
    deadkeyBaseLetterResolveOptions,
  );

  // Resolved vkey for the S-01/S-08 layer-preview lines below — a custom
  // selection still shows "Shift + <KEY>"/"Shift + RAlt + <KEY>" using the
  // resolved physical key, never the raw "__custom__" sentinel or unresolved
  // typed text.
  const swapVkeyForDisplay = resolvedVkeyOf(
    resolveKeyPickerSelection(selectedSwapKey, selectedSwapKeyCustomChar),
  );
  const raltVkeyForDisplay = resolvedVkeyOf(
    resolveKeyPickerSelection(selectedRaltKey, selectedRaltKeyCustomChar),
  );

  // Named locals for dotted-circle-wrapped interpolations used inside <Trans>/t()
  // macros below. Computing these BEFORE the macro (rather than calling
  // displayChar() inline inside the interpolation) keeps the identifier a
  // simple reference, so lingui extracts a NAMED placeholder (e.g.
  // {currentCharDisplay}) instead of collapsing it to a POSITIONAL {0}/{1} —
  // named placeholders are required for the en/fr catalogs to stay aligned.
  const currentCharDisplay = displayChar(currentChar);
  const deadkeyBaseSummaryDisplay = deadkeyBaseLetterDisplay
    ? displayChar(deadkeyBaseLetterDisplay)
    : t({ id: "editor.assignLoop.deadkeyBasePlaceholder", message: "[base]" });
  const deadkeyBasePreviewDisplay = deadkeyBaseLetterDisplay
    ? displayChar(deadkeyBaseLetterDisplay)
    : t({ id: "editor.assignLoop.deadkeyBaseLetterPlaceholder", message: "[base letter]" });

  // Each method is one card: transparent header button + inline config when selected.
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
        <Trans id="editor.assignLoop.howToTypeIt">How to type it:</Trans>
      </p>
      <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM, fontFamily: FONT, opacity: 0.85 }}>
        <Trans id="editor.assignLoop.charBoxHelp">
          Type a character, or a Unicode value like U+00E9. Combine composed parts with spaces, e.g. U+006E U+0303.
        </Trans>
      </p>

      {/* S-01 — always shown. Rendered FIRST: "Assign to a key" is the
          per-character default method (see MechanismGallery's
          useState<Method>("swap")), so its card leads the list. */}
      <div style={cardStyle(method === "swap")}>
        <button
          type="button"
          aria-pressed={method === "swap"}
          onClick={() => onMethodChange("swap")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "swap" ? ACCENT : TEXT_MAIN }}>
            <Trans id="editor.assignLoop.method.swap.title">Assign to a key</Trans>
          </span>
          {method !== "swap" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.method.swap.summary">
                Dedicate one physical key to produce {currentCharDisplay}
              </Trans>
            </span>
          )}
        </button>
        {method === "swap" && (
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
              <span><Trans id="editor.assignLoop.keyLabel">Key:</Trans></span>
              <KeyPickerField
                value={selectedSwapKey}
                onChange={onSwapKeyChange}
                customChar={selectedSwapKeyCustomChar}
                onCustomCharChange={onSwapKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({ id: "editor.assignLoop.swap.keySelectAriaLabel", message: "Physical key for simple swap" })}
                customInputAriaLabel={t({ id: "editor.assignLoop.swap.keyCustomAriaLabel", message: "Custom character for simple swap key" })}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span id="swap-layer-label" style={{ fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
                <Trans id="editor.assignLoop.layerLabel">Layer:</Trans>
              </span>
              <RadioGroup
                name="swap-layer"
                value={swapLayer}
                onChange={(v) => onSwapLayerChange(v as SwapLayer)}
                ariaLabelledby="swap-layer-label"
                options={[
                  { value: "base", label: t({ id: "editor.assignLoop.swap.layerBase", message: "Base" }) },
                  {
                    value: "shift",
                    label: t({ id: "editor.assignLoop.swap.layerShift", message: "Shift" }),
                    disabled: shiftLayerDisabled,
                    ...(shiftLayerDisabled
                      ? { title: t({ id: "editor.assignLoop.swap.shiftDisabledReason", message: "Mnemonic keyboard: shift behaviour comes from the base layout" }) }
                      : {}),
                  },
                ]}
              />
            </div>
            {swapLayer === "shift" && swapVkeyForDisplay !== null && (
              <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
                <Trans id="editor.assignLoop.swap.shiftPreview">
                  Shift + {swapVkeyForDisplay.replace(/^K_/, "")} &rarr;{" "}
                  <span style={{ fontFamily: "monospace", color: TEXT_MAIN, fontSize: 16 }}>{currentCharDisplay}</span>
                </Trans>
              </p>
            )}
          </div>
        )}
      </div>

      {/* S-03 — always shown */}
      <div style={cardStyle(method === "sequence")}>
        <button
          type="button"
          aria-pressed={method === "sequence"}
          onClick={() => onMethodChange("sequence")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "sequence" ? ACCENT : TEXT_MAIN }}>
            <Trans id="editor.assignLoop.method.sequence.title">Type a sequence</Trans>
          </span>
          {method !== "sequence" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.method.sequence.summary">
                Type two or more keystrokes in a row to produce {currentCharDisplay}
              </Trans>
            </span>
          )}
        </button>
        {method === "sequence" && (
          <div style={configStyle}>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              <Trans id="editor.assignLoop.method.sequence.checkHint">
                The sequence builder is open on the right, in place of the
                live preview — define the key sequence for{" "}
                <span style={{ color: TEXT_MAIN, fontFamily: "monospace", fontSize: 16 }}>
                  {currentCharDisplay}
                </span>{" "}
                there.
              </Trans>
            </p>
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
            <Trans id="editor.assignLoop.method.deadkey.title">Tap a trigger key, then a letter</Trans>
          </span>
          {method !== "deadkey" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.method.deadkey.summary">
                Trigger &rarr;{" "}
                {deadkeyBaseSummaryDisplay} &rarr;{" "}
                {currentCharDisplay}
              </Trans>
            </span>
          )}
        </button>
        {method === "deadkey" && (
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
              <span><Trans id="editor.assignLoop.triggerKeyLabel">Trigger key:</Trans></span>
              <KeyPickerField
                value={triggerKey}
                onChange={onTriggerKeyChange}
                customChar={triggerKeyCustomChar}
                onCustomCharChange={onTriggerKeyCustomCharChange}
                options={DEADKEY_OPTIONS}
                selectAriaLabel={t({ id: "editor.assignLoop.deadkey.triggerKeySelectAriaLabel", message: "Trigger key for deadkey" })}
                customInputAriaLabel={t({ id: "editor.assignLoop.deadkey.triggerKeyCustomAriaLabel", message: "Custom trigger character for deadkey" })}
                blockDelimiters
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              <span style={{ alignSelf: "center" }}><Trans id="editor.assignLoop.baseLetterLabel">Base letter:</Trans></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <input
                  type="text"
                  value={deadkeyBaseLetter}
                  onChange={(e) => onDeadkeyBaseLetterChange(e.target.value)}
                  aria-label={t({ id: "editor.assignLoop.deadkey.baseLetterAriaLabel", message: "Base letter for deadkey" })}
                  maxLength={16}
                  style={inputStyle}
                />
                {baseLetterReflection.kind === "ok" && (
                  <span role="status" aria-live="polite" style={{ fontSize: 10, color: TEXT_DIM, fontFamily: FONT }}>
                    {baseLetterReflection.text}
                  </span>
                )}
                {baseLetterReflection.kind === "error" && (
                  <span role="alert" style={{ fontSize: 10, color: "#f85149", opacity: 0.85, fontFamily: FONT }}>
                    {baseLetterReflection.reason}
                  </span>
                )}
                {deadkeyBaseLetterIsLoneCombiningMark && (
                  <span role="status" aria-live="polite" style={{ fontSize: 10, color: "#d29922", opacity: 0.9, fontFamily: FONT }}>
                    <Trans id="editor.assignLoop.deadkey.loneCombiningMarkWarning">
                      That looks like a combining mark on its own — the base letter is usually a plain letter.
                    </Trans>
                  </span>
                )}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              <Trans id="editor.assignLoop.method.deadkey.preview">
                Press {triggerKeyDisplay}, then{" "}
                {deadkeyBasePreviewDisplay} &rarr;{" "}
                <span style={{ fontFamily: "monospace", color: TEXT_MAIN, fontSize: 16 }}>{currentCharDisplay}</span>
              </Trans>
            </p>
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
            <Trans id="editor.assignLoop.method.ralt.title">Layer + key</Trans>
          </span>
          {method !== "ralt" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.method.ralt.summary">
                Hold a modifier layer and press a base key to get {currentCharDisplay}
              </Trans>
            </span>
          )}
        </button>
        {method === "ralt" && (() => {
          const filledRaltTokens = raltTokens.filter((tok): tok is ModifierToken => tok !== "");
          const raltAllFilled =
            raltTokens.length > 0 && filledRaltTokens.length === raltTokens.length;
          const raltHasRoomToAdd =
            raltTokens.length < MAX_RALT_SLOTS &&
            raltAllFilled &&
            (() => {
              const excluded = new Set<ModifierToken>();
              for (const tok of filledRaltTokens) {
                for (const e of MODIFIER_EXCLUSIONS[tok]) excluded.add(e);
              }
              return modifierPool.some((tok) => !excluded.has(tok));
            })();
          const raltIsDesktopOnly =
            filledRaltTokens.includes("CAPS") || filledRaltTokens.includes("NCAPS");
          // Canonicalize once so the macOS-conflict note below keys off the
          // RESULT of chirality unification, not the raw pre-canonicalization
          // tokens: CTRL+RALT and CTRL+LALT both demote to the same generic
          // [CTRL ALT] (see modifierCombos.ts's canonicalizeCombo doc), so
          // neither should raise a RAlt-specific note, while a combo where
          // RALT survives (e.g. [RALT] alone, or [SHIFT RALT]) still should.
          // canonicalizeCombo only throws for a mutually-exclusive combo,
          // which the dropdown's own exclusion logic (MODIFIER_EXCLUSIONS)
          // already prevents from being constructed here.
          let raltCanonicalTokens: ModifierToken[] = [];
          try {
            raltCanonicalTokens = canonicalizeCombo(filledRaltTokens);
          } catch {
            raltCanonicalTokens = filledRaltTokens;
          }
          // The preview keys off the RESOLVED vkey (raltVkeyForDisplay,
          // custom-char aware) rather than the raw selectedRaltKey — a custom
          // base character must show its resolved physical key in the
          // combo-spec preview, never the "__custom__" sentinel.
          let raltPreviewSpec: string | null = null;
          if (raltVkeyForDisplay !== null && filledRaltTokens.length > 0) {
            try {
              raltPreviewSpec = comboToKeySpec(raltCanonicalTokens, raltVkeyForDisplay);
            } catch {
              raltPreviewSpec = null;
            }
          }

          return (
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
                <span><Trans id="editor.assignLoop.ralt.baseKeyLabel">Base key:</Trans></span>
                <KeyPickerField
                  value={selectedRaltKey}
                  onChange={onRaltKeyChange}
                  customChar={selectedRaltKeyCustomChar}
                  onCustomCharChange={onRaltKeyCustomCharChange}
                  options={KEY_OPTIONS}
                  selectAriaLabel={t({ id: "editor.assignLoop.ralt.baseKeySelectAriaLabel", message: "Base key for layer-switch combo" })}
                  customInputAriaLabel={t({ id: "editor.assignLoop.ralt.baseKeyCustomAriaLabel", message: "Custom character for layer-switch combo base key" })}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
                  {t({
                    id: "editor.assignLoop.ralt.layersLabel",
                    message: plural(raltTokens.length, { one: "Layer:", other: "Layers:" }),
                  })}
                </span>
                {raltTokens.map((token, index) => {
                  const options = optionsForRaltSlot(modifierPool, raltTokens, index);
                  return (
                    <div key={index} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <select
                        value={token}
                        onChange={(e) => onRaltTokenChange(index, e.target.value)}
                        aria-label={t({
                          id: "editor.assignLoop.ralt.layerSlotAriaLabel",
                          message: `Layer ${index + 1} for layer-switch combo`,
                        })}
                        style={selectStyle}
                      >
                        <option value="">
                          <Trans id="editor.assignLoop.ralt.selectPlaceholder">— Select —</Trans>
                        </option>
                        {options.map((o) => (
                          <option
                            key={o}
                            value={o}
                            style={modifierTokensInUse.has(o) ? { fontWeight: 700 } : undefined}
                          >
                            {o}
                            {modifierTokensInUse.has(o)
                              ? t({ id: "editor.assignLoop.ralt.inUseSuffix", message: " (in use)" })
                              : ""}
                          </option>
                        ))}
                      </select>
                      {index > 0 && (
                        <button
                          type="button"
                          aria-label={t({
                            id: "editor.assignLoop.ralt.removeLayerAriaLabel",
                            message: `Remove layer ${index + 1}`,
                          })}
                          onClick={() => onRemoveRaltSlot(index)}
                          style={{
                            background: "transparent",
                            border: `1px solid ${BORDER}`,
                            borderRadius: 4,
                            color: TEXT_DIM,
                            fontSize: 12,
                            padding: "2px 8px",
                            cursor: "pointer",
                            fontFamily: FONT,
                          }}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  );
                })}
                {raltHasRoomToAdd && (
                  <button
                    type="button"
                    aria-label={t({ id: "editor.assignLoop.ralt.addLayerAriaLabel", message: "Add another layer" })}
                    onClick={onAddRaltSlot}
                    style={{
                      alignSelf: "flex-start",
                      background: "transparent",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 4,
                      color: TEXT_DIM,
                      fontSize: 12,
                      padding: "2px 10px",
                      cursor: "pointer",
                      fontFamily: FONT,
                    }}
                  >
                    <Trans id="editor.assignLoop.ralt.addLayerButton">+ Add layer</Trans>
                  </button>
                )}
              </div>
              {raltPreviewSpec !== null && (
                <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
                  {raltPreviewSpec} &rarr;{" "}
                  <span style={{ fontFamily: "monospace", color: TEXT_MAIN, fontSize: 16 }}>{displayChar(currentChar)}</span>
                </p>
              )}
              {raltIsDesktopOnly && (
                <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
                  <Trans id="editor.assignLoop.ralt.desktopOnlyNote">
                    Desktop only — this layer will not appear on the touch layout.
                  </Trans>
                </p>
              )}
              {raltCanonicalTokens.includes("RALT") && (
                <p style={{ margin: 0, fontSize: 11, color: "#d29922", fontFamily: FONT }}>
                  <Trans id="editor.assignLoop.ralt.macosConflictNote">
                    Note: RAlt may conflict with system shortcuts on macOS.
                  </Trans>
                </p>
              )}
            </div>
          );
        })()}
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
  /**
   * Optional marks-series placement worklist (spec 046, FR-020 — the
   * placementMap seam pattern). When supplied, composed units covered by a
   * PRODUCTIVE mark key (a `markUnits` entry: base key + mark key reach them)
   * are dropped from the walk — the mark itself is walked instead (it is in
   * the inventory via the marks store). Own-letter units keep their whole-unit
   * walk entries. Absent (or empty — a skipped series) ⇒ the existing flat
   * `lettersToAdd` behavior, unchanged.
   */
  worklist?: PlacementWorklist;
}

export function MechanismGallery({
  selectedBaseKeyboard,
  onComplete,
  onBack,
  placementMap,
  worklist,
}: MechanismGalleryProps) {
  const { t, i18n } = useLingui();
  const deadkeyBaseLetterResolveOptions = useMemo(
    () => buildDeadkeyBaseLetterResolveOptions(i18n),
    [i18n],
  );
  const locked = useWorkingCopyStore((s) => s.desktopLocked);
  const unlockDesktop = useWorkingCopyStore((s) => s.unlockDesktop);
  const markStale = useWorkingCopyStore((s) => s.markStale);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const recordAssignments = useWorkingCopyStore((s) => s.recordAssignments);
  // unflagCharForSequence is reused here purely for its assignment-stripping
  // side effect (it removes a char's whole recorded multi_char_sequence
  // assignment regardless of sequenceFlaggedChars membership — see the store
  // action's own doc comment) — the flagging half of its contract is no
  // longer driven from this gallery now that sequences build inline via
  // SequenceBuilderPanel (see hasSequenceForChar for the coverage check that
  // replaces sequenceFlaggedChars membership).
  const unflagCharForSequence = useWorkingCopyStore((s) => s.unflagCharForSequence);
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const axes = useWorkingCopyStore(
    useShallow((s) => s.session.axes as Partial<DiscoveryAxisVector>),
  );
  const setAxisFills = useWorkingCopyStore((s) => s.setAxisFills);

  // One-time intro splash — read the seen flag on mount; mark it on "Get started".
  const mechIntroSeen = useWorkingCopyStore((s) => s.galleryIntrosSeen.mechanism);
  const markGalleryIntroSeen = useWorkingCopyStore((s) => s.markGalleryIntroSeen);

  const { lettersToAdd: inventoryLettersToAdd } = useInventoryDiff();

  // Spec 046 worklist filter (FR-020): a composed unit whose marks are ALL
  // productive mark keys is reachable via base key + mark key — it needs no
  // whole-unit placement of its own, so it leaves the walk. Everything else
  // (plain bases, own-letter units, the productive marks themselves) keeps its
  // flat-inventory walk entry. No worklist (or an empty one) ⇒ identity.
  const lettersToAdd = useMemo(() => {
    if (worklist === undefined || worklist.markUnits.length === 0) {
      return inventoryLettersToAdd;
    }
    const productiveMarks = new Set(worklist.markUnits.map((u) => u.mark));
    return inventoryLettersToAdd.filter((c) => {
      const units = [...c.normalize("NFD")];
      if (units.length < 2) return true;
      const marks = units.slice(1);
      return !marks.every((m) => productiveMarks.has(m));
    });
  }, [inventoryLettersToAdd, worklist]);

  // Read Phase C assignments directly (not the merged session.assignments view)
  // so multiple methods per character are preserved.
  const sessionAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical",
      ),
    [phaseResults],
  );

  // sessionAssignments with sequence assignments/mechanisms excluded — see
  // excludeSequenceMechanisms above. This gallery's whole covered/applied view
  // (coveredChars, appliedForCurrentChar, the "Applied methods" badge row)
  // derives from THIS, never from sessionAssignments directly, so a
  // Sequence-Gallery-owned assignment can never show as "Added" here nor be
  // removed via this gallery's own controls.
  const mechanismAssignments = useMemo(
    () => excludeSequenceMechanisms(sessionAssignments),
    [sessionAssignments],
  );

  // The covered set: chars in lettersToAdd that have at least one NON-sequence
  // mechanism assignment (mechanismAssignments already excludes the
  // sequence-owned dimension — see above).
  const coveredChars = useMemo(
    () =>
      new Set(
        mechanismAssignments
          .filter((a) => a.scope === "individual")
          .map((a) => a.target)
          .filter((ch) => lettersToAdd.includes(ch)),
      ),
    [mechanismAssignments, lettersToAdd],
  );

  // Chars in lettersToAdd that already have a recorded PATTERN_SEQUENCE
  // assignment — the "Sequences" chip row below. Tracked separately from
  // coveredChars/mechanismAssignments (see excludeSequenceMechanisms) since a
  // sequence is a distinct dimension from a non-sequence mechanism.
  const sequenceRecordedChars = useMemo(
    () => lettersToAdd.filter((c) => hasSequenceForChar(sessionAssignments, c)),
    [lettersToAdd, sessionAssignments],
  );

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
      // Pick the first uncovered char, or the very first if all covered.
      return (
        lettersToAdd.find((c) => !coveredChars.has(c)) ??
        lettersToAdd[0] ??
        null
      );
    });
    // Intentionally omit coveredChars — only re-run when the
    // inventory list itself changes, not when methods are applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettersKey]);

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

    // #890 — pre-fill phase-gated axis GAPS (diacriticBehavior, multiMode,
    // constraintEnforcement, + optional markInputOrder/remapPosture) from the
    // §7.2 script-class default-fill prior before checking completeness.
    // The prior only ever supplies the OFF-STATE value for an axis it fills
    // (never a rule-triggering one — see default-fill.ts's load-bearing
    // invariant), and it never overwrites an axis already present on `axes`
    // (elicited-from-survey or IR-derived). So when `axes` was already
    // complete, `filled` is reference-identical in content to `axes` and
    // selectStrategy()'s recommendation is unchanged; the prior only ever
    // turns an incomplete vector into a complete one, never changes an
    // already-elicited value. `scale`/`scriptClass` are required inputs to
    // defaultFillAxes — skip the pre-fill (fall back to the prior undefined-
    // fullAxes behavior) when either is still unanswered.
    const prefilled =
      axes.scale !== undefined && axes.scriptClass !== undefined
        ? defaultFillAxes(axes)
        : null;
    // markInputOrder="postfix" reaching `axes` can only be base-derived: the
    // script-class prior structurally never emits it (default-fill.ts's
    // load-bearing invariant) and the survey doesn't elicit it yet — it is
    // seeded onto irAxes at instantiation by seedIrAxesFromBaseIr (spec §7.2
    // rule 3a, #926). defaultFillAxes() correctly leaves an already-present axis
    // out of its own axisFills, so reconstruct the import-derived provenance
    // here (rather than threading a separate store slot) to keep it visible on
    // the Flow Map.
    const importDerivedFills: AxisFill[] =
      axes.markInputOrder === "postfix"
        ? [{ axis: "markInputOrder", value: "postfix", source: "import-derived" }]
        : [];
    // Publish provenance for the current keyboard; clear any stale fills from a
    // prior keyboard/run when scale/scriptClass aren't answered yet, so the
    // Flow Map never shows provenance that doesn't belong to this selection.
    setAxisFills([...importDerivedFills, ...(prefilled !== null ? prefilled.axisFills : [])]);
    const candidateAxes = prefilled !== null ? prefilled.axes : axes;

    const fullAxes: DiscoveryAxisVector | undefined =
      candidateAxes.scale !== undefined &&
      candidateAxes.scriptClass !== undefined &&
      candidateAxes.phoneticIntuition !== undefined &&
      candidateAxes.diacriticBehavior !== undefined &&
      candidateAxes.multiMode !== undefined &&
      candidateAxes.constraintEnforcement !== undefined &&
      candidateAxes.spareKeyAvailability !== undefined
        ? (candidateAxes as DiscoveryAxisVector)
        : undefined;

    svc
      .filterFor(selectedBaseKeyboard, fullAxes)
      .then((ranked) => {
        // Load ranked patterns PLUS all four methods the add-a-key UI offers.
        // Axis-based ranking may exclude off-strategy patterns, so load them
        // explicitly so the preview transform can always resolve an applied
        // assignment.
        const ids = new Set<string>(ranked.map((m) => m.patternId));
        ids.add(PATTERN_DEADKEY);
        ids.add(PATTERN_SWAP);
        ids.add(PATTERN_RALT);
        // PATTERN_SEQUENCE — the sequence builder now records real
        // multi_char_sequence assignments directly (see SequenceBuilderPanel),
        // so the live preview must be able to resolve this pattern too.
        ids.add(PATTERN_SEQUENCE);
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
  }, [selectedBaseKeyboard, axes, setAxisFills]);

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

  const [method, setMethod] = useState<Method>("swap");
  const [triggerKey, setTriggerKey] = useState("K_COLON");
  const [triggerKeyCustomChar, setTriggerKeyCustomChar] = useState("");
  const [deadkeyBaseLetter, setDeadkeyBaseLetter] = useState("");
  const [selectedSwapKey, setSelectedSwapKey] = useState("");
  const [selectedSwapKeyCustomChar, setSelectedSwapKeyCustomChar] = useState("");
  const [selectedRaltKey, setSelectedRaltKey] = useState("");
  const [selectedRaltKeyCustomChar, setSelectedRaltKeyCustomChar] = useState("");
  const [swapLayer, setSwapLayer] = useState<SwapLayer>("base");
  const [raltTokens, setRaltTokens] = useState<(ModifierToken | "")[]>(["RALT"]);

  // Propose-then-confirm case-pair companion (spec v1.3.1 §3c — never apply
  // silently). Set right after a base-layer S-01 apply when the applied
  // character has a known case counterpart; cleared on confirm/decline or
  // when currentChar changes.
  // `baseAssignment` captures the identity (object reference) of the
  // assignment created at apply time, NOT its target/index — the gallery
  // allows multiple mechanisms per character, and a subsequent apply for the
  // same character appends a new, unrelated assignment. Confirming the
  // companion must locate and replace exactly the assignment this proposal
  // was raised for; a target/index scan would silently grab whichever
  // assignment for that char happens to match, which is the P1 defect this
  // guards against.
  const [pendingCompanion, setPendingCompanion] = useState<{
    originalChar: string;
    counterpart: string;
    vkey: string;
    capsHandling: boolean;
    baseAssignment: MechanismAssignment;
  } | null>(null);

  // Working IR used to plan shift-layer assignments — prefer the carve
  // working IR (ir), falling back to baseIr before the carve step has run.
  // Null when the working copy has not been instantiated yet (e.g. a bare
  // inventory-only render in tests); shift targeting is disabled in that case
  // since planShiftAssignment has nothing to evaluate against.
  const workingIr = useWorkingCopyStore((s) => s.ir ?? s.baseIr);
  const identityBcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);

  // Shift-layer targeting is disallowed for mnemonic keyboards (planShiftAssignment /
  // isMnemonicLayout in @keyboard-studio/engine) — in mnemonic mode K_X already
  // resolves to the base-layout character, so a SHIFT-flagged rule would
  // double-apply shift. Also suppresses the case-pair companion prompt.
  const shiftLayerAllowed = useMemo(
    () => workingIr !== null && !isMnemonicLayout(workingIr),
    [workingIr],
  );

  // S-08 layer-combo picker: the modifier tokens already used elsewhere in
  // the working IR (drives both the per-family option pool and the
  // "(in use)" dropdown highlighting), and the pool itself.
  const modifierTokensInUse = useMemo<ReadonlySet<ModifierToken>>(
    () => (workingIr !== null ? collectModifierTokensInUse(workingIr) : new Set<ModifierToken>()),
    [workingIr],
  );
  const modifierPool = useMemo<ModifierToken[]>(
    () => computeModifierPool(modifierTokensInUse),
    [modifierTokensInUse],
  );
  // First-slot default — the alt-family entry the pool leads with: generic
  // ALT until the keyboard already uses a chiral alt token, at which point
  // the pool leads with RALT (computeModifierPool's ["RALT","LALT"] order).
  const raltDefaultToken = useMemo<ModifierToken>(() => {
    const altFamily = modifierPool.find((tok) => tok === "ALT" || tok === "RALT" || tok === "LALT");
    return altFamily ?? "RALT";
  }, [modifierPool]);

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

  // Positional Back/Next/Skip/Previous navigation + suggestion-dismissal
  // tracking — shared with TouchGallery via usePositionalCharNav so the two
  // galleries cannot drift (see that hook for the Back/Next/Previous
  // rationale, including the idx === -1 defense-in-depth guard). No
  // initialSuggestionResolved is passed: suggestionResolved is component-
  // level state here — it survives navigation within the mounted session
  // but is not persisted across unmount/remount, since MechanismGallery has
  // no draft-store slot for Phase C in-progress state today.
  const {
    currentIdx,
    hasAnotherCharAfterCurrent,
    handleNext,
    handleBack,
    handleSelectChar,
    suggestionResolved,
    markSuggestionResolved,
  } = usePositionalCharNav({
    list: lettersToAdd,
    currentChar,
    setCurrentChar,
    onComplete,
    onBack,
  });

  // Whether the suggestion row must stay hidden for the current character —
  // true once explicitly resolved (Accept/Deny), or once the character is
  // already covered (a configured char never re-prompts). Skipping does not
  // resolve a suggestion — Skip records nothing, so a skipped-over character
  // still shows its suggestion row if revisited.
  const suggestionDismissed =
    currentChar !== null &&
    (suggestionResolved.has(currentChar) || coveredChars.has(currentChar));

  // ---------------------------------------------------------------------------
  // Method-input reset — called after apply or suggestion accept
  // ---------------------------------------------------------------------------

  const resetMethodState = useCallback(() => {
    setMethod("swap");
    setTriggerKey("K_COLON");
    setTriggerKeyCustomChar("");
    setDeadkeyBaseLetter("");
    setSelectedSwapKey("");
    setSelectedSwapKeyCustomChar("");
    setSelectedRaltKey("");
    setSelectedRaltKeyCustomChar("");
    setSwapLayer("base");
    setRaltTokens([raltDefaultToken]);
  }, [raltDefaultToken]);

  // Reset method inputs (not suggestionResolved — that persists per char)
  // whenever currentChar changes.
  useEffect(() => {
    setPendingCompanion(null);
    resetMethodState();
    if (currentChar !== null && isDecomposableAccented(currentChar)) {
      // §3c defaults-first: for a decomposable accented letter the natural method
      // is deadkey (S-02) — propose-then-confirm. resetMethodState sets "swap"
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
      markSuggestionResolved(currentChar);
      console.warn(`[MechanismGallery] handleSuggestionAccept: unrecognised strategyId "${suggestion.strategyId}" — dismissing suggestion`);
      return;
    }
    recordAssignments([...sessionAssignments, assignment]);
    markSuggestionResolved(currentChar);
    resetMethodState();
  }, [suggestion, currentChar, sessionAssignments, recordAssignments, resetMethodState, markSuggestionResolved]);

  // Change: dismiss the suggestion row; pickers stay blank for manual selection.
  const handleSuggestionChange = useCallback(() => {
    if (currentChar !== null) markSuggestionResolved(currentChar);
  }, [currentChar, markSuggestionResolved]);

  // ---------------------------------------------------------------------------
  // Apply action
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "sequence") {
      // No-op here — the sequence builder (rendered in the right pane, see
      // rightContent below) owns its own Apply button and commit logic; the
      // generic "Apply method" button is hidden for this method (see the
      // render below), so this branch only guards against a stray call.
      return false;
    }
    if (method === "swap") {
      return resolvedVkeyOf(resolveKeyPickerSelection(selectedSwapKey, selectedSwapKeyCustomChar)) !== null;
    }
    if (method === "ralt") {
      // Resolved vkey (custom-char aware — a customChar sentinel only counts
      // once it resolves to a real physical key) AND at least one layer
      // chosen — empty-combo Apply is disabled.
      return (
        resolvedVkeyOf(resolveKeyPickerSelection(selectedRaltKey, selectedRaltKeyCustomChar)) !== null &&
        raltTokens.some((tok) => tok !== "")
      );
    }
    // deadkey: trigger key must resolve to a physical key (real selection or
    // a custom character that maps to one); base letter must resolve to a
    // non-empty character.
    return (
      resolvedVkeyOf(
        resolveKeyPickerSelection(triggerKey, triggerKeyCustomChar, TRIGGER_KEY_RESOLVE_OPTIONS),
      ) !== null && resolveCharInput(deadkeyBaseLetter, deadkeyBaseLetterResolveOptions).ok
    );
  }, [
    currentChar,
    method,
    deadkeyBaseLetter,
    triggerKey,
    triggerKeyCustomChar,
    selectedSwapKey,
    selectedSwapKeyCustomChar,
    selectedRaltKey,
    selectedRaltKeyCustomChar,
    raltTokens,
    deadkeyBaseLetterResolveOptions,
  ]);

  // ---------------------------------------------------------------------------
  // S-08 layer-combo dropdown handlers
  // ---------------------------------------------------------------------------

  const handleRaltTokenChange = useCallback(
    (index: number, value: string) => {
      const token = (value || "") as ModifierToken | "";
      setRaltTokens((prev) => {
        const next = [...prev];
        next[index] = token;
        // Forward invalidation: an earlier slot's new value may exclude a
        // later slot's existing selection (e.g. RALT chosen after LALT was
        // already picked in a later slot) — drop those now-invalid picks.
        for (let i = index + 1; i < next.length; i++) {
          const stillValid = optionsForRaltSlot(modifierPool, next, i).includes(
            next[i] as ModifierToken,
          );
          if (next[i] !== "" && !stillValid) next[i] = "";
        }
        return next;
      });
    },
    [modifierPool],
  );

  const handleAddRaltSlot = useCallback(() => {
    setRaltTokens((prev) => (prev.length >= MAX_RALT_SLOTS ? prev : [...prev, ""]));
  }, []);

  const handleRemoveRaltSlot = useCallback((index: number) => {
    setRaltTokens((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;
    // method === "sequence" is unreachable here: canApply returns false for
    // it (the sequence builder in the right pane owns its own Apply — see
    // SequenceBuilderPanel), so the guard above already returned.

    let assignment: MechanismAssignment;

    if (method === "deadkey") {
      const base = resolveCharInput(deadkeyBaseLetter, deadkeyBaseLetterResolveOptions);
      const triggerResolution = resolveKeyPickerSelection(
        triggerKey,
        triggerKeyCustomChar,
        TRIGGER_KEY_RESOLVE_OPTIONS,
      );
      const resolvedTriggerVkey = resolvedVkeyOf(triggerResolution);
      if (!base.ok || resolvedTriggerVkey === null) return;
      // accentChar: the character emitted when the trigger key is pressed
      // twice. For the 4 built-in trigger keys, always use the key's literal
      // character (e.g. ';' for K_COLON) so trigger+trigger escapes back to
      // the bare character. For a custom trigger character, the resolved
      // custom character itself IS that literal — deadkeyName follows the
      // same convention as deadkeyNameFor (the character's codepoint hex,
      // padded to 4), never the "dead0" fallback deadkeyNameFor uses for an
      // unrecognised built-in key id.
      let deadkeyName: string;
      let accentChar: string;
      if (triggerResolution.kind === "customOk") {
        deadkeyName = triggerResolution.char.codePointAt(0)!.toString(16).padStart(4, "0");
        accentChar = triggerResolution.char;
      } else {
        deadkeyName = deadkeyNameFor(triggerKey);
        accentChar = TRIGGER_KEY_CHARS[triggerKey] ?? "";
      }
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_DEADKEY,
            strategyId: "S-02",
            slotValues: {
              triggerKey: resolvedTriggerVkey,
              deadkeyName,
              baseLetters: base.value,
              accentedForms: currentChar,
              accentChar,
            },
          },
        ],
        source: "user",
      };
    } else if (method === "swap") {
      const resolvedSwapVkey = resolvedVkeyOf(
        resolveKeyPickerSelection(selectedSwapKey, selectedSwapKeyCustomChar),
      );
      if (resolvedSwapVkey === null) return;
      // S-01: simple_swap — kmnFragment uses {{kmnRules}}.
      // Guard against a stale "shift" selection surviving a mid-flow mnemonic
      // transition (e.g. base keyboard swap) — never emit a SHIFT-flagged rule
      // when shift targeting isn't allowed.
      const effectiveLayer: SwapLayer =
        swapLayer === "shift" && shiftLayerAllowed ? "shift" : "base";
      // capsHandling is a property of the KEY, not of which layer the author
      // is targeting — a key that already carries explicit CAPS/NCAPS rules
      // needs a CAPS-aware pair on EITHER layer (Layer-A Check #10), so
      // compute it once and reuse for both the base and shift branches below.
      const capsHandling =
        workingIr !== null
          ? planShiftAssignment(workingIr, "main", resolvedSwapVkey).capsHandling
          : false;
      let kmnRules: string;
      if (effectiveLayer === "shift") {
        kmnRules = buildShiftRuleLines(resolvedSwapVkey, currentChar, {
          capsHandling,
        }).join("\n");
      } else {
        // Base layer: bare `+ [K_X] > U+XXXX` when the key has no CAPS
        // handling; the CAPS-aware NCAPS+CAPS pair otherwise — a bare rule on
        // a CAPS-handling key would shadow that key's pre-existing CAPS/NCAPS
        // pair, since applyAssignments splices new lines before existing
        // ones (first-match-wins).
        kmnRules = buildBaseRuleLines(resolvedSwapVkey, currentChar, {
          capsHandling,
        }).join("\n");
      }
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

      // Case-pair companion proposal (spec v1.3.1 §3c — propose-then-confirm,
      // never apply silently). Only for a BASE-layer apply: the user chose
      // base for currentChar, so the counterpart's natural home is the shift
      // layer of the SAME key. Suppressed for mnemonic keyboards (shift
      // targeting is unavailable) and for the toLower direction — assigning
      // an uppercase char to base proposes nothing; only the base->uppercase
      // (toUpper) direction is offered a companion. Scope cut, not a defect:
      // the reverse direction is left for a future pass.
      if (effectiveLayer === "base" && shiftLayerAllowed) {
        const bcp47 =
          identityBcp47 !== undefined && identityBcp47 !== "" ? identityBcp47 : undefined;
        const counterpart = caseCounterpart(currentChar, bcp47);
        if (counterpart !== null && counterpart.direction === "toUpper" && workingIr !== null) {
          setPendingCompanion({
            originalChar: currentChar,
            counterpart: counterpart.counterpart,
            vkey: resolvedSwapVkey,
            capsHandling,
            baseAssignment: assignment,
          });
        }
      }
    } else {
      // method === "ralt"
      const resolvedRaltVkey = resolvedVkeyOf(
        resolveKeyPickerSelection(selectedRaltKey, selectedRaltKeyCustomChar),
      );
      if (resolvedRaltVkey === null) return;
      // S-08: modifier_as_layer_switch — kmnFragment uses {{altgrKeyList}} and {{altgrOutputList}}.
      // Build a single-entry held-layer rule for this character, keyed on
      // whichever combo of ModifierTokens the author picked (generalized S-08).
      const chosenTokens = raltTokens.filter((tok): tok is ModifierToken => tok !== "");
      let altgrKeyList: string;
      try {
        // Use the RESOLVED vkey (custom-char aware), never the raw
        // selectedRaltKey — the latter may be the "__custom__" sentinel
        // when the author typed a custom base character.
        altgrKeyList = comboToKeySpec(canonicalizeCombo(chosenTokens), resolvedRaltVkey);
      } catch {
        // canonicalizeCombo only throws for a mutually-exclusive combo, which
        // the dropdown's own exclusion logic (handleRaltTokenChange) already
        // prevents from being selected — structurally unreachable today.
        // Guarded anyway: skip recording rather than crashing the gallery.
        return;
      }
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_RALT,
            strategyId: "S-08",
            slotValues: {
              altgrKeyList,
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
    triggerKey,
    triggerKeyCustomChar,
    deadkeyBaseLetter,
    selectedSwapKey,
    selectedSwapKeyCustomChar,
    selectedRaltKey,
    selectedRaltKeyCustomChar,
    swapLayer,
    raltTokens,
    shiftLayerAllowed,
    workingIr,
    identityBcp47,
    recordAssignments,
    sessionAssignments,
    resetMethodState,
    deadkeyBaseLetterResolveOptions,
  ]);

  // ---------------------------------------------------------------------------
  // Case-pair companion — confirm/decline handlers
  // ---------------------------------------------------------------------------

  const handleCompanionConfirm = useCallback(() => {
    if (pendingCompanion === null) return;

    // Stale-proposal guard: locate the exact assignment object this proposal
    // was raised for, by reference — not by re-matching target/scope, which
    // would happily grab a different, unrelated assignment for the same
    // character (P1: multiple mechanisms per character). If it is no longer
    // present in sessionAssignments (removed, or somehow replaced by another
    // path), the proposal is stale: dismiss the banner and record nothing.
    const baseAssignmentIdx = sessionAssignments.indexOf(pendingCompanion.baseAssignment);
    if (baseAssignmentIdx === -1) {
      setPendingCompanion(null);
      return;
    }

    if (pendingCompanion.capsHandling) {
      // CAPS-handling key: the base assignment just recorded (for
      // originalChar) already carries an explicit NCAPS/CAPS pair
      // (buildBaseRuleLines). Appending a SEPARATE companion assignment with
      // its own [CAPS K_X] line would conflict with that pair's [CAPS K_X]
      // line — two rules targeting the identical context, first-inserted
      // silently wins (Layer-A Check #10). Instead, REPLACE the base
      // assignment with a single combined assignment carrying the full
      // CAPS-as-case-inverter quad (buildCasePairRuleLines).
      const kmnRules = buildCasePairRuleLines(
        pendingCompanion.vkey,
        pendingCompanion.originalChar,
        pendingCompanion.counterpart,
        { capsHandling: true },
      ).join("\n");
      const combinedAssignment: MechanismAssignment = {
        scope: "individual",
        target: pendingCompanion.originalChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SWAP,
            strategyId: "S-01",
            slotValues: { kmnRules },
          },
        ],
        source: "user",
      };
      const next = sessionAssignments.map((a, i) =>
        i === baseAssignmentIdx ? combinedAssignment : a,
      );
      recordAssignments(next);
    } else {
      // No CAPS handling on the key: base (`[K_X]`) and shift (`[SHIFT K_X]`)
      // target disjoint contexts — appending a separate companion assignment
      // cannot conflict with the base assignment.
      const kmnRules = buildShiftRuleLines(pendingCompanion.vkey, pendingCompanion.counterpart, {
        capsHandling: false,
      }).join("\n");
      const companionAssignment: MechanismAssignment = {
        scope: "individual",
        target: pendingCompanion.counterpart,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SWAP,
            strategyId: "S-01",
            slotValues: { kmnRules },
          },
        ],
        source: "user",
      };
      recordAssignments([...sessionAssignments, companionAssignment]);
    }

    setPendingCompanion(null);
  }, [pendingCompanion, sessionAssignments, recordAssignments]);

  const handleCompanionDecline = useCallback(() => {
    setPendingCompanion(null);
  }, []);

  // How many NON-sequence methods have already been applied to the current
  // character (mechanismAssignments already excludes the sequence-owned
  // dimension — see excludeSequenceMechanisms above).
  const appliedForCurrentChar = useMemo(
    () =>
      mechanismAssignments.filter(
        (a) => a.scope === "individual" && a.target === currentChar,
      ).length,
    [mechanismAssignments, currentChar],
  );
  // Forward gate: an untouched character needs an explicit Apply before
  // Next/Done is enabled — revisiting an already-covered character always
  // re-enables it, so Back-then-Next over a finished character never traps
  // the author. Skip (see handleNext, which the Skip button also calls) is
  // pure navigation and records nothing, so a skipped-over character stays
  // gated here until it is actually applied.
  const canGoNext =
    currentChar !== null &&
    (appliedForCurrentChar > 0 ||
      coveredChars.has(currentChar) ||
      hasSequenceForChar(sessionAssignments, currentChar));

  // Skip is pure forward navigation — it records nothing, so it is identical
  // to handleNext (advance one position, or complete from the last
  // character, both from usePositionalCharNav above). The Skip button calls
  // handleNext directly (see below) rather than duplicating this logic; kept
  // as a single source of truth so the two controls can never drift.

  const handleRemoveCovered = useCallback(
    (char: string) => {
      // Own only the non-sequence mechanisms for `char` — a recorded
      // multi_char_sequence assignment (or the sequence-mechanism dimension
      // of a mixed assignment) is tracked as a separate dimension (see the
      // "Sequences" chip row) and must survive this "Added" chip's removal
      // untouched (see
      // excludeSequenceMechanisms above). An assignment left with zero
      // mechanisms after this strip is dropped entirely; one that still
      // holds sequence mechanisms is kept, narrowed to just those. The
      // "does `a` carry a sequence mechanism for `char`" half of this split
      // is the same predicate hoisted to isSequenceAssignmentForChar in
      // ./patternIds.ts — reused here instead of reimplemented.
      const next = sessionAssignments.flatMap((a) => {
        if (!(a.scope === "individual" && a.target === char)) return [a];
        if (!isSequenceAssignmentForChar(a, char)) return [];
        const sequenceOnly = a.mechanisms.filter((m) => m.patternId === PATTERN_SEQUENCE);
        return [{ ...a, mechanisms: sequenceOnly }];
      });
      recordAssignments(next);
      // Finding 2 (P2): a pending case-pair companion refers to a specific
      // base assignment by identity. If that assignment no longer survives
      // the removal, the proposal is dead — dismiss it proactively rather
      // than leaving a stale-but-visible banner (propose-then-confirm,
      // spec v1.3.1 §3c). The staleness re-check in handleCompanionConfirm
      // is a backstop for paths this dismissal doesn't cover.
      if (pendingCompanion !== null && !next.includes(pendingCompanion.baseAssignment)) {
        setPendingCompanion(null);
      }
    },
    [sessionAssignments, recordAssignments, pendingCompanion],
  );

  const handleRemoveMechanism = useCallback(
    (assignment: MechanismAssignment) => {
      // `assignment` is usually the exact recorded object (from
      // mechanismAssignments, unchanged when it carries no sequence
      // mechanisms) — remove it outright by reference. If it isn't found,
      // it must be a rebuilt exclusion-view of an underlying assignment that
      // ALSO carries PATTERN_SEQUENCE mechanisms (see excludeSequenceMechanisms
      // above); in that case drop only the mechanisms visible here, leaving
      // the sequence mechanisms on the original (still tracked as a separate
      // dimension — see the "Sequences" chip row) untouched.
      let next: MechanismAssignment[];
      if (sessionAssignments.includes(assignment)) {
        next = sessionAssignments.filter((a) => a !== assignment);
      } else {
        const removed = new Set(assignment.mechanisms);
        next = sessionAssignments
          .map((a) =>
            a.scope === assignment.scope && a.target === assignment.target
              ? { ...a, mechanisms: a.mechanisms.filter((m) => !removed.has(m)) }
              : a,
          )
          .filter((a) => a.mechanisms.length > 0);
      }
      recordAssignments(next);
      // See handleRemoveCovered above — same proactive-dismissal rationale.
      if (pendingCompanion !== null && !next.includes(pendingCompanion.baseAssignment)) {
        setPendingCompanion(null);
      }
    },
    [sessionAssignments, recordAssignments, pendingCompanion],
  );

  // Edit-after-Done: unlocks the desktop layout so a completed Mechanism
  // Gallery can be revisited and corrected. When a touch layout has already
  // been built from the (now-stale) physical layout, mark the TOUCH step
  // stale directly (not "mechanisms") so the dashboard surfaces a re-review
  // warning for it. The production manifest deliberately gives the "touch"
  // step `inputs: []` (to avoid a C2 dependency cycle), so there is no
  // mechanisms→touch edge for markStale("mechanisms") to propagate across —
  // marking "touch" itself seeds it as a re-opened root, which lands it in
  // `staleSteps` regardless of the missing edge. The flag is cleared when the
  // user re-completes the touch step (see reducer R2's clearStale(TOUCH_STEP_ID)
  // call). No-op re: touch when no touch layout exists yet, since there is
  // nothing downstream to go stale.
  const handleUnlock = useCallback(() => {
    unlockDesktop();
    if (touchLayoutJson !== null) {
      markStale(TOUCH_STEP_ID);
    }
  }, [unlockDesktop, markStale, touchLayoutJson]);

  const handleKeyTap = useCallback(
    (keyId: string) => {
      if (locked) return;
      if (method === "swap" && ALL_PICKABLE_KEYS.has(keyId)) {
        setSelectedSwapKey(keyId);
        // Tapping a real key sets the picker to that key; clear the paired
        // custom-char text so re-opening "Enter my own character..." starts
        // clean instead of re-showing stale (possibly invalid) text.
        setSelectedSwapKeyCustomChar("");
      } else if (method === "ralt" && ALL_PICKABLE_KEYS.has(keyId)) {
        setSelectedRaltKey(keyId);
        setSelectedRaltKeyCustomChar("");
      } else if (method === "deadkey" && VALID_DEADKEY_TRIGGER_KEYS.has(keyId)) {
        setTriggerKey(keyId);
        setTriggerKeyCustomChar("");
      }
      // method === "sequence" or unrecognised key: ignore
    },
    [method, locked],
  );

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Guard: no base keyboard
  // ---------------------------------------------------------------------------

  if (selectedBaseKeyboard === null) {
    return (
      <div style={{ ...pageStyle, padding: "24px 32px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {onBack !== undefined && (
            <button type="button" onClick={onBack} style={ghostBtn}>
              <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
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
              <Trans id="editor.assignLoop.noBaseKeyboardSelected">
                No base keyboard selected. Go back to choose a starting point.
              </Trans>
            </p>
          </div>
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
              <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
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
              <Trans id="editor.assignLoop.noInventoryConfirmed">
                No inventory confirmed yet. Complete the Survey (Phase B) to
                confirm which characters your keyboard must produce.
              </Trans>
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
        eyebrow={t({ id: "editor.assignLoop.intro.eyebrow", message: "Getting started · Desktop" })}
        title={t({ id: "editor.assignLoop.intro.title", message: "Welcome to the Mechanism Gallery" })}
        body={
          <Trans id="editor.assignLoop.intro.body">
            This is where you build your keyboard. For each character your
            language needs that the base layout doesn&rsquo;t already have,
            you&rsquo;ll choose how to type it on a physical (desktop) keyboard.
          </Trans>
        }
        bullets={[
          <Trans id="editor.assignLoop.intro.bullet1" key="bullet1">
            You&rsquo;ll go character by character through the list from your survey.
          </Trans>,
          <Trans id="editor.assignLoop.intro.bullet2" key="bullet2">
            Pick a method &mdash; use a dead key, swap a key, or use AltGr
            &mdash; or Skip characters you don&rsquo;t need.
          </Trans>,
          <Trans id="editor.assignLoop.intro.bullet3" key="bullet3">
            Need several keystrokes for one character? Pick &ldquo;Type a
            sequence&rdquo; and a small builder opens right here, in place
            of the preview.
          </Trans>,
          <Trans id="editor.assignLoop.intro.bullet4" key="bullet4">
            Phones and tablets come later, in the Touch gallery.
          </Trans>,
        ]}
        startAriaLabel={t({ id: "editor.assignLoop.intro.startAriaLabel", message: "Start the mechanism gallery" })}
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
  // Forward-button cluster — exactly one of three states applies: the
  // locked-forward-escape ("Continue"), the empty-diff
  // completion ("Done" when there is nothing to add), or the per-character
  // Next/Done advance. Computed once as a single spec so the JSX below
  // renders one <button>, rather than three near-identical button blocks
  // that differ only in label/onClick/testId/style.
  // ---------------------------------------------------------------------------

  // The always-enabled forward-button style is the shared `forwardBtnStyle`
  // import (aliased from galleryTheme.ts's galleryForwardBtnStyle).

  interface ForwardButtonSpec {
    label: string;
    onClick: (() => void) | undefined;
    testId?: string;
    ariaLabel?: string;
    disabled: boolean;
    style: CSSProperties;
  }

  // Invariant: callers always pass onComplete when locked can be true — so
  // the "no actionable control" state (locked with Apply/Skip/Next all
  // disabled and no completion button rendered) is unreachable.
  const doneLabel = t({ id: "editor.assignLoop.doneButton", message: "Done" });
  const forwardButton: ForwardButtonSpec | null =
    locked && onComplete !== undefined
      ? {
          label: t({ id: "editor.assignLoop.continueButton", message: "Continue →" }),
          onClick: onComplete,
          testId: "mechanisms-continue",
          ariaLabel: t({ id: "editor.assignLoop.continueAriaLabel", message: "Continue (desktop layout locked)" }),
          disabled: false,
          style: forwardBtnStyle,
        }
      : lettersToAdd.length === 0
        ? {
            label: doneLabel,
            onClick: onComplete,
            testId: "mechanisms-continue",
            disabled: false,
            style: forwardBtnStyle,
          }
        : currentChar !== null
          ? {
              label: hasAnotherCharAfterCurrent
                ? t({ id: "editor.assignLoop.nextCharacterButton", message: "Next character →" })
                : doneLabel,
              ariaLabel: hasAnotherCharAfterCurrent
                ? t({ id: "editor.assignLoop.nextCharacterAriaLabel", message: "Next character" })
                : doneLabel,
              onClick: handleNext,
              disabled: !canGoNext || locked,
              style: {
                padding: "9px 20px",
                background: canGoNext ? "#238636" : "#21262d",
                border: "none",
                borderRadius: 6,
                color: canGoNext ? "#e6edf3" : TEXT_DIM,
                fontSize: 13,
                fontWeight: 600,
                cursor: canGoNext ? "pointer" : "not-allowed",
                fontFamily: FONT,
              },
            }
          : null;

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
      {/* Locked banner — editing is disabled once Mechanisms has completed
          (lockDesktop() fires via reducer R1). "Unlock to edit" lets the
          author return and fix a mistake: it flips desktopLocked back to
          false (the gallery below re-renders editable) and, when a touch
          layout has already been built from this physical layout, marks the
          TOUCH step stale directly so the dashboard flags it for re-review
          (correctness rail — see handleUnlock for why "touch", not
          "mechanisms", is marked). Re-completing Mechanisms re-locks via the
          same reducer path; no second lock path is introduced here. */}
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
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span><Trans id="editor.assignLoop.desktopLockedBanner">Desktop layout locked — editing disabled</Trans></span>
            <button
              type="button"
              onClick={handleUnlock}
              aria-label={t({ id: "editor.assignLoop.unlockAriaLabel", message: "Unlock desktop layout to edit" })}
              style={{
                flexShrink: 0,
                padding: "5px 12px",
                background: "#d29922",
                border: "1px solid #d29922",
                borderRadius: 5,
                color: "#1a1209",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              <Trans id="editor.assignLoop.unlockButton">Unlock to edit</Trans>
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 11, fontFamily: FONT }}>
            <Trans id="editor.assignLoop.unlockHint">
              Editing the desktop layout may require re-reviewing your touch layout.
            </Trans>
          </p>
        </div>
      )}
      <>
          {/* Small coverage line */}
          {lettersToAdd.length > 0 && (
            <p
              role="status"
              aria-live="polite"
              aria-label={t({
                id: "editor.assignLoop.coverageAriaLabel",
                message: `${coveredCount} of ${lettersToAdd.length} added`,
              })}
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              <Trans id="editor.assignLoop.coverageLine">
                {coveredCount} of {lettersToAdd.length} added
              </Trans>
            </p>
          )}

          {/* Top toolbar row — Back (left) + a right-aligned forward cluster
              (right), on the same horizontal level. Back is positional
              (handleBack) rather than a history stack, so it survives
              remount; it is rendered whenever onBack is available (to escape
              the phase from the first character) or the current character
              isn't first (interior/last positions always have a previous
              character to return to). The right-aligned cluster holds the
              previous-character button (rendered whenever currentChar !==
              null and not locked; disabled on the first character, since
              there is nowhere further back to step) immediately to the left
              of the primary forward action — exactly one of the locked
              forward-escape, the empty-diff Done completion, or the
              per-character Next/Done advance button. The cluster itself
              carries marginLeft: "auto" (rather than each button) so it holds
              position whether or not Back is present. */}
          {(onBack !== undefined ||
            currentIdx > 0 ||
            (locked && onComplete !== undefined) ||
            lettersToAdd.length === 0 ||
            currentChar !== null) && (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                width: "100%",
              }}
            >
              {(onBack !== undefined || currentIdx > 0) && (
                <button
                  type="button"
                  onClick={handleBack}
                  style={{ ...ghostBtn, fontSize: 13 }}
                >
                  <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
                </button>
              )}

              {/* Right-aligned forward cluster: the primary forward action.
                  The old "Previous character" button that lived here has
                  been replaced by the CharScrollStrip below (any character,
                  not just the immediately-previous one, is now reachable by
                  clicking its chip). */}
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {/* Single button driven by the forwardButton spec computed
                    above — exactly one of the locked forward-escape, the
                    empty-diff Done completion, or the per-character
                    Next/Done advance is ever non-null. */}
                {forwardButton !== null && (
                  <button
                    type="button"
                    onClick={forwardButton.onClick}
                    disabled={forwardButton.disabled}
                    {...(forwardButton.testId !== undefined
                      ? { "data-testid": forwardButton.testId }
                      : {})}
                    {...(forwardButton.ariaLabel !== undefined
                      ? { "aria-label": forwardButton.ariaLabel }
                      : {})}
                    style={forwardButton.style}
                  >
                    {forwardButton.label}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Character scroll strip — horizontal, all of lettersToAdd; click
              any chip to jump straight to that character (replaces the old
              "Previous character" button, which only ever stepped back one
              position). Each chip's badge is the produces-count for that
              character in THIS gallery's modality (physical) — see
              charMechanisms.ts. */}
          {lettersToAdd.length > 0 && (
            <CharScrollStrip
              chars={lettersToAdd}
              currentChar={currentChar}
              onSelectChar={handleSelectChar}
              assignments={sessionAssignments}
              modality="physical"
            />
          )}

          {/* Empty-diff state — status text only; the forward/completion
              control (Continue / Done) now lives in the top toolbar row
              above, paired with Back. This is the only reachable null-
              currentChar state left — handleNext (which Skip also calls) on
              the last character calls onComplete directly rather than
              setting currentChar to null, so there is no separate "all done,
              char is null" panel to reconcile. */}
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
                <Trans id="editor.assignLoop.noNewCharacters">No new characters to add.</Trans>
              </p>
            </div>
          )}

          {/* Per-char UI */}
          {currentChar !== null && (
            <>
              {/* "Add a key" section header — the character-heading card that
                  used to live here (glyph + U+ notation) is gone; the
                  CharScrollStrip above now shows both on the selected chip
                  directly (see CharScrollStrip.tsx). This label is kept so
                  the "you're now choosing how to add this key" cue doesn't
                  disappear along with the card. */}
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: TEXT_DIM,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <Trans id="editor.assignLoop.addAKeyEyebrow">Add a key</Trans>
              </p>

              {/* kbgen suggestion row — shown above method chooser when a
                  qualifying placement candidate exists and hasn't been dismissed.
                  [Accept] pre-fills method + key picker; [Change] dismisses the
                  row so the author can select manually. No kbgen data => null =>
                  row is absent and gallery behaves exactly as today. */}
              {suggestion !== null && !suggestionDismissed && (
                <div
                  role="note"
                  aria-label={t({ id: "editor.assignLoop.suggestion.ariaLabel", message: "Placement suggestion from kbgen seeder" })}
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
                      const charOrEmpty = currentChar !== null ? displayChar(currentChar) : "";
                      return suggestion.strategyId === "S-01"
                        ? t({
                            id: "editor.assignLoop.suggestion.replaceText",
                            message: `Suggested: Replace ${keyName} with ${charOrEmpty}`,
                          })
                        : t({
                            id: "editor.assignLoop.suggestion.raltText",
                            message: `Suggested: Right Alt + ${keyName} for ${charOrEmpty}`,
                          });
                    })()}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={handleSuggestionAccept}
                      aria-label={
                        suggestion.strategyId === "S-01"
                          ? t({
                              id: "editor.assignLoop.suggestion.acceptSwapAriaLabel",
                              message: `Accept suggestion: assign ${currentChar} to ${suggestion.topCandidate.vkey}`,
                            })
                          : t({
                              id: "editor.assignLoop.suggestion.acceptRaltAriaLabel",
                              message: `Accept suggestion: RAlt + ${suggestion.topCandidate.vkey} for ${currentChar}`,
                            })
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
                      <Trans id="editor.assignLoop.suggestion.acceptButton">Accept</Trans>
                    </button>
                    <button
                      type="button"
                      onClick={handleSuggestionChange}
                      aria-label={t({ id: "editor.assignLoop.suggestion.denyAriaLabel", message: "Deny suggestion and choose method manually" })}
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
                </div>
              )}

              {/* Method chooser */}
              <MethodChooser
                currentChar={currentChar}
                method={method}
                onMethodChange={setMethod}
                triggerKey={triggerKey}
                onTriggerKeyChange={setTriggerKey}
                triggerKeyCustomChar={triggerKeyCustomChar}
                onTriggerKeyCustomCharChange={setTriggerKeyCustomChar}
                deadkeyBaseLetter={deadkeyBaseLetter}
                onDeadkeyBaseLetterChange={setDeadkeyBaseLetter}
                selectedSwapKey={selectedSwapKey}
                onSwapKeyChange={setSelectedSwapKey}
                selectedSwapKeyCustomChar={selectedSwapKeyCustomChar}
                onSwapKeyCustomCharChange={setSelectedSwapKeyCustomChar}
                selectedRaltKey={selectedRaltKey}
                onRaltKeyChange={setSelectedRaltKey}
                selectedRaltKeyCustomChar={selectedRaltKeyCustomChar}
                onRaltKeyCustomCharChange={setSelectedRaltKeyCustomChar}
                swapLayer={swapLayer}
                onSwapLayerChange={setSwapLayer}
                raltTokens={raltTokens}
                onRaltTokenChange={handleRaltTokenChange}
                onAddRaltSlot={handleAddRaltSlot}
                onRemoveRaltSlot={handleRemoveRaltSlot}
                modifierPool={modifierPool}
                modifierTokensInUse={modifierTokensInUse}
                shiftLayerDisabled={!shiftLayerAllowed}
              />

              {/* Case-pair companion proposal — propose-then-confirm, never
                  apply silently (spec v1.3.1 §3c). Shown after a base-layer
                  S-01 apply when the applied character has a known
                  uppercase counterpart. */}
              {pendingCompanion !== null && (
                <div
                  role="note"
                  aria-label={t({ id: "editor.assignLoop.companion.ariaLabel", message: "Case-pair companion proposal" })}
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
                  <p style={{ margin: 0, fontSize: 12, color: "#56d364", fontFamily: FONT }}>
                    <Trans id="editor.assignLoop.companion.prompt">
                      {pendingCompanion.originalChar} has an uppercase form,{" "}
                      {pendingCompanion.counterpart}. Map {pendingCompanion.counterpart} to the
                      shift layer of the same key as well?
                    </Trans>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleCompanionConfirm}
                      aria-label={t({
                        id: "editor.assignLoop.companion.confirmAriaLabel",
                        message: `Map ${pendingCompanion.counterpart} to the shift layer of ${pendingCompanion.vkey}`,
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
                      <Trans id="editor.assignLoop.companion.confirmButton">Map it</Trans>
                    </button>
                    <button
                      type="button"
                      onClick={handleCompanionDecline}
                      aria-label={t({
                        id: "editor.assignLoop.companion.declineAriaLabel",
                        message: `Do not map ${pendingCompanion.counterpart} to the shift layer`,
                      })}
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
                      <Trans id="editor.assignLoop.companion.declineButton">No thanks</Trans>
                    </button>
                  </div>
                </div>
              )}

              {/* Apply + Next + Skip actions */}
              {appliedForCurrentChar > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "#56d364", fontFamily: FONT }}>
                  {t({
                    id: "editor.assignLoop.appliedCount",
                    message: plural(appliedForCurrentChar, {
                      one: "# method applied",
                      other: "# methods applied",
                    }),
                  })}
                </p>
              )}
              {appliedForCurrentChar > 0 && (
                <div
                  role="group"
                  aria-label={t({ id: "editor.assignLoop.appliedMethodsAriaLabel", message: "Applied methods — click to remove" })}
                  style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}
                >
                  {mechanismAssignments
                    .filter((a) => a.scope === "individual" && a.target === currentChar)
                    .map((a, i) => {
                      const ref = a.mechanisms[0];
                      const label = ref !== undefined ? methodLabel(ref, i18n) : a.mechanisms.map((m) => methodLabel(m, i18n)).join(", ");
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleRemoveMechanism(a)}
                          disabled={locked}
                          aria-label={t({
                            id: "editor.assignLoop.removeMethodAriaLabel",
                            message: `Remove method ${label} for ${currentChar}`,
                          })}
                          title={t({ id: "editor.assignLoop.clickToRemove", message: "click to remove" })}
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
              {currentChar !== null && hasSequenceForChar(sessionAssignments, currentChar) && (
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}
                >
                  <span style={{ fontSize: 12, color: "#58a6ff", fontFamily: FONT }}>
                    <Trans id="editor.assignLoop.sequenceRecordedBadge">Sequence recorded</Trans>
                  </span>
                  <button
                    type="button"
                    onClick={() => unflagCharForSequence(currentChar)}
                    disabled={locked}
                    aria-label={t({
                      id: "editor.assignLoop.removeSequenceAssignmentAriaLabel",
                      message: `Remove recorded sequence for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                    })}
                    title={t({ id: "editor.assignLoop.clickToRemove", message: "click to remove" })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      background: "#0d1f33",
                      border: "1px solid #58a6ff",
                      borderRadius: 12,
                      color: "#58a6ff",
                      fontSize: 11,
                      fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
                      cursor: locked ? "not-allowed" : "pointer",
                    }}
                  >
                    <Trans id="editor.assignLoop.removeButton">remove</Trans>
                    <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>
                      {" ×"}
                    </span>
                  </button>
                </div>
              )}

              {/* Sequences using this character (Part 3) — every recorded
                  multi_char_sequence where currentChar appears in ANY slot
                  (content, indicator, or output), not just the ones whose
                  output IS currentChar. Read-only here — mirrors
                  SequenceGallery's own "Recorded sequences" card style
                  (SequenceGallery.tsx) but editing a sequence stays owned by
                  the Sequence Gallery, so no Remove control is offered.
                  Shared with TouchGallery's own bottom list — see
                  UsesSequencesCard.tsx. */}
              <UsesSequencesCard
                currentChar={currentChar}
                assignments={sessionAssignments}
                modality="physical"
              />

              {/* Apply + Skip. Back and Next/Done live in the shared top
                  toolbar row above (see leftContent's top of pane) so the
                  forward-advance control is spatially separated from these
                  editing actions. The generic "Apply method" button is
                  hidden for method === "sequence" — the sequence builder
                  (right pane, see rightContent below) owns its own Apply. */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {method !== "sequence" && (
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!canApply || locked}
                    aria-label={t({
                      id: "editor.assignLoop.applyMethodAriaLabel",
                      message: `Apply method for ${currentChar}`,
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
                  disabled={locked}
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
                <Trans id="editor.assignLoop.addedHeading">Added</Trans>
              </p>
              <div
                role="group"
                aria-label={t({ id: "editor.assignLoop.addedGroupAriaLabel", message: "Added characters — click to remove" })}
                style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
              >
                {[...coveredChars].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleRemoveCovered(c)}
                    aria-label={t({
                      id: "editor.assignLoop.removeCharacterAriaLabel",
                      message: `Remove ${{ notation: toUPlusNotation(c) }} ${{ char: c }}`,
                    })}
                    title={t({
                      id: "editor.assignLoop.removeCharacterTitle",
                      message: `${{ notation: toUPlusNotation(c) }} — click to remove`,
                    })}
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
                    {displayChar(c)}
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

          {/* Sequences chip row — chars with a recorded multi_char_sequence
              assignment, tracked separately from "Added" (see
              excludeSequenceMechanisms). */}
          {sequenceRecordedChars.length > 0 && (
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
                <Trans id="editor.assignLoop.sequencesHeading">Sequences</Trans>
              </p>
              <div
                role="group"
                aria-label={t({ id: "editor.assignLoop.sequencesGroupAriaLabel", message: "Characters with a recorded sequence — click to remove" })}
                style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
              >
                {sequenceRecordedChars.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => unflagCharForSequence(c)}
                    aria-label={t({
                      id: "editor.assignLoop.removeSequenceAssignmentListAriaLabel",
                      message: `Remove recorded sequence for ${{ notation: toUPlusNotation(c) }} ${{ char: c }}`,
                    })}
                    title={t({
                      id: "editor.assignLoop.removeSequenceAssignmentTitle",
                      message: `${{ notation: toUPlusNotation(c) }} — click to remove`,
                    })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 8px",
                      background: "#1c2a3a",
                      border: "1px solid #58a6ff",
                      borderRadius: 16,
                      color: "#58a6ff",
                      fontSize: 13,
                      fontFamily: "monospace",
                      cursor: "pointer",
                      lineHeight: 1.3,
                    }}
                  >
                    {displayChar(c)}
                    <span
                      aria-hidden="true"
                      style={{ fontSize: 11, color: "#58a6ff", opacity: 0.7 }}
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
          <Trans id="editor.assignLoop.patternLoadError">
            Pattern load error — preview transform may be incomplete.
          </Trans>
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
    <AssignLoopShell
      headingText={t({ id: "editor.assignLoop.mechanismGalleryHeading", message: "Mechanism Gallery" })}
      modalityLabel={t({ id: "editor.assignLoop.modality.desktop", message: "Desktop" })}
      leftContent={leftContent}
      rightContent={
        // Selecting the S-03 sequence method swaps the visible right pane for
        // the sequence builder — the trigger is the method-card click itself
        // (MethodChooser's onMethodChange), not a later Apply. Apply and
        // Cancel both hand control back via resetMethodState (method ->
        // "swap"), which reverts the visible pane back to the preview below,
        // exactly like every other method's Apply already resets method
        // state.
        //
        // IMPORTANT: the preview branch is toggled via CSS (display:none),
        // NOT by conditionally unmounting it. GalleryPreviewWithPatterns owns
        // OSKFrame's <iframe>, whose own header comment states the iframe
        // "is mounted unconditionally ... so KMW's init() runs once and
        // stays warm — hiding & re-creating the iframe would reset KMW
        // context on every selection". An earlier version of this file
        // violated that invariant by unmounting GalleryPreviewWithPatterns
        // whenever method === "sequence", destroying and later recreating
        // the WASM/KMW-backed iframe on every method toggle — exactly the
        // "expensive"/unsafe reinit its own doc comment warns against. Always
        // render it; only the wrapping div's `display` changes.
        <>
          <div
            data-testid="mechanism-preview-wrapper"
            style={{ display: method === "sequence" && currentChar !== null ? "none" : "contents" }}
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
                <Trans id="editor.assignLoop.loadingPatterns">Loading patterns...</Trans>
              </p>
            ) : null}
          </div>
          {method === "sequence" && currentChar !== null && (
            <SequenceBuilderPanel
              char={currentChar}
              sessionAssignments={sessionAssignments}
              recordAssignments={recordAssignments}
              onApplied={resetMethodState}
              onCancel={resetMethodState}
            />
          )}
        </>
      }
    />
  );
}
