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
//   - Offers three methods:
//       S-03 (sequence) — always shown
//       S-02 (deadkey)  — only for decomposable accented letters
//       "swap" (always shown; user picks a physical key) — a COMBINED
//         S-01/S-08 card ("Assign to a key"). It starts with zero modifier
//         layers, which is a plain S-01 simple_swap base-layer assignment;
//         adding one or more layers (up to four ModifierTokens — see
//         @keyboard-studio/engine's modifierCombos.ts) turns the same Apply
//         into an S-08 modifier_as_layer_switch combo instead. There is no
//         separate Base/Shift toggle — see handleApply's method === "swap"
//         branch, which picks the write path from raltTokens' filled count.
//   - "Add key" records a MechanismAssignment(scope:"individual"); the user
//     advances explicitly via "Next character"/"Done".
//   - "Mark for later review" (mechanism-gallery-progression) is a per-
//     character TOGGLE, not navigation — it records the character in
//     surveySessionStore.markedForLaterDesktop (authoring metadata only,
//     never the working copy) and unblocks Next/Done for that character
//     exactly like an Apply would, WITHOUT changing coverage: a marked
//     character stays unimplemented (Phase F / export still see it as such,
//     via the untouched useInventoryCoverageGate() gate) but is no longer
//     "unaccounted for" (lib/accountedForGate.ts). Replaces the old
//     "Skip this character" link, which advanced without recording anything,
//     silently leaving a character neither implemented nor accounted for.
//   - The gallery's Done affordance is disabled while any lettersToAdd
//     character is neither implemented nor marked (see canGoNext /
//     unaccountedChars below) — there is no more "come back later" confirm
//     dialog; the inline hint explains why Done is unavailable instead.
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

import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
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
  MechanismRef,
  PlacementMap,
  PlacementWorklist,
  RemovalCapability,
} from "@keyboard-studio/contracts";
import { toUPlusNotation, buildProducedSet } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { collateInventory } from "../../survey/collation.ts";
import { nfcDedup } from "../../survey/charNormUtils.ts";
import { TOUCH_STEP_ID } from "../../steps/reducer.ts";
import { getPatternLibraryService } from "../../lib/services.ts";
import { displayChar } from "../../lib/irToCarveNodes.ts";
import { capabilityHint } from "./parts/InfoView.tsx";
import type { AxisFill, DiscoveryAxisVector } from "@keyboard-studio/contracts";
import {
  defaultFillAxes,
  isMnemonicLayout,
  planShiftAssignment,
  buildShiftRuleLines,
  buildBaseRuleLines,
  buildCasePairRuleLines,
  MODIFIER_EXCLUSIONS,
  canonicalizeCombo,
  comboToKeySpec,
  collectModifierTokensInUse,
  collectCharContributors,
  collectCompositionMethod,
  type ModifierToken,
  type CharContributors,
} from "@keyboard-studio/engine";
import {
  useKeyboardArtifact,
  type ScaffoldSpec,
  type Stage,
} from "../../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { useInventoryDiff } from "../../hooks/useInventoryDiff.ts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import {
  getSuggestionForCharWithCasePair,
  PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
} from "../../survey/placementSeeds.ts";
import {
  KEY_OPTIONS,
  ALL_PICKABLE_KEYS,
  CUSTOM_KEY_OPTION_VALUE,
} from "../../lib/keyOptions.ts";
import { formatModifierCombo } from "../../lib/modifierTokenLabel.ts";
import {
  resolveCharInput,
  resolveKeyPickerSelection,
  resolvedVkeyOf,
  isLoneCombiningMark,
  reflectCharInput,
  type ResolveCharInputOptions,
  type KeyPickerResolveOptions,
} from "../../lib/charInput.ts";
import {
  useCasePairCompanion,
  type CasePairProposal,
} from "./casePairCompanion.ts";
import { CasePairProposalBanner } from "./CasePairProposalBanner.tsx";
import { isGatedAccentCompositionCandidate } from "./siblingAccents.ts";
import {
  appendNotDeletableSuffix,
  composeContributorLabel,
  compositionTooltip,
} from "./existingMethodLabels.ts";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { KeyPickerField } from "./KeyPickerField.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import { usePositionalCharNav, nearestSurvivingChar, indexOfChar } from "./usePositionalCharNav.ts";
import { useCharCycleKeys } from "./useCharCycleKeys.ts";
import { AssignLoopShell } from "./AssignLoopShell.tsx";
import { CharScrollStrip } from "./parts/CharScrollStrip.tsx";
import { getProducerBadge, allCharsCovered } from "./parts/charMechanisms.ts";
import { UsesSequencesCard } from "./parts/UsesSequencesCard.tsx";
import { GalleryEmptyState } from "./parts/GalleryEmptyState.tsx";
import {
  RemovableChipRow,
  HoverDangerChip,
  NonDeletableMethodChip,
} from "./parts/RemovableChipRow.tsx";
import {
  unimplementedDesktopChars,
  selectDesktopAssignments,
  formatUncoveredCharsList,
} from "../../lib/unimplementedInventory.ts";
import { subtractMarked } from "../../lib/accountedForGate.ts";
import {
  SequenceBuilderPanel,
  hasSequenceForChar,
  partitionSequenceAssignment,
  type SequenceApplied,
} from "./SequenceBuilderPanel.tsx";
import { SelectMenu, type SelectMenuOption } from "../../ui/SelectMenu.tsx";
import {
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  BLUE_ACTION,
  galleryGhostBtn as ghostBtn,
  galleryInputStyle as inputStyle,
  galleryForwardBtnStyle as forwardBtnStyle,
  gallerySelectMenuStyle,
  galleryHeaderBtnStyle as headerBtnStyle,
  galleryConfigStyle as configStyle,
  galleryCardStyle as cardStyle,
} from "../../lib/galleryTheme.ts";
import { ERROR_RED, ERROR_BG } from "../../ui/theme.ts";
import {
  PATTERN_SEQUENCE,
  PATTERN_DEADKEY,
  PATTERN_SWAP,
  PATTERN_RALT,
  isSequenceAssignmentForChar,
} from "./patternIds.ts";

// Re-exported for existing importers that reach the pattern id constants via
// this module; the canonical declarations now live in ./patternIds.ts.
export { PATTERN_SEQUENCE, PATTERN_DEADKEY, PATTERN_SWAP, PATTERN_RALT };

const selectStyle: CSSProperties = gallerySelectMenuStyle(140);

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
function buildDeadkeyBaseLetterResolveOptions(
  i18n?: I18n,
): ResolveCharInputOptions {
  return {
    multiToken: true,
    singleGrapheme: true,
    blockDelimiters: true,
    singleGraphemeReason: resolveMessage(
      i18n,
      msg({
        id: "editor.assignLoop.deadkeySingleGraphemeReason",
        message:
          "Enter one base character. (Covering several base letters with one dead key is coming later.)",
      }),
    ),
  };
}

// The S-02 deadkey trigger's resolved custom character is reused as
// `accentChar` — the deadkey's own literal output — so it needs the same
// delimiter guard as the character boxes above, unlike the SWAP/RALT/touch
// host-key pickers (which resolve solely to a K_ vkey id).
const TRIGGER_KEY_RESOLVE_OPTIONS: KeyPickerResolveOptions = {
  blockDelimiters: true,
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
      const label = resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.methodLabel.deadkey",
          message: "Deadkey",
        }),
      );
      return `${label}: ${sv["triggerKey"] ?? "?"} + ${sv["baseLetters"] ?? "?"}`;
    }
    case "simple_swap": {
      // kmnRules may be multiple lines (e.g. shift-layer CAPS/NCAPS pair) —
      // the badge only needs the bracketed vkey expression from the first line.
      const firstLine = (sv["kmnRules"] ?? "").split("\n")[0] ?? "";
      const label = resolveMessage(
        i18n,
        msg({ id: "editor.assignLoop.methodLabel.key", message: "Key" }),
      );
      return `${label}: ${firstLine.replace(/^\+ \[/, "").replace(/\].*/, "")}`;
    }
    case "modifier_as_layer_switch": {
      // altgrKeyList is a bracket-notation combo spec — e.g. "[RALT K_E]" or
      // "[SHIFT CTRL RALT K_E]" for an arbitrary generalized S-08 combo
      // (modifierCombos.ts comboToKeySpec). The vkey is always the last token.
      const altgrKeyList = sv["altgrKeyList"] ?? "";
      const parts = altgrKeyList
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split(/\s+/)
        .filter(Boolean);
      const key = parts.pop() ?? "?";
      // parts came from splitting a bracket-notation combo spec built by this
      // gallery's own S-08 write path (comboToKeySpec), so its entries are
      // always ModifierToken strings — asserted rather than re-typed here.
      const prefix =
        parts.length > 0
          ? formatModifierCombo(parts as ModifierToken[])
          : resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.methodLabel.layer",
                message: "Layer",
              }),
            );
      return `${prefix}: ${key}`;
    }
    case "multi_char_sequence":
      // Defensive fallback only — excludeSequenceMechanisms (below) keeps
      // PATTERN_SEQUENCE mechanisms out of every badge list this label feeds,
      // since sequences are tracked as a separate dimension (see the
      // "Sequences" chip row below) rather than the "Added"/"Applied methods"
      // rows. This branch exists so a raw patternId can never leak onto a
      // badge if that exclusion is ever bypassed.
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.methodLabel.multiKeySequence",
          message: "Multi-key sequence",
        }),
      );
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
    const nonSequence = a.mechanisms.filter(
      (m) => m.patternId !== PATTERN_SEQUENCE,
    );
    if (nonSequence.length === 0) continue;
    result.push(
      nonSequence.length === a.mechanisms.length
        ? a
        : { ...a, mechanisms: nonSequence },
    );
  }
  return result;
}

// Maps each DEADKEY_OPTIONS key value to the unshifted character it produces.
// Used to derive a deadkey ID matching the sil_cameroon_qwerty convention
// (dk ID = Unicode codepoint of the trigger key's character, e.g. dk(003b) for `;`).
const TRIGGER_KEY_CHARS: Record<string, string> = {
  K_LBRKT: "[", // left bracket [
  K_RBRKT: "]", // right bracket ]
  K_BKQUOTE: "`", // backtick `
  K_COLON: ";", // semicolon ;
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
      heading={t({
        id: "editor.assignLoop.preview.heading",
        message: "Live preview",
      })}
      warningLabel={t({
        id: "editor.assignLoop.preview.applyWarnings",
        message: "Apply warnings:",
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// MethodChooser — S-03 / S-02 / combined-S-01-S-08 single-card selection +
// inline config
// ---------------------------------------------------------------------------

type Method = "sequence" | "deadkey" | "swap";

// "swap" is the combined "Assign to a key" card: a physical key picker plus
// an optional modifier-layer combo (raltTokens below). There is no separate
// Base/Shift toggle — a plain base-layer S-01 `simple_swap` assignment is
// what zero layers means; adding a SHIFT token to the combo (once SHIFT
// appears in the modifier pool) is the only way to reach the shift plane
// under this merged card. See handleApply's method === "swap" branch, which
// picks the S-01 vs. S-08 write path from the FILLED layer count.

// S-08 layer-switch target combo — a list of up to four ModifierTokens
// (SHIFT / CAPS / the alt family / the ctrl family — NCAPS is not offered,
// see computeModifierPool), generalized beyond the old binary
// 'ralt'|'shift-ralt' toggle (engine's modifierCombos.ts,
// `modifier_as_layer_switch`). A ctrl-family + chiral-alt-family pick (e.g.
// Ctrl+RAlt) unifies to the all-generic Ctrl+Alt at apply time
// (modifierCombos.ts's canonicalizeCombo — a mixed generic+chiral combo is
// kmcmplib-invalid and undeliverable by any real keypress, while the
// all-generic form matches both a physical Ctrl+Alt press and a Windows
// AltGr press via Keyman core's IsEquivalentShift).
// Unlike the old S-01 Shift toggle, the layer combo is NOT gated on mnemonic
// layouts: `store(&mnemoniclayout)` changes only how the base character of a
// key spec is resolved (base-layout character vs physical position); a
// SHIFT flag inside the combo selects the shifted plane and does not
// re-apply the base layout's own shift semantics, so the combo is legitimate
// either way. Real mnemonic keyboards ship such rules: sil_euro_latin
// declares `store(&mnemoniclayout) '1'` and maps e.g.
// `[RALT SHIFT '<'] > U+00AB`.
//
// The card starts with ZERO layers (raltTokens = []) — a valid, applyable
// state that plans a plain base-key assignment (see handleApply). A slot
// value of "" means "not yet chosen": the FIRST layer added still defaults
// to a non-empty token (generic ALT, or RALT once the keyboard already uses
// a chiral alt token — see raltDefaultToken), mirroring the pre-merge
// "Layer + key" card's always-prefilled first slot; every slot added after
// that defaults to the first still-available modifier token (per
// optionsForRaltSlot's earlier-slot exclusions) that the keyboard already
// uses elsewhere, else falls back to unselected ("") — see
// handleAddRaltSlot. Apply is disabled until an unselected slot is filled or
// removed (see canApply / handleRemoveRaltSlot, which now allows removing
// all the way back to zero).
const MAX_RALT_SLOTS = 4;

// Modifier tokens that stay selectable in the layer-combo dropdowns but are
// never used as the auto-default for a newly-added slot (see
// handleAddRaltSlot). CAPS is reported as "in use" by collectModifierTokensInUse
// for any keyboard carrying routine CAPS/NCAPS case-handling rules, but it is a
// case/state modifier rather than a layer an author reaches for — auto-filling
// it would surprise. (NCAPS is never in the pool at all — see computeModifierPool.)
const AUTO_DEFAULT_EXCLUDED: ReadonlySet<ModifierToken> = new Set(["CAPS"]);

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
function computeModifierPool(
  inUse: ReadonlySet<ModifierToken>,
): ModifierToken[] {
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
/**
 * True when every PRESENT layer slot in the combined "Assign to a key" card
 * has a chosen (non-"") token. Zero slots is vacuously true — the card's
 * starting state, a valid plain base-key assignment. Shared by the render
 * closure (drives "+ Add layer" visibility) and canApply (drives the Apply
 * button) so the two never compute "all filled" via two separate
 * expressions that could silently diverge.
 */
function raltAllFilled(tokens: readonly (ModifierToken | "")[]): boolean {
  return tokens.every((tok) => tok !== "");
}

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
  /** The single physical key picker for the combined "swap" card — the base
   *  key of the layer combo when raltTokens is non-empty, or the plain
   *  assigned key when it is empty. */
  selectedSwapKey: string;
  onSwapKeyChange: (v: string) => void;
  selectedSwapKeyCustomChar: string;
  onSwapKeyCustomCharChange: (v: string) => void;
  /**
   * S-08 target combo — a list of up to {@link MAX_RALT_SLOTS} chosen
   * ModifierTokens (one dropdown per slot; "" means "not yet chosen", only
   * valid past the first slot). Empty means "no layer" — a plain S-01
   * base-key assignment (see handleApply).
   */
  raltTokens: (ModifierToken | "")[];
  onRaltTokenChange: (index: number, value: string) => void;
  onAddRaltSlot: () => void;
  onRemoveRaltSlot: (index: number) => void;
  /** Per-family option pool for the layer-combo dropdowns (computeModifierPool). */
  modifierPool: ModifierToken[];
  /** Tokens already used elsewhere in the working IR — rendered bold + "(in use)". */
  modifierTokensInUse: ReadonlySet<ModifierToken>;
}

const DEADKEY_OPTIONS = [
  { value: "K_COLON", label: "K_COLON (semicolon ;)" },
  { value: "K_LBRKT", label: "K_LBRKT (left bracket [)" },
  { value: "K_RBRKT", label: "K_RBRKT (right bracket ])" },
  { value: "K_BKQUOTE", label: "K_BKQUOTE (backtick `)" },
] as const;

// Module-level Sets for O(1) membership checks in handleKeyTap.
// ALL_PICKABLE_KEYS is imported from keyOptions.ts.
const VALID_DEADKEY_TRIGGER_KEYS: ReadonlySet<string> = new Set(
  DEADKEY_OPTIONS.map((o) => o.value),
);

// selectStyle — used by the S-08 layer-combo dropdowns (the modifier-token
// SelectMenus); the base-key picker itself uses KeyPickerField, which carries
// its own internal style.

// ghostBtn, inputStyle, headerBtnStyle, configStyle, and cardStyle are
// imported (aliased) from ../../lib/galleryTheme.ts — shared byte-for-byte
// with SequenceBuilderPanel.tsx (and, for ghostBtn/headerBtnStyle/
// configStyle/cardStyle, TouchGallery.tsx) rather than redefined here. The
// page-level wrapper style (pageStyle) is no longer imported directly here —
// it's used via GalleryEmptyState.tsx (the no-base-keyboard/no-inventory
// guards) rather than inline.

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
  raltTokens,
  onRaltTokenChange,
  onAddRaltSlot,
  onRemoveRaltSlot,
  modifierPool,
  modifierTokensInUse,
}: MethodChooserProps) {
  const { t, i18n } = useLingui();
  const deadkeyBaseLetterResolveOptions =
    buildDeadkeyBaseLetterResolveOptions(i18n);
  const triggerKeyPlaceholder = t({
    id: "editor.assignLoop.triggerKeyPlaceholder",
    message: "[trigger key]",
  });

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

  // Resolved vkey for the combo-preview line below — a custom selection
  // still shows the resolved physical key in the combo-spec preview, never
  // the raw "__custom__" sentinel or unresolved typed text.
  const swapVkeyForDisplay = resolvedVkeyOf(
    resolveKeyPickerSelection(selectedSwapKey, selectedSwapKeyCustomChar),
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
    : t({
        id: "editor.assignLoop.deadkeyBaseLetterPlaceholder",
        message: "[base letter]",
      });

  // Each method is one card: transparent header button + inline config when
  // selected. cardStyle is imported from ../../lib/galleryTheme.ts.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        <Trans id="editor.assignLoop.howToTypeIt">How to type it:</Trans>
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          color: TEXT_DIM,
          fontFamily: FONT,
          opacity: 0.85,
        }}
      >
        <Trans id="editor.assignLoop.charBoxHelp">
          Type a character, or a Unicode value like U+00E9. Combine composed
          parts with spaces, e.g. U+006E U+0303.
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
          <span
            style={{
              fontWeight: 600,
              color: method === "swap" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.assignLoop.method.swap.title">
              Assign to a key
            </Trans>
          </span>
          {method !== "swap" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.method.swap.summary">
                Dedicate one physical key to produce {currentCharDisplay}
              </Trans>
            </span>
          )}
        </button>
        {method === "swap" &&
          (() => {
            const filledRaltTokens = raltTokens.filter(
              (tok): tok is ModifierToken => tok !== "",
            );
            // Vacuously true at raltTokens.length === 0 (the card's starting
            // state) — that is what lets raltHasRoomToAdd stay true from an
            // empty start, so "+ Add layer" is visible before any layer has
            // ever been added (requirement: the card must be able to add its
            // first layer from zero). raltAllFilled is the shared helper
            // (also used by canApply) — see its doc comment above.
            const raltHasRoomToAdd =
              raltTokens.length < MAX_RALT_SLOTS &&
              raltAllFilled(raltTokens) &&
              (() => {
                const excluded = new Set<ModifierToken>();
                for (const tok of filledRaltTokens) {
                  for (const e of MODIFIER_EXCLUSIONS[tok]) excluded.add(e);
                }
                return modifierPool.some((tok) => !excluded.has(tok));
              })();
            const raltIsDesktopOnly =
              filledRaltTokens.includes("CAPS") ||
              filledRaltTokens.includes("NCAPS");
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
            // The preview keys off the RESOLVED vkey (swapVkeyForDisplay,
            // custom-char aware) rather than the raw selectedSwapKey — a
            // custom base character must show its resolved physical key in
            // the combo-spec preview, never the "__custom__" sentinel. Only
            // rendered once at least one layer is filled — with zero layers
            // the plain key picker above is the whole story.
            let raltPreviewSpec: string | null = null;
            if (swapVkeyForDisplay !== null && filledRaltTokens.length > 0) {
              try {
                raltPreviewSpec = comboToKeySpec(
                  raltCanonicalTokens,
                  swapVkeyForDisplay,
                );
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
                  <span>
                    <Trans id="editor.assignLoop.keyLabel">Key:</Trans>
                  </span>
                  <KeyPickerField
                    value={selectedSwapKey}
                    onChange={onSwapKeyChange}
                    customChar={selectedSwapKeyCustomChar}
                    onCustomCharChange={onSwapKeyCustomCharChange}
                    options={KEY_OPTIONS}
                    selectAriaLabel={t({
                      id: "editor.assignLoop.swap.keySelectAriaLabel",
                      // Method-neutral: this picker is the base key of a
                      // layer combo once a layer is added, not only a plain
                      // (zero-layer) base swap — see the merged "Assign to a
                      // key" card doc comment above.
                      message: "Physical key for Assign to a key",
                    })}
                    customInputAriaLabel={t({
                      id: "editor.assignLoop.swap.keyCustomAriaLabel",
                      message: "Custom character for the assigned key",
                    })}
                  />
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {raltTokens.length > 0 && (
                    <span
                      style={{
                        fontSize: 12,
                        color: TEXT_DIM,
                        fontFamily: FONT,
                      }}
                    >
                      {t({
                        id: "editor.assignLoop.ralt.layersLabel",
                        message: plural(raltTokens.length, {
                          one: "Layer:",
                          other: "Layers:",
                        }),
                      })}
                    </span>
                  )}
                  {raltTokens.map((token, index) => {
                    const options = optionsForRaltSlot(
                      modifierPool,
                      raltTokens,
                      index,
                    );
                    const raltSlotOptions: SelectMenuOption[] = [
                      {
                        value: "",
                        label: t({
                          id: "editor.assignLoop.ralt.selectPlaceholder",
                          message: "— Select —",
                        }),
                      },
                      ...options.map((o) => ({
                        value: o,
                        label: modifierTokensInUse.has(o)
                          ? `${o}${t({ id: "editor.assignLoop.ralt.inUseSuffix", message: " (in use)" })}`
                          : o,
                      })),
                    ];
                    return (
                      // key={index} intentionally kept: a raltTokens slot's
                      // identity IS its position (onRaltTokenChange/
                      // handleRemoveRaltSlot both address slots by index, and
                      // two slots can hold the identical value, e.g. two
                      // empty "" slots, so no content-derived key would be
                      // stable/unique here either) — not the array-index
                      // anti-pattern this sweep otherwise targets.
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <SelectMenu
                          value={token}
                          onChange={(v) => onRaltTokenChange(index, v)}
                          ariaLabel={t({
                            id: "editor.assignLoop.ralt.layerSlotAriaLabel",
                            message: `Layer ${index + 1} for layer-switch combo`,
                          })}
                          options={raltSlotOptions}
                          renderOptionLabel={(opt) =>
                            modifierTokensInUse.has(
                              opt.value as ModifierToken,
                            ) ? (
                              <span style={{ fontWeight: 700 }}>
                                {opt.label}
                              </span>
                            ) : (
                              opt.label
                            )
                          }
                          style={selectStyle}
                        />
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
                      </div>
                    );
                  })}
                  {raltHasRoomToAdd && (
                    <button
                      type="button"
                      aria-label={t({
                        id: "editor.assignLoop.ralt.addLayerAriaLabel",
                        message: "Add another layer",
                      })}
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
                      <Trans id="editor.assignLoop.ralt.addLayerButton">
                        + Add layer
                      </Trans>
                    </button>
                  )}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: TEXT_DIM,
                      fontFamily: FONT,
                      lineHeight: 1.4,
                    }}
                  >
                    <Trans id="editor.assignLoop.ralt.addLayerHelp">
                      Add a layer to place this character behind a modifier key
                      — e.g. Shift for an uppercase/shifted output, or Right Alt
                      (AltGr) for an extra character. With no layer, the
                      character is assigned directly to the key.
                    </Trans>
                  </p>
                </div>
                {raltPreviewSpec !== null && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: TEXT_DIM,
                      fontFamily: FONT,
                    }}
                  >
                    {raltPreviewSpec} &rarr;{" "}
                    <span
                      style={{
                        fontFamily: "monospace",
                        color: TEXT_MAIN,
                        fontSize: 16,
                      }}
                    >
                      {displayChar(currentChar)}
                    </span>
                  </p>
                )}
                {raltIsDesktopOnly && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: TEXT_DIM,
                      fontFamily: FONT,
                    }}
                  >
                    <Trans id="editor.assignLoop.ralt.desktopOnlyNote">
                      Desktop only — this layer will not appear on the touch
                      layout.
                    </Trans>
                  </p>
                )}
                {raltCanonicalTokens.includes("RALT") && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: "#d29922",
                      fontFamily: FONT,
                    }}
                  >
                    <Trans id="editor.assignLoop.ralt.macosConflictNote">
                      Note: RAlt may conflict with system shortcuts on macOS.
                    </Trans>
                  </p>
                )}
              </div>
            );
          })()}
      </div>

      {/* S-03 — always shown */}
      <div style={cardStyle(method === "sequence")}>
        <button
          type="button"
          aria-pressed={method === "sequence"}
          onClick={() => onMethodChange("sequence")}
          style={headerBtnStyle}
        >
          <span
            style={{
              fontWeight: 600,
              color: method === "sequence" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.assignLoop.method.sequence.title">
              Type a sequence
            </Trans>
          </span>
          {method !== "sequence" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.method.sequence.summary">
                Type two or more keystrokes in a row to produce{" "}
                {currentCharDisplay}
              </Trans>
            </span>
          )}
        </button>
        {method === "sequence" && (
          <div style={configStyle}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              <Trans id="editor.assignLoop.method.sequence.checkHint">
                The sequence builder is open on the right, in place of the live
                preview — define the key sequence for{" "}
                <span
                  style={{
                    color: TEXT_MAIN,
                    fontFamily: "monospace",
                    fontSize: 16,
                  }}
                >
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
          <span
            style={{
              fontWeight: 600,
              color: method === "deadkey" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.assignLoop.method.deadkey.title">
              Tap a trigger key, then a letter
            </Trans>
          </span>
          {method !== "deadkey" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.method.deadkey.summary">
                Trigger &rarr; {deadkeyBaseSummaryDisplay} &rarr;{" "}
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
              <span>
                <Trans id="editor.assignLoop.triggerKeyLabel">
                  Trigger key:
                </Trans>
              </span>
              <KeyPickerField
                value={triggerKey}
                onChange={onTriggerKeyChange}
                customChar={triggerKeyCustomChar}
                onCustomCharChange={onTriggerKeyCustomCharChange}
                options={DEADKEY_OPTIONS}
                selectAriaLabel={t({
                  id: "editor.assignLoop.deadkey.triggerKeySelectAriaLabel",
                  message: "Trigger key for deadkey",
                })}
                customInputAriaLabel={t({
                  id: "editor.assignLoop.deadkey.triggerKeyCustomAriaLabel",
                  message: "Custom trigger character for deadkey",
                })}
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
              <span style={{ alignSelf: "center" }}>
                <Trans id="editor.assignLoop.baseLetterLabel">
                  Base letter:
                </Trans>
              </span>
              <span
                style={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <input
                  type="text"
                  value={deadkeyBaseLetter}
                  onChange={(e) => onDeadkeyBaseLetterChange(e.target.value)}
                  aria-label={t({
                    id: "editor.assignLoop.deadkey.baseLetterAriaLabel",
                    message: "Base letter for deadkey",
                  })}
                  maxLength={16}
                  style={inputStyle}
                />
                {baseLetterReflection.kind === "ok" && (
                  <span
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 10, color: TEXT_DIM, fontFamily: FONT }}
                  >
                    {baseLetterReflection.text}
                  </span>
                )}
                {baseLetterReflection.kind === "error" && (
                  <span
                    role="alert"
                    style={{
                      fontSize: 10,
                      color: "#f85149",
                      opacity: 0.85,
                      fontFamily: FONT,
                    }}
                  >
                    {baseLetterReflection.reason}
                  </span>
                )}
                {deadkeyBaseLetterIsLoneCombiningMark && (
                  <span
                    role="status"
                    aria-live="polite"
                    style={{
                      fontSize: 10,
                      color: "#d29922",
                      opacity: 0.9,
                      fontFamily: FONT,
                    }}
                  >
                    <Trans id="editor.assignLoop.deadkey.loneCombiningMarkWarning">
                      That looks like a combining mark on its own — the base
                      letter is usually a plain letter.
                    </Trans>
                  </span>
                )}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              <Trans id="editor.assignLoop.method.deadkey.preview">
                Press {triggerKeyDisplay}, then {deadkeyBasePreviewDisplay}{" "}
                &rarr;{" "}
                <span
                  style={{
                    fontFamily: "monospace",
                    color: TEXT_MAIN,
                    fontSize: 16,
                  }}
                >
                  {currentCharDisplay}
                </span>
              </Trans>
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
  const unflagCharForSequence = useWorkingCopyStore(
    (s) => s.unflagCharForSequence,
  );
  const rawInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const axes = useWorkingCopyStore(
    useShallow((s) => s.session.axes as Partial<DiscoveryAxisVector>),
  );
  const setAxisFills = useWorkingCopyStore((s) => s.setAxisFills);

  // "Mark for later review" — authoring metadata only (surveySessionStore),
  // never the working copy. See surveySessionStore.markedForLaterDesktop's
  // docstring for why it lives there and why desktop/touch are tracked
  // separately. `markedDesktopSet` is the render-friendly Set view of the
  // persisted array.
  const markedForLaterDesktop = useSurveySessionStore((s) => s.markedForLaterDesktop);
  const toggleMarkedForLaterDesktop = useSurveySessionStore(
    (s) => s.toggleMarkedForLaterDesktop,
  );
  const markedDesktopSet = useMemo(
    () => new Set(markedForLaterDesktop),
    [markedForLaterDesktop],
  );

  // -- "Existing methods" (base keyboard producers for currentChar) --------
  // baseIr is the source of truth projectWorkingCopyVfs itself projects
  // from (never mutated by carve/output projection) — the same source
  // useInventoryDiff() reads for the lettersToAdd/alreadyProduced diff below.
  // removalCapabilities/deletedItemIds/isItemDeleted/cascadeDelete are the
  // EXISTING carve overlay (workingCopyStore.ts) — no new store state is
  // introduced here; a deletion recorded from this gallery is undone by the
  // same Undo the carve gallery uses, and is projected at output by the
  // existing carve-deletion projection step.
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const removalCapabilities = useWorkingCopyStore((s) => s.removalCapabilities);
  // deletedItemIds is selected (even though only isItemDeleted is called
  // below) purely so this component re-renders when the overlay changes —
  // isItemDeleted itself is a stable store-action reference and calling it
  // does not, on its own, subscribe this component to deletedItemIds.
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  const cascadeDelete = useWorkingCopyStore((s) => s.cascadeDelete);

  // One-time intro splash — read the seen flag on mount; mark it on "Get started".
  const mechIntroSeen = useWorkingCopyStore(
    (s) => s.galleryIntrosSeen.mechanism,
  );
  const markGalleryIntroSeen = useWorkingCopyStore(
    (s) => s.markGalleryIntroSeen,
  );

  const {
    lettersToAdd: inventoryLettersToAdd,
    producedSet: sessionProducedSet,
    rawProducedSet: sharedRawProducedSet,
  } = useInventoryDiff();

  // Collated display order (spec 047 FR-007's default-ICU comparator, reused
  // — not reinvented; see survey/collation.ts): puts a lowercase letter
  // immediately before its uppercase counterpart (`"a".localeCompare("A")"`
  // === -1 under the root collation) and keeps accented forms adjacent to
  // their base. `inventory` feeds the SHOW-ALL CharScrollStrip below plus
  // the empty-inventory guard and handleSelectDisplayChar's membership
  // check — both order-independent, so reordering here is safe. The
  // canonical `confirmedInventory` (rawInventory) is left untouched; only
  // this display-local derivation is sorted.
  //
  // `collateInventory` (not bare `collate`) — a bare combining mark added to
  // the inventory (e.g. a lone U+0308 combining diaeresis, added ahead of a
  // precomposed target like "ӝ") otherwise collates to ICU position 0 under
  // `collate()`'s root comparator, inserting a phantom "first" walk entry and
  // shifting every other character's index (the walk/nav indexing bug this
  // fix addresses). `collateInventory` partitions letters/stacks (ICU order)
  // from bare marks (raw code-point order, trailing) before returning —
  // see survey/collation.ts.
  //
  // `nfcDedup([], rawInventory)` — same fix as TouchGallery's matching
  // `inventory` derivation (see that file for the full rationale): a walk
  // entry can appear in confirmedInventory as BOTH its precomposed form
  // (e.g. "ӝ" U+04DD) and its canonically-equivalent decomposed form (e.g.
  // "ж"+combining-diaeresis) — distinct JS strings that would otherwise
  // surface as two separate walk stops for what is visually one character.
  // Deduping (and displaying the NFC form) here — not in confirmedInventory
  // itself, which stays untouched — keeps this gallery's walk consistent
  // with TouchGallery's. NFD stacks with no precomposed codepoint
  // (Africanist multi-mark sequences) round-trip through NFC unchanged
  // (NFC(x) is not always length 1), so this never folds two genuinely
  // different characters together.
  const inventory = useMemo(
    () => collateInventory(nfcDedup([], rawInventory)),
    [rawInventory],
  );

  // This session's physical (desktop) assignments — feeds baseProducedSet
  // below (session-aware coverage) and mechanismAssignments further down.
  // Declared once, early, so both can share it.
  const sessionAssignments = useMemo(
    () => selectDesktopAssignments(phaseResults),
    [phaseResults],
  );

  // BASE-DIRECT signal (a) of the 3-signal producer badge (charMechanisms.ts's
  // getProducerBadge) — the PRISTINE base-only produced set: no session
  // assignments folded in at all, no `augmentWithComposable`. Contrast with
  // `baseProducedSet` below, which DOES fold in this session's physical
  // assignments (feeds signal (c), COMPOSITION) — the two are deliberately
  // different sets. `excludeBackspaceCorrections: true` matches every other
  // base-produced-set caller in this file (see `baseProducedSet` below) so a
  // char reachable only via a backspace-correction rule is not wrongly
  // counted as directly produced here either. Memoized on `baseIr` alone —
  // this never reacts to session assignments, same as `lettersToAdd`.
  const baseOnlyProducedSet = useMemo(
    () =>
      baseIr !== null
        ? buildProducedSet(baseIr, { excludeBackspaceCorrections: true })
        : new Set<string>(),
    [baseIr],
  );

  // The BASE (pre-augmentWithComposable) SESSION-AWARE produced set — this
  // session's physical assignments folded into the base, but never itself run
  // through `augmentWithComposable`. This is the badge's signal (c)
  // (COMPOSITION) input — `preAugmentSessionAwareSet` — AND
  // `collectCompositionMethod` below's own input: composition must stay
  // strictly ONE level, so it needs the un-augmented set to decide "is this
  // composable from what's DIRECTLY produced [this session]", never "from
  // what's already-composable". Contrast with `baseOnlyProducedSet` above
  // (no session assignments at all — signal (a)). `excludeBackspaceCorrections:
  // true` — SAME option useInventoryDiff() passes — so a char reachable ONLY
  // via a backspace-correction store rule (e.g. the SIL Cameroon Â shape) is
  // not wrongly treated as directly produced here either; without this, the
  // early-out in collectCompositionMethod (`baseProduced.has(targetChar)`)
  // would suppress the real "A + ◌̂ → Â" composition row.
  //
  // `buildSessionProducedSet` (not bare `buildProducedSet(baseIr, ...)`) —
  // shaped-bug fix (diacritic-implementability): this session's physical
  // assignments are injected into the base .kmn (applyAssignments), reparsed,
  // and the produced set is rebuilt from that preview IR, so a mark produced
  // as a rule-output byproduct THIS session (e.g. a deadkey's bare
  // combining-diaeresis output) is visible to collectCompositionMethod
  // immediately — not just after the working copy is serialized. See
  // packages/engine/src/pattern-apply/sessionProducedSet.ts.
  //
  // Perf dedup (km-synthesis): this is the SAME round-trip useInventoryDiff()
  // already computes internally (identical baseIr/sessionAssignments/
  // getPatternByIdSync inputs — sessionAssignments here is
  // selectDesktopAssignments(phaseResults), same as useInventoryDiff.ts's own
  // derivation) to produce its pre-augment set — reuse that hook's
  // `rawProducedSet` rather than re-running `buildSessionProducedSet` a
  // second time per render.
  const baseProducedSet = sharedRawProducedSet;

  // Spec 046 worklist filter (FR-020): a composed unit whose marks are ALL
  // productive mark keys is reachable via base key + mark key — it needs no
  // whole-unit placement of its own, so it leaves the walk. Everything else
  // (plain bases, own-letter units, the productive marks themselves) keeps its
  // flat-inventory walk entry. No worklist (or an empty one) ⇒ identity.
  //
  // The worklist-filtered result is then collated (same `collateInventory`
  // helper as `inventory` above) before being returned — this is the list
  // usePositionalCharNav's `list` walks and the "first uncovered" default
  // below reads, so sorting it puts a lowercase letter immediately before
  // its uppercase counterpart in the Back/Next walk too. The SET of
  // characters (the coverage/gate denominator, criterion 18.6) is never
  // widened or narrowed by this — only its order changes.
  //
  // `nfcDedup([], inventoryLettersToAdd)` — same duplicate-walk-entry fix as
  // `inventory` above: `inventoryLettersToAdd` (from useInventoryDiff.ts)
  // carries confirmedInventory's raw, un-deduped entries (it NFC-normalizes
  // only for its own produced-set lookup, then pushes the original raw
  // string), so a decomposed/precomposed pair not yet produced would
  // otherwise both survive into this walk's denominator as two stops for one
  // grapheme. Deduping here — this gallery's own walk list, not the shared
  // hook — keeps it consistent with `inventory` and with TouchGallery's
  // matching `touchLettersToAdd`.
  const lettersToAdd = useMemo(() => {
    const deduped = nfcDedup([], inventoryLettersToAdd);
    let filtered = deduped;
    if (worklist !== undefined && worklist.markUnits.length > 0) {
      const productiveMarks = new Set(worklist.markUnits.map((u) => u.mark));
      filtered = deduped.filter((c) => {
        const units = [...c.normalize("NFD")];
        if (units.length < 2) return true;
        const marks = units.slice(1);
        return !marks.every((m) => productiveMarks.has(m));
      });
    }
    return collateInventory(filtered);
  }, [inventoryLettersToAdd, worklist]);

  // Read Phase C assignments directly (not the merged session.assignments view)
  // so multiple methods per character are preserved.
  // (sessionAssignments itself is declared earlier, alongside baseProducedSet
  // above, so both can share the one derivation.)

  // sessionAssignments with sequence assignments/mechanisms excluded — see
  // excludeSequenceMechanisms above. This gallery's whole covered/applied view
  // (coveredChars, appliedForCurrentChar, the "Applied methods" badge row)
  // derives from THIS, never from sessionAssignments directly, so a
  // sequence-owned assignment can never show as "Added" here nor be
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

  // Whole-inventory "every character is implemented" check (bug fix) — built
  // on the SAME 3-signal getProducerBadge computation the CharScrollStrip
  // badge uses, over the FULL SHOW-ALL `inventory` list (not just
  // lettersToAdd — a base-produced char must count as covered too). Feeds
  // the forward-button spec below: when true, the Done button is always
  // rendered regardless of currentChar/walk membership (see that spec's
  // top-priority branch).
  const allCovered = useMemo(
    () => allCharsCovered(inventory, sessionAssignments, "physical", baseOnlyProducedSet, baseProducedSet),
    [inventory, sessionAssignments, baseOnlyProducedSet, baseProducedSet],
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
  // Previous run's lettersToAdd — feeds nearestSurvivingChar's "where was this
  // character before the reflow" lookup below. Updated at the end of the
  // effect (not via a separate render), so it always holds the list the LAST
  // sync ran against, not the list mid-render.
  const prevLettersToAddRef = useRef<readonly string[]>(lettersToAdd);
  useEffect(() => {
    setCurrentChar((prev) => {
      // Keep current char if it's still in the list (e.g., inventory
      // refresh) — by NFC identity (indexOfChar), not raw equality, so a
      // representation change (e.g. collateInventory's NFC-dedup) doesn't
      // spuriously look like a removal.
      if (prev !== null && indexOfChar(lettersToAdd, prev) !== -1) return prev;
      if (prev === null) {
        // First-ever pick — prefer the first UNCOVERED char over strict
        // position 0.
        return (
          lettersToAdd.find((c) => !coveredChars.has(c)) ??
          lettersToAdd[0] ??
          null
        );
      }
      // `prev` was removed by this reflow — fall back to the NEAREST
      // surviving neighbor (shaped-bug fix, walk-order/indexing) rather than
      // jumping to "first uncovered"/list[0], which can be arbitrarily far
      // from where the author was in a long inventory. See
      // usePositionalCharNav.ts's `nearestSurvivingChar` doc comment.
      return nearestSurvivingChar(prevLettersToAddRef.current, prev, lettersToAdd);
    });
    prevLettersToAddRef.current = lettersToAdd;
    // Intentionally omit coveredChars — only re-run when the
    // inventory list itself changes, not when methods are applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettersKey]);

  // ---------------------------------------------------------------------------
  // Pattern loading — needed for patternMap (GalleryPreviewWithPatterns)
  // ---------------------------------------------------------------------------

  const [patternMap, setPatternMap] = useState<Map<string, Pattern>>(new Map());
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
        ? [
            {
              axis: "markInputOrder",
              value: "postfix",
              source: "import-derived",
            },
          ]
        : [];
    // Publish provenance for the current keyboard; clear any stale fills from a
    // prior keyboard/run when scale/scriptClass aren't answered yet, so the
    // Flow Map never shows provenance that doesn't belong to this selection.
    setAxisFills([
      ...importDerivedFills,
      ...(prefilled !== null ? prefilled.axisFills : []),
    ]);
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
        // Load ranked patterns PLUS every pattern the add-a-key UI's three
        // methods can write (the combined "swap" card writes EITHER
        // PATTERN_SWAP or PATTERN_RALT, depending on the filled layer count).
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
            devLog.warn(
              "[MechanismGallery] getById() returned undefined for a patternId",
            );
          }
        }
        setPatternMap(map);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        devLog.error("[MechanismGallery] filterFor error:", err);
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
        ? {
            keyboardId: identity.keyboardId,
            displayName: identity.displayName ?? "",
          }
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
  const [selectedSwapKeyCustomChar, setSelectedSwapKeyCustomChar] =
    useState("");
  // Combined "Assign to a key" card — starts with zero layers (a plain
  // base-key S-01 assignment); resetMethodState below resets it back to []
  // per character too.
  const [raltTokens, setRaltTokens] = useState<(ModifierToken | "")[]>([]);

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
  // The state and the banner both live in the shared case-pair module now, so
  // all three placement mechanisms raise the SAME proposal through the SAME
  // affordance (FR-011) and `caseCounterpart` keeps exactly one caller
  // (FR-002). Physical behaviour is unchanged.
  const {
    proposal: pendingCompanion,
    propose: proposeCompanion,
    dismiss: dismissCompanion,
    clear: clearCompanion,
  } = useCasePairCompanion();

  /** The base assignment a proposal was raised for, when it has one (physical
   *  and combo do; touch tracks a mechanism ref instead). */
  const pendingCompanionBase: MechanismAssignment | null =
    pendingCompanion !== null && pendingCompanion.mechanism !== "touch"
      ? pendingCompanion.baseAssignment
      : null;

  // Working IR used to plan shift-layer assignments — prefer the carve
  // working IR (ir), falling back to baseIr before the carve step has run.
  // Null when the working copy has not been instantiated yet (e.g. a bare
  // inventory-only render in tests); shift targeting is disabled in that case
  // since planShiftAssignment has nothing to evaluate against.
  const workingIr = useWorkingCopyStore((s) => s.ir ?? s.baseIr);
  // The casing locale is read by useCasePairCompanion itself — the gallery no
  // longer plumbs a bcp47 tag, which is what keeps `caseCounterpart` down to
  // exactly one caller.

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
    () =>
      workingIr !== null
        ? collectModifierTokensInUse(workingIr)
        : new Set<ModifierToken>(),
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
    const altFamily = modifierPool.find(
      (tok) => tok === "ALT" || tok === "RALT" || tok === "LALT",
    );
    return altFamily ?? "RALT";
  }, [modifierPool]);

  // The current character's 3-signal producer badge (charMechanisms.ts's
  // getProducerBadge) — the SAME computation CharScrollStrip's own badge and
  // the SHOW-ALL floor-row check (existingMethodContributors below) use,
  // with the SAME 4 trailing args this gallery already passes to
  // CharScrollStrip (baseOnlyProducedSet, baseProducedSet). Hoisted here so
  // the suggestion gate below (currentCharBadge?.count ?? 0) === 0 and the
  // floor-row check share one computation rather than each re-deriving it.
  const currentCharBadge = useMemo(
    () =>
      currentChar !== null
        ? getProducerBadge(currentChar, sessionAssignments, "physical", baseOnlyProducedSet, baseProducedSet)
        : null,
    [currentChar, sessionAssignments, baseOnlyProducedSet, baseProducedSet],
  );

  // kbgen placement suggestion for the current character (null when no map or
  // no qualifying candidate). Memoized against currentChar + placementMap so it
  // only recomputes on actual input changes, not on unrelated re-renders.
  //
  // getSuggestionForCharWithCasePair additionally falls back to a synthesized
  // S-08 suggestion for an UPPERCASE letter whose LOWERCASE case-pair sibling
  // has a direct RALT (S-08) candidate — the uppercase then gets a RAlt+Shift
  // suggestion on the same vkey instead of no suggestion at all. Same "" ->
  // undefined bcp47 normalization useCasePairCompanion applies (an identity
  // with an empty tag is "no locale", not "the empty locale").
  const suggestionBcp47 =
    identity?.bcp47 !== undefined && identity.bcp47 !== ""
      ? identity.bcp47
      : undefined;
  const suggestion = useMemo((): PlacementSeedEntry | null => {
    if (placementMap === undefined || currentChar === null) return null;
    const raw = getSuggestionForCharWithCasePair(
      currentChar,
      placementMap,
      PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
      suggestionBcp47,
    );
    // Never surface a CAPS-based placement as a *suggestion*: CAPS is a
    // case/state modifier, not a layer an author reaches for, so a "Caps + key"
    // recommendation surprises more than it helps. This suppresses only the
    // suggestion row (and its accept button) for a CAPS-carrying candidate —
    // CAPS stays fully available as a manual layer pick (computeModifierPool
    // still offers it in every dropdown) and everywhere else is untouched.
    if (raw !== null && raw.topCandidate.modifiers.includes("CAPS")) return null;
    return raw;
  }, [currentChar, placementMap, suggestionBcp47]);

  // Canonicalized modifier combo for the S-08 suggestion row's display text +
  // aria-labels — derived from the candidate's OWN modifiers (never a
  // hardcoded "RAlt"), so a case-pair fallback candidate's
  // ["SHIFT","RALT"] renders as "Shift+RAlt". Falls back to bare RALT when
  // the candidate carries no modifiers, mirroring handleSuggestionAccept's
  // write-path fallback. Canonicalization can only throw for a mutually-
  // exclusive combo (structurally unreachable for a seeder/fallback
  // candidate); the catch keeps a display-only computation from ever
  // crashing the gallery.
  const suggestionComboTokens = useMemo<ModifierToken[]>(() => {
    if (suggestion === null || suggestion.strategyId !== "S-08") return [];
    const modifiers = suggestion.topCandidate.modifiers;
    const tokens = (
      modifiers.length > 0 ? modifiers : ["RALT"]
    ) as ModifierToken[];
    try {
      return canonicalizeCombo(tokens);
    } catch {
      return tokens;
    }
  }, [suggestion]);

  // Whole-inventory leave-warning (soft gate) — computed from the SAME
  // MechanismAssignment map + lettersToAdd scope this gallery already uses
  // for coveredChars, via the shared unimplementedDesktopChars helper (do not
  // fork this definition — see lib/unimplementedInventory.ts). Non-empty only
  // when at least one character in lettersToAdd resolves to zero mechanisms.
  // `sessionProducedSet` (useInventoryDiff's session-aware, composability-
  // folded produced set) is threaded through here too — WITHOUT it, this
  // legacy gate could disagree with the badge (getProducerBadge) about a
  // character that is only covered by composition this session, firing a
  // spurious "still unimplemented" warning on a Done click the badge itself
  // already reports as green. See useInventoryDiff.ts / unimplementedInventory.ts.
  const unimplementedChars = useMemo(
    () => unimplementedDesktopChars(sessionAssignments, lettersToAdd, sessionProducedSet),
    [sessionAssignments, lettersToAdd, sessionProducedSet],
  );

  // Mark-aware "still needs an assignment or a mark before Done is offered"
  // list (mechanism-gallery-progression) — a SEPARATE derivation layered on
  // top of `unimplementedChars` (implemented-only, UNCHANGED above), never
  // threaded back into it. This is deliberately scoped to `unimplementedChars`
  // (lettersToAdd-scoped, session-produced-set-aware) rather than re-deriving
  // coverage — see lib/accountedForGate.ts's module doc for why marks must
  // stay a strict relaxation applied on top of the implemented-only gate, and
  // why that gate itself (and therefore the Phase F hard gate / export gate,
  // which read a DIFFERENT hook — hooks/useInventoryCoverageGate.ts — never
  // this local list) must never see marks.
  const unaccountedChars = useMemo(
    () => subtractMarked(unimplementedChars, markedDesktopSet),
    [unimplementedChars, markedDesktopSet],
  );

  // Named string locals for the inline "Done is blocked" hint rendered in
  // leftContent below — computed here (ahead of leftContent's own
  // definition) rather than inline, matching this file's established
  // convention of never embedding a plural/ternary directly as a <Trans>
  // child (see currentCharDisplay elsewhere in this file). Framed as "needs
  // an assignment or a mark", never "missing"/"skip forever" (spec v1.3.1
  // §3c) — replaces the old ConfirmDialog leave-warning modal text.
  const unaccountedCountLabel = t({
    id: "editor.mechanisms.unaccounted.count",
    message: plural(unaccountedChars.length, {
      one: "# character",
      other: "# characters",
    }),
  });
  const unaccountedVerb = t({
    id: "editor.mechanisms.unaccounted.verb",
    message: plural(unaccountedChars.length, { one: "needs", other: "need" }),
  });
  const unaccountedCharsList = formatUncoveredCharsList(unaccountedChars);

  // Intercepts the forward-completion action (Done/Continue) ONLY — never
  // Back, never per-character Next. Defense-in-depth no-op guard: the
  // per-character `canGoNext` gate above already prevents the walk from
  // reaching a "Done" click with any character neither implemented nor
  // marked, and the forward-button spec below disables Done/Continue
  // whenever `unaccountedChars` is non-empty — so this should be
  // unreachable in the ordinary walk. Kept as a guard (rather than removed)
  // in case a future forward-button branch is added without threading the
  // same check.
  const handleForwardComplete = useCallback(() => {
    if (unaccountedChars.length > 0) return;
    onComplete?.();
  }, [unaccountedChars, onComplete]);

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
    suggestionResolved,
    markSuggestionResolved,
  } = usePositionalCharNav({
    list: lettersToAdd,
    currentChar,
    setCurrentChar,
    onComplete: handleForwardComplete,
    onBack,
  });

  // Select-by-value for the CharScrollStrip's SHOW-ALL display list
  // (criterion 18.6): `handleSelectChar` above is gated on `lettersToAdd`
  // (usePositionalCharNav's own `list`), so clicking an already-produced
  // chip through it would be a no-op — deliberately, since Back/Next/Skip
  // must never step onto a char outside lettersToAdd's walk order. This
  // sibling handler is the one CharScrollStrip actually calls: it jumps to
  // ANY character in the full `inventory` (in or out of lettersToAdd) purely
  // for inspection, without touching the positional walk state. A no-op
  // when `char` isn't in `inventory` at all (defense-in-depth — every chip
  // CharScrollStrip renders is itself drawn from `inventory`).
  const handleSelectDisplayChar = useCallback(
    (char: string) => {
      if (!inventory.includes(char)) return;
      setCurrentChar(char);
    },
    [inventory, setCurrentChar],
  );

  // ArrowLeft/ArrowRight character cycling, attached at the PANE level (the
  // leftContent wrapping div below) rather than on CharScrollStrip itself —
  // see useCharCycleKeys.ts for why. Reuses `handleSelectDisplayChar` (the
  // SAME handler CharScrollStrip's chip onClick calls) so there is exactly
  // one selection call site, not two.
  const handlePaneKeyDown = useCharCycleKeys({
    chars: inventory,
    currentChar,
    onSelectChar: handleSelectDisplayChar,
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
    setRaltTokens([]);
  }, []);

  // Reset method inputs (not suggestionResolved — that persists per char)
  // whenever currentChar changes.
  useEffect(() => {
    clearCompanion();
    resetMethodState();
    // Abugida-safe gate — shared predicate; see siblingAccents.ts for the
    // reasoning (also used by TouchGallery's longpress suggestion memo).
    if (
      currentChar !== null &&
      isGatedAccentCompositionCandidate(currentChar, axes.scriptClass)
    ) {
      // §3c defaults-first: for a decomposable accented letter the natural method
      // is deadkey (S-02) — propose-then-confirm. resetMethodState sets "swap"
      // unconditionally, so override here after the reset.
      setDeadkeyBaseLetter([...currentChar.normalize("NFD")][0] ?? "");
      setMethod("deadkey");
    }
  }, [currentChar, resetMethodState, clearCompanion, axes.scriptClass]);

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
    // Set only by the S-08 branch below, to the LOWERCASE placement's own
    // modifiers (never including SHIFT — see the guard there) — carries the
    // ralt-layer companion's propose() call outside the branch so it fires
    // AFTER recordAssignments below, once `assignment` is the exact object
    // the proposal must reference (FR-008 identity guard).
    let raltCompanionModifiers: ModifierToken[] | null = null;
    if (suggestion.strategyId === "S-01") {
      const cp =
        currentChar
          .codePointAt(0)
          ?.toString(16)
          .toUpperCase()
          .padStart(4, "0") ?? "0000";
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SWAP,
            strategyId: "S-01",
            slotValues: { kmnRules: `+ [${vkey}] > U+${cp}` },
          },
        ],
        source: "user",
      };
    } else if (suggestion.strategyId === "S-08") {
      // Build from the candidate's OWN modifiers — never hardcode RALT.
      // Mirrors the manual S-08 write path below (comboToKeySpec /
      // canonicalizeCombo), so an uppercase case-pair fallback candidate
      // (placementSeeds.ts's getSuggestionForCharWithCasePair, which supplies
      // ["SHIFT","RALT"]) emits "[SHIFT RALT vkey]" rather than colliding with
      // the lowercase's "[RALT vkey]". Falls back to bare RALT when the
      // candidate carries no modifiers — today's kbgen seeder emits a direct
      // S-08 candidate with modifiers: ["RALT"], but an empty list is guarded
      // defensively rather than assumed.
      const candidateModifiers = suggestion.topCandidate.modifiers;
      // PlacementCandidate.modifiers are documented Keyman modifier tokens
      // (placementMap.ts) — asserted rather than re-typed here, same as the
      // manual S-08 badge label's `parts as ModifierToken[]` above.
      const tokens = (
        candidateModifiers.length > 0 ? candidateModifiers : ["RALT"]
      ) as ModifierToken[];
      let altgrKeyList: string;
      try {
        altgrKeyList = comboToKeySpec(canonicalizeCombo(tokens), vkey);
      } catch {
        // canonicalizeCombo only throws for a mutually-exclusive combo — a
        // malformed kbgen/case-pair candidate should not crash the gallery;
        // dismiss the suggestion rather than record a broken assignment.
        markSuggestionResolved(currentChar);
        devLog.warn(
          `[MechanismGallery] handleSuggestionAccept: invalid modifier combo ${JSON.stringify(candidateModifiers)} for S-08 suggestion — dismissing`,
        );
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
      // Case-pair companion proposal (spec v1.3.1 §3c — propose-then-confirm)
      // for the RAlt-layer counterpart, raised right after the author accepts
      // THIS suggestion — the flow the user actually takes, rather than
      // waiting for them to separately navigate to the uppercase character
      // (which today only gets its OWN suggestion row via
      // getSuggestionForCharWithCasePair, not this propose-then-confirm
      // banner). Only when `tokens` has no SHIFT of its own: a candidate that
      // already carries SHIFT is itself the uppercase case-pair fallback
      // (placementSeeds.ts), so IT is the companion — proposing a further
      // companion for it would double up. `useCasePairCompanion`'s own
      // `caseCounterpart` direction check (toUpper only) independently
      // suppresses this for an already-uppercase `currentChar`.
      if (!tokens.includes("SHIFT")) {
        raltCompanionModifiers = tokens;
      }
    } else {
      markSuggestionResolved(currentChar);
      devLog.warn(
        `[MechanismGallery] handleSuggestionAccept: unrecognised strategyId "${suggestion.strategyId}" — dismissing suggestion`,
      );
      return;
    }
    recordAssignments([...sessionAssignments, assignment]);
    markSuggestionResolved(currentChar);
    if (raltCompanionModifiers !== null) {
      proposeCompanion({
        mechanism: "ralt-layer",
        originalChar: currentChar,
        vkey,
        baseModifiers: raltCompanionModifiers,
        baseAssignment: assignment,
        // "Counterpart already placed" (spec §Edge Cases): redundant if the
        // counterpart already has a PATTERN_RALT mechanism whose altgrKeyList
        // names this same vkey — mirrors the manual S-08 write path's
        // word-boundary match on kmnRules (see the "Assign to a key" card's
        // alreadyProduced above), applied to altgrKeyList instead.
        alreadyProduced: (counterpart) =>
          sessionAssignments.some(
            (a) =>
              a.target === counterpart &&
              a.mechanisms.some((m) => {
                const keyList = m.slotValues?.["altgrKeyList"];
                return (
                  m.patternId === PATTERN_RALT &&
                  typeof keyList === "string" &&
                  new RegExp(`\\b${vkey}\\b`).test(keyList)
                );
              }),
          ),
      });
    }
    resetMethodState();
  }, [
    suggestion,
    currentChar,
    sessionAssignments,
    recordAssignments,
    resetMethodState,
    markSuggestionResolved,
    proposeCompanion,
  ]);

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
      // Combined "Assign to a key" card: the physical key must resolve
      // (custom-char aware — a customChar sentinel only counts once it
      // resolves to a real physical key) AND every PRESENT layer slot must
      // be filled. Zero layers is vacuously "all filled" — a valid,
      // applyable plain base-key assignment — but a layer slot the author
      // added and left blank blocks Apply until it's filled or removed.
      return (
        resolvedVkeyOf(
          resolveKeyPickerSelection(selectedSwapKey, selectedSwapKeyCustomChar),
        ) !== null && raltAllFilled(raltTokens)
      );
    }
    // deadkey: trigger key must resolve to a physical key (real selection or
    // a custom character that maps to one); base letter must resolve to a
    // non-empty character.
    return (
      resolvedVkeyOf(
        resolveKeyPickerSelection(
          triggerKey,
          triggerKeyCustomChar,
          TRIGGER_KEY_RESOLVE_OPTIONS,
        ),
      ) !== null &&
      resolveCharInput(deadkeyBaseLetter, deadkeyBaseLetterResolveOptions).ok
    );
  }, [
    currentChar,
    method,
    deadkeyBaseLetter,
    triggerKey,
    triggerKeyCustomChar,
    selectedSwapKey,
    selectedSwapKeyCustomChar,
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
    setRaltTokens((prev) => {
      if (prev.length >= MAX_RALT_SLOTS) return prev;
      // The FIRST layer added defaults to raltDefaultToken (mirrors the
      // pre-merge "Layer + key" card, which always started with one
      // pre-filled slot). Every slot added after that defaults to the first
      // still-available LAYER modifier (per optionsForRaltSlot's earlier-slot
      // exclusions) that the keyboard already uses elsewhere — modifierPool
      // leads with SHIFT, so this surfaces Shift automatically once Shift is
      // in use. CAPS is excluded from the auto-default (AUTO_DEFAULT_EXCLUDED):
      // collectModifierTokensInUse reports it from routine CAPS/NCAPS
      // case-handling rules, but CAPS is a case/state modifier rather than a
      // layer an author reaches for, so auto-filling it surprises more than it
      // helps — it stays a selectable dropdown option, just never the default.
      // If no eligible option is in use, the slot falls back to unselected ("")
      // until the author picks one (canApply blocks Apply meanwhile).
      if (prev.length === 0) return [...prev, raltDefaultToken];
      const available = optionsForRaltSlot(modifierPool, prev, prev.length);
      const inUseDefault = available.find(
        (tok) => !AUTO_DEFAULT_EXCLUDED.has(tok) && modifierTokensInUse.has(tok),
      );
      return [...prev, inUseDefault ?? ""];
    });
  }, [raltDefaultToken, modifierPool, modifierTokensInUse]);

  const handleRemoveRaltSlot = useCallback((index: number) => {
    // No minimum — the combined card's zero-layer state is valid (a plain
    // base-key assignment), so removing the last remaining layer is allowed.
    setRaltTokens((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;
    // method === "sequence" is unreachable here: canApply returns false for
    // it (the sequence builder in the right pane owns its own Apply — see
    // SequenceBuilderPanel), so the guard above already returned.

    let assignment: MechanismAssignment;

    if (method === "deadkey") {
      const base = resolveCharInput(
        deadkeyBaseLetter,
        deadkeyBaseLetterResolveOptions,
      );
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
        deadkeyName = triggerResolution.char
          .codePointAt(0)!
          .toString(16)
          .padStart(4, "0");
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

      // S-02 case-pair proposal: the parallel combo case-shifts the BASE
      // LETTER and the OUTPUT only. The trigger key, its deadkey name, and the
      // accent character are untouched — a dead key is an accent selector, not
      // a letter, and a SHIFT-flagged accent key would be a broken rule.
      // Suppressed by the hook when either side has no confident capital.
      proposeCompanion({
        mechanism: "combo",
        originalChar: currentChar,
        combo: {
          kind: "deadkey",
          triggerKey: resolvedTriggerVkey,
          deadkeyName,
          accentChar,
          baseLetter: base.value,
        },
        baseAssignment: assignment,
        // "Counterpart already placed" (spec §Edge Cases): the parallel combo
        // is redundant if the counterpart already has a PATTERN_DEADKEY
        // mechanism on this same trigger key.
        alreadyProduced: (counterpart) =>
          sessionAssignments.some(
            (a) =>
              a.target === counterpart &&
              a.mechanisms.some(
                (m) =>
                  m.patternId === PATTERN_DEADKEY &&
                  m.slotValues?.["triggerKey"] === resolvedTriggerVkey,
              ),
          ),
      });
    } else {
      // method === "swap" — combined "Assign to a key" card. Zero filled
      // layers (raltTokens has none) plans a plain S-01 simple_swap base-key
      // assignment; one or more filled layers plans an S-08
      // modifier_as_layer_switch combo instead. Both write paths below are
      // unchanged from the pre-merge "Assign to a key"/"Layer + key" cards —
      // only the branching condition (chosenTokens.length) is new.
      const resolvedSwapVkey = resolvedVkeyOf(
        resolveKeyPickerSelection(selectedSwapKey, selectedSwapKeyCustomChar),
      );
      if (resolvedSwapVkey === null) return;
      const chosenTokens = raltTokens.filter(
        (tok): tok is ModifierToken => tok !== "",
      );

      if (chosenTokens.length === 0) {
        // ---- S-01: simple_swap — kmnFragment uses {{kmnRules}}. ----
        // capsHandling is a property of the KEY — a key that already carries
        // explicit CAPS/NCAPS rules needs a CAPS-aware pair (Layer-A Check
        // #10).
        const capsHandling =
          workingIr !== null
            ? planShiftAssignment(workingIr, "main", resolvedSwapVkey)
                .capsHandling
            : false;
        // Base layer only now that the Base/Shift toggle is gone: bare
        // `+ [K_X] > U+XXXX` when the key has no CAPS handling; the
        // CAPS-aware NCAPS+CAPS pair otherwise — a bare rule on a
        // CAPS-handling key would shadow that key's pre-existing CAPS/NCAPS
        // pair, since applyAssignments splices new lines before existing
        // ones (first-match-wins).
        const kmnRules = buildBaseRuleLines(resolvedSwapVkey, currentChar, {
          capsHandling,
        }).join("\n");
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
        // never apply silently). The counterpart's natural home is the shift
        // layer of the SAME key. Suppressed for mnemonic keyboards (shift
        // targeting is unavailable) and for the toLower direction — assigning
        // an uppercase char to base proposes nothing; only the base->uppercase
        // (toUpper) direction is offered a companion. Scope cut, not a defect:
        // the reverse direction is left for a future pass.
        if (shiftLayerAllowed && workingIr !== null) {
          proposeCompanion({
            mechanism: "physical",
            originalChar: currentChar,
            vkey: resolvedSwapVkey,
            capsHandling,
            // Object identity, not target/index: the gallery allows several
            // mechanisms per character, so confirm must locate exactly the
            // assignment this proposal was raised for (FR-008).
            baseAssignment: assignment,
            // "Counterpart already placed" (spec §Edge Cases). `simple_swap`
            // records its rule text as already-emitted .kmn lines in
            // `slotValues.kmnRules` (buildBaseRuleLines / buildShiftRuleLines /
            // buildCasePairRuleLines all interpolate the vkey literally), so we
            // don't have exactly one line shape to string-match against — a
            // combined CAPS quad, a bare shift line, and a CAPS/NCAPS shift pair
            // all look different. Matching `target === counterpart` (this IS an
            // assignment for the capital) together with the vkey appearing
            // (word-boundary) anywhere in that assignment's `kmnRules` is
            // reliable regardless of which of the three emitters produced it,
            // without re-deriving or comparing exact rule text.
            alreadyProduced: (counterpart) =>
              sessionAssignments.some(
                (a) =>
                  a.target === counterpart &&
                  a.mechanisms.some((m) => {
                    const rules = m.slotValues?.["kmnRules"];
                    return (
                      typeof rules === "string" &&
                      new RegExp(`\\b${resolvedSwapVkey}\\b`).test(rules)
                    );
                  }),
              ),
          });
        }
      } else if (chosenTokens.length === 1 && chosenTokens[0] === "SHIFT") {
        // ---- Shift-plane assignment (S-01 via the shift layer) — spec §10
        // Check #10 / shiftRules.ts. ----
        // A combo whose ONLY modifier is SHIFT targets the SAME shift plane
        // the pre-merge Base/Shift radio's "Shift" option wrote, via the
        // SAME CAPS-aware builder (planShiftAssignment + buildShiftRuleLines)
        // — not the store-based S-08 write path below, which never consults
        // keyHasCapsHandling and would silently skip the NCAPS/CAPS pair a
        // CAPS-handling key requires. Multi-modifier combos that also
        // include SHIFT (e.g. [SHIFT ALT K_X]) are NOT rerouted here: they
        // fall through to the S-08 branch below unchanged, which has never
        // been CAPS-aware (shiftRules.ts is scoped to bare base/shift
        // assignments only) — that is pre-existing S-08 behavior, not a
        // regression introduced by the merged card.
        //
        // Not gated on shiftLayerAllowed/mnemonic: unlike the old radio, the
        // layer-combo SHIFT option is intentionally selectable regardless of
        // &MNEMONICLAYOUT (see the "is not gated by mnemonic layout" test) —
        // capsHandling is the only per-key concern this plane needs.
        const capsHandling =
          workingIr !== null
            ? planShiftAssignment(workingIr, "main", resolvedSwapVkey)
                .capsHandling
            : false;
        const kmnRules = buildShiftRuleLines(resolvedSwapVkey, currentChar, {
          capsHandling,
        }).join("\n");
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
        // No case-pair companion proposal here — mirrors the old Shift radio,
        // which only proposed a companion from the BASE-layer apply (see the
        // chosenTokens.length === 0 branch above); the counterpart of a
        // shift-plane assignment isn't a further shift-plane target.
      } else {
        // ---- S-08: modifier_as_layer_switch — kmnFragment uses
        // {{altgrKeyList}} and {{altgrOutputList}}. ----
        // Build a single-entry held-layer rule for this character, keyed on
        // whichever combo of ModifierTokens the author picked (generalized S-08).
        let altgrKeyList: string;
        try {
          // Use the RESOLVED vkey (custom-char aware), never the raw
          // selectedSwapKey — the latter may be the "__custom__" sentinel
          // when the author typed a custom base character.
          altgrKeyList = comboToKeySpec(
            canonicalizeCombo(chosenTokens),
            resolvedSwapVkey,
          );
        } catch {
          // canonicalizeCombo only throws for a mutually-exclusive combo, which
          // the dropdown's own exclusion logic (handleRaltTokenChange) already
          // prevents from being selected — structurally unreachable today.
          // Guarded anyway: skip recording rather than crashing the gallery.
          return;
        }
        // No ralt-layer case-pair companion proposal here (unlike the
        // suggestion-accept path's handleSuggestionAccept, which does raise
        // one). This "Assign to a key" card lets the author pick ANY combo of
        // up to four ModifierTokens — chosenTokens may already include SHIFT
        // (e.g. the author manually building the SHIFT+RALT companion
        // itself), or be an unrelated combo (e.g. CTRL+ALT) that carries no
        // case-pair meaning at all. Unlike the suggestion-accept path — whose
        // candidate is always a kbgen-seeded, RALT-only lowercase placement,
        // so "this base placement's own modifiers, plus SHIFT" is always a
        // sound companion to propose — there is no reliable signal here that
        // chosenTokens IS a lowercase case-pair's RALT layer rather than an
        // arbitrary combo. Proposing unconditionally would misfire (double
        // SHIFT, or a nonsensical companion for CTRL+ALT). Scope cut, not a
        // defect: a future pass could special-case chosenTokens === ["RALT"]
        // specifically, but that is a narrower rule than exists today for any
        // other manual-apply companion.
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
    raltTokens,
    shiftLayerAllowed,
    workingIr,
    proposeCompanion,
    recordAssignments,
    sessionAssignments,
    resetMethodState,
    deadkeyBaseLetterResolveOptions,
  ]);

  // ---------------------------------------------------------------------------
  // Case-pair companion — confirm/decline handlers
  // ---------------------------------------------------------------------------

  /**
   * S-03 apply came back from the sequence panel. The panel renders no banner
   * of its own — the one hook and the one banner live here (FR-011), so this
   * is where the parallel-combo proposal is raised.
   */
  const handleSequenceApplied = useCallback(
    (applied?: SequenceApplied) => {
      resetMethodState();
      if (applied === undefined || currentChar === null) return;
      proposeCompanion({
        mechanism: "combo",
        originalChar: currentChar,
        combo: {
          kind: "sequence",
          content: applied.content,
          indicator: applied.indicator,
        },
        baseAssignment: applied.assignment,
        // "Counterpart already placed" (spec §Edge Cases). The confirm path's
        // own (firstLetterOut, secondLetter) dedup already makes a re-confirm
        // a no-op — this predicate suppresses the BANNER in that same case, so
        // the author isn't prompted to confirm something that would do
        // nothing. Matches the S-02 predicate's style: it checks the
        // UNCHANGED physical component (there, `triggerKey`; here,
        // `secondLetter`, the indicator key, which the combo shift never
        // touches — see DeadkeyCombo/SequenceCombo in casePairCompanion.ts)
        // rather than re-deriving the case-shifted `firstLetterOut`, which
        // would need a second `caseCounterpart` call outside the hook
        // (`caseCounterpart` is deliberately kept to exactly one caller,
        // FR-002 — see the comment above `useCasePairCompanion()`).
        alreadyProduced: (counterpart) =>
          partitionSequenceAssignment(sessionAssignments, counterpart).mechs.some(
            (m) => m.slotValues?.["secondLetter"] === applied.indicator,
          ),
      });
    },
    [resetMethodState, currentChar, proposeCompanion, sessionAssignments],
  );

  /**
   * S-02 / S-03 confirm: record the parallel combo. The trigger (dead key) or
   * indicator (sequence) is carried across unchanged — only the base/content
   * letter and the output are case-shifted, and both were shifted by the hook
   * at propose time (`parallelCombo`), never re-derived here.
   */
  const confirmComboCompanion = useCallback(
    (proposal: Extract<CasePairProposal, { mechanism: "combo" }>) => {
      // Stale-proposal guard — same rule as the physical path (FR-008): the
      // assignment this was raised for must still be present, by reference.
      if (!sessionAssignments.includes(proposal.baseAssignment)) {
        clearCompanion();
        return;
      }

      const { parallelCombo, counterpart } = proposal;

      if (parallelCombo.kind === "deadkey") {
        const companionAssignment: MechanismAssignment = {
          scope: "individual",
          target: counterpart,
          modality: "physical",
          mechanisms: [
            {
              patternId: PATTERN_DEADKEY,
              strategyId: "S-02",
              slotValues: {
                // Unchanged: the accent key is a selector, not a letter.
                triggerKey: parallelCombo.triggerKey,
                deadkeyName: parallelCombo.deadkeyName,
                accentChar: parallelCombo.accentChar,
                // Case-shifted: the base letter in, the accented form out.
                baseLetters: parallelCombo.baseLetter,
                accentedForms: counterpart,
              },
            },
          ],
          source: "user",
        };
        recordAssignments([...sessionAssignments, companionAssignment]);
      } else {
        // The parallel sequence produces the counterpart, so it belongs in the
        // counterpart's own sequence bucket. The existing
        // (firstLetterOut, secondLetter) dedup makes a re-confirm a no-op
        // rather than a duplicate ref.
        const { mechs: existingMechs, rest } = partitionSequenceAssignment(
          sessionAssignments,
          counterpart,
        );
        const alreadyRecorded = existingMechs.some(
          (m) =>
            m.slotValues?.["firstLetterOut"] === parallelCombo.content &&
            m.slotValues?.["secondLetter"] === parallelCombo.indicator,
        );
        if (!alreadyRecorded) {
          const newRef: MechanismRef = {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: {
              firstLetterOut: parallelCombo.content,
              // Unchanged: the indicator is a physical key by construction.
              secondLetter: parallelCombo.indicator,
              collapsedChar: counterpart,
            },
          };
          recordAssignments([
            ...rest,
            {
              scope: "individual",
              target: counterpart,
              modality: "physical",
              mechanisms: [...existingMechs, newRef],
              source: "user",
            },
          ]);
        }
      }

      clearCompanion();
    },
    [sessionAssignments, recordAssignments, clearCompanion],
  );

  const handleCompanionConfirm = useCallback(() => {
    if (pendingCompanion === null) return;
    // The touch mechanism confirms in its own gallery.
    if (pendingCompanion.mechanism === "touch") return;

    if (pendingCompanion.mechanism === "combo") {
      confirmComboCompanion(pendingCompanion);
      return;
    }

    if (pendingCompanion.mechanism === "ralt-layer") {
      // Stale-proposal guard — same rule as the physical branch below (FR-008):
      // the assignment this was raised for must still be present, by reference.
      if (!sessionAssignments.includes(pendingCompanion.baseAssignment)) {
        clearCompanion();
        return;
      }
      // The companion's modifiers are the lowercase placement's own modifiers
      // with SHIFT added — the SAME comboToKeySpec/canonicalizeCombo builder
      // the manual S-08 write path and the suggestion-accept fix use, so the
      // emitted altgrKeyList shape can never drift between the three call
      // sites. canonicalizeCombo only throws for a mutually-exclusive combo —
      // structurally unreachable here since baseModifiers was itself already
      // a valid, applied combo — but guarded the same defensive way as the
      // other write paths rather than assumed.
      let altgrKeyList: string;
      try {
        altgrKeyList = comboToKeySpec(
          canonicalizeCombo([...pendingCompanion.baseModifiers, "SHIFT"]),
          pendingCompanion.vkey,
        );
      } catch {
        clearCompanion();
        return;
      }
      const companionAssignment: MechanismAssignment = {
        scope: "individual",
        target: pendingCompanion.counterpart,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_RALT,
            strategyId: "S-08",
            slotValues: {
              altgrKeyList,
              altgrOutputList: pendingCompanion.counterpart,
            },
          },
        ],
        source: "user",
      };
      recordAssignments([...sessionAssignments, companionAssignment]);
      clearCompanion();
      return;
    }

    // Stale-proposal guard: locate the exact assignment object this proposal
    // was raised for, by reference — not by re-matching target/scope, which
    // would happily grab a different, unrelated assignment for the same
    // character (P1: multiple mechanisms per character). If it is no longer
    // present in sessionAssignments (removed, or somehow replaced by another
    // path), the proposal is stale: dismiss the banner and record nothing.
    const baseAssignmentIdx = sessionAssignments.indexOf(
      pendingCompanion.baseAssignment,
    );
    if (baseAssignmentIdx === -1) {
      clearCompanion();
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
      const kmnRules = buildShiftRuleLines(
        pendingCompanion.vkey,
        pendingCompanion.counterpart,
        {
          capsHandling: false,
        },
      ).join("\n");
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

    clearCompanion();
  }, [
    pendingCompanion,
    sessionAssignments,
    recordAssignments,
    clearCompanion,
    confirmComboCompanion,
  ]);

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
  // Forward gate: an untouched character needs EITHER an explicit Apply OR an
  // explicit "Mark for later review" before Next/Done is enabled — revisiting
  // an already-covered/marked character always re-enables it, so
  // Back-then-Next over a finished (or deferred) character never traps the
  // author. This is what "gate the Done button on implemented-OR-marked"
  // means in practice: because the walk cannot advance forward past an
  // unaccounted character, by the time the LAST character's button reads
  // "Done", every character in `lettersToAdd` has already been forced through
  // this same check — there is no separate whole-inventory re-check needed at
  // completion (mechanism-gallery-progression; replaces the old
  // "Skip this character" escape, which recorded nothing and let an author
  // leave a character neither implemented nor accounted for).
  const canGoNext =
    currentChar !== null &&
    (appliedForCurrentChar > 0 ||
      coveredChars.has(currentChar) ||
      hasSequenceForChar(sessionAssignments, currentChar) ||
      markedDesktopSet.has(currentChar));

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
        const sequenceOnly = a.mechanisms.filter(
          (m) => m.patternId === PATTERN_SEQUENCE,
        );
        return [{ ...a, mechanisms: sequenceOnly }];
      });
      recordAssignments(next);
      // Finding 2 (P2): a pending case-pair companion refers to a specific
      // base assignment by identity. If that assignment no longer survives
      // the removal, the proposal is dead — dismiss it proactively rather
      // than leaving a stale-but-visible banner (propose-then-confirm,
      // spec v1.3.1 §3c). The staleness re-check in handleCompanionConfirm
      // is a backstop for paths this dismissal doesn't cover.
      if (
        pendingCompanionBase !== null &&
        !next.includes(pendingCompanionBase)
      ) {
        clearCompanion();
      }
    },
    [
      sessionAssignments,
      recordAssignments,
      pendingCompanionBase,
      clearCompanion,
    ],
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
              ? {
                  ...a,
                  mechanisms: a.mechanisms.filter((m) => !removed.has(m)),
                }
              : a,
          )
          .filter((a) => a.mechanisms.length > 0);
      }
      recordAssignments(next);
      // See handleRemoveCovered above — same proactive-dismissal rationale.
      if (
        pendingCompanionBase !== null &&
        !next.includes(pendingCompanionBase)
      ) {
        clearCompanion();
      }
    },
    [
      sessionAssignments,
      recordAssignments,
      pendingCompanionBase,
      clearCompanion,
    ],
  );

  // -- "Existing methods" — base keyboard's own producers for currentChar --
  //
  // Runs collectCharContributors against baseIr (never the carve working
  // IR — baseIr is the same source-of-truth projectWorkingCopyVfs itself
  // projects from) to find every place in the BASE keyboard that already
  // produces currentChar, then flattens it to one row per method:
  //   - a ruleNodeId is a whole-rule delete candidate — deletable unless
  //     removalCapabilities marks it not-removable (context-sensitive /
  //     opaque / unknown), in which case it's shown muted with a reason.
  //     CURATION: when the char also has a PRODUCED store-slot row (see
  //     below), the keystroke row(s) for the SAME char are omitted — the
  //     store-slot row is the real, always-current method and a duplicate
  //     "Press X" row alongside it is noise. Only when a keystroke is the
  //     char's SOLE producer (no produced store-slot exists) is it kept —
  //     the completeness floor is a last resort, never routinely skipped.
  //   - a storeSlot is an output/input-store slot drop — deletable exactly
  //     when its descriptor's `producedRole` is "produced" (a genuine
  //     producer of the char). A `producedRole: "used"` slot (the char is
  //     consumed as INPUT there — a deadkey base, or a non-deadkey rule's
  //     own input-store occurrence — not produced) renders the same blue,
  //     non-deletable chip as composition/unattributed/blocked: removing it
  //     wouldn't remove a method that produces this char at all.
  //   - a `blocked` entry (opaque fragment, or a multi-char literal output
  //     that can't be split) is always muted, never silently dropped.
  // A method already removed THIS session (its id already in
  // deletedItemIds, via the existing carve overlay) is filtered out
  // entirely — collectCharContributors always reads baseIr, which never
  // reflects the overlay itself.
  interface ExistingMethodRow {
    id: string;
    label: string;
    deletable: boolean;
    /**
     * True exactly when this row's descriptor is `producedRole: "used"` — the
     * char is only CONSUMED here (a deadkey base, or a non-deadkey rule's
     * own any()-consumed input-store occurrence), never produced by it. Only
     * a "slot" row can ever be `true`; every other kind (rule/blocked/
     * composition/unattributed) always PRODUCES the char and is `false`.
     * Drives the color split (blue vs. green) independently of `deletable`
     * (the delete-affordance signal) — see `NonDeletableMethodChip`'s doc
     * comment in parts/RemovableChipRow.tsx.
     */
    isUsed: boolean;
    kind: "rule" | "slot" | "blocked" | "composition" | "unattributed";
    reason?: string;
  }

  const existingMethodContributors = useMemo<CharContributors | null>(
    () =>
      baseIr !== null && currentChar !== null
        ? collectCharContributors(baseIr, currentChar)
        : null,
    [baseIr, currentChar],
  );

  const existingMethods = useMemo<ExistingMethodRow[]>(() => {
    if (existingMethodContributors === null || baseIr === null) return [];

    // `descriptors` is INDEX-PARALLEL to ruleNodeIds, then storeSlots, then
    // blocked, concatenated in that order (see collectCharContributors.ts's
    // doc comment on `descriptors`) — slice it back into three per-array
    // views rather than re-deriving a lookup, so each loop below can zip its
    // own array against the matching descriptor by position.
    const { descriptors } = existingMethodContributors;
    const ruleDescriptors = descriptors.slice(
      0,
      existingMethodContributors.ruleNodeIds.length,
    );
    const storeSlotDescriptors = descriptors.slice(
      existingMethodContributors.ruleNodeIds.length,
      existingMethodContributors.ruleNodeIds.length +
        existingMethodContributors.storeSlots.length,
    );
    const blockedDescriptors = descriptors.slice(
      existingMethodContributors.ruleNodeIds.length +
        existingMethodContributors.storeSlots.length,
    );

    const rows: ExistingMethodRow[] = [];

    // Build the store-slot rows FIRST (before the keystroke/rule rows below)
    // so the keystroke-drop curation can see whether a PRODUCED store-slot
    // row already exists for this char — pushed into `rows` afterward to
    // preserve the original rule-then-slot render order.
    const storeSlotRows: ExistingMethodRow[] = [];
    let hasProducedStoreSlot = false;
    existingMethodContributors.storeSlots.forEach((slot, i) => {
      if (isItemDeleted(slot.slotId)) return;
      const descriptor = storeSlotDescriptors[i];
      if (descriptor === undefined) return;
      // producedRole "used" (a deadkey base, or a non-deadkey rule's own
      // any()-consumed input-store occurrence — §0 in collectCharContributors)
      // is not a producer of this char at all; render it exactly like
      // composition/unattributed/blocked — blue, informational, never
      // deletable. Absent producedRole (composition/unattributed shapes
      // never reach this loop) never occurs here — every storeSlots
      // descriptor is engine-constructed and always carries the field.
      const isUsed = descriptor.producedRole === "used";
      // Intentionally `kind === "store-slot"` only — a produced "deadkey" row
      // (mark+base combination) does NOT count toward `hasProducedStoreSlot`
      // and so never suppresses the plain-key keystroke row below. A dead-key
      // combination is a DISTINCT input method, not a redundant restatement
      // of the plain keystroke the way an alphabet/store fan-out slot is, so
      // it must not drop the keystroke chip.
      if (descriptor.kind === "store-slot" && !isUsed) {
        hasProducedStoreSlot = true;
      }
      const baseLabel = composeContributorLabel(descriptor, i18n);
      storeSlotRows.push({
        id: slot.slotId,
        label: isUsed ? appendNotDeletableSuffix(baseLabel, i18n) : baseLabel,
        deletable: !isUsed,
        isUsed,
        kind: "slot",
      });
    });

    existingMethodContributors.ruleNodeIds.forEach((nodeId, i) => {
      if (isItemDeleted(nodeId)) return;
      const descriptor = ruleDescriptors[i];
      // Defensive only — the engine's index-parallel invariant guarantees
      // this is always present; skip rather than mis-attach a label if it
      // ever isn't.
      if (descriptor === undefined) return;
      // Keystroke-drop curation: a produced store-slot row already covers
      // this char with a real, always-current method — a redundant
      // "Press X" keystroke row is dropped. Only when NO produced store-slot
      // exists (the keystroke is the char's sole producer) is this row kept.
      if (hasProducedStoreSlot) return;
      const capability: RemovalCapability | undefined =
        removalCapabilities.get(nodeId);
      const notRemovable = (capability ?? "").startsWith("not-removable:");
      const ruleBaseLabel = composeContributorLabel(descriptor, i18n);
      rows.push({
        id: nodeId,
        label: notRemovable
          ? appendNotDeletableSuffix(ruleBaseLabel, i18n)
          : ruleBaseLabel,
        deletable: !notRemovable,
        isUsed: false,
        kind: "rule",
        ...(notRemovable
          ? {
              reason: capabilityHint(
                capability ?? "not-removable:unknown",
                i18n,
              ),
            }
          : {}),
      });
    });

    rows.push(...storeSlotRows);

    existingMethodContributors.blocked.forEach((b, i) => {
      const descriptor = blockedDescriptors[i];
      const blockedBaseLabel =
        descriptor !== undefined
          ? composeContributorLabel(descriptor, i18n)
          : b.label;
      rows.push({
        id: `blocked:${i}:${b.label}`,
        label: appendNotDeletableSuffix(blockedBaseLabel, i18n),
        deletable: false,
        isUsed: false,
        kind: "blocked",
        reason: b.reason,
      });
    });

    // SHOW-ALL composition row (spec follow-up): currentChar isn't directly
    // produced by the base (no real method row above covers it), but IS
    // composable from characters the base DOES directly produce — synthesize
    // one blue, non-deletable informational row via the SAME
    // composeContributorLabel composer every other kind goes through.
    // baseProducedSet is the PRE-augmentation set (see its own doc comment) —
    // composition stays strictly one level, never chained off an
    // already-composable char.
    if (currentChar !== null) {
      const compositionDescriptor = collectCompositionMethod(
        baseProducedSet,
        currentChar,
      );
      if (compositionDescriptor !== undefined) {
        rows.push({
          id: `composition:${currentChar}`,
          label: appendNotDeletableSuffix(
            composeContributorLabel(compositionDescriptor, i18n),
            i18n,
          ),
          deletable: false,
          isUsed: false,
          kind: "composition",
          reason: compositionTooltip(compositionDescriptor, i18n),
        });
      }
    }

    // SHOW-ALL floor (criterion 18.6-adjacent invariant): currentChar is
    // GREEN (getProducerBadge's count >= 1 — the SAME 3-signal computation
    // CharScrollStrip's badge uses, see charMechanisms.ts) but, after
    // everything above, still has zero rows — an unrecognized-shape producer
    // collectCharContributors couldn't attribute at all. Append one truthful,
    // no-arrow floor row rather than leave the section empty under a green
    // badge. Reuses the hoisted `currentCharBadge` (declared above, near the
    // suggestion gate) rather than a second getProducerBadge call for the
    // same character — one computation, two readers.
    if (currentChar !== null && rows.length === 0 && (currentCharBadge?.count ?? 0) > 0) {
      rows.push({
        id: `unattributed:${currentChar}`,
        label: appendNotDeletableSuffix(
          composeContributorLabel(
            { kind: "unattributed", producedChar: currentChar, producedRole: "produced" },
            i18n,
          ),
          i18n,
        ),
        deletable: false,
        isUsed: false,
        kind: "unattributed",
      });
    }

    return rows;
    // deletedItemIds is an intentional dep even though only isItemDeleted is
    // called in the body — see the store-selector comment above.
  }, [
    existingMethodContributors,
    baseIr,
    removalCapabilities,
    isItemDeleted,
    deletedItemIds,
    i18n,
    currentChar,
    baseProducedSet,
    currentCharBadge,
  ]);

  const handleRemoveExistingMethod = useCallback(
    (row: ExistingMethodRow) => {
      if (!row.deletable) return;
      // Routes through the SAME cascadeDelete the full carve gallery uses
      // (CarveGallery.tsx) — a rule nodeId and a store slot id both go
      // through the item channel there too, so a removal made here is
      // reversible via the identical Undo stack and is reflected at output
      // by the existing carve-deletion projection step. No new store state.
      if (row.kind === "rule") {
        cascadeDelete([row.id], []);
      } else if (row.kind === "slot") {
        cascadeDelete([], [row.id]);
      }
    },
    [cascadeDelete],
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
      } else if (
        method === "deadkey" &&
        VALID_DEADKEY_TRIGGER_KEYS.has(keyId)
      ) {
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
      <GalleryEmptyState
        {...(onBack !== undefined ? { onBack } : {})}
        message={
          <Trans id="editor.assignLoop.noBaseKeyboardSelected">
            No base keyboard selected. Go back to choose a starting point.
          </Trans>
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Guard: no inventory
  // ---------------------------------------------------------------------------

  if (inventory.length === 0) {
    return (
      <GalleryEmptyState
        {...(onBack !== undefined ? { onBack } : {})}
        message={
          <Trans id="editor.assignLoop.noInventoryConfirmed">
            No inventory confirmed yet. Complete the Survey (Phase B) to confirm
            which characters your keyboard must produce.
          </Trans>
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Intro splash — first entry to the desktop mechanism gallery only
  // ---------------------------------------------------------------------------

  if (showIntro) {
    return (
      <GalleryIntroSplash
        eyebrow={t({
          id: "editor.assignLoop.intro.eyebrow",
          message: "Getting started · Desktop",
        })}
        title={t({
          id: "editor.assignLoop.intro.title",
          message: "Welcome to the Mechanism Gallery",
        })}
        body={
          <Trans id="editor.assignLoop.intro.body">
            This is where you build your keyboard. For each character your
            language needs that the base layout doesn&rsquo;t already have,
            you&rsquo;ll choose how to type it on a physical (desktop) keyboard.
          </Trans>
        }
        bullets={[
          <Trans id="editor.assignLoop.intro.bullet1" key="bullet1">
            You&rsquo;ll go character by character through the list from your
            survey.
          </Trans>,
          <Trans id="editor.assignLoop.intro.markForLaterBullet" key="bullet2">
            Pick a method &mdash; use a dead key, swap a key, or use AltGr
            &mdash; or mark a character for later review if you&rsquo;d
            rather come back to it.
          </Trans>,
          <Trans id="editor.assignLoop.intro.bullet3" key="bullet3">
            Need several keystrokes for one character? Pick &ldquo;Type a
            sequence&rdquo; and a small builder opens right here, in place of
            the preview.
          </Trans>,
          <Trans id="editor.assignLoop.intro.bullet4" key="bullet4">
            Phones and tablets come later, in the Touch gallery.
          </Trans>,
        ]}
        startAriaLabel={t({
          id: "editor.assignLoop.intro.startAriaLabel",
          message: "Start the mechanism gallery",
        })}
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
  // the "no actionable control" state (locked with Apply/Mark/Next all
  // disabled and no completion button rendered) is unreachable.
  const doneLabel = t({ id: "editor.assignLoop.doneButton", message: "Done" });
  const forwardButton: ForwardButtonSpec | null =
    // TOP PRIORITY (bug fix): once every inventory character has count >= 1
    // (allCovered, the SAME badge computation CharScrollStrip/currentCharBadge
    // use), the Done button is ALWAYS rendered — regardless of currentChar or
    // its walk (lettersToAdd) membership. Previously this button was hidden
    // entirely for a currentChar outside lettersToAdd (e.g. an
    // already-produced character reached via the SHOW-ALL CharScrollStrip),
    // which could strand an author who had, in fact, finished every
    // character — there was no visible way to advance. Falls through to the
    // existing branches unchanged whenever any character is still count 0.
    // `unaccountedChars.length === 0` is a defense-in-depth mirror of
    // `allCovered` here (mechanism-gallery-progression) — the two are
    // computed over slightly different scopes/signals (full `inventory` via
    // getProducerBadge vs. `lettersToAdd` via unimplementedDesktopChars), so
    // this guards against them ever disagreeing about "safe to complete".
    allCovered && unaccountedChars.length === 0 && onComplete !== undefined
      ? {
          label: doneLabel,
          onClick: handleForwardComplete,
          testId: "mechanisms-continue",
          disabled: false,
          style: forwardBtnStyle,
        }
      : locked && onComplete !== undefined
      ? {
          label: t({
            id: "editor.assignLoop.continueButton",
            message: "Continue →",
          }),
          onClick: handleForwardComplete,
          testId: "mechanisms-continue",
          ariaLabel: t({
            id: "editor.assignLoop.continueAriaLabel",
            message: "Continue (desktop layout locked)",
          }),
          disabled: false,
          style: forwardBtnStyle,
        }
      : lettersToAdd.length === 0
        ? {
            label: doneLabel,
            onClick: handleForwardComplete,
            testId: "mechanisms-continue",
            disabled: false,
            style: forwardBtnStyle,
          }
        : // The per-char Next/Done control is scoped to lettersToAdd's walk
          // order (Back/Next/canGoNext all key off it — see the
          // lettersToAdd-gating comment above). currentChar can now also be
          // an already-produced character selected via the SHOW-ALL
          // CharScrollStrip (handleSelectDisplayChar) — HIDE this button
          // entirely rather than render it disabled in that case: it isn't
          // a "global Next" separate from this one, so a disabled render
          // would look like the walk is stuck rather than simply "you're
          // inspecting a character outside this step's coverage".
          currentChar !== null && lettersToAdd.includes(currentChar)
          ? // `!hasAnotherCharAfterCurrent` means this IS the completion
            // click (label reads "Done") — gate it on `unaccountedChars` too
            // (mechanism-gallery-progression), not just `canGoNext` for the
            // CURRENT character: the SHOW-ALL CharScrollStrip
            // (handleSelectDisplayChar) can jump `currentChar` straight to
            // the last walk position without ever visiting the earlier ones,
            // so canGoNext alone (which only checks the current character)
            // is not sufficient to guarantee every character in
            // lettersToAdd has been implemented or marked.
            (() => {
              const nextDisabled =
                !canGoNext ||
                locked ||
                (!hasAnotherCharAfterCurrent && unaccountedChars.length > 0);
              return {
                label: hasAnotherCharAfterCurrent
                  ? t({
                      id: "editor.assignLoop.nextCharacterButton",
                      message: "Next character →",
                    })
                  : doneLabel,
                ariaLabel: hasAnotherCharAfterCurrent
                  ? t({
                      id: "editor.assignLoop.nextCharacterAriaLabel",
                      message: "Next character",
                    })
                  : doneLabel,
                onClick: handleNext,
                disabled: nextDisabled,
                style: {
                  padding: "9px 20px",
                  background: !nextDisabled ? "#238636" : "#21262d",
                  border: "none",
                  borderRadius: 6,
                  color: !nextDisabled ? "#e6edf3" : TEXT_DIM,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: !nextDisabled ? "pointer" : "not-allowed",
                  fontFamily: FONT,
                },
              };
            })()
          : null;

  // ---------------------------------------------------------------------------
  // Left pane content
  // ---------------------------------------------------------------------------

  // onKeyDown lives on this OUTER pane div (not on CharScrollStrip below) so
  // ArrowLeft/ArrowRight cycles the character no matter which control inside
  // the pane currently has focus — a plain native keydown bubbles up to here
  // regardless of the focused descendant. See useCharCycleKeys.ts.
  const leftContent = (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
       the bubbled keydown only ADDS a keyboard capability (ArrowLeft/Right
       character cycling regardless of focused descendant, per the comment
       above); the pane is not made pointer-interactive. */
    <div
      onKeyDown={handlePaneKeyDown}
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
            <span>
              <Trans id="editor.assignLoop.desktopLockedBanner">
                Desktop layout locked — editing disabled
              </Trans>
            </span>
            <button
              type="button"
              onClick={handleUnlock}
              aria-label={t({
                id: "editor.assignLoop.unlockAriaLabel",
                message: "Unlock desktop layout to edit",
              })}
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
              Editing the desktop layout may require re-reviewing your touch
              layout.
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

        {/* Proactive "Done is blocked" hint (mechanism-gallery-progression) —
              replaces the old ConfirmDialog leave-warning modal. Rendered
              whenever any lettersToAdd character is neither implemented nor
              marked, so the reason Done is disabled is visible BEFORE a
              click, not surfaced reactively after one. role="status" +
              aria-live="polite" rides the same convention as the coverage
              status line above (D3 note: this is not a validation cycle, no
              debounce involved either way) — no new timer, updates on the
              same re-render that recomputes unaccountedChars. */}
        {unaccountedChars.length > 0 && (
          <p
            role="status"
            aria-live="polite"
            style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}
          >
            <Trans id="editor.mechanisms.unaccounted.message">
              {unaccountedCountLabel} still {unaccountedVerb} an assignment or
              a mark for later review before you can finish:{" "}
              {unaccountedCharsList}.
            </Trans>
          </p>
        )}

        {/* Character scroll strip — horizontal, SHOW-ALL of the confirmed
              inventory (criterion 18.6), not just lettersToAdd: an author
              should be able to see and inspect every character, including
              ones already produced (directly by the base, or composable
              from this session's own assignments), not only the ones
              still needing a method. `baseDirectSet`/`preAugmentSessionAwareSet`
              feed the 3-signal producer badge (charMechanisms.ts's
              getProducerBadge) so those chips still show the green
              produces->=1 badge (mirrors TouchGallery's matching props).
              Selecting a chip goes through
              handleSelectDisplayChar (not handleSelectChar, which is gated
              on lettersToAdd) so an already-produced chip is still
              selectable — see handleSelectDisplayChar's own doc comment and
              the forwardButton guard below for what changes once such a
              character is selected. lettersToAdd itself (coverage counter,
              coverage gate, canGoNext) is never widened. */}
        {inventory.length > 0 && (
          <CharScrollStrip
            chars={inventory}
            currentChar={currentChar}
            onSelectChar={handleSelectDisplayChar}
            assignments={sessionAssignments}
            modality="physical"
            baseDirectSet={baseOnlyProducedSet}
            preAugmentSessionAwareSet={baseProducedSet}
          />
        )}

        {/* Empty-diff state — status text only; the forward/completion
              control (Continue / Done) now lives in the top toolbar row
              above, paired with Back. This is the only reachable null-
              currentChar state left — handleNext on the last character calls
              onComplete directly rather than setting currentChar to null, so
              there is no separate "all done, char is null" panel to
              reconcile. */}
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
              <Trans id="editor.assignLoop.noNewCharacters">
                No new characters to add.
              </Trans>
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
                  row is absent and gallery behaves exactly as today.
                  Gate is strictly `(currentCharBadge?.count ?? 0) === 0` — the
                  suggestion shows ONLY when the character has ZERO recorded
                  implementations. This subsumes every prior partial gate: a
                  recorded SEQUENCE (signal (b) SESSION-DIRECT via
                  `hasSequenceForChar`), COMPOSITION (signal (c),
                  `currentCharBadge?.isComposable`), AND — the case the old
                  gate missed — BASE-DIRECT coverage (signal (a),
                  `baseOnlyProducedSet`), e.g. a character the base keyboard
                  already produces via an existing rule sequence. Any of
                  those already gives count >= 1, so count === 0 is exactly
                  "the badge the author sees is still at zero" — the same
                  signal driving the green/red badge itself
                  (charMechanisms.ts), so the suggestion and the badge can
                  never visibly disagree. */}
            {suggestion !== null &&
              !suggestionDismissed &&
              (currentCharBadge?.count ?? 0) === 0 && (
              <div
                role="note"
                aria-label={t({
                  id: "editor.assignLoop.suggestion.ariaLabel",
                  message: "Placement suggestion from kbgen seeder",
                })}
                style={{
                  // RED, not green — the suggestion row only ever renders
                  // when currentCharBadge's count is 0 (see the gate above),
                  // so it always reads as "not yet implemented", matching
                  // the badge's own 0-count colors (charMechanisms.ts /
                  // CharScrollStrip.tsx's `ERROR_RED` + its paired dark-red
                  // background).
                  background: ERROR_BG,
                  border: `1px solid ${ERROR_RED}`,
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
                    color: ERROR_RED,
                    fontFamily: FONT,
                    fontWeight: 600,
                  }}
                >
                  {(() => {
                    const keyName = suggestion.topCandidate.vkey.replace(
                      /^K_/,
                      "",
                    );
                    const charOrEmpty =
                      currentChar !== null ? displayChar(currentChar) : "";
                    if (suggestion.strategyId === "S-01") {
                      return t({
                        id: "editor.assignLoop.suggestion.replaceText",
                        message: `Suggested: Replace ${keyName} with ${charOrEmpty}`,
                      });
                    }
                    // S-08: derive the label from the candidate's OWN
                    // modifiers (never hardcode "Right Alt") — reuses the
                    // shared per-token label table + "+"-joined formatting
                    // (modifierTokenLabel.ts) rather than a second copy, so a
                    // case-pair fallback candidate's ["SHIFT","RALT"] renders
                    // "Shift+RAlt" instead of the plain-RAlt lowercase text.
                    const modifierLabel = formatModifierCombo(
                      suggestionComboTokens,
                    );
                    return t({
                      id: "editor.assignLoop.suggestion.raltText",
                      message: `Suggested: ${modifierLabel} + ${keyName} for ${charOrEmpty}`,
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
                            message: `Accept suggestion: ${formatModifierCombo(suggestionComboTokens)} + ${suggestion.topCandidate.vkey} for ${currentChar}`,
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
                    <Trans id="editor.assignLoop.suggestion.acceptButton">
                      Accept
                    </Trans>
                  </button>
                  <button
                    type="button"
                    onClick={handleSuggestionChange}
                    aria-label={t({
                      id: "editor.assignLoop.suggestion.denyAriaLabel",
                      message: "Deny suggestion and choose method manually",
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
                    <Trans id="editor.assignLoop.suggestion.denyButton">
                      Deny
                    </Trans>
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
              raltTokens={raltTokens}
              onRaltTokenChange={handleRaltTokenChange}
              onAddRaltSlot={handleAddRaltSlot}
              onRemoveRaltSlot={handleRemoveRaltSlot}
              modifierPool={modifierPool}
              modifierTokensInUse={modifierTokensInUse}
            />

            {/* Case-pair companion proposal — propose-then-confirm, never
                  apply silently (spec v1.3.1 §3c). Shown after a base-layer
                  S-01 apply when the applied character has a known
                  uppercase counterpart. */}
            {pendingCompanion !== null && (
              <CasePairProposalBanner
                proposal={pendingCompanion}
                onConfirm={handleCompanionConfirm}
                onDismiss={dismissCompanion}
              />
            )}

            {/* Applied-methods summary */}
            {appliedForCurrentChar > 0 && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "#56d364",
                  fontFamily: FONT,
                }}
              >
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
                aria-label={t({
                  id: "editor.assignLoop.appliedMethodsAriaLabel",
                  message: "Applied methods — click to remove",
                })}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 2,
                }}
              >
                {mechanismAssignments
                  .filter(
                    (a) => a.scope === "individual" && a.target === currentChar,
                  )
                  .map((a) => {
                    const ref = a.mechanisms[0];
                    const label =
                      ref !== undefined
                        ? methodLabel(ref, i18n)
                        : a.mechanisms
                            .map((m) => methodLabel(m, i18n))
                            .join(", ");
                    // Stable content-identity key (not array index) — a
                    // removal reflows this filtered list, and an index key
                    // would rebind React's reconciliation to the WRONG chip
                    // (e.g. a mid-list removal making the last chip disappear
                    // instead of the clicked one, or transferring hover/focus
                    // state onto an unrelated chip). Every mechanism this
                    // gallery can record carries a patternId + slotValues
                    // (see applyAssignments.ts's own `mechanismKey`), so the
                    // full mechanisms list serializes to a unique key.
                    const chipKey = a.mechanisms
                      .map((m) => `${m.patternId}::${JSON.stringify(m.slotValues ?? {})}`)
                      .join("|");
                    return (
                      <HoverDangerChip
                        key={chipKey}
                        onClick={() => handleRemoveMechanism(a)}
                        disabled={locked}
                        ariaLabel={t({
                          id: "editor.assignLoop.removeMethodAriaLabel",
                          message: `Remove method ${label} for ${currentChar}`,
                        })}
                        title={t({
                          id: "editor.assignLoop.clickToRemove",
                          message: "click to remove",
                        })}
                        baseStyle={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 8px",
                          background: "#0d2218",
                          border: "1px solid #238636",
                          borderRadius: 12,
                          color: "#56d364",
                          fontSize: 11,
                          fontFamily:
                            "ui-monospace, 'Cascadia Code', Consolas, monospace",
                          cursor: locked ? "not-allowed" : "pointer",
                        }}
                      >
                        {label}
                        <span
                          aria-hidden="true"
                          style={{ fontSize: 10, color: "inherit", opacity: 0.7 }}
                        >
                          {" ×"}
                        </span>
                      </HoverDangerChip>
                    );
                  })}
              </div>
            )}

            {/* Existing methods — the BASE keyboard's own producers for
                  currentChar (desktop "delete each pre-existing method").
                  COLOR tracks PRODUCED vs. USED; deletability is a SEPARATE
                  signal carried by which of the two branches below a row
                  takes, not by color:
                    - row.deletable        -> green HoverDangerChip: "×" +
                      red-on-hover + click-to-delete (real keystroke/store-
                      slot/deadkey producers removalCapabilities allows).
                    - !deletable && isUsed  -> BLUE NonDeletableMethodChip: a
                      "slot" row whose descriptor is producedRole "used" — the
                      char is only CONSUMED here (a deadkey base, or a
                      non-deadkey rule's own any()-consumed input-store
                      occurrence), never produced by this row.
                    - !deletable && !isUsed -> GREEN NonDeletableMethodChip,
                      static: composition, unattributed (SHOW-ALL floor),
                      blocked/opaque/multi-char, and a produced rule
                      removalCapabilities marked not-removable. All of these
                      PRODUCE the char but have no single rule/slot to
                      surgically delete — green-without-"×" is the visual
                      signal for "produced here, nothing single to delete."
                  See existingMethods/handleRemoveExistingMethod above for how
                  rows are built and removed, and NonDeletableMethodChip
                  (parts/RemovableChipRow.tsx) for the shared static-chip
                  palette. */}
            {currentChar !== null && existingMethods.length > 0 && (
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
                  <Trans id="editor.assignLoop.existingMethodsHeading">
                    Existing methods
                  </Trans>
                </p>
                <div
                  role="group"
                  aria-label={t({
                    id: "editor.assignLoop.existingMethodsGroupAriaLabel",
                    message: "Existing methods from the base keyboard",
                  })}
                  style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                >
                  {existingMethods.map((row) =>
                    row.deletable ? (
                      <HoverDangerChip
                        key={row.id}
                        onClick={() => handleRemoveExistingMethod(row)}
                        disabled={locked}
                        ariaLabel={t({
                          id: "editor.assignLoop.removeExistingMethodAriaLabel",
                          message: `Remove existing method ${row.label} for ${currentChar}`,
                        })}
                        title={t({
                          id: "editor.assignLoop.clickToRemove",
                          message: "click to remove",
                        })}
                        baseStyle={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 8px",
                          background: "#0d2218",
                          border: "1px solid #238636",
                          borderRadius: 12,
                          color: "#56d364",
                          fontSize: 11,
                          fontFamily:
                            "ui-monospace, 'Cascadia Code', Consolas, monospace",
                          cursor: locked ? "not-allowed" : "pointer",
                        }}
                      >
                        {row.label}
                        <span
                          aria-hidden="true"
                          style={{ fontSize: 10, color: "inherit", opacity: 0.7 }}
                        >
                          {" ×"}
                        </span>
                      </HoverDangerChip>
                    ) : (
                      <NonDeletableMethodChip
                        key={row.id}
                        variant={row.isUsed ? "blue" : "green"}
                        {...(row.reason !== undefined
                          ? { reason: row.reason }
                          : {})}
                      >
                        {row.label}
                      </NonDeletableMethodChip>
                    ),
                  )}
                </div>
              </div>
            )}

            {currentChar !== null &&
              hasSequenceForChar(sessionAssignments, currentChar) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <span
                    style={{ fontSize: 12, color: "#58a6ff", fontFamily: FONT }}
                  >
                    <Trans id="editor.assignLoop.sequenceRecordedBadge">
                      Sequence recorded
                    </Trans>
                  </span>
                  <button
                    type="button"
                    onClick={() => unflagCharForSequence(currentChar)}
                    disabled={locked}
                    aria-label={t({
                      id: "editor.assignLoop.removeSequenceAssignmentAriaLabel",
                      message: `Remove recorded sequence for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                    })}
                    title={t({
                      id: "editor.assignLoop.clickToRemove",
                      message: "click to remove",
                    })}
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
                      fontFamily:
                        "ui-monospace, 'Cascadia Code', Consolas, monospace",
                      cursor: locked ? "not-allowed" : "pointer",
                    }}
                  >
                    <Trans id="editor.assignLoop.removeButton">remove</Trans>
                    <span
                      aria-hidden="true"
                      style={{ fontSize: 10, opacity: 0.7 }}
                    >
                      {" ×"}
                    </span>
                  </button>
                </div>
              )}

            {/* Sequences using this character (Part 3) — every recorded
                  multi_char_sequence where currentChar appears in ANY slot
                  (content, indicator, or output), not just the ones whose
                  output IS currentChar. Read-only here — mirrors the inline
                  SequenceBuilderPanel's "Recorded sequences" card style
                  (SequenceBuilderPanel.tsx) but editing a sequence stays owned
                  by the sequence builder, so no Remove control is offered.
                  Shared with TouchGallery's own bottom list — see
                  UsesSequencesCard.tsx. */}
            <UsesSequencesCard
              currentChar={currentChar}
              assignments={sessionAssignments}
              modality="physical"
            />

            {/* Apply + Mark for later review. Back and Next/Done live in the
                  shared top toolbar row above (see leftContent's top of
                  pane) so the forward-advance control is spatially separated
                  from these editing actions. The generic "Apply method"
                  button is hidden for method === "sequence" — the sequence
                  builder (right pane, see rightContent below) owns its own
                  Apply.
                  "Mark for later review" replaces the old "Skip this
                  character" control (mechanism-gallery-progression):
                  Skip previously advanced the walk while recording nothing,
                  so a skipped character was silently unaccounted for at
                  completion. Marking is the honest version of the same
                  escape — it is a pure TOGGLE on the current character (does
                  not itself navigate), and a marked character satisfies
                  `canGoNext` exactly like an applied one, so the existing
                  Next/Done control in the toolbar above becomes the single
                  way to actually move on. Toggle-able so an author who
                  changes their mind can unmark and implement instead. */}
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
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
                  <Trans id="editor.assignLoop.applyMethodButton">
                    Apply method
                  </Trans>
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleMarkedForLaterDesktop(currentChar)}
                disabled={locked}
                aria-pressed={markedDesktopSet.has(currentChar)}
                aria-label={
                  markedDesktopSet.has(currentChar)
                    ? t({
                        id: "editor.assignLoop.unmarkForLaterAriaLabel",
                        message: `Unmark ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }} — currently marked for later review`,
                      })
                    : t({
                        id: "editor.assignLoop.markForLaterAriaLabel",
                        message: `Mark ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }} for later review`,
                      })
                }
                style={{
                  background: markedDesktopSet.has(currentChar)
                    ? "rgba(227,179,65,0.16)"
                    : "transparent",
                  border: markedDesktopSet.has(currentChar)
                    ? "1px solid #9e6a03"
                    : "none",
                  color: markedDesktopSet.has(currentChar) ? "#e3b341" : TEXT_DIM,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "4px 8px",
                  borderRadius: 6,
                  textDecoration: markedDesktopSet.has(currentChar) ? "none" : "underline",
                }}
              >
                {markedDesktopSet.has(currentChar) ? (
                  <Trans id="editor.assignLoop.markedForLaterButton">
                    Marked for later review
                  </Trans>
                ) : (
                  <Trans id="editor.assignLoop.markForLaterButton">
                    Mark for later review
                  </Trans>
                )}
              </button>
            </div>
          </>
        )}

        {/* Added chip row — characters already configured, removable */}
        {coveredChars.size > 0 && (
          <RemovableChipRow
            heading={<Trans id="editor.assignLoop.addedHeading">Added</Trans>}
            groupAriaLabel={t({
              id: "editor.assignLoop.addedGroupAriaLabel",
              message: "Added characters — click to remove",
            })}
            chipBackground="#0d2218"
            chipBorder="#238636"
            chipColor="#56d364"
            hoverDanger
            items={[...coveredChars].map((c) => ({
              key: c,
              label: displayChar(c),
              onClick: () => handleRemoveCovered(c),
              ariaLabel: t({
                id: "editor.assignLoop.removeCharacterAriaLabel",
                message: `Remove ${{ notation: toUPlusNotation(c) }} ${{ char: c }}`,
              }),
              title: t({
                id: "editor.assignLoop.removeCharacterTitle",
                message: `${{ notation: toUPlusNotation(c) }} — click to remove`,
              }),
            }))}
          />
        )}

        {/* Sequences chip row — chars with a recorded multi_char_sequence
              assignment, tracked separately from "Added" (see
              excludeSequenceMechanisms). */}
        {sequenceRecordedChars.length > 0 && (
          <RemovableChipRow
            heading={
              <Trans id="editor.assignLoop.sequencesHeading">Sequences</Trans>
            }
            groupAriaLabel={t({
              id: "editor.assignLoop.sequencesGroupAriaLabel",
              message: "Characters with a recorded sequence — click to remove",
            })}
            chipBackground="#1c2a3a"
            chipBorder="#58a6ff"
            chipColor="#58a6ff"
            hoverDanger={false}
            items={sequenceRecordedChars.map((c) => ({
              key: c,
              label: displayChar(c),
              onClick: () => unflagCharForSequence(c),
              ariaLabel: t({
                id: "editor.assignLoop.removeSequenceAssignmentListAriaLabel",
                message: `Remove recorded sequence for ${{ notation: toUPlusNotation(c) }} ${{ char: c }}`,
              }),
              title: t({
                id: "editor.assignLoop.removeSequenceAssignmentTitle",
                message: `${{ notation: toUPlusNotation(c) }} — click to remove`,
              }),
            }))}
          />
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
    <>
      <AssignLoopShell
        headingText={t({
          id: "editor.assignLoop.mechanismGalleryHeading",
          message: "Mechanism Gallery",
        })}
        modalityLabel={t({
          id: "editor.assignLoop.modality.desktop",
          message: "Desktop",
        })}
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
              style={{
                display:
                  method === "sequence" && currentChar !== null
                    ? "none"
                    : "contents",
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
                  <Trans id="editor.assignLoop.loadingPatterns">
                    Loading patterns...
                  </Trans>
                </p>
              ) : null}
            </div>
            {method === "sequence" && currentChar !== null && (
              <SequenceBuilderPanel
                char={currentChar}
                sessionAssignments={sessionAssignments}
                recordAssignments={recordAssignments}
                onApplied={handleSequenceApplied}
                onCancel={resetMethodState}
              />
            )}
          </>
        }
      />
    </>
  );
}
