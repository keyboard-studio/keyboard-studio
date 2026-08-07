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
//     replace). "Apply method" + "Next character →" + "Mark for later review"
//     follow MechanismGallery's pattern (mechanism-gallery-progression;
//     "Mark for later review" replaces the old "Skip this character" link —
//     see canGoNext's own doc comment for why). There is no manual "already
//     in layout" card: the auto-detected "already" suggestion records
//     inherited characters. "Mark for later review" is a per-character
//     TOGGLE (surveySessionStore.markedForLaterTouch, authoring metadata
//     only — never the working copy); a marked character stays uncovered for
//     Phase F / export purposes but is no longer "unaccounted for" here.
//   - Positional Back/Next/last-character navigation walks inventory by
//     index; an unaddressed character stays gated (see canGoNext) until it is
//     either configured or marked.
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
// The inline touch-lint panel that surfaced Layer C findings below the
// character cards has been removed; only the FR-008 completion gate remains.
// FR-008 completion gate: `uncoveredTouchChars`/`unaccountedTouchChars` (see
// `layoutForLintAndGate` below) re-run touchCoverage LIVE on every render
// (mechanism-gallery-progression) and disable the Done/Continue control —
// proactively, not just on a click attempt — while any inventory char is
// both uncovered and unmarked.
//
// Single 300 ms debounce contract upheld — no second timer introduced.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/react/shallow";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import type {
  TouchAssignment,
  MechanismRef,
  TouchLayoutIR,
  KeyboardIR,
  TouchKeyRuleIndex,
  DiscoveryAxisVector,
  PlacementMap,
} from "@keyboard-studio/contracts";
import {
  toUPlusNotation,
  isDecomposableAccented,
  formatUncoveredTouchMessage,
  computeTouchCoverage,
  buildTouchKeyRuleIndex,
  isSpacerKeyClass,
} from "@keyboard-studio/contracts";
import type {
  DesktopModifications,
  ModifierToken,
  KeyEditOperation,
} from "@keyboard-studio/engine";
import {
  parseTouchLayout,
  touchCoverage,
  resolveTouchLayerId,
  touchLayerForChar,
  enumerateTouchMethodsForChar,
  applyTouchKeycapRemovalsToLayout,
  applyTouchKeycapRemovalsToRawJson,
  collectCompositionMethod,
  collectLayerCombosInUse,
  comboToTouchLayerId,
  canonicalizeCombo,
  addableTouchLayerTokens,
  optionsForTouchLayerSlot,
  caseCounterpart,
  replayKeyEditOverlay,
  parseTouchKeyAddress,
  touchKeyAddress,
  emitTouchLayout,
} from "@keyboard-studio/engine";
import type { TouchMethodDescriptor } from "@keyboard-studio/engine";
import {
  buildTouchLayoutJson,
  deriveSeedLayout,
} from "../../lib/buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import { TOUCH_STEP_ID } from "../../steps/reducer.ts";
import { useCharWalkPosition } from "../../hooks/useCharWalkPosition.ts";
import { cursorCharIn } from "../../lib/stepWalk.ts";
import { peekStepCursor } from "../../stores/stepWalkStore.ts";
import {
  formatModifierCombo,
  MODIFIER_TOKEN_LABELS,
} from "../../lib/modifierTokenLabel.ts";
import { deriveDesktopModifications } from "../../lib/deriveDesktopModifications.ts";
import { extractMechanismHostKey } from "../../lib/extractMechanismHostKey.ts";
import { lowercaseFirst } from "../../lib/caseOrder.ts";
import { subtractMarked } from "../../lib/accountedForGate.ts";
import {
  shouldEmitTouchLayout,
  resolveTouchSeedSource,
} from "../../lib/touchEmission.ts";
import { useInventoryDiff } from "../../hooks/useInventoryDiff.ts";
import { ErrorText } from "../../ui/index.ts";
import {
  useWorkingCopyStore,
  type BulkAccentGroup,
  type TouchEditorMode,
  type UndoEntry,
} from "../../stores/workingCopyStore.ts";
import {
  buildKeyGridViewModel,
  type KeyGridCellViewModel,
  type KeyGridViewModel,
} from "./keyGrid/keyGridViewModel.ts";
import {
  KeyGrid,
  type KeyGridPlatformTab,
  type KeyGridProvenance,
} from "./keyGrid/KeyGrid.tsx";
import { useGridNav } from "./keyGrid/useGridNav.ts";
import { KeyInspector } from "./keyGrid/KeyInspector.tsx";
import { AssignPanel, type AssignPanelCommitResult } from "./keyGrid/AssignPanel.tsx";
import {
  useKeyEditGuards,
  type KeyEditInvalidationWarning,
  type KeyEditRejectionNotice,
} from "./keyGrid/useKeyEditGuards.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { collateInventory } from "../../survey/collation.ts";
import { nfcDedup } from "../../survey/charNormUtils.ts";
import {
  promoteOnManualEdit,
  casePairTouchTarget,
  type TouchLayerId,
} from "./touchBehavior.ts";
import {
  useCasePairCompanion,
  type CasePairProposalInput,
} from "./casePairCompanion.ts";
import { CasePairProposalBanner } from "./CasePairProposalBanner.tsx";
import {
  siblingAccentPlacements,
  isGatedAccentCompositionCandidate,
  type SiblingAccentPlacement,
} from "./siblingAccents.ts";
import {
  SiblingAccentProposalBanner,
  type SiblingAccentProposal,
} from "./SiblingAccentProposalBanner.tsx";
import { displayChar } from "../../lib/irToCarveNodes.ts";
import {
  appendNotDeletableSuffix,
  composeTouchMethodLabel,
  touchMethodNonDeletableReason,
  composeContributorLabel,
  compositionTooltip,
} from "./existingMethodLabels.ts";
import { isMutateSeamEnabled } from "../../flags/mutateFlag.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { useTouchKeyDiagnostics } from "../../hooks/useValidatorFindings.ts";
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
import { ProposalCard } from "./parts/ProposalCard.tsx";
import {
  RemovableChipRow,
  HoverDangerChip,
  NonDeletableMethodChip,
} from "./parts/RemovableChipRow.tsx";
import { SelectMenu, type SelectMenuOption } from "../../ui/SelectMenu.tsx";
import { KEY_OPTIONS, VALID_HOST_KEYS } from "../../lib/keyOptions.ts";
import { stripVkeyPrefix } from "../../lib/keyLabel.ts";
import {
  resolveKeyPickerSelection,
  resolvedVkeyOf,
} from "../../lib/charInput.ts";
import {
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  BLUE_ACTION,
  BG_CARD,
  galleryGhostBtn as ghostBtn,
  gallerySelectMenuStyle,
  galleryHeaderBtnStyle as headerBtnStyle,
  galleryConfigStyle as configStyle,
  galleryCardStyle as cardStyle,
} from "../../lib/galleryTheme.ts";
// T118 — the rejection banner's border. `galleryTheme.ts` has no error token of
// its own; `ui/theme.ts` is where the E/W/I severity palette lives, and this is
// the same token KeyGridCell/KeyInspector already use for an error severity.
import { ERROR_RED } from "../../ui/theme.ts";

const selectStyle: CSSProperties = gallerySelectMenuStyle(160);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The empty/no-op DesktopModifications — the mods memo's fallback when baseIr is null. */
const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };

/**
 * Stable empty `TouchLayoutIR` — `useKeyEditGuards` (T088) takes a required
 * `layout`, but `effectiveKeyModeLayout` is `null` before the base keyboard
 * has loaded. Hooks cannot be called conditionally, so this is the same
 * "stable fallback so a hook always has a valid argument" idiom
 * `emptyKeyGridViewModel` already uses for `useGridNav` below.
 */
const EMPTY_TOUCH_LAYOUT: TouchLayoutIR = { platforms: [], nodeIds: [] };

/**
 * Whether a touch layer id carries a casing component (FR-013) — `"shift"`
 * or `"caps"` — and therefore implies an uppercase keycap. Layer ids are
 * hyphen-joined components (`comboToTouchLayerId`'s vocabulary, e.g.
 * `"rightalt-shift"`, `"shift-ctrl-alt"`); this matches whole components,
 * not substrings, so `"ncaps"` (a real, non-casing layer id) is never
 * mistaken for a `"caps"` component. Exported so the component-vs-substring
 * distinction is independently testable — every real vkey id is already
 * all-uppercase, so testing only through {@link hostKeyShortLabel}'s output
 * cannot distinguish a correct component match from an accidental substring
 * match (both produce the same uppercase letter for a real key id).
 */
export function isCasingBearingTouchLayer(layer: TouchLayerId): boolean {
  const components = layer.split("-");
  return components.includes("shift") || components.includes("caps");
}

/**
 * Strip the `K_` prefix from a key id for user-facing display, casing the
 * result to match the layer it targets (FR-013). A vkey name carries no case
 * of its own — `K_A` names *the* A key — so a placement's displayed keycap
 * must derive its case from `layer`, not from the vkey spelling.
 *
 * A layer id with no `shift` or `caps` component (`alt`, `ctrl`, `rightalt`,
 * `rightctrl`, `leftctrl`, `ncaps`) is out of scope for this amendment
 * (FR-013) and keeps rendering the raw uppercase vkey letter, unchanged from
 * today.
 */
export function hostKeyShortLabel(keyId: string, layer: TouchLayerId): string {
  const short = stripVkeyPrefix(keyId);
  if (layer === "default") return short.toLowerCase();
  if (isCasingBearingTouchLayer(layer)) return short.toUpperCase();
  return short;
}

/** Composite lookup key for a bulk-group member: the sibling character plus
 *  the host key it was placed on. One helper feeds both the built set and the
 *  chip-row membership test so their separators can never drift apart. */
function bulkMemberKey(char: string, hostKey: string): string {
  return `${char} ${hostKey}`;
}

/** Direction code to arrow character. */
function dirArrow(dir: string): string {
  if (dir === "n") return "↑"; // up
  if (dir === "s") return "↓"; // down
  if (dir === "e") return "→"; // right
  if (dir === "w") return "←"; // left
  return dir;
}

// ---------------------------------------------------------------------------
// Key mode (spec 058 T072/T073/T075) — shared helpers
// ---------------------------------------------------------------------------

/**
 * `K_SPACE` is the one established scaffold convention
 * (`scaffoldTouchLayout.ts`'s `buildLetterKey`/row builders) that legitimately
 * carries no `text`/`output` of its own and does not use the asterisk
 * convention every other functional key (`*Shift*`, `*BkSp*`, `*Enter*`, …)
 * uses — the space bar's output is a KMW base-keystroke identity, not
 * something a `.kmn` rule or a scaffolded `output` field ever states. Excluded
 * by id rather than by the asterisk check below, which does not apply to it.
 */
const KEY_MODE_NON_LETTER_ALLOWLIST = new Set(["K_SPACE"]);

/**
 * A cell counts as "no reachable output" (FR-036, FR-036d) when it is not a
 * non-interactive spacer/blank (`isSpacerKeyClass`), not a functional keycap
 * (the established `*Shift*`/`*BkSp*`/… asterisk convention `touch-
 * coverage.ts`'s own `collectKeyChars` push() already excludes on), not the
 * one allow-listed space-bar id above, AND `producedChars` — the SAME
 * single-source production semantics `keyGridViewModel.ts` derives and the
 * grid itself renders from — is empty. Reusing that exact field (rather than
 * re-deriving "does this key produce anything") is what keeps this predicate
 * and the grid's own display from ever disagreeing.
 */
function isNoOutputLetterCell(cell: KeyGridCellViewModel): boolean {
  if (isSpacerKeyClass(cell.sp)) return false;
  if (cell.keycap.startsWith("*")) return false;
  if (KEY_MODE_NON_LETTER_ALLOWLIST.has(cell.id)) return false;
  return cell.producedChars.length === 0;
}

/** Localized label for a `.keyman-touch-layout` platform id (T072's key-mode
 * platform tabs). Takes an optional i18n + resolves via msg()/resolveMessage()
 * — see touchMechanismLabel's doc comment just below for why a bare `t`
 * parameter would break Lingui's static extraction here. */
function touchModePlatformLabel(id: string, i18n?: I18n): string {
  if (id === "phone") {
    return resolveMessage(
      i18n,
      msg({ id: "editor.assignLoop.touch.keyMode.platform.phone", message: "Phone" }),
    );
  }
  if (id === "tablet") {
    return resolveMessage(
      i18n,
      msg({ id: "editor.assignLoop.touch.keyMode.platform.tablet", message: "Tablet" }),
    );
  }
  if (id === "desktop") {
    return resolveMessage(
      i18n,
      msg({
        id: "editor.assignLoop.touch.keyMode.platform.desktop",
        message: "Desktop touch",
      }),
    );
  }
  return id;
}

/**
 * Structured description of what the top of the shared `undoStack` (spec 058
 * FR-036g — ONE chronological stack across both touch-step modes) is about to
 * undo. Deliberately data-only (no localized strings): the caller builds the
 * actual accessible label via `t()` calls in its own `useLingui()` scope (see
 * `touchMechanismLabel`'s doc comment on why a helper cannot own that part).
 *
 * `null` when the stack is empty, or (for a `'k'` entry) when the referenced
 * op has already been evicted from `keyEditOps` — an ordinary "nothing to
 * describe" outcome, never a crash (matches `parseTouchKeyAddress`'s own
 * never-throw convention).
 */
export type UndoTargetDescription =
  | { kind: "node"; id: string }
  | { kind: "item"; id: string }
  | { kind: "touchKey"; keyId: string }
  | { kind: "batch"; count: number }
  | { kind: "keyEdit"; keyId: string; opKind: KeyEditOperation["kind"] }
  | null;

export function describeUndoTarget(
  entry: UndoEntry | undefined,
  keyEditOps: readonly KeyEditOperation[],
): UndoTargetDescription {
  if (entry === undefined) return null;
  switch (entry.k) {
    case "n":
      return { kind: "node", id: entry.id };
    case "i":
      return { kind: "item", id: entry.id };
    case "batch":
      return { kind: "batch", count: entry.nodeIds.length + entry.itemIds.length };
    case "t": {
      const parts = parseTouchKeyAddress(entry.id);
      return { kind: "touchKey", keyId: parts?.keyId ?? entry.id };
    }
    case "k": {
      const op = keyEditOps.find((o) => o.seq === entry.seq);
      if (op === undefined) return null;
      const parts = parseTouchKeyAddress(op.address);
      return { kind: "keyEdit", keyId: parts?.keyId ?? op.address, opKind: op.kind };
    }
    default:
      return null;
  }
}

/** Produce a human-readable label for a single configured mechanism chip.
 * Takes an optional i18n + resolves via msg()/resolveMessage() rather than a
 * bare `t` parameter — Lingui's macro tracks the specific binding introduced
 * by useLingui(), so a re-bound `t` parameter is a distinct binding the
 * extractor does not follow (see Inspector.tsx's storeBlurb for the same fix). */
function touchMechanismLabel(
  target: string,
  m: MechanismRef,
  i18n?: I18n,
): string {
  const patternId = m.patternId;
  const sv = m.slotValues ?? {};
  // resolveTouchLayerId, not a hand-rolled `?? "default"` — the absent-layer
  // rule lives in one place (touchLayer.ts), the same helper
  // normalizeTouchSlots already uses.
  const hkShort = sv["hostKey"]
    ? hostKeyShortLabel(sv["hostKey"], resolveTouchLayerId(sv))
    : "";
  if (patternId === "touch_inherited") {
    return `${target} · ${resolveMessage(i18n, msg({ id: "editor.assignLoop.touch.mechanismLabel.inherited", message: "inherited" }))}`;
  }
  if (patternId === "longpress_alternates") {
    return `${target} · ${resolveMessage(i18n, msg({ id: "editor.assignLoop.touch.mechanismLabel.longpress", message: "long-press" }))} ${hkShort}`;
  }
  if (patternId === "flick_gestures") {
    const dir = sv["direction"] ?? "";
    return `${target} · ${resolveMessage(i18n, msg({ id: "editor.assignLoop.touch.mechanismLabel.flick", message: "flick" }))} ${hkShort} ${dirArrow(dir)}`.trimEnd();
  }
  if (patternId === "multitap") {
    return `${target} · ${resolveMessage(i18n, msg({ id: "editor.assignLoop.touch.mechanismLabel.multitap", message: "multitap" }))} ${hkShort}`;
  }
  if (patternId === "touch_key_replace") {
    return `${target} · ${resolveMessage(i18n, msg({ id: "editor.assignLoop.touch.mechanismLabel.replace", message: "replace" }))} ${hkShort}`;
  }
  return target;
}


// ghostBtn, headerBtnStyle, configStyle, and cardStyle are imported
// (aliased) from ../../lib/galleryTheme.ts — shared byte-for-byte with
// MechanismGallery.tsx rather than redefined here. The page-level wrapper
// style (pageStyle) is no longer imported directly here — it's used via
// GalleryEmptyState.tsx (the no-inventory guard) rather than inline.

// ---------------------------------------------------------------------------
// Touch method type
// ---------------------------------------------------------------------------

// Selectable methods in the chooser. `touch_inherited` is intentionally NOT a
// chooser option — a character already reachable on the seed layout is shown
// read-only via the "Existing methods" section and needs no click to keep;
// nothing is recorded for it. The pattern-apply engine still understands the
// touch_inherited patternId for a draft persisted from a prior build of this
// gallery, before the read-only display replaced the accept-to-record
// suggestion card.
export type TouchMethod =
  | "touch_key_replace"
  | "longpress_alternates"
  | "flick_gestures"
  | "multitap";

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

/**
 * Seed the touch layer builder's slot state for `char` (requirement 6,
 * defaults-first). `touchLayerForChar` only ever returns `"default"` or
 * `"shift"`, so the inverse is trivial — no general
 * touch-layer-id-to-combo helper exists (`comboToTouchLayerId` has no
 * exported inverse), and building one for these two cases would be
 * over-general: `"default"` is the empty combo (zero slots — the builder
 * renders no rows, matching the pre-builder single-select's "Base" default),
 * `"shift"` is the single-token `["SHIFT"]` combo.
 */
function seedLayerTokensForChar(char: string | null): (ModifierToken | "")[] {
  if (char === null) return [];
  return touchLayerForChar(char) === "shift" ? ["SHIFT"] : [];
}

/**
 * Corpus longpress-host TIE-BREAKER (placement-priors v2's `PlacementMap.touch`
 * field — see `packages/engine/src/placement/touch-mining.ts`). Consulted by
 * the suggestion memo ONLY when the NFD-decomposition path finds nothing —
 * NFD stays authoritative; the corpus host is convenience/fallback data, not
 * a competing signal. Returns the best-attested (highest `priorCount`) host's
 * vkey, or `null` when `placementMap` is absent, carries no `touch` data, or
 * has no entry for `char`'s codepoint.
 *
 * Deliberately does not filter on `layerClass` — the caller only needs a host
 * vkey to hang a longpress off of; which of the corpus keyboards' layers that
 * host lived on is not meaningful to a longpress-alternates suggestion on
 * THIS keyboard's layout.
 */
function touchCorpusFallbackHostKey(
  char: string,
  placementMap: PlacementMap | undefined,
): string | null {
  if (placementMap?.touch === undefined) return null;
  const codepoint = toUPlusNotation(char);
  const entry = placementMap.touch.find((e) => e.codepoint === codepoint);
  const best = entry?.hosts[0];
  return best !== undefined ? best.vkey : null;
}

/**
 * Slot values with an absent `layer` filled in as `"default"`.
 *
 * Both appliers treat an absent `layer` as `"default"`, and equality here has
 * to agree or the compatibility guarantee leaks: a ref stored in a draft
 * BEFORE the `layer` slot existed carries `{hostKey, char}`, while a freshly
 * built one carries `{hostKey, char, layer: "default"}`. Comparing raw key
 * sets would call those distinct and duplicate the chip on every revisit.
 * `{K_A, á, default}` vs `{K_A, Á, shift}` stay correctly distinct.
 */
function normalizeTouchSlots(
  slots: Record<string, string> | undefined,
): Record<string, string> {
  const base = slots ?? {};
  // Only mechanisms that actually carry a host key participate in layer
  // targeting; `touch_inherited` has no slotValues at all and must not gain
  // a phantom one.
  if (base["hostKey"] === undefined) return base;
  return base["layer"] === undefined
    ? { ...base, layer: resolveTouchLayerId(base) }
    : base;
}

export function buildTouchMechanismRef(
  method: TouchMethod,
  resolvedHostKey: string | null,
  flickDirection: string,
  char: string,
  // Explicit touch-layer target for the layer combo builder (spec: "a layer
  // option just like the desktop does" — see `TouchMethodChooser`'s
  // `touchLayer` prop), now shared by all four methods. Absent (or "") falls
  // back to the case-derived default below, so a caller that doesn't pass it
  // (e.g. a pre-picker unit test) is byte-identical.
  explicitLayer?: string,
): MechanismRef | null {
  if (resolvedHostKey === null) return null;
  const hk = resolvedHostKey;
  // An absent `layer` means "default" to both appliers, but writing it
  // explicitly is what makes `{K_A, á, default}` and `{K_A, Á, shift}` two
  // distinct refs under mechanismRefEquals — which is exactly the distinction
  // a case pair needs.
  const layer =
    explicitLayer !== undefined && explicitLayer !== ""
      ? explicitLayer
      : touchLayerForChar(char);
  if (method === "longpress_alternates") {
    return {
      patternId: "longpress_alternates",
      slotValues: { hostKey: hk, char, layer },
    };
  }
  if (method === "flick_gestures") {
    return {
      patternId: "flick_gestures",
      slotValues: { hostKey: hk, direction: flickDirection, char, layer },
    };
  }
  if (method === "touch_key_replace") {
    return {
      patternId: "touch_key_replace",
      slotValues: { hostKey: hk, char, layer },
    };
  }
  // multitap
  return { patternId: "multitap", slotValues: { hostKey: hk, char, layer } };
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
  /**
   * Touch-layer COMBO BUILDER state, shared by all four methods (#1
   * longpress, #2 flick, #3 multitap, #4 replace) — a stack of modifier
   * slots modeled on MechanismGallery's merged "Assign to a key" card's S-08
   * layer-combo picker (add/remove buttons, one dropdown per slot). Unlike
   * that picker's free/constructible pool, this builder may only assemble a combination
   * `validLayerCombos` (the desktop keyboard's own combos, from
   * `collectLayerCombosInUse`) already contains — see
   * `addableTouchLayerTokens`. An empty array is the base/default layer,
   * always valid.
   */
  layerTokens: (ModifierToken | "")[];
  onLayerTokenChange: (index: number, value: string) => void;
  onAddLayerSlot: () => void;
  onRemoveLayerSlot: (index: number) => void;
  /** The desktop keyboard's own combos — the builder's hard constraint pool. */
  validLayerCombos: ModifierToken[][];
  /** Whether the assembled combo (or the always-valid empty/base combo) is
   * currently a member of `validLayerCombos` — surfaced as an inline note
   * when false (a partial combo under construction); the parent gates Apply
   * on this via `canApply`. */
  layerComboValid: boolean;
  /** Human-friendly label for the currently assembled combo (e.g.
   * "Shift+RAlt", or "Base" for the empty combo) — see
   * `touchLayerComboLabel`. Shown as a preview line below the builder. */
  layerPreviewLabel: string;
}

/**
 * Human-friendly label for a canonicalized modifier combo, e.g. "Shift+RAlt".
 * The empty combo is the desktop keyboard's base/default layer.
 *
 * The per-token label table (`MODIFIER_TOKEN_LABELS`) and the "+"-joined
 * formatting are shared with MechanismGallery's S-08 covered-chip badge via
 * `../../lib/modifierTokenLabel.ts` — only the "Base" fallback for the empty
 * combo stays local (TouchGallery's own synthetic base option).
 */
function touchLayerComboLabel(
  combo: readonly ModifierToken[],
  i18n?: I18n,
): string {
  if (combo.length === 0) {
    return resolveMessage(
      i18n,
      msg({ id: "editor.assignLoop.touch.layerBase", message: "Base" }),
    );
  }
  return formatModifierCombo(combo);
}

// ---------------------------------------------------------------------------
// Touch layer combo builder — a stack of modifier slots (mirrors the
// merged "Assign to a key" card's raltTokens/optionsForRaltSlot/
// MAX_RALT_SLOTS in MechanismGallery), but HARD-CONSTRAINED to combinations
// the desktop keyboard actually uses (collectLayerCombosInUse's report —
// "D" below) rather than that card's free/constructible per-family pool
// (computeModifierPool). The
// author may only assemble a combo the desktop already defines; there is no
// path to constructing a combo the desktop doesn't have.
// ---------------------------------------------------------------------------

// A combo draws at most one token from each of the four mutually-exclusive
// modifier families (SHIFT; ctrl: CTRL/RCTRL/LCTRL; alt: ALT/RALT/LALT; caps:
// CAPS/NCAPS — see MODIFIER_EXCLUSIONS), so no combo `collectLayerCombosInUse`
// can ever report exceeds 4 tokens. Same structural bound as
// MechanismGallery's S-08 `MAX_RALT_SLOTS` — a fixed property of the
// modifier vocabulary, not re-derived per keyboard.
const MAX_TOUCH_LAYER_SLOTS = 4;

// `addableTouchLayerTokens`/`optionsForTouchLayerSlot` — the combo-
// reachability constraint this builder is HARD-CONSTRAINED by — are pure
// combinatorics over `ModifierToken`/`MODIFIER_EXCLUSIONS`, not view logic,
// so they live in the engine beside `MODIFIER_EXCLUSIONS`/
// `collectLayerCombosInUse`/`canonicalizeCombo` (see
// `engine/src/pattern-apply/modifierCombos.ts`) and are imported from
// `@keyboard-studio/engine` above, same as those other three.

const layerSlotRemoveBtnStyle: CSSProperties = {
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_DIM,
  fontSize: 12,
  padding: "2px 8px",
  cursor: "pointer",
  fontFamily: FONT,
};

const layerAddBtnStyle: CSSProperties = {
  alignSelf: "flex-start",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_DIM,
  fontSize: 12,
  padding: "2px 10px",
  cursor: "pointer",
  fontFamily: FONT,
};

interface TouchLayerBuilderProps {
  layerTokens: (ModifierToken | "")[];
  onLayerTokenChange: (index: number, value: string) => void;
  onAddLayerSlot: () => void;
  onRemoveLayerSlot: (index: number) => void;
  validLayerCombos: ModifierToken[][];
  layerComboValid: boolean;
  /** 1-based slot number -> aria-label; lets long-press/flick keep distinct
   * per-card labels (matching the existing per-card hostKey aria-label
   * convention) even though only one card's builder renders at a time. */
  slotAriaLabel: (n: number) => string;
  removeAriaLabel: (n: number) => string;
  addAriaLabel: string;
  selectPlaceholder: string;
  addButtonLabel: string;
  notYetValidNote: string;
}

/**
 * The add/remove modifier-slot stack shared by all four touch methods'
 * layer builder — one `SelectMenu` per slot (options constrained by
 * `optionsForTouchLayerSlot`), a remove button per slot (every slot is
 * removable, including the last — an empty stack is the valid base/default
 * layer, unlike S-08's `raltTokens`, which must always keep at least one
 * slot), and an add button shown only while `addableTouchLayerTokens` still
 * has room to extend the current selection toward a combo in
 * `validLayerCombos`.
 */
function TouchLayerBuilder({
  layerTokens,
  onLayerTokenChange,
  onAddLayerSlot,
  onRemoveLayerSlot,
  validLayerCombos,
  layerComboValid,
  slotAriaLabel,
  removeAriaLabel,
  addAriaLabel,
  selectPlaceholder,
  addButtonLabel,
  notYetValidNote,
}: TouchLayerBuilderProps) {
  const filledLayerTokens = layerTokens.filter(
    (tok): tok is ModifierToken => tok !== "",
  );
  const layerAllFilled =
    layerTokens.length === 0 ||
    filledLayerTokens.length === layerTokens.length;
  const layerHasRoomToAdd =
    layerTokens.length < MAX_TOUCH_LAYER_SLOTS &&
    layerAllFilled &&
    addableTouchLayerTokens(new Set(filledLayerTokens), validLayerCombos)
      .length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {layerTokens.map((token, index) => {
        const options = optionsForTouchLayerSlot(
          validLayerCombos,
          layerTokens,
          index,
        );
        const slotOptions: SelectMenuOption[] = [
          { value: "", label: selectPlaceholder },
          ...options.map((o) => ({
            value: o,
            label: MODIFIER_TOKEN_LABELS[o] ?? o,
          })),
        ];
        return (
          // key={index} intentionally kept: a layer-token slot's identity IS
          // its position (onLayerTokenChange/onRemoveLayerSlot both address
          // slots by index, and two slots can hold the identical value, e.g.
          // two empty "" slots) — not the array-index anti-pattern this
          // sweep otherwise targets. Same reasoning as MechanismGallery's
          // raltTokens.map.
          <div
            key={index}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <SelectMenu
              value={token}
              onChange={(v) => onLayerTokenChange(index, v)}
              ariaLabel={slotAriaLabel(index + 1)}
              options={slotOptions}
              style={selectStyle}
            />
            <button
              type="button"
              aria-label={removeAriaLabel(index + 1)}
              onClick={() => onRemoveLayerSlot(index)}
              style={layerSlotRemoveBtnStyle}
            >
              &times;
            </button>
          </div>
        );
      })}
      {layerHasRoomToAdd && (
        <button
          type="button"
          aria-label={addAriaLabel}
          onClick={onAddLayerSlot}
          style={layerAddBtnStyle}
        >
          {addButtonLabel}
        </button>
      )}
      {!layerComboValid && (
        <p
          role="status"
          style={{ margin: 0, fontSize: 11, color: "#d29922", fontFamily: FONT }}
        >
          {notYetValidNote}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TouchLayerBuilderSection — the "Layer:" heading + TouchLayerBuilder +
// "Resulting layer" preview block shared by all four method cards (longpress/
// flick/multitap/replace) in TouchMethodChooser below. The four cards were
// previously near-identical ~55-line copies of this block, differing only in
// the method slug baked into the heading id, the three per-method aria-label
// message ids, and the human method label — collapsed here to one
// parameterized component keyed by `method`.
// ---------------------------------------------------------------------------

/** Per-method slug (used in element ids) + human label (for reference/
 * documentation alongside the slug — the aria-label message TEXT itself
 * stays a literal per-method string below, not built from this label, so the
 * Lingui extractor keeps seeing stable, literal `t({id, message})` ids). */
const METHOD_META: Record<TouchMethod, { slug: string; label: string }> = {
  longpress_alternates: { slug: "longpress", label: "long-press" },
  flick_gestures: { slug: "flick", label: "flick" },
  multitap: { slug: "multitap", label: "multitap" },
  touch_key_replace: { slug: "replace", label: "replace" },
};

interface TouchLayerBuilderSectionProps {
  method: TouchMethod;
  layerTokens: (ModifierToken | "")[];
  onLayerTokenChange: (index: number, value: string) => void;
  onAddLayerSlot: () => void;
  onRemoveLayerSlot: (index: number) => void;
  validLayerCombos: ModifierToken[][];
  layerComboValid: boolean;
  selectPlaceholder: string;
  addButtonLabel: string;
  notYetValidNote: string;
  layerPreviewLabel: string;
}

/**
 * Renders the `role="group"` wrapper (`aria-labelledby` -> the per-method
 * heading id), the "Layer:" heading, the shared `TouchLayerBuilder`, and the
 * "Resulting layer" preview paragraph — byte-identical across all four method
 * cards except for the method-scoped heading id and aria-label ids/messages
 * below. Calls its own `useLingui()` (rather than accepting a `t` prop) so
 * the per-method `t({id, message})` calls below stay traceable to a
 * same-scope `useLingui()` binding for Lingui's macro extractor — a `t`
 * passed in as a parameter is a distinct binding the extractor does not
 * follow (see `touchMechanismLabel`'s and Inspector.tsx's `storeBlurb`'s note
 * on the same constraint).
 */
function TouchLayerBuilderSection({
  method,
  layerTokens,
  onLayerTokenChange,
  onAddLayerSlot,
  onRemoveLayerSlot,
  validLayerCombos,
  layerComboValid,
  selectPlaceholder,
  addButtonLabel,
  notYetValidNote,
  layerPreviewLabel,
}: TouchLayerBuilderSectionProps) {
  const { t } = useLingui();
  const { slug } = METHOD_META[method];
  const headingId = `touch-layer-builder-heading-${slug}`;

  let slotAriaLabel: (n: number) => string;
  let removeAriaLabel: (n: number) => string;
  let addAriaLabel: string;

  switch (method) {
    case "longpress_alternates":
      slotAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.longpress.layerSlotAriaLabel",
          message: `Touch layer ${{ n }} for long-press`,
        });
      removeAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.longpress.removeLayerAriaLabel",
          message: `Remove touch layer ${{ n }} for long-press`,
        });
      addAriaLabel = t({
        id: "editor.assignLoop.touch.longpress.addLayerAriaLabel",
        message: "Add another touch layer for long-press",
      });
      break;
    case "flick_gestures":
      slotAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.flick.layerSlotAriaLabel",
          message: `Touch layer ${{ n }} for flick`,
        });
      removeAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.flick.removeLayerAriaLabel",
          message: `Remove touch layer ${{ n }} for flick`,
        });
      addAriaLabel = t({
        id: "editor.assignLoop.touch.flick.addLayerAriaLabel",
        message: "Add another touch layer for flick",
      });
      break;
    case "multitap":
      slotAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.multitap.layerSlotAriaLabel",
          message: `Touch layer ${{ n }} for multitap`,
        });
      removeAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.multitap.removeLayerAriaLabel",
          message: `Remove touch layer ${{ n }} for multitap`,
        });
      addAriaLabel = t({
        id: "editor.assignLoop.touch.multitap.addLayerAriaLabel",
        message: "Add another touch layer for multitap",
      });
      break;
    case "touch_key_replace":
      slotAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.replace.layerSlotAriaLabel",
          message: `Touch layer ${{ n }} for replace`,
        });
      removeAriaLabel = (n) =>
        t({
          id: "editor.assignLoop.touch.replace.removeLayerAriaLabel",
          message: `Remove touch layer ${{ n }} for replace`,
        });
      addAriaLabel = t({
        id: "editor.assignLoop.touch.replace.addLayerAriaLabel",
        message: "Add another touch layer for replace",
      });
      break;
  }

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <span id={headingId} style={{ fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        <Trans id="editor.assignLoop.touch.layerLabel">Layer:</Trans>
      </span>
      <TouchLayerBuilder
        layerTokens={layerTokens}
        onLayerTokenChange={onLayerTokenChange}
        onAddLayerSlot={onAddLayerSlot}
        onRemoveLayerSlot={onRemoveLayerSlot}
        validLayerCombos={validLayerCombos}
        layerComboValid={layerComboValid}
        slotAriaLabel={slotAriaLabel}
        removeAriaLabel={removeAriaLabel}
        addAriaLabel={addAriaLabel}
        selectPlaceholder={selectPlaceholder}
        addButtonLabel={addButtonLabel}
        notYetValidNote={notYetValidNote}
      />
      <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
        <Trans id="editor.assignLoop.touch.layerResultPreview">
          Resulting layer: {layerPreviewLabel}
        </Trans>
      </p>
    </div>
  );
}

// Chrome (option labels); built per-render via the optional-i18n +
// msg()/resolveMessage() pattern (see Inspector.tsx's storeBlurb) rather than
// a bare `t` parameter — Lingui's macro tracks the specific binding
// introduced by useLingui(), so a re-bound `t` parameter is a distinct
// binding the extractor does not follow.
function buildFlickDirections(
  i18n?: I18n,
): ReadonlyArray<{ value: string; label: string }> {
  return [
    {
      value: "",
      label: resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.touch.flickChoosePlaceholder",
          message: "-- choose direction --",
        }),
      ),
    },
    {
      value: "n",
      label: resolveMessage(
        i18n,
        msg({ id: "editor.assignLoop.touch.flickUp", message: "Up (north)" }),
      ),
    },
    {
      value: "s",
      label: resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.touch.flickDown",
          message: "Down (south)",
        }),
      ),
    },
    {
      value: "e",
      label: resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.touch.flickRight",
          message: "Right (east)",
        }),
      ),
    },
    {
      value: "w",
      label: resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.touch.flickLeft",
          message: "Left (west)",
        }),
      ),
    },
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
  layerTokens,
  onLayerTokenChange,
  onAddLayerSlot,
  onRemoveLayerSlot,
  validLayerCombos,
  layerComboValid,
  layerPreviewLabel,
}: TouchMethodChooserProps) {
  const { t, i18n } = useLingui();
  const layerSelectPlaceholder = t({
    id: "editor.assignLoop.touch.selectPlaceholder",
    message: "— Select —",
  });
  const layerAddButtonLabel = t({
    id: "editor.assignLoop.touch.addLayerButton",
    message: "+ Add layer",
  });
  const layerNotYetValidNote = t({
    id: "editor.assignLoop.touch.layerNotYetValidNote",
    message:
      "Not yet a layer this keyboard uses — finish the combination or remove a layer.",
  });
  const flickDirections = buildFlickDirections(i18n);
  // Named local for the dotted-circle-wrapped char used in the <Trans> macros
  // below — a simple identifier extracts as a NAMED lingui placeholder (e.g.
  // {currentCharDisplay}), whereas calling displayChar() inline inside the
  // macro collapses it to a POSITIONAL {0}/{1}, which is what broke the fr
  // catalog (see the module-level fix note near MechanismGallery's twin).
  const currentCharDisplay = displayChar(currentChar);
  // cardStyle is imported from ../../lib/galleryTheme.ts.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        <Trans id="editor.assignLoop.touch.howToReachIt">
          How to reach it on touch:
        </Trans>
      </p>

      {/* 1. Long-press on a key */}
      <div style={cardStyle(method === "longpress_alternates")}>
        <button
          type="button"
          aria-pressed={method === "longpress_alternates"}
          onClick={() => onMethodChange("longpress_alternates")}
          style={headerBtnStyle}
        >
          <span
            style={{
              fontWeight: 600,
              color: method === "longpress_alternates" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.assignLoop.touch.method.longpress.title">
              Long-press on a key
            </Trans>
          </span>
          {method !== "longpress_alternates" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.touch.method.longpress.summary">
                Hold a key to reveal {currentCharDisplay} as a long-press
                option.
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
              <span>
                <Trans id="editor.assignLoop.touch.hostKeyLabel">
                  Host key:
                </Trans>
              </span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({
                  id: "editor.assignLoop.touch.longpress.hostKeySelectAriaLabel",
                  message: "Host key for long-press",
                })}
                customInputAriaLabel={t({
                  id: "editor.assignLoop.touch.longpress.hostKeyCustomAriaLabel",
                  message: "Custom character for long-press host key",
                })}
              />
            </div>
            <TouchLayerBuilderSection
              method="longpress_alternates"
              layerTokens={layerTokens}
              onLayerTokenChange={onLayerTokenChange}
              onAddLayerSlot={onAddLayerSlot}
              onRemoveLayerSlot={onRemoveLayerSlot}
              validLayerCombos={validLayerCombos}
              layerComboValid={layerComboValid}
              selectPlaceholder={layerSelectPlaceholder}
              addButtonLabel={layerAddButtonLabel}
              notYetValidNote={layerNotYetValidNote}
              layerPreviewLabel={layerPreviewLabel}
            />
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
          <span
            style={{
              fontWeight: 600,
              color: method === "flick_gestures" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.assignLoop.touch.method.flick.title">
              Swipe a key (flick)
            </Trans>
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
              <span>
                <Trans id="editor.assignLoop.touch.hostKeyLabel">
                  Host key:
                </Trans>
              </span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({
                  id: "editor.assignLoop.touch.flick.hostKeySelectAriaLabel",
                  message: "Host key for flick",
                })}
                customInputAriaLabel={t({
                  id: "editor.assignLoop.touch.flick.hostKeyCustomAriaLabel",
                  message: "Custom character for flick host key",
                })}
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
              <Trans id="editor.assignLoop.touch.directionLabel">
                Direction:
              </Trans>
              <SelectMenu
                value={flickDirection}
                onChange={onFlickDirectionChange}
                ariaLabel={t({
                  id: "editor.assignLoop.touch.flickDirectionAriaLabel",
                  message: "Flick direction",
                })}
                options={flickDirections}
                style={selectStyle}
              />
            </label>
            <TouchLayerBuilderSection
              method="flick_gestures"
              layerTokens={layerTokens}
              onLayerTokenChange={onLayerTokenChange}
              onAddLayerSlot={onAddLayerSlot}
              onRemoveLayerSlot={onRemoveLayerSlot}
              validLayerCombos={validLayerCombos}
              layerComboValid={layerComboValid}
              selectPlaceholder={layerSelectPlaceholder}
              addButtonLabel={layerAddButtonLabel}
              notYetValidNote={layerNotYetValidNote}
              layerPreviewLabel={layerPreviewLabel}
            />
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
          <span
            style={{
              fontWeight: 600,
              color: method === "multitap" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.assignLoop.touch.method.multitap.title">
              Tap multiple times (multitap)
            </Trans>
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
              <span>
                <Trans id="editor.assignLoop.touch.hostKeyLabel">
                  Host key:
                </Trans>
              </span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({
                  id: "editor.assignLoop.touch.multitap.hostKeySelectAriaLabel",
                  message: "Host key for multitap",
                })}
                customInputAriaLabel={t({
                  id: "editor.assignLoop.touch.multitap.hostKeyCustomAriaLabel",
                  message: "Custom character for multitap host key",
                })}
              />
            </div>
            <TouchLayerBuilderSection
              method="multitap"
              layerTokens={layerTokens}
              onLayerTokenChange={onLayerTokenChange}
              onAddLayerSlot={onAddLayerSlot}
              onRemoveLayerSlot={onRemoveLayerSlot}
              validLayerCombos={validLayerCombos}
              layerComboValid={layerComboValid}
              selectPlaceholder={layerSelectPlaceholder}
              addButtonLabel={layerAddButtonLabel}
              notYetValidNote={layerNotYetValidNote}
              layerPreviewLabel={layerPreviewLabel}
            />
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
          <span
            style={{
              fontWeight: 600,
              color: method === "touch_key_replace" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.assignLoop.touch.method.replace.title">
              Replace a key
            </Trans>
          </span>
          {method !== "touch_key_replace" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.touch.method.replace.summary">
                Make a key type {currentCharDisplay} directly on the touch
                keyboard.
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
              <span>
                <Trans id="editor.assignLoop.touch.hostKeyLabel">
                  Host key:
                </Trans>
              </span>
              <KeyPickerField
                value={hostKey}
                onChange={onHostKeyChange}
                customChar={hostKeyCustomChar}
                onCustomCharChange={onHostKeyCustomCharChange}
                options={KEY_OPTIONS}
                selectAriaLabel={t({
                  id: "editor.assignLoop.touch.replace.hostKeySelectAriaLabel",
                  message: "Host key to replace",
                })}
                customInputAriaLabel={t({
                  id: "editor.assignLoop.touch.replace.hostKeyCustomAriaLabel",
                  message: "Custom character for the key to replace",
                })}
              />
            </div>
            <TouchLayerBuilderSection
              method="touch_key_replace"
              layerTokens={layerTokens}
              onLayerTokenChange={onLayerTokenChange}
              onAddLayerSlot={onAddLayerSlot}
              onRemoveLayerSlot={onRemoveLayerSlot}
              validLayerCombos={validLayerCombos}
              layerComboValid={layerComboValid}
              selectPlaceholder={layerSelectPlaceholder}
              addButtonLabel={layerAddButtonLabel}
              notYetValidNote={layerNotYetValidNote}
              layerPreviewLabel={layerPreviewLabel}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// TouchPreviewPane is now GalleryPreviewPane (shared component) — see GalleryPreviewPane.tsx.

// ---------------------------------------------------------------------------
// SuggestionActions — Accept/Deny button pair shared by the three suggestion-
// card variants (longpress/replace/already) rendered in TouchGallery's
// leftContent below. The three variants differ only in message text, the
// accept handler, and the aria-labels — style is byte-identical across all
// three, so it is hoisted to module scope here rather than repeated per card.
// ---------------------------------------------------------------------------

const suggestionAcceptBtnStyle: CSSProperties = {
  padding: "5px 14px",
  background: "#238636",
  border: "none",
  borderRadius: 5,
  color: "#e6edf3",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

const suggestionDenyBtnStyle: CSSProperties = {
  padding: "5px 14px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 5,
  color: TEXT_DIM,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: FONT,
};

interface SuggestionActionsProps {
  onAccept: () => void;
  onDeny: () => void;
  acceptAriaLabel: string;
  denyAriaLabel: string;
}

function SuggestionActions({
  onAccept,
  onDeny,
  acceptAriaLabel,
  denyAriaLabel,
}: SuggestionActionsProps) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        onClick={onAccept}
        aria-label={acceptAriaLabel}
        style={suggestionAcceptBtnStyle}
      >
        <Trans id="editor.assignLoop.suggestion.acceptButton">Accept</Trans>
      </button>
      <button
        type="button"
        onClick={onDeny}
        aria-label={denyAriaLabel}
        style={suggestionDenyBtnStyle}
      >
        <Trans id="editor.assignLoop.suggestion.denyButton">Deny</Trans>
      </button>
    </div>
  );
}

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
  /**
   * Optional corpus placement map (same object MechanismGallery consumes via
   * `usePlacementPriors` — see `addPhysicalAdapter.tsx`). TouchGallery only
   * reads its `touch` field (placement-priors v2's corpus-mined longpress
   * hosts) — the physical-key `entries` are irrelevant here. When supplied,
   * the suggestion memo below falls back to a corpus-attested longpress host
   * ONLY when the NFD-decomposition path finds nothing (see
   * `touchCorpusFallbackHostKey`); NFD stays authoritative. Absent (or
   * carrying no `touch` data) => the existing NFD-only behavior, unchanged.
   */
  placementMap?: PlacementMap;
}

export function TouchGallery({ onComplete, onBack, placementMap }: TouchGalleryProps) {
  const { t, i18n } = useLingui();
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  // The MUTABLE working IR (spec 058 T085-T089 composition) — AssignPanel's
  // rule synthesis (ensureTouchKeyRule/applyGuardSynthesis) reads/returns this
  // one, via the overlay-preserving setWorkingIR seam (see
  // handleAssignPanelCommit below), never `baseIr` (locked, and the scope
  // `touchRuleIndex` below deliberately stays pinned to for character-mode
  // coverage detection — see that memo's own doc comment).
  const ir = useWorkingCopyStore((s): KeyboardIR | null => s.ir);
  // The committed key-level touch layout edit overlay (spec 058) — read here
  // so it can be threaded into useWorkingCopyTransform's liveLayoutOverride
  // below (T054), folded into the key-mode grid's effective layout (T072),
  // and read for the undo affordance's description (T076).
  const keyEditOverlay = useWorkingCopyStore((s) => s.keyEditOverlay);

  // Touch step mode selector (T072, FR-035/FR-036a) — a view toggle over the
  // SAME step, never a branch: switching modes never clears touchDraft or
  // keyEditOverlay (FR-036b — enforced by NOT wiring either to this switch).
  const touchEditorMode = useWorkingCopyStore((s) => s.touchEditorMode);
  const setTouchEditorMode = useWorkingCopyStore((s) => s.setTouchEditorMode);

  // Undo affordance (T076, FR-036g) — ONE chronological stack across both
  // modes. `undoDelete` already dispatches correctly per entry kind
  // (including the 'k' key-edit kind this feature added) — reused as-is, not
  // re-implemented here.
  const undoStack = useWorkingCopyStore((s) => s.undoStack);
  const undoDelete = useWorkingCopyStore((s) => s.undoDelete);

  // Shared id linking the mode tablist's tabs (`aria-controls`) to whichever
  // pane content is currently mounted — only one of characterModeContent/
  // keyModeContent is ever in the DOM at a time, so reusing one id is safe.
  const leftPaneId = useId();
  const modeTabRefs = useRef<Map<TouchEditorMode, HTMLButtonElement>>(
    new Map(),
  );

  // Abugida-safe gate input (km-domain ruling) — mirrors MechanismGallery's
  // own `axes` selector (see that file, near its `baseIr` selector).
  const axes = useWorkingCopyStore(
    useShallow((s) => s.session.axes as Partial<DiscoveryAxisVector>),
  );

  // spec 035 R3/R11 — the carve overlay + Phase C assignments feed
  // deriveDesktopModifications (mods memo below); touchSeedSource feeds the
  // R11 emission matrix. Read here (not inline in the memo) so the mods/
  // emission memos below can depend on stable primitives.
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const touchSeedSourceStored = useSurveySessionStore((s) => s.touchSeedSource);

  // "Mark for later review" — authoring metadata only (surveySessionStore),
  // never the working copy. Touch-gallery counterpart of MechanismGallery's
  // markedForLaterDesktop — see that store field's docstring for why
  // desktop/touch are tracked separately.
  const markedForLaterTouch = useSurveySessionStore((s) => s.markedForLaterTouch);
  const toggleMarkedForLaterTouch = useSurveySessionStore(
    (s) => s.toggleMarkedForLaterTouch,
  );
  const markedTouchSet = useMemo(() => new Set(markedForLaterTouch), [markedForLaterTouch]);

  // "Existing methods" section — pre-existing touch methods (from the base
  // keyboard's own touch layout) that already produce currentChar, mirroring
  // MechanismGallery's desktop "Existing methods" section. deletedTouchKeyIds
  // is read directly (not just via isTouchKeyDeleted) so the existingTouchMethods
  // memo below re-runs when the set changes — same pattern as
  // MechanismGallery's isItemDeleted/deletedItemIds pairing.
  const deletedTouchKeyIds = useWorkingCopyStore((s) => s.deletedTouchKeyIds);
  const isTouchKeyDeleted = useWorkingCopyStore((s) => s.isTouchKeyDeleted);
  const deleteTouchKey = useWorkingCopyStore((s) => s.deleteTouchKey);
  const restoreTouchKey = useWorkingCopyStore((s) => s.restoreTouchKey);

  // Character inventory — same source MechanismGallery uses.
  const rawInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);

  // Collated display/walk order (spec 047 FR-007's default-ICU comparator,
  // reused — not reinvented; see survey/collation.ts and MechanismGallery's
  // matching `inventory` derivation): puts a lowercase letter immediately
  // before its uppercase counterpart and keeps accented forms adjacent to
  // their base. Feeds BOTH the CharScrollStrip (`chars=`) and
  // usePositionalCharNav (`list:`) below, plus this gallery's other
  // order-independent `inventory` reads (membership/length/coverage checks)
  // — none of those depend on order, so sorting the single shared variable
  // is safe. The canonical `confirmedInventory` (rawInventory) is left
  // untouched; only this display-local derivation is sorted.
  //
  // `collateInventory` (not bare `collate`) — a bare combining mark in the
  // inventory otherwise collates to ICU position 0 under `collate()`'s root
  // comparator, inserting a phantom "first" walk entry and shifting every
  // other character's index. `collateInventory` partitions letters/stacks
  // (ICU order) from bare marks (raw code-point order, trailing) — see
  // survey/collation.ts.
  //
  // `nfcDedup([], rawInventory)` — a walk entry can appear in
  // confirmedInventory as BOTH its precomposed form (e.g. "ӝ" U+04DD) and its
  // canonically-equivalent decomposed form (e.g. "ж"+combining-diaeresis),
  // which are distinct JS strings the raw list would otherwise carry as two
  // separate walk stops for what is visually one character. `detectedChars`/
  // `baseTouchCoveredSet` below already NFC-normalize internally (matching
  // the useInventoryDiff.ts:~108 pattern); `inventory` itself did not, so a
  // decomposed duplicate stayed a phantom, never-covered walk stop even after
  // its precomposed sibling was implemented. Deduping (and displaying the NFC
  // form) here — not in confirmedInventory itself, which stays untouched —
  // keeps both sides of every membership check consistent. NFD stacks with no
  // precomposed codepoint (Africanist multi-mark sequences) round-trip
  // through NFC unchanged (NFC(x) is not always length 1), so this never
  // folds two GENUINELY different characters together.
  const inventory = useMemo(
    () => collateInventory(nfcDedup([], rawInventory)),
    [rawInventory],
  );
  // Stable primitive proxy for `inventory` — declared up here (rather than
  // beside the currentChar-sync effect) so detectedChars/touchLettersToAdd
  // below, which also need it, can be declared before that effect.
  const inventoryKey = inventory.join("\0");

  // The touch key <-> rule join (spec 058 FR-005/FR-007). Threaded into ALL
  // THREE coverage call sites in this component — `detectedChars`, the FR-008
  // `handleContinue` gate, and `baseTouchCoveredSet` — because leaving any one on
  // the unjoined path is exactly the split-brain the join exists to end: the
  // badge would say a mark key is covered while the gate refused to let the
  // author continue, or vice versa.
  //
  // Memoized on `baseIr` alone: the store never mutates it in place (it replaces
  // the slot), so reference equality is a correct dependency, and the index is a
  // pure function of the IR's rules and stores.
  const touchRuleIndex = useMemo(
    () => (baseIr !== null ? buildTouchKeyRuleIndex(baseIr) : undefined),
    [baseIr],
  );
  // One options object, shared by all three call sites, so they cannot drift on
  // which options they pass.
  const coverageOptions = useMemo(
    () => (touchRuleIndex !== undefined ? { ruleIndex: touchRuleIndex } : {}),
    [touchRuleIndex],
  );

  // Key-mode's OWN rule index (spec 058 T085-T089 composition), built from the
  // MUTABLE `ir` rather than `baseIr` above — deliberately a second index, not
  // a redundant recompute of the same one. `ir` and `baseIr` agree on every
  // desktop rule (locked identically at instantiation), so this diverges from
  // `touchRuleIndex` ONLY once AssignPanel mints a touch-key rule
  // (ensureTouchKeyRule/applyGuardSynthesis) — exactly the case that needs to
  // be visible to the very next proposal's shared-candidate scan and
  // opaque-fragment gate, and to the grid/inspector's own "Produces" read.
  // `touchRuleIndex` stays baseIr-scoped for character-mode coverage
  // detection, per that memo's own doc comment — not touched here.
  const keyModeRuleIndex = useMemo<TouchKeyRuleIndex | undefined>(
    () => (ir !== null ? buildTouchKeyRuleIndex(ir) : undefined),
    [ir],
  );

  // Coverage options for everything on the KEY-MODE side of this step: the
  // shared progress figures, the FR-008 completion gate, and (via
  // `useKeyEditGuards`) T119's `blocksContinue` prediction of that gate.
  //
  // These three MUST use one index, and it has to be the mutable-`ir` one.
  // `coverageOptions` above is `baseIr`-scoped, which is right for seed-time
  // detection but wrong here, for two compounding reasons:
  //
  //   1. It UNDER-CREDITS. Once AssignPanel mints a touch-key rule
  //      (`ensureTouchKeyRule`/`applyGuardSynthesis`), the character that rule
  //      produces exists only in `ir` — so a `baseIr`-scoped gate refuses
  //      Continue for a character the author has just placed, by the very path
  //      US2 exists to provide.
  //   2. It made `blocksContinue` a LIE. That flag is documented as a
  //      prediction of this gate's own verdict derived from the same coverage
  //      truth (see useKeyEditGuards.ts's T119 section), and the guard hook is
  //      passed `keyModeRuleIndex`. With the gate on a different index the two
  //      could disagree about a character — the inline warning silent, then
  //      Continue refused at the gate. That is exactly the deferral US5 AS3
  //      removes, reintroduced through the back door.
  //
  // Falls back to `coverageOptions` only when there is no working `ir` yet, in
  // which case the two indexes are identical anyway.
  const keyModeCoverageOptions = useMemo(
    () => (keyModeRuleIndex !== undefined ? { ruleIndex: keyModeRuleIndex } : coverageOptions),
    [keyModeRuleIndex, coverageOptions],
  );

  // Session-aware desktop produced set (shaped-bug fix, diacritic-
  // implementability) — the SAME `producedSet` MechanismGallery's coverage
  // gate derives from (base .kmn + this session's physical assignments
  // injected via applyAssignments/buildSessionProducedSet; see
  // useInventoryDiff.ts and
  // packages/engine/src/pattern-apply/sessionProducedSet.ts). Used ONLY by
  // `handleContinue`'s completion-GATE re-check below (touchCoverage's
  // `additionalProduced` parameter), so a touch inventory char composable
  // only because its combining-mark component was assigned a DESKTOP deadkey
  // this session (e.g. "ж" + a session-assigned diaeresis deadkey composing
  // "ӝ") doesn't block completion. Deliberately NOT threaded into
  // `detectedChars`/`touchLettersToAdd` below — those drive the INTERACTIVE
  // walk (`usePositionalCharNav`'s `list`), which must stay static across a
  // session for the identical reason useInventoryDiff.ts's own module doc
  // gives for MechanismGallery's `lettersToAdd`: reflowing it whenever a
  // session assignment changes coverage would strand/reflow the walk mid-edit
  // (caught by this fix's own regression pass).
  const { producedSet: desktopProducedSet, rawProducedSet: desktopRawProducedSet } =
    useInventoryDiff();

  // Draft persistence — read on mount; write on every charTouch change.
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);
  const setTouchDraft = useWorkingCopyStore((s) => s.setTouchDraft);

  // One-time intro splash — read the seen flag on mount; mark it on "Get started".
  const touchIntroSeen = useWorkingCopyStore((s) => s.galleryIntrosSeen.touch);
  const markGalleryIntroSeen = useWorkingCopyStore(
    (s) => s.markGalleryIntroSeen,
  );

  // ---------------------------------------------------------------------------
  // Live OSK preview — right pane wiring
  // ---------------------------------------------------------------------------

  const scaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? {
            keyboardId: identity.keyboardId,
            displayName: identity.displayName ?? "",
          }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );

  // ---------------------------------------------------------------------------
  // Per-character touch assignment state (declared early — memos below depend on it)
  // ---------------------------------------------------------------------------

  // Local map of explicitly-configured characters: char -> TouchAssignment.
  // Rehydrated from the store draft on mount so back-navigation from Phase C
  // preserves work already done in Phase E.
  const [charTouch, setCharTouch] = useState<Map<string, TouchAssignment>>(
    () =>
      touchDraft !== null ? new Map(touchDraft.charTouchEntries) : new Map(),
  );

  // Sibling-accent bulk groups (longpress accelerator): each batch the author
  // confirms via the "Add them" banner is recorded here so the gallery renders
  // ONE removable summary box per batch instead of a chip per sibling.
  // Rehydrated from the draft (absent -> []) so the box survives an
  // unmount/remount, exactly like the charTouch chips do.
  const [bulkAccentGroups, setBulkAccentGroups] = useState<BulkAccentGroup[]>(
    () => touchDraft?.bulkAccentGroups ?? [],
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
              .map(
                (m) => `${m.patternId}/${JSON.stringify(m.slotValues ?? {})}`,
              )
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
  const charTouchAssignments = useMemo(
    () => [...charTouch.values()],
    [charTouch],
  );

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
    return deriveDesktopModifications(
      baseIr,
      deletedNodeIds,
      deletedItemIds,
      phaseResults,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, modsDepsKey]);

  // Resolved seed-source choice (spec 035 R4/R11) — the raw store value may be
  // null (defensive: author somehow reached touch without the fork); the
  // Entity-5 default is applied here via resolveTouchSeedSource so preview,
  // lint, and this component's own emission decision agree.
  const resolvedSeedSource = useMemo(
    () =>
      resolveTouchSeedSource(
        touchSeedSourceStored,
        resolveBaseTouchJson(baseVfs) !== undefined,
      ),
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
  const touchLayoutResult = useMemo(() => {
    const appliedEdits = [...charTouch.values()].filter((a) =>
      a.mechanisms.some((m) => m.patternId !== "touch_inherited"),
    );
    if (baseIr === null) return { json: null, warnings: [] };
    if (
      !shouldEmitTouchLayout(resolvedSeedSource, mods, appliedEdits.length > 0)
    )
      return { json: null, warnings: [] };
    // Case B: base ships a touch layout AND the author chose import-adapt →
    // apply faithfully onto raw JSON copy. Case A (including reseed, which
    // must NOT receive the shipped layout — R10 discards it): IR-based path.
    const baseTouchJson =
      resolvedSeedSource === "reseed-from-desktop"
        ? undefined
        : resolveBaseTouchJson(baseVfs);
    // `.warnings` (e.g. a genuine "host key not found in any platform's
    // layer" skip from applyTouchAssignments(ToRawJson)/
    // applyDesktopModifications) is threaded through — see
    // `touchApplyWarnings` below, rendered so an "Apply method" click that
    // the engine could not honour is never a silent no-op. We capture
    // `built` (not a direct return) because touch method deletions are
    // applied on top of `.json` before returning; `.warnings` passes through
    // unchanged.
    const built = buildTouchLayoutJson(baseIr, appliedEdits, {
      ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
      mods,
      seedSource: resolvedSeedSource,
    });
    if (built.json === null) return { json: null, warnings: built.warnings };
    // Touch method deletions (workingCopyStore.deletedTouchKeyIds) apply on
    // top of desktop mods + Phase E edits, mirroring projectWorkingCopyVfs's
    // step order (1.5 carve keycaps, then 1.6 touch deletions) — so the live
    // vfsTransform/OSK preview never shows a method the author deleted here
    // in the gallery, not just the final serialized output.
    return {
      json: applyTouchKeycapRemovalsToRawJson(built.json, deletedTouchKeyIds)
        .json,
      warnings: built.warnings,
    };
    // touchKey drives re-evaluation when charTouch changes (Map identity is
    // not stable; the key is). baseIr is a stable snapshot post-lockDesktop.
    // baseVfs is stable after instantiation but included for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, touchKey, baseVfs, mods, resolvedSeedSource, deletedTouchKeyIds]);

  const touchLayoutJson = touchLayoutResult.json;
  // Diagnostic messages for touch assignments the engine could not apply
  // (e.g. an unmatched host key/layer) — already name the char + host key +
  // layer (see applyTouchAssignmentsToRawJson's warning strings). Rendered
  // below, next to Apply/Mark, using the same visual + aria-live convention
  // as the existing "Apply warnings:" banner (GalleryPreviewPane) rather than
  // a new toast system. Recomputes on the same touchKey-driven memo as
  // touchLayoutJson — no second debounce timer (D3).
  const touchApplyWarnings = touchLayoutResult.warnings;

  // Raw (undeleted) seed — desktop mods (spec 035 R3) replayed, but NO Phase
  // E edits — via `deriveSeedLayout` (buildTouchLayoutJson.ts), the shared
  // seed-derivation implementation also used by buildTouchLayoutJson's own
  // Case A branch; do not duplicate the Case A/B branching inline here.
  // Depends only on baseIr/baseVfs/mods/resolvedSeedSource (NOT
  // touchKey/charTouch — the author's own edits are deliberately excluded,
  // per spec 035 simplification.md: "already in layout" means already in the
  // SEED), and — deliberately — NOT deletedTouchKeyIds either (see below).
  // null only when baseIr has not loaded yet.
  //
  // The author's touch-method DELETION overlay (`deletedTouchKeyIds`) is NOT
  // applied here. Kept as its own memo purely so the restore affordance below
  // (`deletedExistingTouchMethods`) can still enumerate a method the author
  // has since deleted — once removed from `detectionSeedLayout` (below), that
  // method no longer produces the character at all, so there'd be nothing
  // left to name/restore if this were the only seed layout kept around.
  const rawDetectionSeedLayout = useMemo<TouchLayoutIR | null>(() => {
    if (baseIr === null) return null;
    try {
      const baseTouchJson =
        resolvedSeedSource === "reseed-from-desktop"
          ? undefined
          : resolveBaseTouchJson(baseVfs);
      return deriveSeedLayout(baseIr, {
        ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
        mods,
        seedSource: resolvedSeedSource,
      }).layout;
    } catch (err) {
      devLog.error(
        "[TouchGallery] rawDetectionSeedLayout derivation failed:",
        err,
      );
      return null;
    }
  }, [baseIr, baseVfs, mods, resolvedSeedSource]);

  // The seed layout for the chosen seed source, with desktop mods (spec 035
  // R3) AND the author's touch-method deletions both replayed — mirroring
  // projectWorkingCopyVfs's step order (carve keycaps first via `mods`
  // baked into rawDetectionSeedLayout, then touch deletions on top). This is
  // the layout `detectedChars` (the CharScrollStrip badge source) and
  // `existingTouchMethods` (via enumerateTouchMethodsForChar) both see, so
  // deleting the sole producer of a character actually uncounts it here in
  // the gallery, not just at final VirtualFS projection.
  const detectionSeedLayout = useMemo<TouchLayoutIR | null>(() => {
    if (rawDetectionSeedLayout === null) return null;
    return applyTouchKeycapRemovalsToLayout(
      rawDetectionSeedLayout,
      deletedTouchKeyIds,
    ).layout;
  }, [rawDetectionSeedLayout, deletedTouchKeyIds]);

  // The layout the lint (18.6 touch-coverage guard) and the stage-completion
  // gate (FR-008) both audit: the derived layout INCLUDING current Phase E
  // edits when touchLayoutJson is non-null (the R11 matrix decided to emit),
  // else the effective seed (detectionSeedLayout) — a truly-untouched
  // import-adapt with a shipped layout still has a real layout to check
  // coverage against even though nothing is emitted yet. Both source memos
  // already have `deletedTouchKeyIds` baked in (touchLayoutJson via
  // applyTouchKeycapRemovalsToRawJson, detectionSeedLayout via
  // applyTouchKeycapRemovalsToLayout), so this memo inherits the deletion
  // overlay transitively — deleting the sole producer of an inventory char
  // makes touchCoverage/handleContinue see it as uncovered, not just the
  // final serialized VFS.
  const layoutForLintAndGate = useMemo<TouchLayoutIR | null>(() => {
    if (touchLayoutJson !== null) {
      try {
        return parseTouchLayout(touchLayoutJson);
      } catch (err) {
        devLog.error(
          "[TouchGallery] layoutForLintAndGate derivation failed:",
          err,
        );
        return detectionSeedLayout;
      }
    }
    return detectionSeedLayout;
  }, [touchLayoutJson, detectionSeedLayout]);

  // ---------------------------------------------------------------------------
  // Key mode (spec 058 T072/T073/T075) — the effective layout the schematic
  // grid renders from, and the ONE shared set of progress figures both touch-
  // step modes report (FR-036d).
  // ---------------------------------------------------------------------------

  // Fold the committed key-edit overlay onto the SAME effective layout the
  // FR-008 completion gate audits (layoutForLintAndGate) — never a second,
  // independently-folded copy. This is what lets the key-mode grid, the
  // shared progress figures below, and the completion gate all agree on one
  // truth about the layout's current state.
  //
  // T120 (FR-036e): the replay's `orphaned` outcome is kept, not thrown away.
  // Replay reports an unresolvable address as a FIRST-CLASS OUTCOME rather
  // than an exception (FR-033a), and an orphaned op is an author edit that
  // will not be applied — so Continue has to be able to say so instead of
  // completing the step over the top of it ("neither silently discarded").
  const keyModeOverlayReplay = useMemo<{
    layout: TouchLayoutIR | null;
    orphaned: readonly KeyEditOperation[];
  }>(() => {
    if (layoutForLintAndGate === null) return { layout: null, orphaned: [] };
    if (keyEditOverlay.ops.length === 0) {
      return { layout: layoutForLintAndGate, orphaned: [] };
    }
    try {
      const { layout, orphaned } = replayKeyEditOverlay(
        layoutForLintAndGate,
        keyEditOverlay,
      );
      return { layout, orphaned };
    } catch (err) {
      devLog.error(
        "[TouchGallery] effectiveKeyModeLayout overlay replay failed:",
        err,
      );
      return { layout: layoutForLintAndGate, orphaned: [] };
    }
  }, [layoutForLintAndGate, keyEditOverlay]);
  const effectiveKeyModeLayout = keyModeOverlayReplay.layout;

  // ONE derived source (FR-036d): "characters still unplaced" and "keys with
  // no letter" are two projections of the SAME effectiveKeyModeLayout +
  // inventory — never two independently maintained counters. The keys-with-
  // no-output scan reuses buildKeyGridViewModel (the exact function the grid
  // itself renders cells from), so this count can never disagree with what
  // the grid displays.
  //
  // Both halves read `keyModeRuleIndex` (via `keyModeCoverageOptions`), the
  // same index the completion gate and the edit-time guard use — see that
  // memo's own doc comment. A synthesized touch-key rule must move these
  // figures, the gate, and the inline warning together or not at all.
  const keyGridProgress = useMemo<{
    unplacedChars: readonly string[];
    keysWithNoOutput: readonly string[];
  }>(() => {
    if (effectiveKeyModeLayout === null || keyModeRuleIndex === undefined) {
      return { unplacedChars: inventory, keysWithNoOutput: [] };
    }
    const { uncovered } = touchCoverage(
      effectiveKeyModeLayout,
      inventory,
      keyModeCoverageOptions,
    );
    const keysWithNoOutput: string[] = [];
    for (const platform of effectiveKeyModeLayout.platforms) {
      for (const layer of platform.layers) {
        const vm = buildKeyGridViewModel({
          layout: effectiveKeyModeLayout,
          ruleIndex: keyModeRuleIndex,
          platform: platform.id,
          layerId: layer.id,
        });
        if (vm === undefined) continue;
        for (const row of vm.rows) {
          for (const cell of row.keys) {
            if (isNoOutputLetterCell(cell)) keysWithNoOutput.push(cell.address);
          }
        }
      }
    }
    return { unplacedChars: uncovered, keysWithNoOutput };
  }, [effectiveKeyModeLayout, keyModeRuleIndex, inventory, keyModeCoverageOptions]);

  // Platform catalog for the key-mode grid's platform tabs (T077 already
  // renders the tablist; this just supplies the catalog from the effective
  // layout for the currently-mounted mode's grid).
  const keyModePlatforms = useMemo<KeyGridPlatformTab[]>(() => {
    if (effectiveKeyModeLayout === null) return [];
    return effectiveKeyModeLayout.platforms.map((p) => ({
      id: p.id,
      label: touchModePlatformLabel(p.id, i18n),
    }));
  }, [effectiveKeyModeLayout, i18n]);

  const [activeKeyPlatformId, setActiveKeyPlatformId] = useState<
    string | null
  >(null);
  const [activeKeyLayerId, setActiveKeyLayerId] = useState<string>("default");
  const [selectedKeyAddress, setSelectedKeyAddress] = useState<string | null>(
    null,
  );

  // Repair the active platform whenever the catalog changes (layout just
  // loaded, or the previously-active platform id no longer exists) — falls
  // back to the first platform rather than stranding the grid unselected.
  useEffect(() => {
    if (keyModePlatforms.length === 0) return;
    setActiveKeyPlatformId((prev) =>
      prev !== null && keyModePlatforms.some((p) => p.id === prev)
        ? prev
        : (keyModePlatforms[0]?.id ?? null),
    );
  }, [keyModePlatforms]);

  const activeKeyPlatformEntry = useMemo(
    () =>
      effectiveKeyModeLayout?.platforms.find(
        (p) => p.id === activeKeyPlatformId,
      ),
    [effectiveKeyModeLayout, activeKeyPlatformId],
  );

  // Repair the active layer the same way, scoped to the active platform's
  // own layer catalog — prefers "default" (present on every real layout),
  // else the platform's first layer.
  useEffect(() => {
    if (activeKeyPlatformEntry === undefined) return;
    setActiveKeyLayerId((prev) =>
      activeKeyPlatformEntry.layers.some((l) => l.id === prev)
        ? prev
        : (activeKeyPlatformEntry.layers.find((l) => l.id === "default")
            ?.id ??
            activeKeyPlatformEntry.layers[0]?.id ??
            "default"),
    );
  }, [activeKeyPlatformEntry]);

  // The edit-time diagnostics (spec 058 T114; FR-040/FR-042). Derived from the
  // SAME `ir` / `effectiveKeyModeLayout` / `keyModeRuleIndex` / `keyEditOverlay`
  // this component already has — no new store field, and no new timer: the hook
  // is a `useMemo` over a pure join, so the findings resolve inside whichever
  // render the existing 300 ms validation cycle already schedules (Decision D3).
  //
  // `keyModeRuleIndex` (built from the MUTABLE `ir`), not `touchRuleIndex`
  // (built from `baseIr`): a rule the author just minted through AssignPanel
  // must stop the dead-key finding for that key immediately, not on the next
  // instantiation.
  const keyModeDiagnostics = useTouchKeyDiagnostics({
    ir,
    layout: effectiveKeyModeLayout,
    ruleIndex: keyModeRuleIndex,
    overlay: keyEditOverlay,
  });

  const keyModeViewModel = useMemo<KeyGridViewModel | undefined>(() => {
    if (
      effectiveKeyModeLayout === null ||
      keyModeRuleIndex === undefined ||
      activeKeyPlatformId === null
    ) {
      return undefined;
    }
    return buildKeyGridViewModel({
      layout: effectiveKeyModeLayout,
      ruleIndex: keyModeRuleIndex,
      platform: activeKeyPlatformId,
      layerId: activeKeyLayerId,
      findingsByAddress: keyModeDiagnostics.byAddress,
    });
  }, [
    effectiveKeyModeLayout,
    keyModeRuleIndex,
    activeKeyPlatformId,
    activeKeyLayerId,
    keyModeDiagnostics,
  ]);

  // Stable empty view model so useGridNav (a hook — cannot be called
  // conditionally) always has a valid argument even before a real one exists.
  const emptyKeyGridViewModel = useMemo<KeyGridViewModel>(
    () => ({ platform: "", layerId: "", direction: "ltr", rows: [] }),
    [],
  );

  const handleSelectKeyCell = useCallback((cell: KeyGridCellViewModel) => {
    setSelectedKeyAddress(cell.address);
  }, []);

  const keyModeGridNav = useGridNav({
    viewModel: keyModeViewModel ?? emptyKeyGridViewModel,
    onSelectCell: handleSelectKeyCell,
  });

  // The selected cell's OWN view model (spec 058 T085-T089 composition) —
  // KeyInspector/AssignPanel both take `selectedCell: KeyGridCellViewModel |
  // null`, matching KeyGrid's own `selectedAddress` contract. Re-derived from
  // `keyModeViewModel` rather than tracked as separate state, so it can never
  // disagree with what the grid itself is currently showing for that address.
  const selectedKeyCell = useMemo<KeyGridCellViewModel | null>(() => {
    if (keyModeViewModel === undefined || selectedKeyAddress === null) {
      return null;
    }
    for (const row of keyModeViewModel.rows) {
      const found = row.keys.find((k) => k.address === selectedKeyAddress);
      if (found !== undefined) return found;
    }
    return null;
  }, [keyModeViewModel, selectedKeyAddress]);

  // FR-034's honest provenance statement — the same resolvedSeedSource this
  // gallery already threads through buildTouchLayoutJson/deriveSeedLayout
  // above, not a second detection.
  const keyModeProvenance: KeyGridProvenance =
    resolvedSeedSource === "reseed-from-desktop"
      ? "derived-from-base"
      : "imported-existing";

  // AssignPanel's T059 provenance-promotion fold (spec 058 T085-T089
  // composition) — see AssignPanel.tsx's own module doc, "Two write paths
  // bundled into one commit": Case A (reseed/derived-from-base) backs the
  // layout with `ir.touchLayout`; Case B (imported-existing) backs it with
  // the raw `touchLayoutJson` store field. `keyModeProvenance` above is
  // already the single source for which case applies — reused here rather
  // than a second Case A/B branch.
  //
  // T119 (US5 AS3): `inventoryChars` is the SAME collated confirmed inventory
  // `handleContinue`'s FR-008 gate audits, and `keyModeRuleIndex` is the SAME
  // index that gate resolves coverage through (`keyModeCoverageOptions`). Both
  // halves have to match for `blocksContinue` to predict the gate rather than
  // guess at it — the index half was wrong at first and is what let the inline
  // warning stay silent about a character the gate then refused (FR-036d).
  const keyEditGuardsOptions = useMemo(
    () => ({
      layout: effectiveKeyModeLayout ?? EMPTY_TOUCH_LAYOUT,
      ...(keyModeRuleIndex !== undefined ? { ruleIndex: keyModeRuleIndex } : {}),
      inventoryChars: inventory,
      i18n,
    }),
    [effectiveKeyModeLayout, keyModeRuleIndex, inventory, i18n],
  );
  const {
    checkOperation: checkKeyEditOperation,
    checkRejections: checkKeyEditRejectionNotices,
  } = useKeyEditGuards(keyEditGuardsOptions);

  // T118 (FR-045): the REFUSAL surface, deliberately separate state from the
  // invalidation warnings below. The two are different verdicts with opposite
  // consequences — an invalidation warning describes an edit that DID happen
  // and is allowed to (FR-036f: "an editor must permit invalid intermediate
  // states"), while a rejection describes one that did NOT. Sharing one banner
  // would make "we saved this, look out" and "we did not save this" read alike.
  const [keyEditRejections, setKeyEditRejections] = useState<
    readonly KeyEditRejectionNotice[]
  >([]);
  // A confirmable rejection the author has acknowledged (`address:reason`), so
  // the second attempt at the SAME edit goes through. Keyed per edit rather than
  // as a single boolean so acknowledging one soft block never silently waives an
  // unrelated one on the next key.
  const [acknowledgedRejections, setAcknowledgedRejections] = useState<
    ReadonlySet<string>
  >(() => new Set());
  useEffect(() => {
    setKeyEditRejections([]);
  }, [selectedKeyAddress]);

  // FR-036f: the invalidation warning surfaces AT THE MOMENT of the edit
  // (checked synchronously in handleAssignPanelCommit below, before the
  // commit lands) — never deferred to the Continue gate. Cleared on a new
  // selection so a stale warning from a previous key never lingers.
  const [keyEditInvalidationWarnings, setKeyEditInvalidationWarnings] =
    useState<readonly KeyEditInvalidationWarning[]>([]);
  useEffect(() => {
    setKeyEditInvalidationWarnings([]);
  }, [selectedKeyAddress]);

  // T106 (FR-062): the characters a KEY EDIT has actually sent back to the
  // unplaced worklist — accumulated across commits, deliberately NOT re-derived
  // from the layout. This exists because "is this character currently
  // unplaced" and "did an edit of mine take its last mechanism away" are
  // different questions, and only the second one may re-open the by-character
  // walk. `keyGridProgress.unplacedChars` answers the first, and it legitimately
  // includes characters that were NEVER in the walk to begin with — a character
  // the shipped layout carries on a `T_` key with no rule behind it is
  // *detected* (it is in the file) yet *uncovered* (striking it produces
  // nothing), and the entry-parity rule (see `touchLettersToAdd` below) keeps
  // such a character out of the walk on purpose, reachable by its
  // CharScrollStrip chip instead. Folding the raw uncovered set into the walk
  // would drag every one of those in and silently move the walk's entry point,
  // so membership here is what bounds re-entry to characters an edit really
  // invalidated (`returnsToWorklist`, classified by `useKeyEditGuards`, itself
  // already scoped to characters the by-character walk had assigned).
  // `unplacedChars` remains the AUTHORITY on whether such a character is
  // *still* unplaced — the two are intersected, never summed (FR-036d: one
  // derived source, never two counters that can disagree), so re-placing a
  // returned character drops it back out of the walk on its own.
  const [returnedToWorklistChars, setReturnedToWorklistChars] = useState<
    readonly string[]
  >([]);

  // ONE commit call site for AssignPanel's `onCommit` (spec 058 T085-T089
  // composition) — reuses the EXISTING key-edit overlay / undo-stack action
  // (`commitKeyEdit`, landed in Phase 5b) and the EXISTING overlay-preserving
  // IR setter (`setWorkingIR`, spec-014's mutate seam) rather than adding a
  // second write path. AssignPanel itself never calls either — see that
  // file's own module doc, "Store-free, like every other file in this
  // directory".
  const handleAssignPanelCommit = useCallback(
    (result: AssignPanelCommitResult) => {
      // T118 (FR-045) FIRST: there is no point warning about a lost character
      // for an edit that is about to be refused. A hard rejection returns
      // without touching the store at all — that is what "the invalid state
      // never exists" means, and why no finding is emitted for it.
      const rejections = checkKeyEditRejectionNotices(result.op);
      const unwaived = rejections.filter(
        (r) => r.blocking || !acknowledgedRejections.has(`${result.op.address}:${r.reason}`),
      );
      if (unwaived.length > 0) {
        setKeyEditRejections(unwaived);
        // A confirmable rejection is recorded as acknowledged NOW, so repeating
        // the same edit proceeds. Propose-then-confirm (spec v1.3.1 §3c): the
        // first attempt states the risk, the second carries it out.
        const waivable = unwaived.filter((r) => !r.blocking);
        if (waivable.length > 0) {
          setAcknowledgedRejections((prev) => {
            const next = new Set(prev);
            for (const r of waivable) next.add(`${result.op.address}:${r.reason}`);
            return next;
          });
        }
        return;
      }
      setKeyEditRejections([]);

      const warnings = checkKeyEditOperation(result.op);
      setKeyEditInvalidationWarnings(warnings);

      const store = useWorkingCopyStore.getState();
      store.commitKeyEdit(result.op);

      if (result.nextIr !== undefined) {
        store.setWorkingIR(result.nextIr);
      }

      if (keyModeProvenance === "derived-from-base") {
        const base = result.nextIr ?? store.ir;
        if (base !== null) {
          store.setWorkingIR({ ...base, touchLayout: result.promotedLayout });
        }
      } else {
        store.setTouchLayoutJson(emitTouchLayout(result.promotedLayout));
      }

      // T106 (FR-062): a character this edit invalidated AND that has lost
      // its LAST mechanism anywhere in the layout (`returnsToWorklist` —
      // never merely "invalidated at this address"; see useKeyEditGuards.ts)
      // must return to the unplaced worklist and be OFFERED for
      // re-placement, not merely reported. Its recorded `charTouch` entry now
      // names a mechanism this commit just erased, so pruning the entry is
      // what makes the character-mode gallery re-offer the method chooser
      // for it instead of continuing to show a stale "existing methods" list
      // for a placement that no longer exists. A character still available
      // elsewhere (`returnsToWorklist: false`, FR-061) keeps its `charTouch`
      // entry untouched — it is not lost, so it must not be treated as such
      // here either.
      const lostForGood = warnings.filter((w) => w.returnsToWorklist).map((w) => w.char);
      if (lostForGood.length > 0) {
        setCharTouch((prev) => {
          let next: Map<string, TouchAssignment> | null = null;
          for (const ch of lostForGood) {
            if (prev.has(ch)) {
              if (next === null) next = new Map(prev);
              next.delete(ch);
            }
          }
          return next ?? prev;
        });
        // Pruning the assignment above only stops the gallery showing a stale
        // "existing methods" list for the erased placement; it does not by
        // itself put the character back in front of the author, because the
        // walk's own membership test reads `detectedChars` — a SEED-time
        // snapshot that still remembers the placement this commit just took
        // away. Recording the character here is what actually re-offers it
        // (see `returnedToWorklistChars`' declaration for why this is recorded
        // rather than re-derived).
        setReturnedToWorklistChars((prev) => {
          const merged = new Set(prev);
          const before = merged.size;
          for (const ch of lostForGood) merged.add(ch);
          return merged.size === before ? prev : [...merged];
        });
      }

      // touchKeyAddress.ts builds the address from the key's OWN id, so a
      // "set" op that renames the key (the U_/T_ minting path — virtually
      // always) changes the address that SAME key now resolves under. Follow
      // it — a successful commit must not silently strand the selection (and
      // with it, the inspector/panel, which both read `selectedKeyCell`
      // derived from this address) on an address nothing answers to anymore.
      if (result.op.kind === "set" && result.op.fields.id !== undefined) {
        const parts = parseTouchKeyAddress(result.op.address);
        if (parts !== undefined) {
          setSelectedKeyAddress(touchKeyAddress(parts.platform, parts.layerId, result.op.fields.id));
        }
      }
    },
    [
      checkKeyEditOperation,
      checkKeyEditRejectionNotices,
      acknowledgedRejections,
      keyModeProvenance,
    ],
  );

  // Grid Enter -> AssignPanel's character field (SC-004's keyboard-only
  // path): a native gridcell <button> already answers Enter/Space with its
  // own click (== onSelectCell, already redundant with arrow-key selection),
  // so this ADDS the "move focus into the editing surface" half. Queries by
  // the SAME stable `data-testid` AssignPanel already renders (rather than a
  // new ref prop) — the same by-attribute convention
  // `useKeyInspectorFocusBridge.handleEscape` (KeyInspector.tsx) uses for its
  // own cell lookup. Composed ALONGSIDE `useGridNav`'s own handler (which
  // never touches Enter — RECOGNIZED_KEYS there is arrows/Home/End only), not
  // instead of it.
  const keyModeDetailContainerRef = useRef<HTMLDivElement | null>(null);
  const handleKeyModeGridKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      keyModeGridNav.handleKeyDown(e);
      if (e.defaultPrevented) return;
      if (e.key !== "Enter") return;
      const target = e.target;
      if (!(target instanceof Element) || target.closest('[role="gridcell"]') === null) {
        return;
      }
      e.preventDefault();
      keyModeDetailContainerRef.current
        ?.querySelector<HTMLInputElement>('[data-testid="assign-panel"] input')
        ?.focus();
    },
    [keyModeGridNav],
  );

  // Escape anywhere in the grid/inspector/panel detail region returns focus
  // to the selected cell — one handler at the container level (rather than
  // one per child) so it covers AssignPanel too, which (being store-free, see
  // its own module doc) exposes no `onEscape` prop of its own.
  const handleKeyModeDetailEscape = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Escape" || selectedKeyAddress === null) return;
      const container = keyModeDetailContainerRef.current;
      const cellEl = container?.querySelector<HTMLElement>(
        '[role="gridcell"][aria-selected="true"]',
      );
      cellEl?.focus();
    },
    [selectedKeyAddress],
  );

  // T076 (FR-036g): the undo affordance's description, derived from the top
  // of the SAME shared undoStack `undoDelete` pops from.
  const undoTargetDescription = useMemo(
    () =>
      describeUndoTarget(undoStack[undoStack.length - 1], keyEditOverlay.ops),
    [undoStack, keyEditOverlay],
  );

  // ---------------------------------------------------------------------------
  // ONE call site for a mode switch (T074 seam — do not scatter
  // setTouchEditorMode calls across the tab click handler, the tablist's
  // keyboard handler, and the propose-banner's accept button).
  //
  // FR-036c (T074, useModeContextCarry.ts — a sibling task, not implemented
  // here) needs to select/reveal the producing key(s) when switching
  // character->key, and land on a produced character when switching
  // key->character. Every mode switch in this file — tab click, tab
  // Left/Right/Home/End, and the T073 propose-banner's "Switch to key view" —
  // already routes through this one function, so that hook has exactly one
  // place to wrap (or this function can be extended in place) rather than
  // three independent call sites that could drift.
  // ---------------------------------------------------------------------------
  const handleSwitchTouchEditorMode = useCallback(
    (mode: TouchEditorMode) => {
      setTouchEditorMode(mode);
    },
    [setTouchEditorMode],
  );

  // VFS transform: the shared working-copy projection factory (T054), NOT a
  // hand-rolled local transform. The previous local `vfsTransform` here
  // injected only `touchLayoutJson` directly into the VFS and never called
  // projectWorkingCopyVfs — so the touch preview showed no carve, no
  // identity, and no keycap-label projection (a preview-identity gap, R10.2:
  // the preview and the emitted artifact disagreed). useWorkingCopyTransform
  // runs the full projection order (carve -> key-edit overlay -> assignments
  // -> layer propagation -> identity), with the touch layout half supplied
  // via `liveLayoutOverride` — this gallery's own in-progress
  // `touchLayoutJson` (derived above from `charTouch`, ahead of the Phase E
  // commit that would otherwise write it to the store) plus the committed
  // key-edit overlay ops. previewedBaseId is intentionally omitted: this is
  // a post-commit gallery with no candidate-base picker of its own (see the
  // hook's own previewedBaseId doc comment).
  const vfsTransform = useWorkingCopyTransform({
    liveLayoutOverride: {
      touchLayoutJson,
      keyEditOps: keyEditOverlay.ops,
    },
  });

  const { stage, retry } = useKeyboardArtifact(
    baseKeyboard,
    scaffoldSpec,
    vfsTransform,
  );

  // ---------------------------------------------------------------------------
  // Phase C desktop assignments — moved up from its old position (further
  // down, alongside the "existing methods" section) because
  // desktopSuggestionTargets/touchLettersToAdd below need it before either of
  // those can be declared. Only depends on phaseResults (read near the top of
  // the component alongside the other spec 035 R3 mods inputs), so the reorder
  // carries no behavior change.
  // ---------------------------------------------------------------------------
  const desktopAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical" && a.scope === "individual",
      ),
    [phaseResults],
  );

  // ---------------------------------------------------------------------------
  // detectedChars + touchLettersToAdd — entry-parity fix (mirrors
  // MechanismGallery's lettersToAdd/alreadyProduced split via useInventoryDiff)
  // ---------------------------------------------------------------------------
  //
  // detectedChars ("already in touch layout" — powers the read-only
  // existing-implementation display; nothing is recorded for a detected
  // character) is derived from detectionSeedLayout (the chosen seed source +
  // replayed desktop mods, see the `detectionSeedLayout` memo above) via the
  // shared engine touchCoverage traversal, rather than an inline
  // scaffoldTouchLayout(baseIr) walk — see spec 035
  // contracts/simplification.md. touchCoverage's `uncovered` set is inverted
  // against `inventory` (touchCoverage only ever answers "is this inventory
  // char reachable", so a covered-set derived this way is a faithful
  // replacement for the old any-char scaffold-walk set: the suggestion logic
  // below only ever queries inventory chars).
  //
  // Declared here (moved up from its old position further down) — earlier
  // than currentChar/usePositionalCharNav below — because touchLettersToAdd
  // (the walk list) needs it before either of those can be declared.
  //
  // Deliberately NOT session-aware (does not take desktopProducedSet): this
  // memo drives touchLettersToAdd (the interactive walk denominator below),
  // which must stay static across a session — see this file's
  // desktopProducedSet declaration comment and useInventoryDiff.ts's module
  // doc for why. The session-aware completion check lives in handleContinue
  // below instead.
  const detectedChars = useMemo<Set<string>>(() => {
    if (detectionSeedLayout === null) return new Set<string>();
    try {
      const { uncovered } = touchCoverage(detectionSeedLayout, inventory, coverageOptions);
      const uncoveredSet = new Set(uncovered);
      return new Set(inventory.filter((c) => !uncoveredSet.has(c)));
    } catch (err) {
      devLog.error("[TouchGallery] detectedChars coverage failed", err);
      return new Set<string>();
    }
    // inventoryKey is the stable primitive proxy for `inventory` (declared
    // above, before this memo) — same precedent as touchKey/modsDepsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionSeedLayout, inventoryKey, coverageOptions]);

  // Characters with an ACTIONABLE Phase C desktop suggestion — a Phase C
  // physical assignment whose mechanism extractMechanismHostKey can turn into
  // a concrete longpress/replace suggestion (mirrors the `suggestion` memo's
  // own first branch below, which checks desktopAssignments BEFORE
  // detectedChars and always raises a card for these regardless of detection
  // status). Needed so touchLettersToAdd (below) does not exclude a character
  // that is only trivially "detected" via its own Phase C mod being replayed
  // onto the seed layout (a naive default key mapping) but still has a real
  // suggestion the author hasn't reviewed yet — excluding those would hide
  // the longpress/replace suggestion card entirely, not just skip an inert
  // walk stop.
  const desktopSuggestionTargets = useMemo(() => {
    const targets = new Set<string>();
    for (const a of desktopAssignments) {
      const m = a.mechanisms[0];
      if (m !== undefined && extractMechanismHostKey(m) !== undefined) {
        targets.add(a.target);
      }
    }
    return targets;
  }, [desktopAssignments]);

  // The walk list — inventory MINUS the characters that are BOTH detected
  // (reachable on the seed touch layout) AND have no actionable suggestion
  // left to review, mirroring MechanismGallery's lettersToAdd (which excludes
  // alreadyProduced from the walk entirely rather than stepping through it
  // read-only). This is the entry-parity fix: a character with nothing left
  // to configure is never a Back/Next/Skip stop, so the author lands on the
  // first actionable suggestion on entry instead of paging past inherited
  // content — while a character that IS detected but still carries an
  // unreviewed Phase C suggestion (desktopSuggestionTargets) stays a walk
  // stop, since that suggestion card is exactly how the author reviews/
  // upgrades the naive default mapping. `inventory` itself (the full SHOW-ALL
  // list) still feeds CharScrollStrip for display/inspection — only the walk
  // narrows.
  //
  // T106 (FR-062): a character that has lost its LAST mechanism to a key-mode
  // edit (T072+) — typically a suppress/remove of its only producing key —
  // MUST re-enter this walk, even though `detectedChars` and
  // `desktopSuggestionTargets` (both seed/Phase-C snapshots, oblivious to any
  // later key-mode edit) still remember the placement that edit erased. That
  // is what turns "return to the unplaced worklist... and are offered for
  // re-placement" from a mere count into an actual Back/Next/Skip/chip stop
  // again. The test is the INTERSECTION of two things, and needs both halves:
  // `returnedToWorklistChars` (an edit really took this character's last
  // mechanism — see its declaration above for why the raw uncovered set is
  // the wrong input here, and what entry-parity regression that caused) and
  // `keyGridProgress.unplacedChars` (it is STILL unplaced — the same
  // `touchCoverage`-derived truth the shared progress figures report, so this
  // is never a second, independently-derived "is this placed" check, and a
  // re-placement silently retires the re-entry).
  //
  // lowercaseFirst (lib/caseOrder.ts) — same stable lowercase-before-uppercase
  // walk-order helper MechanismGallery's lettersToAdd uses (via
  // useInventoryDiff.ts), so the case-pair companion's precondition (the
  // lowercase implemented before its uppercase counterpart is even reached)
  // holds in both galleries, not just the desktop one.
  const unplacedCharsKey = keyGridProgress.unplacedChars.join("\0");
  const returnedToWorklistKey = returnedToWorklistChars.join("\0");
  const touchLettersToAdd = useMemo(() => {
    const unplacedSet = new Set(keyGridProgress.unplacedChars);
    const returnedSet = new Set(returnedToWorklistChars);
    return lowercaseFirst(
      inventory.filter(
        (c) =>
          !detectedChars.has(c) ||
          desktopSuggestionTargets.has(c) ||
          (returnedSet.has(c) && unplacedSet.has(c)),
      ),
    );
    // inventoryKey/unplacedCharsKey/returnedToWorklistKey are the stable
    // primitive proxies for `inventory`/`keyGridProgress.unplacedChars`/
    // `returnedToWorklistChars` — same precedent as detectedChars above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    detectedChars,
    desktopSuggestionTargets,
    inventoryKey,
    unplacedCharsKey,
    returnedToWorklistKey,
  ]);
  const touchLettersToAddKey = touchLettersToAdd.join("\0");

  // Current character index — synced with touchLettersToAdd (the walk list,
  // NOT the full inventory — see above). Declared here (moved up from its
  // later position) so both handleContinue and usePositionalCharNav below
  // can reference it; this state is otherwise independent of the intervening
  // code, so the reorder carries no behavior change.
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  // Previous run's touchLettersToAdd — feeds nearestSurvivingChar's "where was
  // this character before the reflow" lookup below (same pattern
  // MechanismGallery uses for its own lettersToAdd resync).
  const prevTouchLettersToAddRef = useRef<readonly string[]>(touchLettersToAdd);

  // Sync currentChar when the walk list loads or changes.
  useEffect(() => {
    setCurrentChar((prev) => {
      if (touchLettersToAdd.length === 0) return null;
      // Keep current char if it's still in the walk list — by NFC identity
      // (indexOfChar), not raw equality, so a representation change (e.g.
      // collateInventory's NFC-dedup) doesn't spuriously look like a removal.
      if (prev !== null && indexOfChar(touchLettersToAdd, prev) !== -1) return prev;
      if (prev === null) {
        // ARRIVAL POSITION — a stored cursor outranks the heuristic below; it is
        // either where the author was before a tab switch unmounted this gallery
        // or the character a footer dot asked for. Same rule MechanismGallery
        // applies to its own walk; see lib/stepWalk.ts.
        const requested = cursorCharIn(peekStepCursor(TOUCH_STEP_ID), touchLettersToAdd);
        if (requested !== null) return requested;
        // First-ever pick — prefer the first unconfigured char.
        return (
          touchLettersToAdd.find((c) => !charTouch.has(c)) ??
          touchLettersToAdd[0] ??
          null
        );
      }
      // `prev` was removed by this reflow — fall back to the NEAREST
      // surviving neighbor (shaped-bug fix, walk-order/indexing) rather than
      // jumping to "first unconfigured"/list[0]. See
      // usePositionalCharNav.ts's `nearestSurvivingChar` doc comment.
      return nearestSurvivingChar(prevTouchLettersToAddRef.current, prev, touchLettersToAdd);
    });
    prevTouchLettersToAddRef.current = touchLettersToAdd;
    // Only re-run when the walk list itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchLettersToAddKey]);

  // FR-008 completion gate (mechanism-gallery-progression): names of chars
  // with no reachable touch mechanism on the final layout — computed LIVE
  // (not only on a click attempt) so the completion control can be disabled
  // PROACTIVELY, matching MechanismGallery's Done gating. Mirrors
  // handleContinue's own `touchCoverage` call exactly (same inputs — see the
  // T120/key-mode reconciliation note there): `effectiveKeyModeLayout` (which
  // IS `layoutForLintAndGate` whenever the key-edit overlay is empty) +
  // `keyModeCoverageOptions` (the mutable-`ir` rule index both the key-mode
  // grid and the gate resolve coverage through) + `desktopProducedSet`. Kept
  // as one shared memo — read by BOTH `handleContinue` and the proactive
  // button-disable below — so the two can never disagree about what counts
  // as uncovered.
  const uncoveredTouchChars = useMemo<string[]>(() => {
    if (effectiveKeyModeLayout === null) return [];
    return [
      ...touchCoverage(
        effectiveKeyModeLayout,
        inventory,
        keyModeCoverageOptions,
        desktopProducedSet,
      ).uncovered,
    ];
  }, [effectiveKeyModeLayout, inventory, keyModeCoverageOptions, desktopProducedSet]);

  // Bind this walk to the shared within-step position model — one footer dot per
  // character, and a jump into the middle of the walk lands. Declared AFTER the
  // sync effect above, which owns the arrival position (see the hook's header).
  const isCharConfigured = useCallback((char: string) => charTouch.has(char), [charTouch]);
  useCharWalkPosition({
    stepId: TOUCH_STEP_ID,
    list: touchLettersToAdd,
    currentChar,
    setCurrentChar,
    isDone: isCharConfigured,
  });

  // Mark-aware "still needs an assignment or a mark before Done is offered"
  // list — a SEPARATE derivation layered on top of `uncoveredTouchChars`
  // (implemented-only, UNCHANGED above), never threaded back into it. See
  // lib/accountedForGate.ts's module doc: the Phase F hard gate / export gate
  // read a DIFFERENT hook (hooks/useInventoryCoverageGate.ts) and never this
  // local list, so marks recorded here cannot relax those. This is also the
  // exact set `handleContinue` gates on for the key-mode pane's Continue
  // control (T120) — a marked character unblocks Done/Continue in EITHER
  // touch-editing mode, not just the by-character walk.
  const unaccountedTouchChars = useMemo(
    () => subtractMarked(uncoveredTouchChars, markedTouchSet),
    [uncoveredTouchChars, markedTouchSet],
  );

  // T120 (FR-036e): the key-edit overlay's half of "committed or explicitly
  // resolved". `true` once the author has been shown the orphaned-edit notice
  // at Continue, so the second Continue completes. Component-local, and NOT a
  // store field: it records that a message has been READ, not anything about
  // the working copy — the overlay itself is untouched either way, which is
  // what "neither silently discarded" requires. Reset whenever the overlay
  // changes (below), so a NEW orphan is never waived by an earlier
  // acknowledgement.
  const [orphanedEditsAcknowledged, setOrphanedEditsAcknowledged] =
    useState(false);

  // Named string local for the FR-008 inline hint rendered near the
  // completion control below — null hides the hint entirely.
  const unaccountedTouchMessage = useMemo(
    () =>
      unaccountedTouchChars.length > 0
        ? unaccountedTouchChars.map((c) => formatUncoveredTouchMessage(c)).join("; ")
        : null,
    [unaccountedTouchChars],
  );

  // T120: a NEW orphan is never waived by an earlier acknowledgement. Keyed on
  // the overlay itself rather than on `touchKey` above, because the overlay is
  // the thing whose orphan set can change (a fresh commit, an undo, or a live
  // re-derivation of the Case A seed) — and it changes independently of the
  // by-character draft that `touchKey` tracks.
  useEffect(() => {
    setOrphanedEditsAcknowledged(false);
  }, [keyEditOverlay]);

  // Emit only chars where a real (non-inherited) or inherited assignment was
  // explicitly accepted — everything in charTouch was put there by the user.
  // `.some()` rather than `mechanisms[0]` (regression 3, multi-method): a
  // character can carry several mechanisms, so any real (non-inherited) one
  // qualifies it, not just whichever happens to be first in the array.
  const finalizeCompletion = useCallback(() => {
    const assignments: TouchAssignment[] = [...charTouch.values()].filter((a) =>
      a.mechanisms.some((m) => m.patternId !== "touch_inherited"),
    );
    onComplete(assignments);
  }, [charTouch, onComplete]);

  // Completion — declared before usePositionalCharNav below because the hook
  // calls it directly when forward navigation reaches the last character (the
  // last character's forward button IS the phase completion, not a further
  // navigation step).
  //
  // Defense-in-depth no-op guard (mechanism-gallery-progression; reconciled
  // with T120 below): no modal, ever — see the "no modal, ever" describe
  // block in TouchGallery.test.tsx and MechanismGallery's matching
  // "Done-blocked inline hint (no modal)" suite. The by-character pane's
  // forward button (`touchForwardButton` below) AND the key-mode pane's
  // Continue button (`touch-key-mode-continue`) are BOTH disabled proactively
  // while `unaccountedTouchChars` (mark-aware; see that memo above — it
  // re-runs touchCoverage on the effective layout, `effectiveKeyModeLayout`,
  // using `keyModeCoverageOptions` + the session-aware `desktopProducedSet`,
  // so it can never disagree with either button's own disabled computation)
  // is non-empty — so this callback should be unreachable via either control
  // in the ordinary walk. Kept as a guard rather than removed, in case a
  // future button branch omits the same check.
  //
  // T120 (FR-036e) — "either mode MUST be able to complete the step":
  //
  //   * The gate is ONE function, shared by both modes' Continue controls
  //     (`touch-key-mode-continue` in the key pane, the Done/Skip control in
  //     the character pane), and it tests coverage (mark-aware) ONLY. It
  //     reads no mode state whatsoever — deliberately, because an author
  //     "MUST never have to switch modes in order to move on".
  //   * It audits the OVERLAY-FOLDED layout, not the unfolded one. That is
  //     what makes by-key work actually count toward completion: several key
  //     commands (`useKeyCommands`' add/remove/suppress) write only the
  //     overlay, so a gate reading `layoutForLintAndGate` would refuse to
  //     credit a coverage gap the author had just fixed in the key view — the
  //     precise "you must go do it in the other mode" failure FR-036e forbids.
  //     It is also the SAME layout `keyGridProgress` derives its shared
  //     figures from, so the gate's verdict and the progress figures cannot
  //     disagree (FR-036d), and the same one T119's `blocksContinue` predicts.
  //   * Both in-progress surfaces are accounted for, neither silently
  //     discarded: the by-character draft is emitted by `finalizeCompletion`
  //     below, and the key-edit overlay is durable store state that has
  //     already been folded into the audited layout. The one case where an
  //     overlay op does NOT reach the layout is an ORPHANED op (its address no
  //     longer resolves — FR-033a's first-class outcome), and that is reported
  //     here rather than stepped over — via the inline `completionGateNotice`
  //     paragraph, never a modal: completion pauses once to say which edits
  //     could not be applied, and only a second, explicit Continue proceeds.
  //     The ops themselves are never dropped by this gate.
  const handleContinue = useCallback(() => {
    if (unaccountedTouchChars.length > 0) return;
    // Coverage passes. Before completing, resolve the other in-progress
    // surface explicitly (see the T120 note above): an orphaned overlay op is
    // author work that will not be applied, so it is stated once and
    // acknowledged rather than silently carried past the end of the step.
    if (keyModeOverlayReplay.orphaned.length > 0 && !orphanedEditsAcknowledged) {
      setOrphanedEditsAcknowledged(true);
      return;
    }
    finalizeCompletion();
  }, [
    unaccountedTouchChars,
    keyModeOverlayReplay,
    orphanedEditsAcknowledged,
    finalizeCompletion,
  ]);

  // Positional Back/Next/Skip/Previous navigation + suggestion-dismissal
  // tracking — shared with MechanismGallery via usePositionalCharNav so the
  // two galleries cannot drift (see that hook for the Back/Next/Previous
  // rationale, including the idx === -1 defense-in-depth guard). `list` is
  // touchLettersToAdd (NOT the full inventory) — mirrors MechanismGallery's
  // `list: lettersToAdd`, the entry-parity fix: a detected/already-covered
  // character is never a walk stop. initialSuggestionResolved rehydrates the
  // resolved set from the store draft on mount (mirrors charTouch) so a
  // resolved suggestion never reappears after back-navigation + unmount/
  // remount.
  const {
    currentIdx,
    hasAnotherCharAfterCurrent,
    handleNext,
    handleBack,
    suggestionResolved,
    markSuggestionResolved,
  } = usePositionalCharNav({
    list: touchLettersToAdd,
    currentChar,
    setCurrentChar,
    onComplete: handleContinue,
    onBack,
    initialSuggestionResolved: touchDraft?.suggestionResolvedChars,
  });

  // Select-by-value for the CharScrollStrip's SHOW-ALL display list —
  // mirrors MechanismGallery's handleSelectDisplayChar. usePositionalCharNav's
  // own handleSelectChar is gated on `list` (touchLettersToAdd), so clicking
  // an already-detected chip through it would be a no-op — deliberately,
  // since Back/Next/Skip must never step onto a char outside the walk order.
  // This sibling handler jumps to ANY character in the full `inventory` (in
  // or out of touchLettersToAdd) purely for inspection, without touching the
  // positional walk state. A no-op when `char` isn't in `inventory` at all
  // (defense-in-depth — every chip CharScrollStrip renders is itself drawn
  // from `inventory`).
  const handleSelectDisplayChar = useCallback(
    (char: string) => {
      if (!inventory.includes(char)) return;
      setCurrentChar(char);
    },
    [inventory, setCurrentChar],
  );

  // ArrowLeft/ArrowRight character cycling, attached at the PANE level (the
  // leftContent wrapping div below) rather than on CharScrollStrip itself —
  // this is the actual fix for the touch gallery: selecting a character here
  // resets a large chooser subtree (method/hostKey/flick/layer state, right
  // below) that can pull DOM focus off the strip's chip, which silently
  // killed a chip-scoped keydown handler. See useCharCycleKeys.ts. Reuses
  // `handleSelectDisplayChar` — the SAME handler CharScrollStrip's chip
  // onClick calls (below) — so arrow-keys and clicks share exactly one
  // selection call site and both jump to any character in the full inventory.
  const handlePaneKeyDown = useCharCycleKeys({
    chars: inventory,
    currentChar,
    onSelectChar: handleSelectDisplayChar,
  });

  // Intro splash — shown once when the author first enters the touch gallery so
  // the move from the desktop (physical) gallery to touch is explicit. The
  // store flag persists "seen" across unmount/remount, so the intro shows once
  // and not again on back-and-forth navigation to Phase C.
  const [showIntro, setShowIntro] = useState(() => !touchIntroSeen);

  // Write charTouch + suggestionResolved back to the store draft whenever
  // they change so that back-navigation (unmount) preserves in-progress
  // work, including which suggestion cards are already decided. Marks
  // (markedForLaterTouch) persist separately, in surveySessionStore — see
  // that field's own docstring — not here; navigation is purely positional
  // so there is no history stack to persist either.
  useEffect(() => {
    setTouchDraft({
      charTouchEntries: [...charTouch.entries()],
      suggestionResolvedChars: [...suggestionResolved],
      bulkAccentGroups,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charTouch, suggestionResolved, bulkAccentGroups]);

  // desktopAssignments/detectedChars/touchLettersToAdd now live earlier in
  // the component (before the currentChar-sync effect) — see those sections'
  // doc comments.

  // The BASE (pre-augmentWithComposable) touch-covered set — the direct-
  // reachability half of touchCoverage's own two-step traversal
  // (computeTouchCoverage, then augmentWithComposable — see engine's
  // touchCoverage.ts), computed directly against the SAME detectionSeedLayout
  // `detectedChars` above already uses. Feeds collectCompositionMethod below:
  // composition must stay strictly ONE level, so it needs the un-augmented
  // set, never `detectedChars` itself (which IS already augmented).
  const baseTouchCoveredSet = useMemo<Set<string>>(() => {
    if (detectionSeedLayout === null) return new Set<string>();
    try {
      const { uncovered } = computeTouchCoverage(
        detectionSeedLayout,
        inventory,
        coverageOptions,
      );
      const uncoveredSet = new Set(uncovered);
      return new Set(
        inventory
          .filter((c) => !uncoveredSet.has(c))
          .map((c) => c.normalize("NFC")),
      );
    } catch (err) {
      devLog.error("[TouchGallery] baseTouchCoveredSet coverage failed", err);
      return new Set<string>();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionSeedLayout, inventoryKey]);

  // Pre-augment, desktop-session-only produced set — mirrors
  // MechanismGallery's `baseProducedSet`: `buildSessionProducedSet` does NOT
  // call `augmentWithComposable` (contrast with `desktopProducedSet` above,
  // useInventoryDiff's AUGMENTED `producedSet`, used only by the completion
  // GATE). `selectDesktopAssignments(phaseResults)` — the SAME unfiltered
  // (by scope) selector `useInventoryDiff` itself uses internally to build
  // `desktopProducedSet` — not the narrower `desktopAssignments` above (which
  // filters to `scope: "individual"` only), so this can't disagree with the
  // gate's own desktop-side produced set over a sequence/character-class-
  // scope assignment. Feeds `directTouchProducedSet` below.
  // Perf dedup (km-synthesis): `useInventoryDiff()`'s own internal
  // `sessionAssignments` is `selectDesktopAssignments(phaseResults)` — the
  // identical selector/input used here — so `rawProducedSet` from that hook
  // (above, `desktopRawProducedSet`) IS `desktopDirectProducedSet`; no need
  // to re-run `buildSessionProducedSet` a second time per render.
  const desktopDirectProducedSet = desktopRawProducedSet;

  // Pre-augment, SESSION-AWARE direct touch-produced set — signal (c)'s
  // (COMPOSITION) input for charMechanisms.ts's getProducerBadge (replaces
  // the former `sessionDetectedChars` directTargets-exclusion workaround,
  // same bug class as MechanismGallery's old `alreadyProducedSet`). Folds
  // THIS session's touch edits (`layoutForLintAndGate`, direct reachability
  // only — never itself run through `augmentWithComposable`) together with
  // `desktopDirectProducedSet` (this session's desktop physical assignments,
  // also pre-augment) so a touch inventory char composable only because its
  // combining-mark component was assigned a method THIS session (touch OR
  // desktop) is visible to `composableComponentsFor` immediately. Feeds ONLY
  // the CharScrollStrip badge below and the "Existing methods" floor-row
  // check further down — NEVER `touchLettersToAdd` (the walk denominator)
  // and never currentChar's advance logic, so walk membership and the
  // documented no-auto-advance/no-skip invariants are untouched. No
  // directTargets exclusion needed here — getProducerBadge sums its three
  // signals directly, so a char both directly touch-assigned AND composable
  // now correctly badges 2, not double-counting-or-1.
  const directTouchProducedSet = useMemo<ReadonlySet<string>>(() => {
    if (layoutForLintAndGate === null) return desktopDirectProducedSet;
    try {
      const { uncovered } = computeTouchCoverage(layoutForLintAndGate, inventory);
      const uncoveredSet = new Set(uncovered);
      const out = new Set<string>(
        inventory.filter((c) => !uncoveredSet.has(c)).map((c) => c.normalize("NFC")),
      );
      for (const ch of desktopDirectProducedSet) out.add(ch);
      return out;
    } catch (err) {
      devLog.error(
        "[TouchGallery] directTouchProducedSet coverage failed",
        err,
      );
      return desktopDirectProducedSet;
    }
    // inventoryKey is the stable primitive proxy for `inventory` — same
    // precedent as detectedChars/baseTouchCoveredSet above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutForLintAndGate, inventoryKey, desktopDirectProducedSet]);

  // Own-session TOUCH-modality direct targets — characters `charTouchAssignments`
  // (THIS session's own charTouch map) already targets with at least one REAL
  // (non-`touch_inherited`) mechanism, individual scope. Subtracted out of
  // `directTouchProducedSet` below (`touchBaseDirectSet`) so signal (a)
  // BASE-DIRECT and signal (b) SESSION-DIRECT (`directProducesCount` over
  // `charTouchAssignments`, `touchBaseDirectSet`'s own doc comment explains
  // why) stay DISJOINT once signal (a) is made session-aware. Same
  // `scope`/`modality`/`touch_inherited` predicate `directProducesCount`
  // itself applies — kept in sync deliberately, not re-derived loosely.
  const touchOwnDirectTargets = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    for (const a of charTouchAssignments) {
      if (
        a.modality === "touch" &&
        a.scope === "individual" &&
        a.mechanisms.some((m) => m.patternId !== "touch_inherited")
      ) {
        out.add(a.target);
      }
    }
    return out;
  }, [charTouchAssignments]);

  // LIVE BASE-DIRECT signal (a) source for touch (bug fix — replaces the
  // FROZEN `baseTouchCoveredSet` at every getProducerBadge/allCharsCovered
  // call site below and at the CharScrollStrip badge prop). `baseTouchCoveredSet`
  // is computed once from `detectionSeedLayout`, which deliberately EXCLUDES
  // this session's own `charTouch` edits (see its own doc comment) — so a
  // character reachable only via a seed touch key that the author's
  // "replace" action later overwrote with a DIFFERENT character stayed
  // reported covered by that set FOREVER, disagreeing with `handleContinue`'s
  // live gate (`touchCoverage(layoutForLintAndGate, ...)`, which correctly
  // sees the overwrite) — badge green + Done force-shown, but a click still
  // got nagged by the "still unimplemented" warning.
  //
  // `touchOwnDirectTargets.size === 0` (no real touch edit recorded THIS
  // session yet) short-circuits to the frozen `baseTouchCoveredSet`
  // deliberately, not just as an optimization: with zero `charTouch` edits,
  // NOTHING has happened yet that could make `baseTouchCoveredSet` stale, so
  // it is still exactly correct — and staying on it here avoids leaning on
  // `directTouchProducedSet`/`layoutForLintAndGate` for a case they were
  // never contracted to carry alone (a base whose only in-scope signal is a
  // desktop-mods replay with zero Phase E edits — see `layoutForLintAndGate`'s
  // own R11-matrix-driven null/non-null split above).
  //
  // Once a real edit exists, `directTouchProducedSet` (derived from
  // `layoutForLintAndGate`, which DOES bake in every `charTouch` edit —
  // replace, delete, and brand-new key assignments alike, via
  // `buildTouchLayoutJson`'s `appliedEdits`) is genuinely live, so a
  // replaced-away character is correctly absent from it and a desktop-mirrored
  // character stays present (it unions `desktopDirectProducedSet`). Subtracting
  // `touchOwnDirectTargets` keeps this DISJOINT from signal (b) SESSION-DIRECT:
  // without the subtraction, a character assigned a BRAND-NEW touch key this
  // session would double-count (once via this now-live signal (a), once via
  // signal (b)), regressing the "0 -> 1" (not "0 -> 2") badge contract the
  // "Producer-count badge" integration suite pins. A character covered only
  // via the seed, a desktop-mirror replay, or a since-restored/undeleted
  // method (none of which are `touchOwnDirectTargets` members) is unaffected
  // by the subtraction and stays correctly counted here.
  const touchBaseDirectSet = useMemo<Set<string>>(() => {
    if (touchOwnDirectTargets.size === 0) return baseTouchCoveredSet;
    const out = new Set<string>();
    for (const ch of directTouchProducedSet) {
      if (!touchOwnDirectTargets.has(ch)) out.add(ch);
    }
    return out;
  }, [baseTouchCoveredSet, directTouchProducedSet, touchOwnDirectTargets]);

  // The current character's 3-signal producer badge (charMechanisms.ts's
  // getProducerBadge) — the SAME computation CharScrollStrip's own badge and
  // the SHOW-ALL floor-row check (existingMethodRows below) use, with the
  // SAME 4 trailing args this gallery already passes to CharScrollStrip
  // (touchBaseDirectSet, directTouchProducedSet). Hoisted here so the
  // floor-row check (currentCharBadge?.count ?? 0) below and the isComposable
  // suggestion gate share one computation rather than each re-deriving it.
  const currentCharBadge = useMemo(
    () =>
      currentChar !== null
        ? getProducerBadge(
            currentChar,
            charTouchAssignments,
            "touch",
            touchBaseDirectSet,
            directTouchProducedSet,
          )
        : null,
    [currentChar, charTouchAssignments, touchBaseDirectSet, directTouchProducedSet],
  );

  // Whole-inventory "every character is implemented" check (bug fix) — built
  // on the SAME 3-signal getProducerBadge computation the CharScrollStrip
  // badge uses, over the FULL SHOW-ALL `inventory` list (not just
  // touchLettersToAdd — a detected/already-covered char must count as
  // covered too). Feeds the forward-button JSX below: when true, the Done
  // button is always rendered regardless of currentChar/walk membership.
  const allCovered = useMemo(
    () =>
      allCharsCovered(
        inventory,
        charTouchAssignments,
        "touch",
        touchBaseDirectSet,
        directTouchProducedSet,
      ),
    [inventory, charTouchAssignments, touchBaseDirectSet, directTouchProducedSet],
  );

  // "Existing methods" for currentChar — every pre-existing touch method
  // (main key / longpress / multitap / flick) in the BASE touch layout that
  // STILL produces currentChar, mirroring MechanismGallery's desktop
  // "Existing methods" section. Sourced from detectionSeedLayout (the same
  // seed-source-aware, mods-replayed, author-edits-EXCLUDED layout that
  // powers detectedChars above) rather than the author's own Phase E edits —
  // deleting a pre-existing method is a base-keyboard edit, not a new
  // assignment. detectionSeedLayout now has the deletion overlay baked in
  // (applyTouchKeycapRemovalsToLayout, see that memo above), so a method
  // deleted this session no longer appears in enumerateTouchMethodsForChar's
  // output at all — the `isTouchKeyDeleted` filter below is therefore
  // belt-and-suspenders, not load-bearing, but kept rather than stripped so a
  // future change to detectionSeedLayout's derivation doesn't silently
  // resurrect a deleted method here.
  const existingTouchMethods = useMemo<TouchMethodDescriptor[]>(() => {
    if (detectionSeedLayout === null || currentChar === null) return [];
    return enumerateTouchMethodsForChar(detectionSeedLayout, currentChar).filter(
      (m) => !isTouchKeyDeleted(m.id),
    );
    // deletedTouchKeyIds is an intentional dep even though only
    // isTouchKeyDeleted is called in the body — same store-selector
    // precedent as MechanismGallery's existingMethods memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionSeedLayout, currentChar, isTouchKeyDeleted, deletedTouchKeyIds]);

  // Deleted pre-existing touch methods for currentChar — the restore
  // affordance's data source (FIX: deletions were previously one-way in the
  // UI). Sourced from rawDetectionSeedLayout (the UNDELETED seed) rather than
  // detectionSeedLayout: once a method is stripped out of the latter, it no
  // longer produces currentChar at all, so there would be nothing left to
  // name here. Scoped to `deletable` methods only — a non-deletable
  // (desktop-backed) row is never in deletedTouchKeyIds in the first place.
  const deletedExistingTouchMethods = useMemo<TouchMethodDescriptor[]>(() => {
    if (rawDetectionSeedLayout === null || currentChar === null) return [];
    return enumerateTouchMethodsForChar(
      rawDetectionSeedLayout,
      currentChar,
    ).filter((m) => m.deletable && isTouchKeyDeleted(m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDetectionSeedLayout, currentChar, isTouchKeyDeleted, deletedTouchKeyIds]);

  // The FULL, unfiltered enumeration of touch methods for currentChar —
  // sourced from rawDetectionSeedLayout (the UNDELETED seed, same source as
  // deletedExistingTouchMethods above) so it is a superset of both
  // existingTouchMethods and deletedExistingTouchMethods. Fed to
  // composeTouchMethodLabel's `allMethodsForChar` argument so the "(platform,
  // layer)" disambiguation-suffix decision (existingMethodLabels.ts) is
  // identical whether a given method is currently shown in "Existing
  // methods" or in the "Deleted methods" restore list — neither of those two
  // already-filtered arrays alone is a safe stand-in for "every method this
  // char has".
  const allTouchMethodsForChar = useMemo<TouchMethodDescriptor[]>(() => {
    if (rawDetectionSeedLayout === null || currentChar === null) return [];
    return enumerateTouchMethodsForChar(rawDetectionSeedLayout, currentChar);
  }, [rawDetectionSeedLayout, currentChar]);

  // Unified "Existing methods" row list (SHOW-ALL, spec follow-up — mirrors
  // MechanismGallery's desktop `existingMethods`): every real touch method
  // above ("touch" kind), PLUS a synthesized composition row when currentChar
  // isn't directly reachable but IS composable from characters the base
  // layout directly reaches, PLUS a floor row when currentChar is green
  // (detectedChars — the augmented set the badge uses) yet still has zero
  // rows after all of the above. One array so the section's visibility guard
  // and rendering both key off ONE list rather than three independent
  // conditions.
  interface ExistingTouchMethodRow {
    id: string;
    label: string;
    deletable: boolean;
    kind: "touch" | "composition" | "unattributed";
    reason?: string;
  }

  const existingMethodRows = useMemo<ExistingTouchMethodRow[]>(() => {
    const rows: ExistingTouchMethodRow[] = existingTouchMethods.map(
      (method) => {
        const nonDeletableReason = touchMethodNonDeletableReason(method, i18n);
        const touchBaseLabel = composeTouchMethodLabel(
          method,
          allTouchMethodsForChar,
          i18n,
        );
        return {
          id: method.id,
          label: method.deletable
            ? touchBaseLabel
            : appendNotDeletableSuffix(touchBaseLabel, i18n),
          deletable: method.deletable,
          kind: "touch",
          ...(nonDeletableReason !== undefined
            ? { reason: nonDeletableReason }
            : {}),
        };
      },
    );

    // SHOW-ALL composition row — baseTouchCoveredSet is the PRE-augmentation
    // set (see its own doc comment above): composition stays strictly one
    // level, never chained off an already-composable char.
    if (currentChar !== null) {
      const compositionDescriptor = collectCompositionMethod(
        baseTouchCoveredSet,
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
          kind: "composition",
          reason: compositionTooltip(compositionDescriptor, i18n),
        });
      }
    }

    // SHOW-ALL floor — currentChar is GREEN (getProducerBadge's count >= 1 —
    // the SAME 3-signal computation CharScrollStrip's badge uses, see
    // charMechanisms.ts) but still has zero rows after everything above.
    // Reuses the hoisted `currentCharBadge` (declared above, near the
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
        kind: "unattributed",
      });
    }

    return rows;
  }, [
    existingTouchMethods,
    allTouchMethodsForChar,
    i18n,
    currentChar,
    baseTouchCoveredSet,
    currentCharBadge,
  ]);

  // Restore affordance (FIX: deleteTouchKey was previously one-way in the UI
  // — the store's restoreTouchKey/isTouchKeyDeleted pair existed but nothing
  // called restoreTouchKey). Reverses a single deletion from
  // deletedExistingTouchMethods above.
  const handleRestoreExistingTouchMethod = useCallback(
    (method: TouchMethodDescriptor) => {
      restoreTouchKey(method.id);
    },
    [restoreTouchKey],
  );

  // ---------------------------------------------------------------------------
  // Per-character suggestion computation
  // ---------------------------------------------------------------------------

  // Bug fix: every method (tap/longpress/multitap/flick) that ALREADY
  // produces currentChar on the CURRENT effective touch layout —
  // layoutForLintAndGate, not detectionSeedLayout. detectionSeedLayout is
  // deliberately the pre-Phase-E seed (see its own doc comment above); the
  // suggestion gate needs the layout that reflects everything the reseed
  // itself already placed via applyDesktopModifications's mods-replay (a
  // Phase C letter whose host key is occupied lands as a longpress sk[]
  // alternate — see engine/src/pattern-apply/applyDesktopModifications.ts)
  // PLUS any Phase E edit the author has already recorded in charTouch —
  // layoutForLintAndGate is exactly that union (touchLayoutJson, parsed, when
  // the R11 emission matrix says emit — which "reseed-from-desktop" always
  // does — else falling back to detectionSeedLayout). Without this, a
  // reseed's own auto-placed longpress was invisible to the suggestion memo,
  // which offered a redundant longpress/replace suggestion for a character
  // that already had a working method — see enumerateTouchMethodsForChar's
  // doc comment for the descriptor shape this reuses (READ side of the same
  // touch-method address scheme `existingTouchMethods` above already uses).
  const currentCharTouchMethods = useMemo<TouchMethodDescriptor[]>(() => {
    if (layoutForLintAndGate === null || currentChar === null) return [];
    return enumerateTouchMethodsForChar(layoutForLintAndGate, currentChar);
  }, [layoutForLintAndGate, currentChar]);

  type Suggestion =
    | { kind: "longpress"; hostKey: string }
    | { kind: "replace"; hostKey: string }
    | { kind: "none" };

  const suggestion = useMemo<Suggestion>(() => {
    if (currentChar === null) return { kind: "none" };

    // A character already producible by SOME existing touch method needs no
    // suggestion card at all — gates BOTH branches below (the Phase C
    // desktop-assignment longpress/replace branch, and the decomposable-
    // accented fallback), per the literal product rule: "a suggestion only
    // happens when the key has no other method to produce that character."
    // This deliberately also suppresses a "replace" suggestion (a desktop
    // simple_swap onto a main key) when the char is already reachable via an
    // existing longpress — see the module's suggestion-gating note; flagged
    // for reviewer confirmation of that specific nuance.
    if (currentCharTouchMethods.length > 0) {
      return { kind: "none" };
    }

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

    // No desktop assignment. A character already reachable on the seed
    // (detectedChars — see the module doc's "already covered" note) needs no
    // suggestion card at all: it is shown read-only in the "Existing methods"
    // section below — the author never has to click Accept to "keep"
    // something that was never at risk of being removed. Kept alongside the
    // currentCharTouchMethods gate above because detectedChars also folds in
    // NFD-composability (augmentWithComposable, via touchCoverage) — a char
    // reachable by composing two directly-reachable parts, which
    // enumerateTouchMethodsForChar (direct producers only) does not capture.
    if (detectedChars.has(currentChar)) {
      return { kind: "none" };
    }

    // Abugida-safe gate — shared predicate; see siblingAccents.ts for the
    // reasoning (also used by MechanismGallery's deadkey auto-default).
    // NFD stays AUTHORITATIVE: a decomposable char with a resolvable Latin
    // base always wins here; the corpus tie-breaker below is only consulted
    // when this branch either doesn't apply or resolves to nothing.
    if (isGatedAccentCompositionCandidate(currentChar, axes.scriptClass)) {
      const nfd = currentChar.normalize("NFD");
      const baseLetter = [...nfd][0] ?? "";
      let hk = "";
      if (baseLetter && /^[a-zA-Z]$/.test(baseLetter)) {
        hk = `K_${baseLetter.toUpperCase()}`;
      }
      // Empty-hostkey guard (km-triage finding #3): a non-Latin base letter
      // (e.g. the base of a Cyrillic/Hebrew/Arabic accented char whose base
      // isn't a-z) leaves `hk` as "" — fall through to the corpus tie-breaker
      // below rather than surfacing an empty target key.
      if (hk !== "") {
        return { kind: "longpress", hostKey: hk };
      }
    }

    // Corpus longpress-host tie-breaker (placement-priors v2's
    // `PlacementMap.touch` — see touchCorpusFallbackHostKey). Fires ONLY when
    // NFD gave nothing above (either the char isn't a gated accent-
    // composition candidate at all, or its base letter didn't resolve to a
    // Latin key) — this is a NEW path that can now surface a suggestion even
    // when the old desktop-assignment (`da`) branch above found nothing, as
    // long as the corpus attests a longpress host for this exact codepoint.
    const corpusHostKey = touchCorpusFallbackHostKey(currentChar, placementMap);
    if (corpusHostKey !== null) {
      return { kind: "longpress", hostKey: corpusHostKey };
    }

    return { kind: "none" };
  }, [
    currentChar,
    desktopAssignments,
    detectedChars,
    currentCharTouchMethods,
    axes.scriptClass,
    placementMap,
  ]);

  // ---------------------------------------------------------------------------
  // Per-character method state — reset when currentChar changes
  // ---------------------------------------------------------------------------

  const [method, setMethod] = useState<TouchMethod>("longpress_alternates");
  const [hostKey, setHostKey] = useState("");
  const [hostKeyCustomChar, setHostKeyCustomChar] = useState("");
  const [flickDirection, setFlickDirection] = useState("");
  // The (shared, all-four-method) layer COMBO BUILDER state (spec: "a layer
  // option just like the desktop does", generalized per the "add" button feature —
  // see the module-level TouchLayerBuilder doc). One slot per chosen
  // ModifierToken; `[]` is the base/default layer. Seeded from
  // `touchLayerForChar(currentChar)` on every char change (see the reset
  // effect below) via `seedLayerTokensForChar` — the SAME layer
  // `buildTouchMechanismRef` has always derived automatically — so leaving
  // the builder untouched reproduces exactly the pre-picker behavior
  // (defaults-first, spec §3c: "no default is a defect").
  const [layerTokens, setLayerTokens] = useState<(ModifierToken | "")[]>(() =>
    seedLayerTokensForChar(null),
  );

  // Resolved host key — shared by canApply, buildMechanismRef, and the
  // manual-edit promotion below. One resolution helper (charInput.ts),
  // consulted here and by KeyPickerField's own feedback rendering, so there
  // is exactly one place the "__custom__" -> real vkey mapping lives.
  const resolvedHostKey = useMemo(
    () => resolvedVkeyOf(resolveKeyPickerSelection(hostKey, hostKeyCustomChar)),
    [hostKey, hostKeyCustomChar],
  );

  // The working desktop IR the layer builder's constraint pool is derived
  // from — same `s.ir ?? s.baseIr` fallback MechanismGallery's merged
  // "Assign to a key" card uses for its own IR-derived option pool
  // (`workingIr` there).
  const workingIrForLayers = useWorkingCopyStore((s) => s.ir ?? s.baseIr);

  // The desktop keyboard's own combos ("D" in the constraint spec) — the
  // builder's hard pool. NOT a free/constructible pool like MechanismGallery's
  // S-08 (computeModifierPool); the author may only assemble a combination
  // this keyboard already defines.
  const validLayerCombos = useMemo<ModifierToken[][]>(
    () =>
      workingIrForLayers !== null
        ? collectLayerCombosInUse(workingIrForLayers)
        : [],
    [workingIrForLayers],
  );

  // "+"-joined canonical-order key set for O(1) "is this combo one the
  // desktop actually uses" membership checks — every element of
  // validLayerCombos is already canonicalizeCombo's output
  // (collectLayerCombosInUse's own contract), so a plain join is a safe,
  // order-stable key (mirrors modifierCombos.ts's own internal
  // comboJoinKey, not exported).
  const validLayerComboKeys = useMemo(
    () => new Set(validLayerCombos.map((c) => c.join("+"))),
    [validLayerCombos],
  );

  // Whether this keyboard uses CAPS lock (key-id-policy.md §2) — gates
  // AssignPanel's case-triple checkbox (spec 058 T085-T089 composition).
  // Derived from the SAME `validLayerCombos` catalog the touch-layer builder
  // above is hard-constrained by, rather than a second "does this keyboard
  // have a caps layer" scan.
  const capsHandled = useMemo(
    () => validLayerCombos.some((combo) => combo.includes("CAPS")),
    [validLayerCombos],
  );

  // The tokens actually chosen across all slots so far (order-independent,
  // deduped) — the builder's assembled combo. Canonicalized so it compares
  // directly against `validLayerComboKeys`/`comboToTouchLayerId`; the
  // exclusion logic the SelectMenu options are constrained by
  // (optionsForTouchLayerSlot) already prevents an internally
  // exclusion-inconsistent selection from being constructible through the
  // UI, so the catch branch is defensive only.
  //
  // Memoized because this array is a DEPENDENCY of `handleApply` and the
  // case-pair path, where it replaced the previously-stable string
  // `editingLayer`. A freshly-built array every render would re-create those
  // callbacks on every unrelated re-render; `layerTokens` is state, so a new
  // reference here means the author actually changed a slot.
  const assembledLayerCombo = useMemo<ModifierToken[]>(() => {
    const filled = layerTokens.filter(
      (tok): tok is ModifierToken => tok !== "",
    );
    try {
      return canonicalizeCombo(filled);
    } catch {
      return filled;
    }
  }, [layerTokens]);

  // Applicability (requirement 4): the empty combo (no slots filled) is
  // always valid — it's the base/default layer, which every desktop
  // keyboard has. A non-empty combo is valid only once it fully matches a
  // combo the desktop actually uses; a combo under construction (e.g. one
  // slot chosen toward a longer valid combo, but not yet the full thing) is
  // NOT valid — this is what blocks Apply on a partial combo.
  const layerComboValid =
    assembledLayerCombo.length === 0 ||
    validLayerComboKeys.has(assembledLayerCombo.join("+"));

  // comboToTouchLayerId is total over any combo built from ModifierToken
  // members: TOUCH_ID_FRAGMENT (engine/src/pattern-apply/modifierCombos.ts)
  // has an entry for every ModifierToken, and canonicalizeCombo's output
  // only ever contains ModifierToken members — so there is no combo this can
  // produce that TOUCH_ID_FRAGMENT doesn't cover. Asserted non-null rather
  // than guarded (same rationale the removed buildTouchLayerOptions used).
  const layerTouchId = comboToTouchLayerId(assembledLayerCombo)!;

  // Human-friendly label for the currently assembled combo (e.g. "Base",
  // "Shift", "Shift+RAlt") — the builder's preview line.
  const layerPreviewLabel = touchLayerComboLabel(assembledLayerCombo, i18n);

  const handleAddLayerSlot = useCallback(() => {
    setLayerTokens((prev) =>
      prev.length >= MAX_TOUCH_LAYER_SLOTS ? prev : [...prev, ""],
    );
  }, []);

  const handleRemoveLayerSlot = useCallback((index: number) => {
    // Unlike MechanismGallery's S-08 raltTokens (which must always keep at
    // least one slot — an empty combo is not a valid S-08 method), removing
    // the last touch-layer slot is fine: zero slots is the base/default
    // layer, itself always valid.
    setLayerTokens((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleLayerTokenChange = useCallback(
    (index: number, value: string) => {
      const token = (value || "") as ModifierToken | "";
      setLayerTokens((prev) => {
        const next = [...prev];
        next[index] = token;
        // Forward invalidation, mirroring MechanismGallery's
        // handleRaltTokenChange: an earlier slot's new value may exclude a
        // later slot's existing selection (or make it unreachable toward any
        // combo in D) — drop those now-invalid picks.
        for (let i = index + 1; i < next.length; i++) {
          const stillValid = optionsForTouchLayerSlot(
            validLayerCombos,
            next,
            i,
          ).includes(next[i] as ModifierToken);
          if (next[i] !== "" && !stillValid) next[i] = "";
        }
        return next;
      });
    },
    [validLayerCombos],
  );

  // Whether the suggestion card must stay hidden for the current character —
  // true once explicitly resolved (Accept/Deny — persisted in
  // suggestionResolved, see above), or once the character is already
  // configured (a configured char never re-prompts). Marking a character for
  // later review does not resolve its suggestion — the mark is a SEPARATE
  // toggle (markedTouchSet) unrelated to suggestionResolved/charTouch, so a
  // marked-but-not-yet-decided character still shows its suggestion card if
  // revisited. Derived rather than reset-on-navigate, so returning to an
  // already-decided character never re-shows its suggestion card.
  const suggestionDismissed =
    currentChar !== null &&
    (suggestionResolved.has(currentChar) || charTouch.has(currentChar));

  // Forward gate (enables "Next character ->"/"Done"): an untouched
  // character needs EITHER an explicit Apply OR an explicit "Mark for later
  // review" first — but revisiting an already-configured/marked character
  // always re-enables it, so Back-then-Next over a finished (or deferred)
  // character never traps the author. Named to match MechanismGallery's
  // canGoNext (cross-gallery naming parity — this gallery has no separate
  // applied-method count, so the gate itself carries the name).
  //
  // A character already reachable on the seed layout (`detectedChars`, the
  // set the "Existing methods" section reads) is also a valid reason to
  // advance — the author needn't do anything to keep an already-present
  // implementation. Without this, every already-implemented character
  // disabled the primary Next/Done button. Detected chars are never
  // double-counted with `charTouch` — the two sets come from independent
  // sources (the seed layout vs. the author's own edits) — so this only ever
  // widens, never narrows, the gate.
  //
  // markedTouchSet (mechanism-gallery-progression) replaces the old
  // "Skip this character" escape: marking is the honest version of the same
  // "move on without implementing" action — it is a pure TOGGLE (see the
  // "Mark for later review" button below), and a marked character satisfies
  // this gate exactly like an applied one.
  const canGoNext = useMemo(
    () =>
      currentChar !== null &&
      (charTouch.has(currentChar) ||
        detectedChars.has(currentChar) ||
        markedTouchSet.has(currentChar)),
    [currentChar, charTouch, detectedChars, markedTouchSet],
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
  // ---------------------------------------------------------------------------
  // Case-pair proposal — the SAME hook and banner the other two mechanisms use
  // ---------------------------------------------------------------------------

  /**
   * Is `combo` one this keyboard actually defines? Same membership test
   * `layerComboValid` uses, in the shape `casePairTouchTarget` consumes — it
   * gates the compound case-pair candidates (e.g. SHIFT+RAlt) so the proposal
   * never targets a touch layer the keyboard has no combo for.
   */
  const isLayerComboInUse = useCallback(
    (combo: readonly ModifierToken[]) => validLayerComboKeys.has(combo.join("+")),
    [validLayerComboKeys],
  );

  const {
    proposal: casePairProposal,
    propose: proposeCompanion,
    dismiss: dismissCompanion,
    clear: clearCompanion,
  } = useCasePairCompanion();

  // Normalize "" -> undefined, same as useCasePairCompanion's own identity
  // read — needed here (not just inside that hook) for the touch-only
  // precedence check below (does the bulk sibling-accent proposal already
  // include currentChar's uppercase counterpart?), which must use the SAME
  // locale the simple companion itself would use.
  const identityBcp47 =
    identity?.bcp47 !== undefined && identity.bcp47 !== ""
      ? identity.bcp47
      : undefined;

  // ---------------------------------------------------------------------------
  // Sibling-accent proposal — the longpress accelerator (spec: "accept ù on u
  // -> offer the rest of u's diacritic family in one click"). Independent of
  // `casePairProposal` above: this one is multi-character and both-case.
  // Kept as its own state/banner rather than folded into `useCasePairCompanion`
  // so neither proposal has to disambiguate a shared "one proposal at a time"
  // slot.
  //
  // Touch-only precedence (both raised from the SAME accepted suggestion, in
  // `handleUseSuggestion` below): when the bulk proposal's placements already
  // include currentChar's uppercase counterpart, the bulk proposal takes
  // priority and the simple companion is DEFERRED (held in
  // `deferredCompanionInput`, not raised) rather than shown alongside it —
  // showing both would prompt the author to place the same uppercase
  // character twice. If the author DENIES the bulk proposal
  // (`handleSiblingAccentDismiss`), the deferred simple companion is raised
  // then, as the fallback. If the author CONFIRMS it
  // (`handleSiblingAccentConfirm`), the uppercase is already placed via the
  // bulk action, so the deferred input is discarded, never raised. When the
  // bulk proposal does NOT include the uppercase (or there is no bulk
  // proposal at all — e.g. a "replace" suggestion, or a longpress suggestion
  // with no siblings to offer), the simple companion is raised immediately,
  // exactly as `handleApply`'s own (unconditional) companion call already
  // does for the manual chooser. This precedence is TOUCH ONLY —
  // MechanismGallery has no sibling-accent bulk path.
  // ---------------------------------------------------------------------------

  const [siblingAccentProposal, setSiblingAccentProposal] =
    useState<SiblingAccentProposal | null>(null);
  const [deferredCompanionInput, setDeferredCompanionInput] =
    useState<Extract<CasePairProposalInput, { mechanism: "touch" }> | null>(
      null,
    );

  useEffect(() => {
    setMethod("longpress_alternates");
    setHostKey("");
    setHostKeyCustomChar("");
    setFlickDirection("");
    // Defaults-first: reproduce the exact pre-picker auto-derived layer for
    // the new character (base/default for almost every char; shift only for
    // an uppercase current char — see `touchLayerForChar`/`seedLayerTokensForChar`)
    // so an author who never touches the builder sees byte-identical behavior.
    setLayerTokens(seedLayerTokensForChar(currentChar));
    clearCompanion();
    // Navigating away (currentChar changing) from a char with an OPEN,
    // UNDECIDED bulk sibling-accent banner intentionally abandons BOTH the
    // bulk proposal AND its deferred simple-uppercase companion fallback
    // (see the "Touch-only precedence" note above `siblingAccentProposal`'s
    // declaration) — the author confirmed neither the bulk proposal nor,
    // therefore, the fallback it would otherwise unlock via
    // `handleSiblingAccentDismiss`. This is deliberate, not a dropped-state
    // bug: no nav-gating is added to keep the bulk banner open, so an
    // undecided banner simply does not survive a character change.
    setSiblingAccentProposal(null);
    setDeferredCompanionInput(null);
  }, [currentChar, clearCompanion]);

  // ---------------------------------------------------------------------------
  // canApply
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "flick_gestures")
      return (
        resolvedHostKey !== null && flickDirection !== "" && layerComboValid
      );
    // longpress_alternates, multitap, and touch_key_replace all carry the
    // same layer builder now — Apply is gated on a complete/valid combo for
    // all three, same as flick above.
    return resolvedHostKey !== null && layerComboValid;
  }, [currentChar, method, resolvedHostKey, flickDirection, layerComboValid]);

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
    // The layer builder now applies to all four methods — canApply already
    // requires layerComboValid, so `Apply` is unreachable with a
    // partial/invalid combo; this always sends the FULL, valid assembled
    // combo's touch layer id.
    return buildTouchMechanismRef(
      method,
      resolvedHostKey,
      flickDirection,
      char,
      layerTouchId,
    );
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
    const aSlots = normalizeTouchSlots(a.slotValues);
    const bSlots = normalizeTouchSlots(b.slotValues);
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
    const hasRealMechanism = existing.mechanisms.some(
      (m) => m.patternId !== "touch_inherited",
    );
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

  const handleCasePairConfirm = useCallback(() => {
    if (casePairProposal === null || casePairProposal.mechanism !== "touch") {
      return;
    }
    const { originalChar, counterpart, hostKey: hk, targetLayer, baseRef } =
      casePairProposal;

    setCharTouch((prev) => {
      // Stale-base guard (FR-008): the placement this was raised for must
      // still be present, by object reference — not by target or index.
      const existing = prev.get(originalChar);
      if (existing === undefined || !existing.mechanisms.includes(baseRef)) {
        return prev;
      }
      // The counterpart is a DIFFERENT character, so this lands in its own
      // charTouch entry and cannot interact with the source character's
      // touch_inherited exclusivity rules.
      const ref: MechanismRef = {
        patternId: baseRef.patternId,
        slotValues: {
          ...(baseRef.slotValues ?? {}),
          char: counterpart,
          hostKey: hk,
          layer: targetLayer,
        },
      };
      return appendMechanismToChar(prev, counterpart, ref);
    });

    clearCompanion();
  }, [casePairProposal, clearCompanion]);

  // Confirm the sibling-accent proposal: place every sibling in ONE update
  // (single Accept places all — spec: "one click to accept all"). Each
  // uppercase sibling is a DIFFERENT character, so it lands in its own
  // `charTouch` entry keyed by that character (same idiom
  // `handleCasePairConfirm` above uses for its own counterpart). A sibling
  // already produced on its target hostKey+layer is skipped (dedupe, mirrors
  // the case-pair companion's own `alreadyProduced` predicate) rather than
  // duplicating a chip.
  const handleSiblingAccentConfirm = useCallback(() => {
    if (siblingAccentProposal === null) return;
    const { acceptedChar, hostKey: acceptedHostKey, placements } =
      siblingAccentProposal;

    // Stale-base guard (mirrors handleCasePairConfirm's identity guard above):
    // the accepted char's own longpress placement — on the SAME host key the
    // siblings would share — must still be present. Without this, removing the
    // just-placed base chip while this banner is open and then clicking "Add
    // them" would place orphaned siblings with no base longpress underneath.
    const acceptedStillPlaced = (
      charTouch.get(acceptedChar)?.mechanisms ?? []
    ).some((m) => normalizeTouchSlots(m.slotValues)["hostKey"] === acceptedHostKey);
    if (!acceptedStillPlaced) {
      setSiblingAccentProposal(null);
      return;
    }

    // Only placements this confirm NEWLY adds count as "changed by" this bulk
    // action — a sibling already produced on its target hostKey+layer is
    // skipped (dedupe, mirrors the case-pair companion's `alreadyProduced`
    // predicate) and is not recorded as a member of the group.
    const toPlace = placements.filter((placement) => {
      const alreadyProduced = (
        charTouch.get(placement.char)?.mechanisms ?? []
      ).some((m) => {
        const slots = normalizeTouchSlots(m.slotValues);
        return (
          slots["hostKey"] === placement.hostKey &&
          slots["layer"] === placement.layer
        );
      });
      return !alreadyProduced;
    });

    if (toPlace.length > 0) {
      setCharTouch((prev) => {
        let next = prev;
        for (const placement of toPlace) {
          const ref = buildTouchMechanismRef(
            "longpress_alternates",
            placement.hostKey,
            "",
            placement.char,
            placement.layer,
          );
          if (ref === null) continue;
          next = appendMechanismToChar(next, placement.char, ref);
        }
        return next;
      });

      // Record (or extend) the bulk group so the batch is summarized in one
      // removable box rather than a chip per sibling.
      const id = `${acceptedChar}:${acceptedHostKey}`;
      const members = toPlace.map((p) => p.char);
      setBulkAccentGroups((prev) => {
        const existing = prev.find((g) => g.id === id);
        if (existing) {
          const mergedMembers = [
            ...new Set([...existing.members, ...members]),
          ];
          return prev.map((g) =>
            g.id === id ? { ...g, members: mergedMembers } : g,
          );
        }
        return [
          ...prev,
          { id, hostKey: acceptedHostKey, baseChar: acceptedChar, members },
        ];
      });
    }

    // CHANGE 4 precedence: the bulk proposal just placed (or already had)
    // every sibling it offered — if a simple companion was deferred behind
    // it (because those siblings included currentChar's uppercase
    // counterpart), that uppercase is now placed, so the deferred companion
    // is discarded rather than raised.
    setDeferredCompanionInput(null);
    setSiblingAccentProposal(null);
  }, [siblingAccentProposal, charTouch]);

  const handleSiblingAccentDismiss = useCallback(() => {
    // CHANGE 4 precedence fallback: the bulk proposal is denied, so if a
    // simple companion was deferred behind it, raise it now — the author
    // still gets offered the uppercase counterpart, just via the simple
    // (single-character) path instead of the bulk one.
    if (deferredCompanionInput !== null) {
      proposeCompanion(deferredCompanionInput);
      setDeferredCompanionInput(null);
    }
    setSiblingAccentProposal(null);
  }, [deferredCompanionInput, proposeCompanion]);

  // ---------------------------------------------------------------------------
  // Suggestion card handlers
  // ---------------------------------------------------------------------------

  // Accept the suggestion: append the suggested mechanism immediately
  // (regression 3, multi-method — via appendMechanismToChar rather than
  // overwriting the assignment, regression: replace), then mark the
  // suggestion resolved and stay on currentChar (regression 4, stay-on-char)
  // so the user can keep editing — advancing happens only via the explicit
  // Next button. If no host key could be derived, fall back to opening the
  // chooser pre-filled at the suggested method so the user can pick a key.
  //
  // Longpress accelerator (spec: accept ù on u -> offer the rest of u's
  // diacritic family in one click): fires ONLY on the "longpress" kind (not
  // "replace" — a replace suggestion is a desktop simple_swap, not an
  // accent-family placement) and only once a real host key was derivable, so
  // there is always a concrete key the siblings can share. Gated on the SAME
  // isDecomposableAccented check the suggestion memo above already used to
  // offer the longpress card in the first place; `siblingAccentPlacements`
  // applies its own Latin-only base gate on top (see that module).
  const handleUseSuggestion = useCallback(() => {
    if (currentChar === null) return;
    if (suggestion.kind !== "longpress" && suggestion.kind !== "replace") {
      markSuggestionResolved(currentChar);
      return;
    }
    const nextMethod: TouchMethod =
      suggestion.kind === "longpress"
        ? "longpress_alternates"
        : "touch_key_replace";
    const hk = suggestion.hostKey;
    if (hk === "") {
      setMethod(nextMethod);
      setHostKey("");
      setFlickDirection("");
      markSuggestionResolved(currentChar);
      return;
    }
    // Route through buildTouchMechanismRef (FR-012) rather than a bare
    // literal, so `layer` is always derived via touchLayerForChar — the same
    // "one casing source" invariant every other placement path already
    // upholds. `hk` is a non-empty string here (the `hk === ""` guard above
    // already returned), so the builder's `resolvedHostKey === null` guard
    // never actually fires on this path — it's a defensive mirror of
    // handleApply's own `if (ref === null) return;`, not a second real path.
    const ref = buildTouchMechanismRef(nextMethod, hk, "", currentChar);
    if (ref === null) return;
    setCharTouch((prev) => appendMechanismToChar(prev, currentChar, ref));
    markSuggestionResolved(currentChar);

    // Case-pair companion (CHANGE 3: the companion must fire whenever a
    // lowercase letter is implemented, not only via the manual chooser's
    // Apply — handleApply below raises the same shape). Built here
    // regardless of the bulk sibling-accent path below, since a "replace"
    // suggestion (desktop simple_swap) or a longpress with no siblings to
    // offer still deserves the simple companion.
    //
    // Passed the assembled COMBO, not the flattened layer id — same reason
    // handleApply below is: the flattened id cannot express "this combo plus
    // SHIFT", which is what the case-pair relation actually is (see
    // casePairTouchTarget).
    const target = casePairTouchTarget(assembledLayerCombo, isLayerComboInUse);
    const targetLayer = target?.layer;
    const companionInput:
      | Extract<CasePairProposalInput, { mechanism: "touch" }>
      | null =
      target !== null
        ? {
            mechanism: "touch",
            originalChar: currentChar,
            hostKey: hk,
            targetLayer: target.layer,
            targetLayerLabel: touchLayerComboLabel(target.combo, i18n),
            baseRef: ref,
            alreadyProduced: (counterpart) =>
              (charTouch.get(counterpart)?.mechanisms ?? []).some((m) => {
                const slots = normalizeTouchSlots(m.slotValues);
                return slots["hostKey"] === hk && slots["layer"] === targetLayer;
              }),
          }
        : null;

    let bulkPlacements: SiblingAccentPlacement[] = [];
    if (suggestion.kind === "longpress" && isDecomposableAccented(currentChar)) {
      // Inventory-driven: only siblings the author's language actually uses
      // (never a Unicode-derived family) are offered — see siblingAccents.ts.
      bulkPlacements = siblingAccentPlacements(currentChar, hk, inventory);
    }

    if (bulkPlacements.length > 0) {
      // CHANGE 4 (touch only): does the bulk proposal already include
      // currentChar's uppercase counterpart? Uses the SAME engine primitive
      // casePairCompanion.ts's propose() uses (FR-002) — a read-only
      // comparison here, not a second casing-derivation path.
      const pair = caseCounterpart(currentChar, identityBcp47);
      const bulkIncludesUppercase =
        pair !== null &&
        pair.direction === "toUpper" &&
        bulkPlacements.some((p) => p.char === pair.counterpart);

      setSiblingAccentProposal({
        acceptedChar: currentChar,
        hostKey: hk,
        placements: bulkPlacements,
      });

      if (bulkIncludesUppercase) {
        // Defer the simple companion — the bulk proposal takes precedence;
        // raised only if the author denies it (handleSiblingAccentDismiss).
        setDeferredCompanionInput(companionInput);
      } else if (companionInput !== null) {
        proposeCompanion(companionInput);
      }
    } else if (companionInput !== null) {
      proposeCompanion(companionInput);
    }
    // inventoryKey is the stable primitive proxy for `inventory` (same
    // precedent as detectedChars/touchKey above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    suggestion,
    currentChar,
    markSuggestionResolved,
    inventoryKey,
    assembledLayerCombo,
    isLayerComboInUse,
    charTouch,
    identityBcp47,
    proposeCompanion,
    i18n,
  ]);

  const handleSuggestionChange = useCallback(() => {
    if (currentChar !== null) markSuggestionResolved(currentChar);
  }, [currentChar, markSuggestionResolved]);

  // ---------------------------------------------------------------------------
  // Apply / Next handlers
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

    // Case-pair proposal (FR-005): offer the capital on the casing-parallel
    // layer of the layer being edited. Suppressed when that layer has no
    // parallel (already a shift/caps layer) or when the parallel is a combo
    // this keyboard does not define, and by the hook itself when the character
    // has no confident capital. Deliberately independent of
    // `suggestionResolved`, which governs the placement-suggestion card — a
    // different object entirely.
    //
    // Passed the assembled COMBO, not `layerTouchId` — the flattened id cannot
    // express "this combo plus SHIFT", which is what the case-pair relation
    // actually is (see casePairTouchTarget).
    const target = casePairTouchTarget(assembledLayerCombo, isLayerComboInUse);
    if (target !== null && resolvedHostKey !== null) {
      const hk = resolvedHostKey;
      const targetLayer = target.layer;
      proposeCompanion({
        mechanism: "touch",
        originalChar: currentChar,
        hostKey: hk,
        targetLayer,
        // Labelled from the target's own combo through the same helper the
        // builder's "Resulting layer:" preview uses, so the banner names
        // exactly the layer the confirm will write to.
        targetLayerLabel: touchLayerComboLabel(target.combo, i18n),
        // Object identity, not target/index (FR-008).
        baseRef: ref,
        // "Counterpart already placed" (spec §Edge Cases): the capital is
        // already on this host key's parallel layer, so there is nothing to
        // propose. Asked with the counterpart the hook derived — this gallery
        // never cases a letter itself (FR-002).
        alreadyProduced: (counterpart) =>
          (charTouch.get(counterpart)?.mechanisms ?? []).some((m) => {
            const slots = normalizeTouchSlots(m.slotValues);
            return slots["hostKey"] === hk && slots["layer"] === targetLayer;
          }),
      });
    }
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
      if (ir !== null)
        store.setWorkingIR(promoteOnManualEdit(ir, resolvedHostKey));
    }
    // Reset method inputs but stay on currentChar — user must click Next to advance.
    setMethod("longpress_alternates");
    setHostKey("");
    setHostKeyCustomChar("");
    setFlickDirection("");
    setLayerTokens(seedLayerTokensForChar(currentChar));
    // `charTouch` is listed because the case-pair "already placed" predicate
    // above closes over it — a stale map would re-propose a pairing the author
    // has already made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentChar,
    canApply,
    method,
    hostKey,
    resolvedHostKey,
    flickDirection,
    layerTokens,
    charTouch,
    assembledLayerCombo,
    isLayerComboInUse,
    proposeCompanion,
    i18n,
  ]);

  // Strip every bulk-added longpress mechanism for `members` on `hostKey` from
  // a charTouch map (dropping any member left with no mechanisms). Touches ONLY
  // the longpress_alternates mechanism on that host key — never another method
  // a member char might also carry. Shared by the bulk box's delete-all and the
  // base-removal orphan cleanup below.
  const stripBulkMembers = useCallback(
    (
      map: Map<string, TouchAssignment>,
      members: readonly string[],
      hostKey: string,
    ): Map<string, TouchAssignment> => {
      const next = new Map(map);
      for (const member of members) {
        const existing = next.get(member);
        if (existing === undefined) continue;
        const kept = existing.mechanisms.filter((m) => {
          const slots = normalizeTouchSlots(m.slotValues);
          return !(
            m.patternId === "longpress_alternates" &&
            slots["hostKey"] === hostKey
          );
        });
        if (kept.length === existing.mechanisms.length) continue;
        if (kept.length === 0) next.delete(member);
        else next.set(member, { ...existing, mechanisms: kept });
      }
      return next;
    },
    [],
  );

  // Bulk box "Remove all": delete every sibling the group added, in one click.
  const handleRemoveBulkGroup = useCallback(
    (group: BulkAccentGroup) => {
      setCharTouch((prev) =>
        stripBulkMembers(prev, group.members, group.hostKey),
      );
      setBulkAccentGroups((prev) => prev.filter((g) => g.id !== group.id));
    },
    [stripBulkMembers],
  );

  // `${member} ${hostKey}` keys for every bulk-group member, so the
  // Configured chip row can skip mechanisms that the bulk summary box already
  // represents (a bulk-added sibling shows in its box, not as its own chip).
  const bulkMemberKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const group of bulkAccentGroups) {
      for (const member of group.members) {
        keys.add(bulkMemberKey(member, group.hostKey));
      }
    }
    return keys;
  }, [bulkAccentGroups]);

  // Keys for each group's accepted BASE char (which shows as its own Configured
  // chip, unlike the siblings). Used to scope that chip to the group's family
  // so it does not linger on unrelated letters (e.g. the "a" base must not show
  // while editing "B") — mirrors how the bulk box itself is scoped below.
  const bulkBaseKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const group of bulkAccentGroups) {
      keys.add(bulkMemberKey(group.baseChar, group.hostKey));
    }
    return keys;
  }, [bulkAccentGroups]);

  // The host key the CURRENT character's accent family lives on — used to scope
  // which bulk summary boxes are shown so the author sees only the family they
  // are looking at (e.g. viewing an e-accent shows the e box, not the a box),
  // not every group in the draft at once. Null for a non-Latin/absent char.
  const currentCharHostKey = useMemo<string | null>(() => {
    if (currentChar === null) return null;
    const base = [...currentChar.normalize("NFD")][0] ?? "";
    return /^[a-zA-Z]$/.test(base) ? `K_${base.toUpperCase()}` : null;
  }, [currentChar]);

  // Remove a single mechanism (by index within that char's mechanisms[]) from
  // the configured chip row (regression 3, multi-method — multiple methods per character). If the
  // removed mechanism was the char's only one, the whole char entry is deleted
  // from the map — folding what was previously a separate
  // "remove the whole configured character" handler into this one, since a
  // char with exactly one mechanism behaves identically either way.
  //
  // It removes EXACTLY the one mechanism, never a bulk batch — deleting the
  // accepted base char does not cascade into its sibling-accent group (those
  // are independent long-press alternates). Only the bulk box's "Remove all"
  // clears a batch. An OPEN (pre-confirm) sibling proposal for `char` is
  // cleared, since its pending placements would target a removed base.
  const handleRemoveMechanism = useCallback(
    (char: string, idx: number) => {
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
      // Clear an OPEN (not-yet-confirmed) sibling-accent proposal if its base
      // char was just removed — its pending placements would target a base
      // that no longer exists. A CONFIRMED group is deliberately NOT touched:
      // each accented sibling is an independent long-press alternate of the
      // same key, so removing the accepted base does NOT orphan them. Deleting
      // one rule removes only that rule; the bulk box's "Remove all" is the
      // only control that clears the whole batch.
      setSiblingAccentProposal((prev) =>
        prev !== null && prev.acceptedChar === char ? null : prev,
      );
    },
    [],
  );

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

  // ---------------------------------------------------------------------------
  // Shared styles — defined before guards so they can be referenced in guard renders
  // ---------------------------------------------------------------------------

  // Denominates over touchLettersToAdd (the walk list), NOT the full
  // inventory — mirrors MechanismGallery's lettersToAdd.length coverage
  // denominator (excludes already-detected chars from the count, same as
  // they're excluded from the walk). currentIdx (usePositionalCharNav) also
  // indexes into touchLettersToAdd, so the "Character N of total" counter
  // below stays consistent with N.
  const totalChars = touchLettersToAdd.length;

  // When there is no suggestion to offer for the current character, skip the
  // suggestion card entirely and show the method chooser directly. Otherwise the
  // chooser appears once the suggestion is accepted or dismissed.
  // `currentCharBadge?.isComposable` — an ADDITIONAL gate (bug fix): a
  // character already GREEN purely via COMPOSITION (signal (c) — its NFD
  // components are all separately reachable) must never surface a
  // "suggested" proposal — the badge already reports it covered, and there
  // is no single key/method left for a suggestion to propose.
  // `suggestionDismissed` alone did not catch this, since it only tracks
  // explicit accept/deny or `charTouch` (this gallery's own direct-assignment
  // set), not composability.
  //
  // Deliberately NOT gated on the badge's full `count` (which also folds in
  // signal (a) BASE-DIRECT, `touchBaseDirectSet`): that set is LIVE and
  // session-aware — it already includes a character reachable only because
  // THIS session's own desktop assignment was replayed onto the touch seed
  // (spec 035 R3), or because the live rendered touch layout reaches it some
  // other way. That is exactly the "replace"/"longpress" suggestion's own
  // target scenario (a character reachable via desktop-mirror inheritance
  // but not yet an EXPLICIT touch mechanism) — gating on the full count would
  // suppress that legitimate, already-tested suggestion. Signal (b)
  // SESSION-DIRECT is not tested separately either: for touch it can only
  // come from `charTouchAssignments` (built from `charTouch` itself), so it
  // never disagrees with `suggestionDismissed`'s own `charTouch.has(...)`
  // check above.
  const showChooser =
    suggestionDismissed || suggestion.kind === "none" || (currentCharBadge?.isComposable ?? false);

  // ---------------------------------------------------------------------------
  // Forward-button spec — mirrors MechanismGallery's ForwardButtonSpec.
  // ---------------------------------------------------------------------------

  interface TouchForwardButtonSpec {
    label: string;
    ariaLabel: string;
    onClick: () => void;
    disabled: boolean;
  }

  const touchDoneLabel = t({ id: "editor.assignLoop.doneButton", message: "Done" });
  const touchForwardButton: TouchForwardButtonSpec | null =
    // TOP PRIORITY (bug fix): once every inventory character has count >= 1
    // (allCovered, the SAME badge computation CharScrollStrip/currentCharBadge
    // use) OR every character is implemented-or-marked (unaccountedTouchChars
    // — mark-aware, see below), the Done button is ALWAYS rendered —
    // regardless of currentChar or its walk (touchLettersToAdd) membership.
    // Previously this button was hidden entirely for a currentChar outside
    // touchLettersToAdd (e.g. an already-detected character reached via the
    // SHOW-ALL CharScrollStrip), which could strand an author who had, in
    // fact, finished every character — there was no visible way to advance.
    // Falls through to the existing branch unchanged whenever any character
    // is still count 0 AND unaccounted-for. `onComplete` is a required
    // TouchGalleryProps field (always defined), unlike MechanismGallery's
    // optional one, so there is no separate undefined check here.
    //
    // RECONCILIATION (mechanism-gallery-progression follow-up): a marked
    // character is NEVER excluded from touchLettersToAdd (marking never
    // changes detection/suggestion status, only the mark set), so it can
    // never itself be "the out-of-walk char currentChar jumped to" — but a
    // DIFFERENT, already-covered character elsewhere in the inventory CAN be
    // reached via the SHOW-ALL strip while the marked character sits
    // untouched further down the walk. In that shape, `allCovered` reads
    // false forever (the marked character's producer-badge count is, and
    // stays, 0 — marks are authoring metadata, never a `MechanismAssignment`,
    // so they never move the badge), and the per-char branch below is
    // unreachable (currentChar is outside touchLettersToAdd) — so, before
    // this fix, NO Done button rendered at all, even though every character
    // was genuinely implemented-or-marked. Hence the `||
    // unaccountedTouchChars.length === 0` added below: `unaccountedTouchChars`
    // is mark-aware AND is the exact signal `handleContinue` itself checks
    // before calling `finalizeCompletion` (see that callback above) — so
    // "Done becomes visible" and "Done, if clicked, actually completes" are
    // the SAME condition on this path; OR-ing it in adds no case where a
    // visible enabled Done could still no-op.
    //
    // `allCovered` is kept as an alternate (not replaced) rather than the
    // sole source of truth: it is derived from LIVE, non-mocked signals in
    // production (touchBaseDirectSet ultimately reads the real seed
    // layout/session edits), whereas `unaccountedTouchChars` reads
    // `layoutForLintAndGate`, which in THIS TEST SUITE's harness is rebuilt
    // by a simplified mocked `buildTouchLayoutJson` that does not replay
    // `baseTouchJson`/`mods` the way the real engine does (see the "Done
    // button forced visible" test suite's own doc comments) — a harness gap,
    // not a production one, but keeping `allCovered` alongside means neither
    // the pre-existing shipped/mirrored-content test scenario nor this fix's
    // new marked-character scenario needs the other's signal to be correct.
    (allCovered || unaccountedTouchChars.length === 0)
      ? {
          label: touchDoneLabel,
          ariaLabel: touchDoneLabel,
          onClick: handleContinue,
          disabled: false,
        }
      : currentChar !== null && touchLettersToAdd.includes(currentChar)
        ? {
            label: hasAnotherCharAfterCurrent
              ? t({
                  id: "editor.assignLoop.nextCharacterButton",
                  message: "Next character →",
                })
              : touchDoneLabel,
            ariaLabel: hasAnotherCharAfterCurrent
              ? t({
                  id: "editor.assignLoop.nextCharacterAriaLabel",
                  message: "Next character",
                })
              : touchDoneLabel,
            onClick: handleNext,
            disabled:
              !canGoNext ||
              (!hasAnotherCharAfterCurrent && unaccountedTouchChars.length > 0),
          }
        : null;

  // ---------------------------------------------------------------------------
  // Guard: no inventory
  // ---------------------------------------------------------------------------

  if (inventory.length === 0) {
    return (
      <GalleryEmptyState
        wrapperMaxWidth={560}
        onBack={onBack}
        backAriaLabel={t({
          id: "editor.assignLoop.touch.backToMechanismsAriaLabel",
          message: "Back to mechanisms",
        })}
        message={
          <Trans id="editor.assignLoop.touch.noInventory">
            No characters in inventory yet. Complete the Survey (Phase B) to
            confirm which characters your keyboard must produce.
          </Trans>
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Intro splash — first entry to the touch gallery only
  // ---------------------------------------------------------------------------

  if (showIntro) {
    return (
      <GalleryIntroSplash
        eyebrow={t({
          id: "editor.assignLoop.touch.intro.eyebrow",
          message: "Next step · Touch",
        })}
        title={t({
          id: "editor.assignLoop.touch.intro.title",
          message: "Welcome to the Touch Gallery",
        })}
        body={
          <Trans id="editor.assignLoop.touch.intro.body">
            Your desktop layout is locked in. Now you&rsquo;ll set how each
            character is reached on phones and tablets, where there is no
            physical keyboard.
          </Trans>
        }
        bullets={[
          <Trans id="editor.assignLoop.touch.intro.bullet1" key="bullet1">
            You&rsquo;ll go character by character, just like the desktop
            gallery.
          </Trans>,
          <Trans
            id="editor.assignLoop.touch.intro.markForLaterBullet"
            key="bullet2"
          >
            Pick a touch method &mdash; long-press, flick, multitap, or replace
            &mdash; or mark a character for later review if you&rsquo;d rather
            come back to it.
          </Trans>,
          <Trans id="editor.assignLoop.touch.intro.bullet3" key="bullet3">
            These choices apply to touch only and never change your desktop
            layout.
          </Trans>,
        ]}
        startAriaLabel={t({
          id: "editor.assignLoop.touch.intro.startAriaLabel",
          message: "Start the touch gallery",
        })}
        onStart={() => {
          markGalleryIntroSeen("touch");
          setShowIntro(false);
        }}
        onBack={onBack}
        backAriaLabel={t({
          id: "editor.assignLoop.touch.backToMechanismsPhaseCAriaLabel",
          message: "Back to mechanisms (Phase C)",
        })}
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
  const currentCharDisplay =
    currentChar !== null ? displayChar(currentChar) : null;

  // T120 (FR-036e): the completion gate's own feedback, rendered by BOTH mode
  // panes from this one element. The gate is shared (see `handleContinue`), so
  // its refusal must be legible wherever the author pressed Continue — a gate
  // that explains itself in only one view is, in practice, a gate that tells
  // the author to switch modes. The two panes are mutually exclusive
  // (`leftContent` picks one), so rendering the same element in each shows it
  // exactly once.
  //
  // The uncovered banner keeps `ErrorText tone="warning"` (role="alert" + the
  // canonical WARNING colour), matching the other gate-message sites. The
  // orphaned-edit notice is a separate paragraph because it reports a
  // different thing: not "a character has no key" but "an edit of yours could
  // not be applied".
  //
  // `unaccountedTouchMessage` (mechanism-gallery-progression) — not a
  // separately-tracked `uncoveredMessage` state — drives the banner: it is
  // derived LIVE from `unaccountedTouchChars` (mark-aware; see that memo's own
  // doc comment), so it recomputes on every edit or mark toggle without a
  // separate "clear on edit" effect, and it can never disagree with the
  // by-character pane's proactive forward-button disable, since both read the
  // same memo. `unaccountedTouchMessage` is a named string local, not an
  // inline `.join()` inside the <Trans> children — see this file's own
  // established convention (currentCharDisplay et al.) for why embedding one
  // directly broke the fr catalog before.
  const completionGateNotice = (
    <>
      {unaccountedTouchMessage !== null && (
        <ErrorText tone="warning">
          <Trans id="editor.assignLoop.touch.cannotFinishYet">
            Cannot finish yet — {unaccountedTouchMessage}.
          </Trans>
        </ErrorText>
      )}
      {orphanedEditsAcknowledged && keyModeOverlayReplay.orphaned.length > 0 && (
        <div role="alert" data-testid="touch-orphaned-key-edits-notice">
          <ErrorText tone="warning">
            {t({
              id: "editor.assignLoop.touch.orphanedKeyEdits",
              message: plural(keyModeOverlayReplay.orphaned.length, {
                one: "# key edit no longer matches any key on this layout, so it will not be applied. Your other edits are unaffected. Press Continue again to move on.",
                other:
                  "# key edits no longer match any key on this layout, so they will not be applied. Your other edits are unaffected. Press Continue again to move on.",
              }),
            })}
          </ErrorText>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11, color: TEXT_DIM }}>
            {keyModeOverlayReplay.orphaned.map((op) => (
              <li key={op.seq}>{op.address}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  // onKeyDown lives on this OUTER pane div (not on CharScrollStrip below) so
  // ArrowLeft/ArrowRight cycles the character no matter which control inside
  // the pane currently has focus — a plain native keydown bubbles up to here
  // regardless of the focused descendant. See useCharCycleKeys.ts.
  //
  // Renamed from the original `leftContent` (T072): this is now specifically
  // the by-character mode's pane content. `leftContent` itself (declared
  // further down) picks between this and `keyModeContent` per
  // `touchEditorMode` — a view swap, not a fork (FR-036a/b): neither this
  // component's state nor the store's touchDraft/keyEditOverlay is cleared by
  // the swap.
  const characterModeContent = (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
       the bubbled keydown only ADDS a keyboard capability (ArrowLeft/Right
       character cycling regardless of focused descendant, per the comment
       above); the pane is not made pointer-interactive. */
    <div
      id={leftPaneId}
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
      {/* Coverage line — hidden once totalChars (touchLettersToAdd.length) is
          zero, mirroring MechanismGallery's `{lettersToAdd.length > 0 && ...}`
          guard, rather than showing a meaningless "0 of 0". */}
      {totalChars > 0 && (
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
      )}

      {/* Character scroll strip — horizontal, SHOW-ALL of inventory. Rendered
          here, near the top of the pane (right after the coverage line,
          before both the all-caught-up panel and the per-char block below),
          matching MechanismGallery's real placement — that gallery renders
          its CharScrollStrip above its per-char/empty-diff content too,
          right after its own coverage line + shared top toolbar row. It is
          still a sibling of the per-char block, NOT nested inside it, so it
          stays visible even when currentChar is null — e.g. the all-caught-up
          state below, where every inventory character is walk-excluded but
          the author can still select one for inspection. Not just
          touchLettersToAdd, so the author can still see and inspect every
          character, including ones already reachable on the seed layout, not
          only the ones still needing a method. Click any chip to jump
          straight to that character (replaces the old "Previous character"
          button, which only ever stepped back one position) via
          handleSelectDisplayChar (NOT the walk's own handleSelectChar, which
          is gated on touchLettersToAdd) — an already-detected chip is still
          selectable for inspection, it is just never a walk stop. Each
          chip's badge is the 3-signal producer count for that character in
          THIS gallery's modality (touch) — see charMechanisms.ts's
          getProducerBadge. `touchBaseDirectSet` (signal (a), the LIVE
          direct-reachability set — see that memo's own doc comment for why
          it is live rather than the frozen `baseTouchCoveredSet`, and how it
          stays disjoint from signal (b)) and `directTouchProducedSet`
          (signal (c)'s composition input, pre-augment + session-aware) feed
          that count so a character already reachable on the seed touch
          layout, OR composable from this session's own touch/desktop edits
          (e.g. a precomposed char whose base + combining mark were each
          assigned a method this session), badges as produced (>=1) rather
          than red 0 — both before and after its suggestion is accepted (the
          accepted touch_inherited placeholder is still not counted, so
          accepting cannot double-count it). A character reachable BOTH by
          its own key AND by composition now badges 2, not 1
          (deletion-safety signal, per product decision) — see
          getProducerBadge's own doc comment. */}
      {inventory.length > 0 && (
        <CharScrollStrip
          chars={inventory}
          currentChar={currentChar}
          onSelectChar={handleSelectDisplayChar}
          assignments={charTouchAssignments}
          modality="touch"
          baseDirectSet={touchBaseDirectSet}
          preAugmentSessionAwareSet={directTouchProducedSet}
          markedSet={markedTouchSet}
        />
      )}

      {/* All-caught-up state — every inventory character is already reachable
          on the seed touch layout (touchLettersToAdd is empty), so the walk
          has nothing to step through and currentChar stays null. Mirrors
          MechanismGallery's "No new characters to add" empty-diff panel, but
          (unlike that gallery) still needs its OWN Back/Done row here: the
          per-char block's toolbar below never renders while currentChar is
          null, and handleBack/handleNext are gated on `list.includes` (empty
          touchLettersToAdd), so this panel calls onBack/handleContinue
          directly rather than going through those.
          `&& currentChar === null` (pre-existing gap, fixed here): totalChars
          (touchLettersToAdd.length) being 0 does not mean currentChar stays
          null forever — the SHOW-ALL CharScrollStrip can still set it via
          handleSelectDisplayChar (e.g. inspecting a detected-but-walk-excluded
          character), independently of the walk. Without this guard, that
          selection left THIS panel mounted (rendering its own
          `data-testid="touch-continue"` Done button unconditionally)
          alongside the per-char block below's OWN `touchForwardButton`
          (same testid), which can ALSO render once `currentChar !== null` —
          two elements sharing one test id. The per-char block's
          `touchForwardButton` already reproduces this panel's Done affordance
          whenever `allCovered` is true (see its own doc comment), so gating
          this panel to `currentChar === null` loses no coverage: once a
          selection sets `currentChar`, the per-char block becomes the single
          source for the forward action. */}
      {totalChars === 0 && currentChar === null && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
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
              onClick={onBack}
              aria-label={t({
                id: "editor.assignLoop.touch.backToMechanismsPhaseCAriaLabel",
                message: "Back to mechanisms (Phase C)",
              })}
              style={ghostBtn}
            >
              <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
            </button>
            <div style={{ marginLeft: "auto" }}>
              <button
                type="button"
                data-testid="touch-continue"
                onClick={handleContinue}
                style={{
                  padding: "9px 20px",
                  background: "#238636",
                  border: "none",
                  borderRadius: 6,
                  color: "#e6edf3",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONT,
                }}
              >
                {t({ id: "editor.assignLoop.doneButton", message: "Done" })}
              </button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_DIM }}>
            <Trans id="editor.assignLoop.noNewCharacters">
              No new characters to add.
            </Trans>
          </p>
        </div>
      )}

      {/* Per-char UI */}
      {currentChar !== null && (
        <>
          {/* "Touch mapping" section header — the character-heading card that
              used to live here (glyph + U+ notation) is gone; the
              CharScrollStrip below now shows both on the selected chip
              directly (see CharScrollStrip.tsx). This label is kept so the
              "you're now configuring this character's touch access" cue
              doesn't disappear along with the card. */}
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: TEXT_DIM,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Trans id="editor.assignLoop.touch.mappingEyebrow">
              Touch mapping
            </Trans>
          </p>

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
            {/* HIDE this button entirely (rather than render it disabled)
                when currentChar is outside touchLettersToAdd — mirrors the
                forward button's gating a few lines below. usePositionalCharNav's
                handleBack is a no-op when currentIdx === -1, which is exactly
                the state a detected/already-covered character selected via the
                SHOW-ALL CharScrollStrip (handleSelectDisplayChar) produces: a
                visible-but-dead Back button would look live but do nothing. */}
            {currentChar !== null && touchLettersToAdd.includes(currentChar) && (
              <button
                type="button"
                onClick={handleBack}
                aria-label={
                  currentIdx <= 0
                    ? t({
                        id: "editor.assignLoop.touch.backToMechanismsPhaseCAriaLabel",
                        message: "Back to mechanisms (Phase C)",
                      })
                    : t({
                        id: "editor.assignLoop.touch.backToPreviousCharacterAriaLabel",
                        message: "Back to previous character",
                      })
                }
                style={ghostBtn}
              >
                <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
              </button>
            )}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {/* HIDE this button entirely (rather than render it disabled)
                  when currentChar is outside touchLettersToAdd AND the whole
                  inventory isn't yet fully covered — mirrors
                  MechanismGallery's forwardButton gating: currentChar can now
                  be a detected/already-covered character selected via the
                  SHOW-ALL CharScrollStrip (handleSelectDisplayChar), and the
                  walk's own Next/Done isn't a "global Next" for that
                  inspection — a disabled render would look like the walk is
                  stuck rather than simply "you're inspecting a character
                  outside this step's coverage". `touchForwardButton` (see its
                  own doc comment above) is null in exactly that case;
                  otherwise (including the TOP-PRIORITY allCovered case) it
                  carries the label/handler/disabled state to render. */}
              {touchForwardButton !== null && (
                <button
                  type="button"
                  data-testid="touch-continue"
                  onClick={touchForwardButton.onClick}
                  disabled={touchForwardButton.disabled}
                  aria-label={touchForwardButton.ariaLabel}
                  style={{
                    padding: "9px 20px",
                    background: !touchForwardButton.disabled ? "#238636" : "#21262d",
                    border: "none",
                    borderRadius: 6,
                    color: !touchForwardButton.disabled ? "#e6edf3" : TEXT_DIM,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: !touchForwardButton.disabled ? "pointer" : "not-allowed",
                    fontFamily: FONT,
                  }}
                >
                  {touchForwardButton.label}
                </button>
              )}
            </div>
          </div>

          {/* FR-008 completion gate message — shared with the key-mode pane
              (T120) via `completionGateNotice`, which also carries the
              orphaned-key-edit notice. The uncovered-chars half is now
              (mechanism-gallery-progression) derived LIVE from the mark-aware
              `unaccountedTouchMessage` rather than set imperatively on a click
              attempt — so the reason Done/Continue is disabled is visible
              proactively in the character pane, matching MechanismGallery's
              inline hint, and recomputes automatically on every edit or mark
              toggle; see `completionGateNotice`'s own doc comment. */}
          {completionGateNotice}

          {/* Sibling-accent bulk summary boxes — one green box per accelerator
              batch, at the TOP alongside the single-character suggestion card.
              Scoped to the current character's family (matched by host key) so
              the author sees only the box for the letter they are looking at,
              not every group in the draft. Each box summarizes the batch and
              removes it all in one click. */}
          {bulkAccentGroups
            .filter((group) => group.hostKey === currentCharHostKey)
            .map((group) => {
              const hostLabel = hostKeyShortLabel(group.hostKey, "default");
              const memberList = group.members
                .map((c) => displayChar(c))
                .join(" ");
              return (
                <ProposalCard
                  key={group.id}
                  ariaLabel={t({
                    id: "editor.assignLoop.touch.bulkAccents.ariaLabel",
                    message: "Bulk-added accent family",
                  })}
                  message={
                    <Trans id="editor.assignLoop.touch.bulkAccents.summary">
                      Added {memberList} to {hostLabel} as long-press.
                    </Trans>
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleRemoveBulkGroup(group)}
                    aria-label={t({
                      id: "editor.assignLoop.touch.bulkAccents.removeAllAriaLabel",
                      message: `Remove all letters added to ${{ hostLabel }}`,
                    })}
                    style={{
                      alignSelf: "flex-start",
                      padding: "4px 12px",
                      background: "transparent",
                      border: "1px solid #238636",
                      borderRadius: 6,
                      color: "#56d364",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: FONT,
                    }}
                  >
                    <Trans id="editor.assignLoop.touch.bulkAccents.removeAll">
                      Remove all
                    </Trans>
                  </button>
                </ProposalCard>
              );
            })}

          {/* Sibling-accent PROPOSAL — the longpress accelerator
              (propose-then-confirm, spec v1.3.1 §3c). CHANGE 5: rendered here,
              at the TOP alongside the bulk summary boxes above (not lower down
              near the Configured chip row), so the proposal occupies the SAME
              location its accepted, removable green summary box will occupy
              once confirmed — one consistent spot for "this bulk batch" across
              propose -> confirm. Independent of the case-pair proposal above —
              see SiblingAccentProposalBanner.tsx's module doc for why the two
              never collide for the SAME accept action on the SAME character
              (CHANGE 4's precedence is unaffected by this relocation: which
              proposal is raised, and in what order, is still decided entirely
              by handleUseSuggestion/handleSiblingAccentConfirm/
              handleSiblingAccentDismiss above — this only moves WHERE the
              banner renders). That non-collision is scoped to one accept
              action on one character; it says nothing about navigating away
              mid-decision — see the `currentChar`-keyed reset effect above,
              which abandons both proposals together on nav. */}
          {siblingAccentProposal !== null && (
            <SiblingAccentProposalBanner
              proposal={siblingAccentProposal}
              onConfirm={handleSiblingAccentConfirm}
              onDismiss={handleSiblingAccentDismiss}
            />
          )}

          {/* Suggestion card (shown until accepted/dismissed; skipped entirely
              when there is no suggestion to offer) — consolidated onto the
              shared `ProposalCard` shell (also used by the bulk-accent
              summary box above) rather than re-declaring the same green
              #0d2218/#238636 note chrome a third time. */}
          {!showChooser &&
            (suggestion.kind === "longpress" || suggestion.kind === "replace") && (
              <ProposalCard
                ariaLabel={t({
                  id: "editor.assignLoop.touch.suggestion.ariaLabel",
                  message: "Touch access method suggestion",
                })}
                message={
                  suggestion.kind === "longpress" ? (
                    <Trans id="editor.assignLoop.touch.suggestion.longpressText">
                      Suggested: long-press{" "}
                      {suggestion.hostKey
                        ? hostKeyShortLabel(
                            suggestion.hostKey,
                            touchLayerForChar(currentChar),
                          )
                        : t({
                            id: "editor.assignLoop.touch.aKeyPlaceholder",
                            message: "a key",
                          })}{" "}
                      to reach {currentCharDisplay}
                    </Trans>
                  ) : (
                    <Trans id="editor.assignLoop.touch.suggestion.replaceText">
                      Suggested: replace{" "}
                      {suggestion.hostKey
                        ? hostKeyShortLabel(
                            suggestion.hostKey,
                            touchLayerForChar(currentChar),
                          )
                        : t({
                            id: "editor.assignLoop.touch.aKeyPlaceholder",
                            message: "a key",
                          })}{" "}
                      with {currentCharDisplay}
                    </Trans>
                  )
                }
              >
                <SuggestionActions
                  onAccept={handleUseSuggestion}
                  onDeny={handleSuggestionChange}
                  acceptAriaLabel={
                    suggestion.kind === "longpress"
                      ? t({
                          id: "editor.assignLoop.touch.suggestion.useLongpressAriaLabel",
                          message: `Use suggested long-press method for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                        })
                      : t({
                          id: "editor.assignLoop.touch.suggestion.useReplaceAriaLabel",
                          message: `Use suggested replace method for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                        })
                  }
                  denyAriaLabel={t({
                    id: "editor.assignLoop.touch.chooseDifferentMethodAriaLabel",
                    message: "Choose a different touch method",
                  })}
                />
              </ProposalCard>
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
              layerTokens={layerTokens}
              onLayerTokenChange={handleLayerTokenChange}
              onAddLayerSlot={handleAddLayerSlot}
              onRemoveLayerSlot={handleRemoveLayerSlot}
              validLayerCombos={validLayerCombos}
              layerComboValid={layerComboValid}
              layerPreviewLabel={layerPreviewLabel}
            />
          )}

          {/* Sequences using this character (Part 3) — every recorded
              multi_char_sequence where currentChar appears in ANY slot
              (content, indicator, or output). Sequences are a desktop-only
              (physical) concept — sourced from desktopAssignments — but
              still worth surfacing here: an author configuring touch access
              may need to know this character is already "in play" as a
              sequence's content/indicator/output on the desktop layout.
              Read-only — mirrors the inline SequenceBuilderPanel's "Recorded
              sequences" card style; editing a sequence stays owned by the
              sequence builder. Shared with MechanismGallery's own bottom list — see
              UsesSequencesCard.tsx. */}
          <UsesSequencesCard
            currentChar={currentChar}
            assignments={desktopAssignments}
            modality="touch"
          />

          {/* Apply + Mark for later review. Back and Next/Done live in the
              shared top toolbar row above so the forward-advance control is
              spatially separated from these editing actions.
              "Mark for later review" replaces the old "Skip this character"
              control (mechanism-gallery-progression) — see canGoNext's own
              doc comment above for why. */}
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
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
                <Trans id="editor.assignLoop.applyMethodButton">
                  Apply method
                </Trans>
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleMarkedForLaterTouch(currentChar)}
              aria-pressed={markedTouchSet.has(currentChar)}
              aria-label={
                markedTouchSet.has(currentChar)
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
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                // MARKED: filled amber chip (background + solid border), same
                // amber hue used for the "marked" badge treatment elsewhere in
                // this file. UNMARKED: an outlined chip in ACCENT — visible as
                // an available action against the dark page background
                // (previously transparent/no-border underlined dim text, which
                // read as inert). The two states differ by more than hue: the
                // fill/outline treatment flips, the flag glyph below flips
                // outline->filled, and the label text itself changes. Kept in
                // sync with MechanismGallery's desktop equivalent.
                background: markedTouchSet.has(currentChar)
                  ? "rgba(227,179,65,0.16)"
                  : "transparent",
                border: markedTouchSet.has(currentChar)
                  ? "1px solid #9e6a03"
                  : `1px solid ${ACCENT}`,
                color: markedTouchSet.has(currentChar) ? "#e3b341" : ACCENT,
                fontSize: 12,
                fontWeight: markedTouchSet.has(currentChar) ? 600 : 500,
                cursor: "pointer",
                fontFamily: FONT,
                padding: "6px 12px",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 12 }}>
                {markedTouchSet.has(currentChar) ? "⚑" : "⚐"}
              </span>
              {markedTouchSet.has(currentChar) ? (
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

          {/* Touch-apply warnings — assignments the engine could not honour
              (e.g. an unmatched host key/layer), so an "Apply method" click
              is never a silent no-op. Same visual + aria-live convention as
              the compiler-diagnostics area in GalleryPreviewPane
              (PreviewPane.tsx) — role="status", aria-live="polite", calm
              BG_CARD/BORDER treatment, monospace — rather than a new toast
              system. Each message already names the char + host key + layer
              (see applyTouchAssignmentsToRawJson's warning strings). */}
          {touchApplyWarnings.length > 0 && (
            <div
              role="status"
              aria-live="polite"
              aria-label={t({
                id: "editor.assignLoop.touch.applyWarningsAriaLabel",
                message: plural(touchApplyWarnings.length, {
                  one: "# touch assignment warning",
                  other: "# touch assignment warnings",
                }),
              })}
              style={{
                marginTop: 4,
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 11,
                color: TEXT_DIM,
                fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
              }}
            >
              <div style={{ color: "#d29922", marginBottom: 4 }}>
                {t({
                  id: "editor.assignLoop.touch.applyWarningsHeading",
                  message: plural(touchApplyWarnings.length, {
                    one: "# touch assignment could not be applied:",
                    other: "# touch assignments could not be applied:",
                  }),
                })}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {touchApplyWarnings.map((w, i) => (
                  // Content-derived key (warning text + position, since two
                  // identical warning strings are legitimately possible and
                  // must still each render) rather than a bare index — this
                  // list regenerates fresh per apply attempt, so index alone
                  // isn't wrong today, but keying off content is strictly
                  // more correct and costs nothing.
                  <li key={`${i}:${w}`}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Case-pair proposal — propose-then-confirm, never apply silently
          (spec v1.3.1 §3c). Offers the capital on the shift layer of the
          layer being edited. */}
      {casePairProposal !== null && (
        <CasePairProposalBanner
          proposal={casePairProposal}
          onConfirm={handleCasePairConfirm}
          onDismiss={dismissCompanion}
        />
      )}

      {/* Configured chip row */}
      {charTouch.size > 0 && (
        <RemovableChipRow
          heading={
            <Trans id="editor.assignLoop.touch.configuredHeading">
              Configured
            </Trans>
          }
          groupAriaLabel={t({
            id: "editor.assignLoop.touch.configuredGroupAriaLabel",
            message: "Configured characters — click to remove",
          })}
          chipBackground="#0d2218"
          chipBorder="#238636"
          chipColor="#56d364"
          chipPadding="4px 10px"
          chipFontSize={12}
          chipWhiteSpaceNowrap
          hoverDanger
          items={[...charTouch.entries()].flatMap(([c, assignment]) =>
            // flatMap (not map) so bulk-group members can be dropped while the
            // remaining mechanisms keep their TRUE index — handleRemoveMechanism
            // removes by index, so filtering must not renumber.
            assignment.mechanisms.flatMap((m, i) => {
              const slots = normalizeTouchSlots(m.slotValues);
              const hostKey = slots["hostKey"] ?? "";
              if (m.patternId === "longpress_alternates") {
                const key = bulkMemberKey(c, hostKey);
                // Siblings live in the bulk box, never as their own chip.
                if (bulkMemberKeys.has(key)) return [];
                // The accepted base char's chip is scoped to its family, like
                // the box: shown while editing that family, hidden elsewhere.
                if (bulkBaseKeys.has(key) && hostKey !== currentCharHostKey) {
                  return [];
                }
              }
              return [
                {
                  key: `${c}-${i}`,
                  // Visible chip label only — routes the target through
                  // displayChar() so a standalone combining mark shows the
                  // dotted circle; the aria-label below keeps the raw target
                  // (via touchMechanismLabel(c, ...)) untouched.
                  label: touchMechanismLabel(displayChar(c), m, i18n),
                  onClick: () => handleRemoveMechanism(c, i),
                  ariaLabel: t({
                    id: "editor.assignLoop.touch.removeMechanismAriaLabel",
                    message: `Remove ${{ notation: toUPlusNotation(c) }} ${{ label: touchMechanismLabel(c, m, i18n) }}`,
                  }),
                  title: t({
                    id: "editor.assignLoop.removeCharacterTitle",
                    message: `${{ notation: toUPlusNotation(c) }} — click to remove`,
                  }),
                },
              ];
            }),
          )}
        />
      )}

      {/* Existing methods — the BASE keyboard's own touch-layout producers
            for currentChar (mirrors MechanismGallery's desktop "Existing
            methods" section), PLUS the SHOW-ALL composition/floor rows (spec
            follow-up). COLOR tracks PRODUCED vs. USED; deletability is a
            SEPARATE signal (which branch below a row takes), not color:
              - row.deletable       -> green HoverDangerChip: "×" +
                red-on-hover + click-to-delete, calling deleteTouchKey(row.id)
                directly (only "touch"-kind rows are ever deletable — an
                explicit `output`, a `U_<HEX>` id, or any longpress/multitap/
                flick sub-entry).
              - !deletable          -> GREEN NonDeletableMethodChip, static:
                a layer-switch main key (still PRODUCES the char — it just
                also switches layers, so it can't be removed here), AND the
                composition/unattributed SHOW-ALL rows. Touch method
                descriptors carry no "used" concept at all (unlike desktop's
                storeSlot rows) — every non-deletable touch row produces the
                char, so every one is green, never blue. See
                existingMethodRows above for how rows are built. */}
      {currentChar !== null && existingMethodRows.length > 0 && (
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
            <Trans id="editor.assignLoop.touch.existingMethodsHeading">
              Existing methods
            </Trans>
          </p>
          <div
            role="group"
            aria-label={t({
              id: "editor.assignLoop.touch.existingMethodsGroupAriaLabel",
              message: "Existing touch methods from the base keyboard",
            })}
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {existingMethodRows.map((row) =>
              row.deletable ? (
                <HoverDangerChip
                  key={row.id}
                  onClick={() => deleteTouchKey(row.id)}
                  ariaLabel={t({
                    id: "editor.assignLoop.touch.removeExistingMethodAriaLabel",
                    message: `Remove existing touch method ${{ label: row.label }} for ${{ notation: toUPlusNotation(currentChar) }}`,
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
                    cursor: "pointer",
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
                // GREEN, static — every non-deletable touch row (layer-switch
                // main keys AND composition/unattributed) PRODUCES the
                // character; there is simply no single key/sub-entry to
                // surgically remove. See NonDeletableMethodChip's doc comment
                // (parts/RemovableChipRow.tsx) for the shared palette.
                <NonDeletableMethodChip
                  key={row.id}
                  variant="green"
                  {...(row.reason !== undefined ? { reason: row.reason } : {})}
                >
                  {row.label}
                </NonDeletableMethodChip>
              ),
            )}
          </div>
        </div>
      )}

      {/* Restore affordance for deleted pre-existing touch methods (FIX:
            deleteTouchKey was previously one-way in this gallery — the
            store's restoreTouchKey/isTouchKeyDeleted pair existed but nothing
            in the UI called restoreTouchKey). Rendered as greyed, struck-
            through "click to restore" chips — a minimal inline second surface
            rather than a whole new panel, consistent with the "Existing
            methods" section's styling above. See deletedExistingTouchMethods/
            handleRestoreExistingTouchMethod above. */}
      {currentChar !== null && deletedExistingTouchMethods.length > 0 && (
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
            <Trans id="editor.assignLoop.touch.existingMethods.deletedHeading">
              Deleted methods
            </Trans>
          </p>
          <div
            role="group"
            aria-label={t({
              id: "editor.assignLoop.touch.existingMethods.deletedGroupAriaLabel",
              message: "Deleted touch methods — click to restore",
            })}
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {deletedExistingTouchMethods.map((method) => {
              const label = composeTouchMethodLabel(
                method,
                allTouchMethodsForChar,
                i18n,
              );
              return (
                <HoverDangerChip
                  key={method.id}
                  onClick={() => handleRestoreExistingTouchMethod(method)}
                  hoverDanger={false}
                  ariaLabel={t({
                    id: "editor.assignLoop.touch.existingMethods.restoreAriaLabel",
                    message: `Restore deleted touch method ${{ label }} for ${{ notation: toUPlusNotation(currentChar) }}`,
                  })}
                  title={t({
                    id: "editor.assignLoop.touch.existingMethods.clickToRestore",
                    message: "deleted — click to restore",
                  })}
                  baseStyle={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    background: "#161b22",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    color: TEXT_DIM,
                    fontSize: 11,
                    fontFamily:
                      "ui-monospace, 'Cascadia Code', Consolas, monospace",
                    cursor: "pointer",
                    textDecoration: "line-through",
                  }}
                >
                  {label}
                </HoverDangerChip>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );

  // ---------------------------------------------------------------------------
  // Key mode (T072) — the editable schematic grid surface. FR-020h/FR-035:
  // this MUST read as visually and verbally distinct from the live OSK
  // preview beside it (labelled "for editing" here vs. "for testing" on the
  // preview pane below) so the two keyboard-shaped surfaces never look like
  // two ways to do the same thing. Wrapped in the SAME onKeyDown/style shell
  // characterModeContent uses, so the pane-level ArrowLeft/Right char-cycle
  // handler (useCharCycleKeys) still correctly skips past the grid — its
  // SKIP_SELECTOR already excludes `[role="grid"]`.
  const keyModeContent = (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
       same bubbled-keydown rationale as characterModeContent above; this
       pane is not made pointer-interactive. */
    <div
      id={leftPaneId}
      onKeyDown={handlePaneKeyDown}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "24px 20px",
        overflowY: "auto",
        boxSizing: "border-box",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={t({
            id: "editor.assignLoop.touch.keyMode.backAriaLabel",
            message: "Back to mechanisms",
          })}
          data-testid="touch-key-mode-back"
          style={ghostBtn}
        >
          <Trans id="editor.assignLoop.touch.keyMode.backButton">
            ← Back
          </Trans>
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={unaccountedTouchChars.length > 0}
          data-testid="touch-key-mode-continue"
          style={{
            ...headerBtnStyle,
            width: "auto",
            color: unaccountedTouchChars.length > 0 ? TEXT_DIM : headerBtnStyle.color,
            cursor: unaccountedTouchChars.length > 0 ? "not-allowed" : "pointer",
          }}
        >
          <Trans id="editor.assignLoop.touch.keyMode.continueButton">
            Continue
          </Trans>
        </button>
      </div>

      {/* T120 (FR-036e): the SAME gate feedback the character pane shows —
          coverage refusal and the orphaned-key-edit notice. Either mode
          completes the step, so either mode has to be able to say why it
          didn't. */}
      {completionGateNotice}

      {/* The "for editing" verb (FR-020h) — an editable SCHEMATIC layout, not
          a rendered keyboard you type on. */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          color: TEXT_DIM,
          fontFamily: FONT,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <Trans id="editor.assignLoop.touch.keyMode.editingLabel">
          Editable layout — for editing
        </Trans>
      </p>

      {/* Grid + inspector + AssignPanel share ONE detail region (spec 058
          T085-T089 composition): Escape anywhere inside it returns focus to
          the selected cell (handleKeyModeDetailEscape), and Enter on a
          gridcell (handleKeyModeGridKeyDown) jumps straight into
          AssignPanel's character field — the keyboard-only path SC-004
          measures. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
          bubbled Escape-handling only, mirroring this pane's own outer div
          above; not made pointer-interactive. */}
      <div
        ref={keyModeDetailContainerRef}
        onKeyDown={handleKeyModeDetailEscape}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {keyModeViewModel !== undefined ? (
          <KeyGrid
            viewModel={keyModeViewModel}
            selectedAddress={selectedKeyAddress}
            onSelectCell={handleSelectKeyCell}
            onKeyDown={handleKeyModeGridKeyDown}
            label={t({
              id: "editor.assignLoop.touch.keyMode.gridAriaLabel",
              message: `Editable touch key layout — ${{ layer: activeKeyLayerId }} layer`,
            })}
            platforms={keyModePlatforms}
            {...(activeKeyPlatformId !== null
              ? { activePlatformId: activeKeyPlatformId }
              : {})}
            onPlatformChange={(platformId) => setActiveKeyPlatformId(platformId)}
            provenance={keyModeProvenance}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}>
            <Trans id="editor.assignLoop.touch.keyMode.notReady">
              The key layout isn&rsquo;t ready yet.
            </Trans>
          </p>
        )}

        {/* T070/T085 detail surfaces — display (KeyInspector) beside editing
            (AssignPanel). Both take the SAME selectedKeyCell/effective layout
            the grid itself renders, so they can never disagree with it. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <KeyInspector
            selectedCell={selectedKeyCell}
            {...(effectiveKeyModeLayout !== null
              ? { layout: effectiveKeyModeLayout }
              : {})}
          />

          {ir !== null && keyModeRuleIndex !== undefined && (
            <AssignPanel
              selectedCell={selectedKeyCell}
              layout={effectiveKeyModeLayout ?? EMPTY_TOUCH_LAYOUT}
              ir={ir}
              ruleIndex={keyModeRuleIndex}
              inventoryChars={inventory}
              capsHandled={capsHandled}
              {...(identityBcp47 !== undefined ? { bcp47: identityBcp47 } : {})}
              repertoire={inventory}
              onCommit={handleAssignPanelCommit}
            />
          )}
        </div>

        {/* FR-036f: warn AT THE MOMENT of the edit when a key-level edit
            invalidates a by-character assignment — never deferred to the
            Continue gate. Same visual + aria-live convention as
            touchApplyWarnings above (role="status", aria-live="polite",
            calm BG_CARD/BORDER treatment). */}
        {keyEditInvalidationWarnings.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            data-testid="key-edit-invalidation-warnings"
            aria-label={t({
              id: "editor.assignLoop.touch.keyMode.invalidationWarningsAriaLabel",
              message: plural(keyEditInvalidationWarnings.length, {
                one: "# assignment invalidated by this edit",
                other: "# assignments invalidated by this edit",
              }),
            })}
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
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {keyEditInvalidationWarnings.map((w) => (
                <li key={w.char}>{w.message}</li>
              ))}
            </ul>
            {/* T119 (US5 AS3): the warning is inline and the edit STANDS — an
                editor must permit invalid intermediate states — so the two
                remedies are offered right here rather than left implicit.
                "Undo this edit" pops the committed operation off the shared
                chronological stack (`undoKeyEdit`, Phase 5c); "restore" is the
                FR-062 path, and needs no button because a character that lost
                its last mechanism has already been returned to the walk by the
                commit handler above (`returnedToWorklistChars`) — the note says
                so instead of offering an action that already happened. Whatever
                the author does here, the FR-008 coverage gate still BLOCKS at
                Continue; this changes nothing about that. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <button
                type="button"
                data-testid="key-edit-invalidation-undo"
                onClick={() => {
                  useWorkingCopyStore.getState().undoKeyEdit();
                  setKeyEditInvalidationWarnings([]);
                }}
                style={{
                  fontFamily: FONT,
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: `1px solid ${BORDER}`,
                  background: "transparent",
                  color: TEXT_MAIN,
                  cursor: "pointer",
                }}
              >
                {t({
                  id: "editor.assignLoop.touch.keyMode.invalidationUndo",
                  message: "Undo this edit",
                })}
              </button>
              {keyEditInvalidationWarnings.some((w) => w.returnsToWorklist) && (
                <span data-testid="key-edit-invalidation-restore-note" style={{ fontFamily: FONT }}>
                  {t({
                    id: "editor.assignLoop.touch.keyMode.invalidationRestoreNote",
                    message:
                      "Or keep the edit — the affected characters are back in the by-character list, ready to place somewhere else.",
                  })}
                </span>
              )}
            </div>
            {/* T119 (US5 AS3): when one of the affected characters is in the
                confirmed inventory, say so HERE — the FR-008 gate will refuse
                Continue until it types again, and telling the author at the
                gate instead of at the edit is exactly the deferral US5 exists
                to remove. Stated, never enforced: the edit above already
                stands. */}
            {keyEditInvalidationWarnings.some((w) => w.blocksContinue) && (
              <div
                data-testid="key-edit-invalidation-blocks-continue"
                style={{ marginTop: 6, fontFamily: FONT, color: TEXT_MAIN }}
              >
                {t({
                  id: "editor.assignLoop.touch.keyMode.invalidationBlocksContinue",
                  message:
                    "This step cannot be finished while a character from your list has no key. Place it somewhere else, or undo the edit.",
                })}
              </div>
            )}
          </div>
        )}

        {/* T118 (FR-045): the REFUSAL surface. `role="alert"`, not
            `role="status"`: unlike the invalidation warning above — which
            reports something that already happened and can be read at leisure —
            a rejection means the author's edit did NOT land, and they will
            otherwise carry on believing it did. A non-blocking (confirmable)
            rejection is recorded as acknowledged on this first showing, so
            repeating the same edit proceeds (propose-then-confirm, §3c). */}
        {keyEditRejections.length > 0 && (
          <div
            role="alert"
            data-testid="key-edit-rejections"
            style={{
              background: BG_CARD,
              border: `1px solid ${ERROR_RED}`,
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 11,
              color: TEXT_MAIN,
              fontFamily: FONT,
            }}
          >
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {keyEditRejections.map((r) => (
                <li key={`${r.reason}-${r.keyId}`} data-rejection-reason={r.reason}>
                  {r.message}
                  {!r.blocking && (
                    <span style={{ color: TEXT_DIM }}>
                      {" "}
                      {t({
                        id: "editor.assignLoop.touch.keyMode.rejectionConfirmHint",
                        message: "Make the same change again to go ahead anyway.",
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  // T072: a view swap, not a fork — touchEditorMode selects which mode's
  // pane content renders; neither mode's in-progress state is touched by
  // the swap itself (FR-036a/b).
  const leftContent =
    touchEditorMode === "key" ? keyModeContent : characterModeContent;

  // ---------------------------------------------------------------------------
  // Two-pane layout (via the shared AssignLoopShell)
  // ---------------------------------------------------------------------------

  // T072 (FR-035): the mode selector as an APG tabs pattern — two tabs, one
  // surface. Automatic activation (Left/Right/Home/End move AND select,
  // wrapping) mirrors KeyGrid.tsx's own platform-tablist pattern (T077) —
  // the one existing tabs precedent in this codebase.
  const touchModeTabs: ReadonlyArray<{ id: TouchEditorMode; label: string }> =
    [
      {
        id: "character",
        label: t({
          id: "editor.assignLoop.touch.mode.characterTab",
          message: "By character",
        }),
      },
      {
        id: "key",
        label: t({
          id: "editor.assignLoop.touch.mode.keyTab",
          message: "By key",
        }),
      },
    ];

  const handleModeTabsKeyDown = (
    e: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    const activeIndex = touchModeTabs.findIndex(
      (tab) => tab.id === touchEditorMode,
    );
    let nextIndex: number;
    switch (e.key) {
      case "ArrowRight":
        nextIndex =
          activeIndex === -1 ? 0 : (activeIndex + 1) % touchModeTabs.length;
        break;
      case "ArrowLeft":
        nextIndex =
          activeIndex === -1
            ? 0
            : (activeIndex - 1 + touchModeTabs.length) % touchModeTabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = touchModeTabs.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = touchModeTabs[nextIndex];
    if (!next) return;
    handleSwitchTouchEditorMode(next.id);
    modeTabRefs.current.get(next.id)?.focus();
  };

  // T076 (FR-036g): the undo affordance names what it is about to undo —
  // never a bare "Undo" once the stack is non-empty — since after a mode
  // switch the next undo may target the OTHER mode's work (a 't' touch-
  // method deletion made in character mode vs. a 'k' key edit made in key
  // mode). Each branch is its own literal `t({id, message})` call (not a
  // dynamically-assembled template) so Lingui's static extractor sees every
  // variant.
  let undoAffordanceLabel: string = t({
    id: "editor.assignLoop.touch.undo.nothingToUndo",
    message: "Nothing to undo",
  });
  if (undoTargetDescription !== null) {
    switch (undoTargetDescription.kind) {
      case "node":
        undoAffordanceLabel = t({
          id: "editor.assignLoop.touch.undo.node",
          message: `Undo removing ${{ id: undoTargetDescription.id }}`,
        });
        break;
      case "item":
        undoAffordanceLabel = t({
          id: "editor.assignLoop.touch.undo.item",
          message: `Undo removing ${{ id: undoTargetDescription.id }}`,
        });
        break;
      case "batch":
        undoAffordanceLabel = t({
          id: "editor.assignLoop.touch.undo.batch",
          message: plural(undoTargetDescription.count, {
            one: "Undo removing # item",
            other: "Undo removing # items",
          }),
        });
        break;
      case "touchKey":
        undoAffordanceLabel = t({
          id: "editor.assignLoop.touch.undo.touchKey",
          message: `Undo deleting the touch method on ${{ id: undoTargetDescription.keyId }}`,
        });
        break;
      case "keyEdit":
        undoAffordanceLabel = t({
          id: "editor.assignLoop.touch.undo.keyEdit",
          message: `Undo the ${{ opKind: undoTargetDescription.opKind }} edit on ${{ id: undoTargetDescription.keyId }}`,
        });
        break;
    }
  }

  // T075 (FR-036d): ONE shared set of progress figures, both derived from
  // keyGridProgress above — never two independently maintained counters.
  // Visible regardless of touchEditorMode (headerExtras renders once, above
  // whichever pane content is currently mounted).
  const unplacedCharsLabel = t({
    id: "editor.assignLoop.touch.progress.unplacedChars",
    message: plural(keyGridProgress.unplacedChars.length, {
      one: "# character still unplaced",
      other: "# characters still unplaced",
    }),
  });
  const keysWithNoOutputLabel = t({
    id: "editor.assignLoop.touch.progress.keysWithNoOutput",
    message: plural(keyGridProgress.keysWithNoOutput.length, {
      one: "# key with no letter",
      other: "# keys with no letter",
    }),
  });

  const headerExtras = (
    <>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- same
          roving-tabindex model as KeyGrid.tsx's own platform tablist (T077):
          DOM focus lives on the individual role="tab" buttons (each with its
          own managed tabIndex below), never on this tablist container, which
          intentionally carries no tabIndex of its own. */}
      <div
        role="tablist"
        aria-label={t({
          id: "editor.assignLoop.touch.modeTabsAriaLabel",
          message: "Touch editing view",
        })}
        data-testid="touch-mode-tabs"
        onKeyDown={handleModeTabsKeyDown}
        style={{ display: "flex", gap: 4, flexShrink: 0 }}
      >
        {touchModeTabs.map((tab) => {
          const isActive = tab.id === touchEditorMode;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              ref={(el) => {
                if (el) modeTabRefs.current.set(tab.id, el);
                else modeTabRefs.current.delete(tab.id);
              }}
              aria-selected={isActive}
              aria-controls={leftPaneId}
              tabIndex={isActive ? 0 : -1}
              data-testid={`touch-mode-tab-${tab.id}`}
              onClick={() => handleSwitchTouchEditorMode(tab.id)}
              style={{
                padding: "4px 10px",
                background: isActive ? "#0d2840" : "transparent",
                border: `1px solid ${isActive ? ACCENT : BORDER}`,
                borderRadius: 6,
                color: isActive ? TEXT_MAIN : TEXT_DIM,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={undoDelete}
        disabled={undoStack.length === 0}
        aria-label={undoAffordanceLabel}
        title={undoAffordanceLabel}
        data-testid="touch-undo-button"
        style={{
          ...ghostBtn,
          opacity: undoStack.length === 0 ? 0.5 : 1,
          cursor: undoStack.length === 0 ? "default" : "pointer",
          flexShrink: 0,
        }}
      >
        <Trans id="editor.assignLoop.touch.undo.label">Undo</Trans>
      </button>

      {/* T075 (FR-036d) — ONE shared, derived set of progress figures, live in
          both modes. aria-live (not role="status", which the coverage line
          above already claims uniquely per-pane) so a screen reader hears an
          update without a second competing status region. */}
      <div
        aria-live="polite"
        data-testid="touch-shared-progress"
        style={{
          display: "flex",
          gap: 12,
          fontSize: 12,
          color: TEXT_DIM,
          fontFamily: FONT,
          flexShrink: 0,
        }}
      >
        <span data-testid="touch-progress-unplaced">{unplacedCharsLabel}</span>
        <span data-testid="touch-progress-no-output-keys">
          {keysWithNoOutputLabel}
        </span>
      </div>

      {touchEditorMode === "character" ? (
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
              For each character, choose how it appears on the touch keyboard.
              Your desktop layout is locked — these apply to phone and tablet
              only.
            </Trans>
          </span>
        </>
      ) : (
        <span
          style={{
            fontSize: 13,
            color: TEXT_DIM,
            fontFamily: FONT,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Trans id="editor.assignLoop.touch.keyMode.headerDescription">
            Edit keys directly on the schematic layout below — add, remove, or
            change what a key produces. Your desktop layout is locked — these
            apply to phone and tablet only.
          </Trans>
        </span>
      )}
    </>
  );

  // FR-020h/FR-035: the live OSK preview's "for testing" verb — this is the
  // surface you TYPE ON, in contrast with the schematic key-mode grid's
  // "for editing" label above (keyModeContent). The character-mode wording
  // stays exactly as it was (no id/message change) since that mode never
  // renders anything grid-shaped beside the preview to be confused with.
  const previewHeading =
    touchEditorMode === "key"
      ? t({
          id: "editor.assignLoop.touch.keyMode.previewHeading",
          message: "Live keyboard — for testing",
        })
      : t({
          id: "editor.assignLoop.touch.previewHeading",
          message: "Touch preview",
        });

  return (
    <>
      <AssignLoopShell
        headingText={t({
          id: "editor.assignLoop.touchGalleryHeading",
          message: "Touch Gallery",
        })}
        modalityLabel={t({
          id: "editor.assignLoop.modality.touch",
          message: "Touch",
        })}
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
            heading={previewHeading}
            warningLabel={t({
              id: "editor.assignLoop.touch.previewWarnings",
              message: "Preview warnings:",
            })}
          />
        }
      />
    </>
  );
}
