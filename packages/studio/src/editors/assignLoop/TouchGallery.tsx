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
// The inline touch-lint panel that surfaced Layer C findings below the
// character cards has been removed; only the FR-008 completion gate remains.
// FR-008 completion gate: handleContinue re-runs touchCoverage on the same
// layout lint audits and refuses to complete (surfacing an inline message)
// while any inventory char is unreachable — see `layoutForLintAndGate` and
// `uncoveredMessage` below.
//
// Single 300 ms debounce contract upheld — no second timer introduced.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type CSSProperties,
} from "react";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import { ConfirmDialog } from "./parts/ConfirmDialog.tsx";
import type {
  TouchAssignment,
  MechanismRef,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  toUPlusNotation,
  isDecomposableAccented,
  formatUncoveredTouchMessage,
  computeTouchCoverage,
} from "@keyboard-studio/contracts";
import type { DesktopModifications, ModifierToken } from "@keyboard-studio/engine";
import {
  parseTouchLayout,
  touchCoverage,
  resolveTouchLayerId,
  enumerateTouchMethodsForChar,
  applyTouchKeycapRemovalsToLayout,
  applyTouchKeycapRemovalsToRawJson,
  collectCompositionMethod,
  collectLayerCombosInUse,
  comboToTouchLayerId,
  canonicalizeCombo,
  addableTouchLayerTokens,
  optionsForTouchLayerSlot,
} from "@keyboard-studio/engine";
import type { TouchMethodDescriptor } from "@keyboard-studio/engine";
import {
  buildTouchLayoutJson,
  deriveSeedLayout,
} from "../../lib/buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import {
  formatModifierCombo,
  MODIFIER_TOKEN_LABELS,
} from "../../lib/modifierTokenLabel.ts";
import { deriveDesktopModifications } from "../../lib/deriveDesktopModifications.ts";
import { extractMechanismHostKey } from "../../lib/extractMechanismHostKey.ts";
import {
  shouldEmitTouchLayout,
  resolveTouchSeedSource,
} from "../../lib/touchEmission.ts";
import { formatUncoveredCharsList } from "../../lib/unimplementedInventory.ts";
import { ErrorText } from "../../ui/index.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import {
  promoteOnManualEdit,
  casePairTouchLayer,
  type TouchLayerId,
} from "./touchBehavior.ts";
import { useCasePairCompanion } from "./casePairCompanion.ts";
import { CasePairProposalBanner } from "./CasePairProposalBanner.tsx";
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
import type {
  ScaffoldSpec,
  VfsTransform,
} from "../../hooks/useKeyboardArtifact.ts";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { KeyPickerField } from "./KeyPickerField.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import { usePositionalCharNav } from "./usePositionalCharNav.ts";
import { AssignLoopShell } from "./AssignLoopShell.tsx";
import { CharScrollStrip } from "./parts/CharScrollStrip.tsx";
import { UsesSequencesCard } from "./parts/UsesSequencesCard.tsx";
import { GalleryEmptyState } from "./parts/GalleryEmptyState.tsx";
import {
  RemovableChipRow,
  HoverDangerChip,
  NonDeletableMethodChip,
} from "./parts/RemovableChipRow.tsx";
import { SelectMenu, type SelectMenuOption } from "../../ui/SelectMenu.tsx";
import { KEY_OPTIONS, VALID_HOST_KEYS } from "../../lib/keyOptions.ts";
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

const selectStyle: CSSProperties = gallerySelectMenuStyle(160);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The empty/no-op DesktopModifications — the mods memo's fallback when baseIr is null. */
const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };

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
  const short = keyId.startsWith("K_") ? keyId.slice(2) : keyId;
  if (layer === "default") return short.toLowerCase();
  if (isCasingBearingTouchLayer(layer)) return short.toUpperCase();
  return short;
}

/** Direction code to arrow character. */
function dirArrow(dir: string): string {
  if (dir === "n") return "↑"; // up
  if (dir === "s") return "↓"; // down
  if (dir === "e") return "→"; // right
  if (dir === "w") return "←"; // left
  return dir;
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
// chooser option — inherited characters are recorded via the auto-detected
// "already" suggestion (handleSuggestionAccept), and Skip moves on without an
// assignment. The pattern-apply engine still understands the touch_inherited
// patternId those suggestions produce.
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
 * The touch layer a placement of `char` belongs on, derived from the letter's
 * case (FR-006). Before this existed, case was simply UNREPRESENTABLE in a
 * touch placement — both appliers hardcoded the phone `default` layer — so an
 * accented uppercase letter landed on the lowercase layer.
 *
 * This reads the character's case; it does NOT change it. The one
 * `.toUpperCase()` left on the touch path builds a vkey NAME (`K_A`), not a
 * letter, and is unrelated.
 */
function touchLayerForChar(char: string): TouchLayerId {
  return /^\p{Lu}$/u.test(char) ? "shift" : "default";
}

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

/** Message text style shared by all three suggestion-card variants. */
const suggestionMessageStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#56d364",
  fontFamily: FONT,
  fontWeight: 600,
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
}

export function TouchGallery({ onComplete, onBack }: TouchGalleryProps) {
  const { t, i18n } = useLingui();
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
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);

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
  // below, next to Apply/Skip, using the same visual + aria-live convention
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

  const { stage, retry } = useKeyboardArtifact(
    baseKeyboard,
    scaffoldSpec,
    vfsTransform,
  );

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
      return inventory.find((c) => !charTouch.has(c)) ?? inventory[0] ?? null;
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
  // Raw uncovered chars backing the leave-warning modal below (count + list) —
  // tracked alongside uncoveredMessage (the formatted inline banner text)
  // rather than re-parsed from it.
  const [uncoveredChars, setUncoveredChars] = useState<string[]>([]);
  // Soft-warning modal (the gallery leave-warning): "Go back and finish" (stay) vs. "Come back
  // later" (defer — proceeds with completion anyway). Distinct from the
  // FR-008 inline gate message above, which still refuses the *default*
  // Done/Skip-from-last action outright; this modal is the explicit escape
  // hatch layered on top of it.
  const [showUnimplementedWarning, setShowUnimplementedWarning] =
    useState(false);

  // Clear a stale gate message as soon as the author makes another edit —
  // "cleared when coverage passes or edits change" (T016b): re-running
  // handleContinue will re-surface the message if the edit didn't fix it.
  // Deliberately keyed on touchKey only (not currentChar): the message lists
  // ALL uncovered inventory chars at once, not per-character state, so simply
  // navigating to a different character must NOT clear it — only an actual
  // edit (or a fresh handleContinue re-check) should.
  useEffect(() => {
    setUncoveredMessage(null);
    setUncoveredChars([]);
    setShowUnimplementedWarning(false);
  }, [touchKey]);

  // Emit only chars where a real (non-inherited) or inherited assignment was
  // explicitly accepted — everything in charTouch was put there by the user.
  // `.some()` rather than `mechanisms[0]` (regression 3, multi-method): a
  // character can carry several mechanisms, so any real (non-inherited) one
  // qualifies it, not just whichever happens to be first in the array.
  // Shared by the "already covered" completion path and the leave-warning
  // modal's "Come back later" (deferred completion) below.
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
  // FR-008 gate: before completing, re-run touchCoverage on the same layout
  // lint audits (layoutForLintAndGate — includes current Phase E edits).
  // While any inventory char is uncovered, refuse the default Done/Skip
  // action and surface an inline message + the leave-warning modal (the gallery leave-warning)
  // naming the uncovered chars — "Come back later" (onSecondary below) is the
  // only path that still completes with characters unimplemented.
  const handleContinue = useCallback(() => {
    if (layoutForLintAndGate !== null) {
      const { uncovered } = touchCoverage(layoutForLintAndGate, inventory);
      if (uncovered.length > 0) {
        setUncoveredMessage(
          uncovered.map((c) => formatUncoveredTouchMessage(c)).join("; "),
        );
        setUncoveredChars([...uncovered]);
        setShowUnimplementedWarning(true);
        return;
      }
    }
    finalizeCompletion();
  }, [layoutForLintAndGate, inventory, finalizeCompletion]);

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
      devLog.error("[TouchGallery] detectedChars coverage failed", err);
      return new Set<string>();
    }
    // inventoryKey is the stable primitive proxy for `inventory` (declared
    // above, before this memo) — same precedent as touchKey/modsDepsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionSeedLayout, inventoryKey]);

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
      const { uncovered } = computeTouchCoverage(detectionSeedLayout, inventory);
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

    // SHOW-ALL floor — currentChar is GREEN (detectedChars, the augmented set
    // the CharScrollStrip badge uses) but still has zero rows after
    // everything above.
    if (
      currentChar !== null &&
      rows.length === 0 &&
      detectedChars.has(currentChar)
    ) {
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
    detectedChars,
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

  // The tokens actually chosen across all slots so far (order-independent,
  // deduped) — the builder's assembled combo. Canonicalized so it compares
  // directly against `validLayerComboKeys`/`comboToTouchLayerId`; the
  // exclusion logic the SelectMenu options are constrained by
  // (optionsForTouchLayerSlot) already prevents an internally
  // exclusion-inconsistent selection from being constructible through the
  // UI, so the catch branch is defensive only.
  const filledLayerTokens = layerTokens.filter(
    (tok): tok is ModifierToken => tok !== "",
  );
  let assembledLayerCombo: ModifierToken[];
  try {
    assembledLayerCombo = canonicalizeCombo(filledLayerTokens);
  } catch {
    assembledLayerCombo = filledLayerTokens;
  }

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
  // ---------------------------------------------------------------------------
  // Case-pair proposal — the SAME hook and banner the other two mechanisms use
  // ---------------------------------------------------------------------------

  /**
   * The touch layer the author is editing — the builder's assembled combo
   * (`layerTouchId`) for all four methods, which now all carry the same
   * touch-layer combo builder (see the module-level TouchLayerBuilder doc).
   * Widens `casePairTouchLayer`'s mapping rather than rewriting the proposal
   * site, exactly as anticipated when this was still hardcoded to
   * longpress/flick only.
   */
  const editingLayer: TouchLayerId = layerTouchId;

  const {
    proposal: casePairProposal,
    propose: proposeCompanion,
    dismiss: dismissCompanion,
    clear: clearCompanion,
  } = useCasePairCompanion();

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

    // Case-pair proposal (FR-005): offer the capital on the casing-parallel
    // layer of the layer being edited. Suppressed when that layer has no
    // parallel (already a shift/caps layer), and by the hook itself when the
    // character has no confident capital. Deliberately independent of
    // `suggestionResolved`, which governs the placement-suggestion card — a
    // different object entirely.
    const targetLayer = casePairTouchLayer(editingLayer);
    if (targetLayer !== null && resolvedHostKey !== null) {
      const hk = resolvedHostKey;
      proposeCompanion({
        mechanism: "touch",
        originalChar: currentChar,
        hostKey: hk,
        targetLayer,
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
    editingLayer,
    proposeCompanion,
  ]);

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
          <Trans id="editor.assignLoop.touch.intro.bullet2" key="bullet2">
            Pick a touch method &mdash; long-press, flick, multitap, or replace
            &mdash; or Skip characters that already work.
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
                    ? t({
                        id: "editor.assignLoop.nextCharacterAriaLabel",
                        message: "Next character",
                      })
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
                  ? t({
                      id: "editor.assignLoop.nextCharacterButton",
                      message: "Next character →",
                    })
                  : t({ id: "editor.assignLoop.doneButton", message: "Done" })}
              </button>
            </div>
          </div>

          {/* Character scroll strip — horizontal, all of inventory; click
              any chip to jump straight to that character (replaces the old
              "Previous character" button, which only ever stepped back one
              position). Each chip's badge is the produces-count for that
              character in THIS gallery's modality (touch) — see
              charMechanisms.ts. `inheritedChars` feeds the seed-reachable
              set into that count so a character this gallery reports as
              "already in the touch layout" badges as produced (>=1) rather
              than red 0 — both before and after its suggestion is accepted
              (the accepted touch_inherited placeholder is still not counted,
              so accepting cannot double-count it). */}
          <CharScrollStrip
            chars={inventory}
            currentChar={currentChar}
            onSelectChar={handleSelectChar}
            assignments={charTouchAssignments}
            modality="touch"
            inheritedChars={detectedChars}
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
              aria-label={t({
                id: "editor.assignLoop.touch.suggestion.ariaLabel",
                message: "Touch access method suggestion",
              })}
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
                  <p style={suggestionMessageStyle}>
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
                  </p>
                  <SuggestionActions
                    onAccept={handleUseSuggestion}
                    onDeny={handleSuggestionChange}
                    acceptAriaLabel={t({
                      id: "editor.assignLoop.touch.suggestion.useLongpressAriaLabel",
                      message: `Use suggested long-press method for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                    })}
                    denyAriaLabel={t({
                      id: "editor.assignLoop.touch.chooseDifferentMethodAriaLabel",
                      message: "Choose a different touch method",
                    })}
                  />
                </>
              )}
              {suggestion.kind === "replace" && (
                <>
                  <p style={suggestionMessageStyle}>
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
                  </p>
                  <SuggestionActions
                    onAccept={handleUseSuggestion}
                    onDeny={handleSuggestionChange}
                    acceptAriaLabel={t({
                      id: "editor.assignLoop.touch.suggestion.useReplaceAriaLabel",
                      message: `Use suggested replace method for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                    })}
                    denyAriaLabel={t({
                      id: "editor.assignLoop.touch.chooseDifferentMethodAriaLabel",
                      message: "Choose a different touch method",
                    })}
                  />
                </>
              )}
              {suggestion.kind === "already" && (
                <>
                  <p style={suggestionMessageStyle}>
                    <Trans id="editor.assignLoop.touch.suggestion.alreadyText">
                      {currentCharDisplay} is already on the touch keyboard.
                      Keep it as is?
                    </Trans>
                  </p>
                  <SuggestionActions
                    onAccept={handleSuggestionAccept}
                    onDeny={handleSuggestionChange}
                    acceptAriaLabel={t({
                      id: "editor.assignLoop.touch.suggestion.keepAlreadyAriaLabel",
                      message: `Keep ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }} as already in touch layout`,
                    })}
                    denyAriaLabel={t({
                      id: "editor.assignLoop.touch.makeChangesAriaLabel",
                      message: "Make changes to touch method",
                    })}
                  />
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

          {/* Apply + Skip. Back and Next/Done live in the shared top toolbar
              row above so the forward-advance control is spatially
              separated from these editing actions. */}
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
              <Trans id="editor.assignLoop.skipCharacterButton">
                Skip this character
              </Trans>
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
                  <li key={i}>{w}</li>
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
            assignment.mechanisms.map((m, i) => ({
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
            })),
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

  const unimplementedTouchCountLabel = t({
    id: "editor.touch.unimplemented.count",
    message: plural(uncoveredChars.length, {
      one: "# character",
      other: "# characters",
    }),
  });
  // Named string locals computed BEFORE the JSX below — no inline ternary /
  // .join() embedded as direct <Trans> children (see MechanismGallery's
  // matching leave-warning for the same convention).
  const uncoveredTouchVerb = t({
    id: "editor.touch.unimplemented.verb",
    message: plural(uncoveredChars.length, { one: "has", other: "have" }),
  });
  const uncoveredCharsList = formatUncoveredCharsList(uncoveredChars);

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
            heading={t({
              id: "editor.assignLoop.touch.previewHeading",
              message: "Touch preview",
            })}
            warningLabel={t({
              id: "editor.assignLoop.touch.previewWarnings",
              message: "Preview warnings:",
            })}
          />
        }
      />
      <ConfirmDialog
        open={showUnimplementedWarning}
        title={t({
          id: "editor.touch.unimplemented.title",
          message: "Finish these characters before leaving?",
        })}
        body={
          <div>
            <p style={{ margin: "0 0 10px" }}>
              <Trans id="editor.touch.unimplemented.message">
                {unimplementedTouchCountLabel} still {uncoveredTouchVerb} no
                touch mechanism: {uncoveredCharsList}. You can finish them now,
                or come back to this gallery later.
              </Trans>
            </p>
          </div>
        }
        primaryLabel={t({
          id: "editor.touch.unimplemented.stay",
          message: "Go back and finish",
        })}
        secondaryLabel={t({
          id: "editor.touch.unimplemented.defer",
          message: "Come back later",
        })}
        // Escape/backdrop must map to the STAY action, not the proceed-forward
        // "Come back later" — dismissing a modal is a cancel, not a confirm.
        dismissAction="primary"
        onPrimary={() => setShowUnimplementedWarning(false)}
        onSecondary={() => {
          setShowUnimplementedWarning(false);
          finalizeCompletion();
        }}
      />
    </>
  );
}
