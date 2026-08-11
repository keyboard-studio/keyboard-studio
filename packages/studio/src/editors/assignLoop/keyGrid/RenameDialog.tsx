// RenameDialog — redefine a touch key's id (spec 058 T090; FR-028;
// key-id-policy.md §4). US3: "The author renames a key id, most often a
// `T_*` id, and the studio validates it live, shows what else the rename
// touches, and fixes up every reference it owns."
//
// ## Scope: THIS file is the dialog only
//
// Per this task's own briefing, the reference fix-up (rewriting every rule
// bound to the old id, the `touchLayout.nodeIds` entries, and any stale
// deletion-overlay address) is T091's job, in
// `packages/engine/src/pattern-apply/touchRuleSynthesis.ts` and
// `packages/studio/src/stores/workingCopyStore.ts` — NEITHER of which this
// file touches. Likewise T092's "propose removing now-orphaned rules" is a
// separate follow-up. This component's `onConfirm` fires exactly once, with
// everything a caller needs to drive that fix-up (see
// {@link RenameDialogConfirmResult}), and does nothing else — no store
// import, no engine mutation, matching AssignPanel.tsx's own "store-free,
// like every other file in this directory" discipline (see that file's
// module doc) and TouchGallery.tsx's ownership of the actual commit path
// (`commitKeyEdit`, `setWorkingIR`, address-matched provenance promotion).
//
// ## Pre-fill: `proposeKeyId`, not the raw current id, when it teaches something
//
// key-id-policy.md §4: "The rename field is pre-filled with the proposed
// id, never blank." A rename never needs a NEW rule — the key already
// produces whatever it produces; renaming does not change output. So the
// only minting path that is ever safe to pre-fill automatically is the
// ruleless `U_` default (`proposeKeyId`'s `unicode-default` path): when the
// key's grid-computed `producedChars` is exactly one single-codepoint
// character, propose the id the minting policy would naturally choose for
// that character today (which may already equal the key's current id, or
// may reveal that a `T_*` mnemonic id could be simplified to its canonical
// `U_<HEX>` form). Every other case — no output yet (the common rename
// target: a dead `T_*` key), a multi-codepoint/store-driven output, or a
// combining mark (which would require a NEW guard rule this dialog does not
// offer to write) — falls back to the key's OWN current id, which is a
// legitimate "nothing to propose beyond what's already there" default and,
// critically, is never blank.
//
// ## Validation: two `validateCandidateKeyId` calls, never a reimplementation
//
// keyIdMinting.ts's `validateCandidateKeyId` takes an `existingIdsInScope`
// list whose SCOPE is entirely the caller's choice (its own doc: "callers
// decide that scope"). key-id-policy.md draws two DIFFERENT scopes for two
// of its checks:
//   - §3.2 uniqueness is scoped to "the same layer of the same platform",
//     exempted when the candidate carries a distinct `TouchKeyIR.layer`
//     override;
//   - §3.3 case-collision has no such scoping — kmcmplib's VKDictionary
//     interning is a single global store.
// One call cannot honor both: passing every same-STRING id across every
// structural layer (e.g. the ordinary, correct idiom of `T_0300` existing
// on `default` AND `shift`) into the SAME scope list as `existingIdsInScope`
// would make the exact-match branch of `validateCandidateKeyId` fire
// "duplicate-in-layer" for two keys on completely different layers, which is
// not a defect at all — it's `key-id-policy.md`'s §2.1 "already appears on N
// other layers" idiom. This module therefore composes two calls, both
// through the SAME unmodified `validateCandidateKeyId`:
//   1. `existingIdsInScope` = other top-level keys in the target's OWN
//      structural layer+platform (each carrying its real `layer` override,
//      the field the exemption keys on) — resolves syntax, reserved, and
//      the correctly-scoped, correctly-exempted duplicate-in-layer check,
//      in the module's own documented priority order.
//   2. Only if (1) passes: a SECOND call whose scope is every OTHER
//      top-level id in the ENTIRE layout, filtered to EXCLUDE any entry
//      whose id is an EXACT match (those are legitimate same-id-on-another-
//      layer occurrences the exemption above already cleared) — so the only
//      way this second call can fail is `validateCandidateKeyId`'s
//      case-only-collision branch, checked at the global scope §3.3 wants.
// See {@link validateRenameCandidate}.
//
// ## The two failure modes key-id-policy.md §4 names explicitly
//
// - "Developer's own layer-rename fix-up iterates the flick map with
//   `forEach` although it is an object, so flick sub-keys are silently
//   missed." This dialog does not perform the fix-up (T091 does), but it DOES
//   walk sub-keys to compute the impact summary's occurrence counts — see
//   {@link collectIdOccurrencesInKey}, which walks `flick` via
//   `Object.values`, exactly like `keyGridViewModel.ts`'s `buildAnnotations`
//   and `useKeyEditGuards.ts`'s `collectAllReachableChars` already do for
//   the identical reason.
// - "Provenance promotion matches by id across all platforms and layers, so
//   a rename must promote the OLD id before and the NEW id after… prefer an
//   ADDRESS-matched promotion." This dialog never calls a promotion helper
//   itself (TouchGallery.tsx / T091 own that), but {@link
//   RenameDialogConfirmResult} carries `address` — never an id-based
//   locator — specifically so whoever wires the confirm callback promotes
//   by address (`promoteKeyAtAddressToHandSet`, the same T059 helper
//   AssignPanel.tsx already uses), not by id.
//
// ## T092 — proposing the orphan-rule cleanup, reusing T083's policy verbatim
//
// key-id-policy.md §4 / touch-key-rule-join.md §6.1's delete bullet: "when a
// rename would leave rules referencing an id no key carries, propose rather
// than silently perform the cleanup — default to remove for rules the studio
// generated, keep-and-report for hand-written ones." That is EXACTLY
// `planKeyDeletionRuleRemoval`'s (T083, touchRuleSynthesis.ts) own policy —
// reused here VERBATIM via {@link buildOrphanCleanupPlan}, never
// re-implemented. The one thing this dialog supplies that the plan function
// cannot derive itself is the INPUT: `planKeyDeletionRuleRemoval` answers
// "does any key anywhere still carry this id", which — called against the
// UNCHANGED `ir` prop — would ALWAYS see the very key being renamed and
// answer "yes, still present" (a false negative on the orphan question,
// since that key is seconds away from losing this id). {@link
// withKeyIdVacatedAtAddress} is a narrow, LOCAL, read-only simulation — it
// clears the id at exactly `targetAddress` (never `oldId` anywhere else,
// never a rule) — so the plan function sees the honest post-rename presence
// question. This is NOT a second copy of `renameTouchKey`'s (T091) real,
// atomic, everywhere-recursive rename: it touches one field of one key,
// purely to answer "if this key's occurrence is gone, is the id orphaned",
// and nothing produced here is ever written anywhere.

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import {
  createKeyOccurrenceCounter,
  bindingsForKeyId,
  normalizeTouchKeyId,
  type KeyboardIR,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  parseTouchKeyAddress,
  planKeyDeletionRuleRemoval,
  proposeKeyId,
  resolveKeyAddress,
  touchKeyAddress,
  validateCandidateKeyId,
  type ExistingKeyIdInScope,
  type KeyDeletionRuleRemovalPlan,
  type KeyEditOperation,
  type KeyIdRejectionReason,
  type ValidateKeyIdResult,
} from "@keyboard-studio/engine";
import { Button, Checkbox, Notice, TextField } from "../../../ui/index.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import type { KeyGridCellViewModel } from "./keyGridViewModel.ts";

// ---------------------------------------------------------------------------
// Pre-fill (see module doc, "Pre-fill")
// ---------------------------------------------------------------------------

/**
 * The id to pre-fill the field with when the dialog opens for `cell` —
 * NEVER blank (key-id-policy.md §4). Exported for direct unit testing
 * alongside the rendered behaviour.
 */
export function computeProposedRenameId(cell: KeyGridCellViewModel): string {
  if (cell.producedChars.length === 1) {
    const [ch] = cell.producedChars;
    if (ch !== undefined && [...ch].length === 1) {
      const proposal = proposeKeyId({ chars: ch, capsHandled: false });
      if (proposal.path === "unicode-default") return proposal.id;
    }
  }
  return cell.id;
}

// ---------------------------------------------------------------------------
// Scoped existing-id collection (see module doc, "Validation")
// ---------------------------------------------------------------------------

/** Every top-level key id in one structural (platform, layer) pair, excluding `excludeAddress`. */
function collectLayerScopeIds(
  layout: TouchLayoutIR,
  platformId: string,
  layerId: string,
  excludeAddress: string,
): ExistingKeyIdInScope[] {
  const out: ExistingKeyIdInScope[] = [];
  const platform = layout.platforms.find((p) => p.id === platformId);
  if (platform === undefined) return out;
  const layer = platform.layers.find((l) => l.id === layerId);
  if (layer === undefined) return out;
  const nextOccurrence = createKeyOccurrenceCounter();
  for (const row of layer.rows) {
    for (const k of row.keys) {
      // Occurrence-aware so `excludeAddress` — a grid cell's address, which may
      // carry one — excludes the key being renamed and not merely the first key
      // that happens to share its id.
      if (touchKeyAddress(platformId, layerId, k.id, nextOccurrence(k.id)) === excludeAddress) continue;
      out.push({ id: k.id, ...(k.layer !== undefined ? { layer: k.layer } : {}) });
    }
  }
  return out;
}

/** Every top-level key id across the WHOLE layout, excluding `excludeAddress`. */
function collectAllTopLevelIds(layout: TouchLayoutIR, excludeAddress: string): ExistingKeyIdInScope[] {
  const out: ExistingKeyIdInScope[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const nextOccurrence = createKeyOccurrenceCounter();
      for (const row of layer.rows) {
        for (const k of row.keys) {
          if (touchKeyAddress(platform.id, layer.id, k.id, nextOccurrence(k.id)) === excludeAddress) {
            continue;
          }
          out.push({ id: k.id, ...(k.layer !== undefined ? { layer: k.layer } : {}) });
        }
      }
    }
  }
  return out;
}

/**
 * Full candidate-id validation for a rename, composed from TWO
 * `validateCandidateKeyId` calls (never a third implementation) — see the
 * module doc's "Validation" section for why one call cannot honor both the
 * in-layer-scoped, override-exempted uniqueness check AND the globally
 * scoped case-collision check.
 */
export function validateRenameCandidate(
  id: string,
  layout: TouchLayoutIR,
  targetAddress: string,
  candidateLayerOverride: string | undefined,
): ValidateKeyIdResult {
  const parts = parseTouchKeyAddress(targetAddress);
  if (parts === undefined) return { valid: false, reason: "malformed" };

  const sameLayerIds = collectLayerScopeIds(layout, parts.platform, parts.layerId, targetAddress);
  const sameLayerResult = validateCandidateKeyId(id, {
    minting: true,
    existingIdsInScope: sameLayerIds,
    ...(candidateLayerOverride !== undefined ? { layerOverride: candidateLayerOverride } : {}),
  });
  if (!sameLayerResult.valid) return sameLayerResult;

  // Only entries that are NOT an exact match survive — an exact match on a
  // different structural layer is the legitimate "same id, another layer"
  // idiom the check above already cleared; leaving it in this second scope
  // would let validateCandidateKeyId's exact-match branch fire a spurious
  // "duplicate-in-layer" here and mask a genuine global case collision.
  const globalCaseCandidates = collectAllTopLevelIds(layout, targetAddress).filter((e) => e.id !== id);
  return validateCandidateKeyId(id, { minting: true, existingIdsInScope: globalCaseCandidates });
}

// ---------------------------------------------------------------------------
// Impact summary (key-id-policy.md §4: "the dialog states what the rename
// touches: occurrences in this layer, in other layers, in other platforms,
// and any .kmn rule referencing the old id")
// ---------------------------------------------------------------------------

/**
 * Every id carried by `key` itself and, recursively, by its `sk`/`multitap`/
 * `flick` sub-entries. `flick` is walked via `Object.values` — see the
 * module doc's "two failure modes" section for why this is load-bearing.
 */
function collectIdOccurrencesInKey(key: TouchKeyIR): string[] {
  const ids = [key.id];
  for (const sub of key.sk ?? []) ids.push(...collectIdOccurrencesInKey(sub));
  for (const sub of key.multitap ?? []) ids.push(...collectIdOccurrencesInKey(sub));
  for (const sub of Object.values(key.flick ?? {})) {
    if (sub !== undefined) ids.push(...collectIdOccurrencesInKey(sub));
  }
  return ids;
}

export interface RenameImpactSummary {
  /** Other occurrences of the OLD id on the SAME layer of the SAME platform (the layer-override idiom). */
  readonly sameLayerOccurrences: number;
  /** Occurrences of the OLD id on OTHER layers of the SAME platform. */
  readonly otherLayerOccurrences: number;
  /** Occurrences of the OLD id on OTHER platforms. */
  readonly otherPlatformOccurrences: number;
  /** `.kmn` bindings (producing and guard alike) keyed on the OLD id. */
  readonly ruleOccurrences: number;
}

/** Compute {@link RenameImpactSummary} for renaming the key at `targetAddress`. */
export function computeRenameImpact(
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
  targetAddress: string,
  oldId: string,
): RenameImpactSummary {
  const targetNorm = normalizeTouchKeyId(oldId);
  const parts = parseTouchKeyAddress(targetAddress);

  let sameLayer = 0;
  let otherLayer = 0;
  let otherPlatform = 0;

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const nextOccurrence = createKeyOccurrenceCounter();
      for (const row of layer.rows) {
        for (const topKey of row.keys) {
          const isTargetKey =
            touchKeyAddress(platform.id, layer.id, topKey.id, nextOccurrence(topKey.id)) ===
            targetAddress;
          for (const id of collectIdOccurrencesInKey(topKey)) {
            if (normalizeTouchKeyId(id) !== targetNorm) continue;
            // Exclude exactly the top-level key being renamed itself; a
            // matching sub-key id underneath IT still counts (T091's own
            // reference fix-up must reach it too).
            if (isTargetKey && id === topKey.id) continue;

            if (parts !== undefined && platform.id === parts.platform) {
              if (layer.id === parts.layerId) sameLayer++;
              else otherLayer++;
            } else {
              otherPlatform++;
            }
          }
        }
      }
    }
  }

  return {
    sameLayerOccurrences: sameLayer,
    otherLayerOccurrences: otherLayer,
    otherPlatformOccurrences: otherPlatform,
    ruleOccurrences: bindingsForKeyId(ruleIndex, oldId).length,
  };
}

// ---------------------------------------------------------------------------
// The orphan-rule cleanup proposal (T092) — reuses planKeyDeletionRuleRemoval
// (T083) verbatim; see the module doc's "T092" section for why the input
// simulation below is needed and what it deliberately does NOT do.
// ---------------------------------------------------------------------------

/**
 * A narrow, read-only simulation: clear the `id` of exactly the key at
 * `targetAddress` (never touching anything else — no other key, no rule),
 * so {@link planKeyDeletionRuleRemoval}'s presence scan can honestly answer
 * "if this occurrence goes away, does the old id survive anywhere else."
 * Matches the SAME first-match-wins address resolution `resolveKeyAddress`
 * already documents for a duplicate-id layout (see touchKeyAddress.ts) —
 * not a new limitation. Never mutates `layout`; returns a fresh object only
 * when a match is found, the layout reference unchanged otherwise.
 */
function withKeyIdVacatedAtAddress(layout: TouchLayoutIR, targetAddress: string): TouchLayoutIR {
  const parts = parseTouchKeyAddress(targetAddress);
  if (parts === undefined) return layout;
  let found = false;
  return {
    ...layout,
    platforms: layout.platforms.map((platform) => {
      if (platform.id !== parts.platform) return platform;
      return {
        ...platform,
        layers: platform.layers.map((layer) => {
          if (layer.id !== parts.layerId) return layer;
          return {
            ...layer,
            rows: layer.rows.map((row) => ({
              keys: row.keys.map((k) => {
                if (found || k.id !== parts.keyId) return k;
                found = true;
                // Never `""` collides with a real id — normalizeTouchKeyId("")
                // is `""`, which no author-typed or generated id ever equals.
                return { ...k, id: "" };
              }),
            })),
          };
        }),
      };
    }),
  };
}

/** Build {@link RenameDialogOrphanCleanup} inputs by reusing `planKeyDeletionRuleRemoval` (T083) unmodified, against the simulated post-rename presence of `oldId`. */
function buildOrphanCleanupPlan(
  ir: KeyboardIR,
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
  targetAddress: string,
  oldId: string,
): KeyDeletionRuleRemovalPlan {
  const simulatedLayout = withKeyIdVacatedAtAddress(layout, targetAddress);
  const simulatedIr: KeyboardIR = { ...ir, touchLayout: simulatedLayout };
  return planKeyDeletionRuleRemoval(simulatedIr, ruleIndex, oldId);
}

/** The author-facing proposal: what would be removed, what would be kept, and the author's final choice for the removable part. */
export interface RenameDialogOrphanCleanup {
  /** `gen-touch-*` rule nodeIds bound to the old id — T083's own default is to remove these. */
  readonly generatedRuleNodeIds: readonly string[];
  /** Hand-written or imported rule nodeIds bound to the old id — NEVER auto-removed; left for the orphan-rule check to report (touch-key-rule-join.md §6.1). */
  readonly handWrittenRuleNodeIds: readonly string[];
  /** The author's final decision for `generatedRuleNodeIds`: remove (default, per T083) or leave them alongside the hand-written ones. */
  readonly removeGenerated: boolean;
  /** T083's own warning text (e.g. naming the hand-written count), echoed when present. */
  readonly warning?: string;
}

// ---------------------------------------------------------------------------
// Confirm result — the seam T091/T092 build on
// ---------------------------------------------------------------------------

/** `Omit<..., "seq">` of the engine's own `RenameKeyOp` — never hand-duplicated, so this cannot drift from the real operation shape `commitKeyEdit` expects (mirrors AssignPanel.tsx's `AssignPanelSetOp` alias). */
export type RenameDialogRenameOp = Omit<Extract<KeyEditOperation, { kind: "rename" }>, "seq">;

export interface RenameDialogConfirmResult {
  /**
   * The layout-side rename op. NOT appended to any store by this file — the
   * caller (T091's wiring, mirroring TouchGallery.tsx's
   * `handleAssignPanelCommit`) is responsible for the full reference
   * fix-up (rule bindings, `nodeIds`, deletion-overlay remap) before or
   * alongside committing this op.
   */
  readonly op: RenameDialogRenameOp;
  readonly oldId: string;
  readonly newId: string;
  /** Echoed for the caller's own logging/T092 decision — already computed here for the on-screen summary. */
  readonly impact: RenameImpactSummary;
  /**
   * Present only when this rename would leave `oldId` carried by no key
   * anywhere AND at least one rule still references it (T092). `undefined`
   * means nothing would be orphaned — the common case, since most renamed
   * ids either have no rules at all or remain carried elsewhere. The caller
   * decides how/when to act on it (e.g. calling `applyKeyDeletionRuleRemoval`
   * on the renamed id after `commitTouchKeyRename`); this dialog never calls
   * it itself.
   */
  readonly orphanCleanup?: RenameDialogOrphanCleanup;
}

// ---------------------------------------------------------------------------
// Localized rejection-reason sentences (FR-044/FR-051)
// ---------------------------------------------------------------------------

function useRejectionReasonText(): (result: Extract<ValidateKeyIdResult, { valid: false }>) => string {
  const { t } = useLingui();
  return (result) => {
    const reason: KeyIdRejectionReason = result.reason;
    switch (reason) {
      case "malformed":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.malformed",
          message: "That's not a valid key id.",
        });
      case "unicode-out-of-range":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.unicodeOutOfRange",
          message: "That code point is outside Keyman's valid range for a U_ id.",
        });
      case "unicode-unpadded":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.unicodeUnpadded",
          message: "A U_ id needs at least four hex digits, zero-padded — for example U_0041.",
        });
      case "reserved-prefix":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.reservedPrefix",
          message: "That id is reserved for the studio's own internal placeholders.",
        });
      case "reserved-sentinel":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.reservedSentinel",
          message: "That id is reserved for a deliberately empty key.",
        });
      case "reserved-private-use":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.reservedPrivateUse",
          message: "That id is reserved by KeymanWeb itself.",
        });
      case "duplicate-in-layer":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.duplicateInLayer",
          message: `Another key on this layer already uses ${{ id: result.conflictingId ?? reason }}.`,
        });
      case "case-only-collision":
        return t({
          id: "editor.assignLoop.keyGrid.renameDialog.reason.caseOnlyCollision",
          message: `That differs only by letter case from ${{ id: result.conflictingId ?? reason }} — Keyman treats the two as the same key.`,
        });
      default: {
        const _exhaustive: never = reason;
        return String(_exhaustive);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Focus management helpers (ARIA APG dialog pattern; docs/accessibility.md)
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RenameDialogProps {
  /** Nothing renders while `false`. */
  open: boolean;
  /** The key being renamed. */
  selectedCell: KeyGridCellViewModel | null;
  /** The EFFECTIVE (overlay-folded) touch layout — for scope resolution and the impact summary. */
  layout: TouchLayoutIR;
  /**
   * The working IR — read-only here (T092's `planKeyDeletionRuleRemoval`
   * call needs a full `KeyboardIR`, not just the layout); never mutated, and
   * `ir.touchLayout` is never trusted directly — see
   * {@link withKeyIdVacatedAtAddress}, which substitutes the EFFECTIVE
   * `layout` prop above before simulating.
   */
  ir: KeyboardIR;
  /** From `buildTouchKeyRuleIndex(ir)`, built once by the caller. */
  ruleIndex: TouchKeyRuleIndex;
  /** Escape, the Cancel button, or the backdrop. Does not itself move focus back — the caller owns the invoker and restores focus to it (mirrors AssignPanel.tsx's cross-component wiring convention). */
  onCancel: () => void;
  /** Fired exactly once per confirmed rename — see {@link RenameDialogConfirmResult}. */
  onConfirm: (result: RenameDialogConfirmResult) => void;
  /** Localized dialog accessible name override. */
  label?: string;
}

export function RenameDialog({
  open,
  selectedCell,
  layout,
  ir,
  ruleIndex,
  onCancel,
  onConfirm,
  label,
}: RenameDialogProps) {
  const { t } = useLingui();
  const uid = useId();
  const rejectionReasonText = useRejectionReasonText();
  const dialogRef = useRef<HTMLFormElement>(null);

  const [idInput, setIdInput] = useState("");
  // Default "remove" (T083's own policy for generated rules) — reset on
  // every open/target change alongside the id field, below.
  const [removeGeneratedChecked, setRemoveGeneratedChecked] = useState(true);

  // Pre-fill (never blank) whenever the dialog opens or the target changes,
  // and move focus into the field — the APG dialog pattern's "opening a
  // dialog moves focus into it" (docs/accessibility.md rule 4).
  //
  // `TextField` (ui/TextField.tsx) is a plain function component, not
  // `forwardRef` — no existing call site in this package attaches a ref to
  // it (checked before writing this), so rather than being the first to
  // widen that primitive's contract, focus is acquired by DOM query
  // scoped to `dialogRef`, mirroring AccountControl.tsx's own identical
  // "focus the first focusable element in the panel" idiom.
  useEffect(() => {
    if (!open || selectedCell === null) return;
    setIdInput(computeProposedRenameId(selectedCell));
    setRemoveGeneratedChecked(true);
    dialogRef.current?.querySelector<HTMLInputElement>('[data-testid="rename-dialog-field"]')?.focus();
  }, [open, selectedCell]);

  // Escape closes from anywhere in the dialog (APG dialog pattern).
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  const candidateLayerOverride = useMemo(() => {
    if (selectedCell === null) return undefined;
    const parts = parseTouchKeyAddress(selectedCell.address);
    if (parts === undefined) return undefined;
    return resolveKeyAddress(layout, parts)?.key.layer;
  }, [selectedCell, layout]);

  const trimmedId = idInput.trim();
  const isUnchanged = selectedCell !== null && trimmedId === selectedCell.id;

  const validation: ValidateKeyIdResult | undefined = useMemo(() => {
    if (selectedCell === null || isUnchanged) return undefined;
    return validateRenameCandidate(trimmedId, layout, selectedCell.address, candidateLayerOverride);
  }, [selectedCell, isUnchanged, trimmedId, layout, candidateLayerOverride]);

  const impact = useMemo(() => {
    if (selectedCell === null) return undefined;
    return computeRenameImpact(layout, ruleIndex, selectedCell.address, selectedCell.id);
  }, [selectedCell, layout, ruleIndex]);

  // T092: independent of what `toId` is — this asks only "if THIS key's
  // occurrence of its OWN current id goes away, does anything still bind to
  // that id" (see the module doc's "T092" section).
  const orphanPlan = useMemo(() => {
    if (selectedCell === null) return undefined;
    return buildOrphanCleanupPlan(ir, layout, ruleIndex, selectedCell.address, selectedCell.id);
  }, [selectedCell, ir, layout, ruleIndex]);

  const hasOrphanConcern =
    orphanPlan !== undefined &&
    !orphanPlan.stillPresentElsewhere &&
    (orphanPlan.generatedRuleNodeIds.length > 0 || orphanPlan.handWrittenRuleNodeIds.length > 0);

  const canConfirm = selectedCell !== null && !isUnchanged && validation?.valid === true;

  function handleKeyDownTrap(e: ReactKeyboardEvent<HTMLFormElement>): void {
    if (e.key !== "Tab" || dialogRef.current === null) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!canConfirm || selectedCell === null || impact === undefined) return;

    const orphanCleanup: RenameDialogOrphanCleanup | undefined = hasOrphanConcern && orphanPlan !== undefined
      ? {
          generatedRuleNodeIds: orphanPlan.generatedRuleNodeIds,
          handWrittenRuleNodeIds: orphanPlan.handWrittenRuleNodeIds,
          removeGenerated: removeGeneratedChecked,
          ...(orphanPlan.warning !== undefined ? { warning: orphanPlan.warning } : {}),
        }
      : undefined;

    onConfirm({
      op: { address: selectedCell.address, kind: "rename", toId: trimmedId },
      oldId: selectedCell.id,
      newId: trimmedId,
      impact,
      ...(orphanCleanup !== undefined ? { orphanCleanup } : {}),
    });
  }

  if (!open || selectedCell === null) return null;

  const dialogLabel =
    label ??
    t({
      id: "editor.assignLoop.keyGrid.renameDialog.ariaLabel",
      message: `Rename ${{ id: selectedCell.id }}`,
    });

  const hasImpact =
    impact !== undefined &&
    (impact.sameLayerOccurrences > 0 ||
      impact.otherLayerOccurrences > 0 ||
      impact.otherPlatformOccurrences > 0 ||
      impact.ruleOccurrences > 0);

  return (
    <>
      {/* Fixed transparent backdrop — click outside to cancel (mirrors AccountControl.tsx's own convention). */}
      <div
        style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--sil-black) 50%, transparent)", zIndex: 299 }}
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the ARIA APG modal DIALOG pattern (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) requires the container itself to trap Tab focus via onKeyDown; jsx-a11y's interactive-role allowlist does not include "dialog" (it is a window/structure role, not a widget role), so this fires regardless of the explicit role — the same "focusable-but-not-a-natively-interactive-role" carve-out KeyInspector.tsx already documents for its own onKeyDown handler. */}
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        data-testid="rename-dialog"
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDownTrap}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 300,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          minWidth: 320,
          maxWidth: 480,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          fontFamily: FONT,
          boxShadow: "0 8px 24px color-mix(in srgb, var(--sil-black) 50%, transparent)",
        }}
      >
        <div style={{ fontSize: 13, color: TEXT_MAIN }} data-testid="rename-dialog-target">
          {t({
            id: "editor.assignLoop.keyGrid.renameDialog.targetLabel",
            message: `Renaming ${{ id: selectedCell.id }}`,
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor={`${uid}-id-field`} style={{ fontSize: 11, color: TEXT_DIM }}>
            <Trans id="editor.assignLoop.keyGrid.renameDialog.fieldLabel">New key id</Trans>
          </label>
          <TextField
            id={`${uid}-id-field`}
            mono
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            error={validation?.valid === false}
            aria-invalid={validation?.valid === false}
            aria-describedby={validation?.valid === false ? `${uid}-id-error` : undefined}
            data-testid="rename-dialog-field"
          />
          {isUnchanged && (
            <span style={{ fontSize: 11, color: TEXT_DIM }} data-testid="rename-dialog-unchanged">
              {t({
                id: "editor.assignLoop.keyGrid.renameDialog.reason.unchanged",
                message: "That's already this key's id.",
              })}
            </span>
          )}
          {validation?.valid === false && (
            <span
              id={`${uid}-id-error`}
              role="alert"
              data-testid="rename-dialog-field-error"
              style={{ fontSize: 11, color: TEXT_DIM }}
            >
              {rejectionReasonText(validation)}
            </span>
          )}
        </div>

        {impact !== undefined && (
          <Notice tone="info">
            <span data-testid="rename-dialog-impact">
              {hasImpact
                ? [
                    impact.sameLayerOccurrences > 0 &&
                      t({
                        id: "editor.assignLoop.keyGrid.renameDialog.impact.sameLayer",
                        message: plural(impact.sameLayerOccurrences, {
                          one: "# other occurrence on this layer",
                          other: "# other occurrences on this layer",
                        }),
                      }),
                    impact.otherLayerOccurrences > 0 &&
                      t({
                        id: "editor.assignLoop.keyGrid.renameDialog.impact.otherLayers",
                        message: plural(impact.otherLayerOccurrences, {
                          one: "# other layer",
                          other: "# other layers",
                        }),
                      }),
                    impact.otherPlatformOccurrences > 0 &&
                      t({
                        id: "editor.assignLoop.keyGrid.renameDialog.impact.otherPlatforms",
                        message: plural(impact.otherPlatformOccurrences, {
                          one: "# other platform",
                          other: "# other platforms",
                        }),
                      }),
                    impact.ruleOccurrences > 0 &&
                      t({
                        id: "editor.assignLoop.keyGrid.renameDialog.impact.rules",
                        message: plural(impact.ruleOccurrences, {
                          one: "# rule in the .kmn",
                          other: "# rules in the .kmn",
                        }),
                      }),
                  ]
                    .filter((part): part is string => typeof part === "string")
                    .join(" · ")
                : t({
                    id: "editor.assignLoop.keyGrid.renameDialog.impact.none",
                    message: "This id appears nowhere else in the layout or the .kmn.",
                  })}
            </span>
          </Notice>
        )}

        {hasOrphanConcern && orphanPlan !== undefined && (
          <Notice tone="warn">
            <div data-testid="rename-dialog-orphan" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {orphanPlan.generatedRuleNodeIds.length > 0 && (
                <>
                  <span data-testid="rename-dialog-orphan-generated">
                    {t({
                      id: "editor.assignLoop.keyGrid.renameDialog.orphan.generated",
                      message: plural(orphanPlan.generatedRuleNodeIds.length, {
                        one: "This id would then be carried by no key. # rule the studio generated would have nothing left to bind to.",
                        other: "This id would then be carried by no key. # rules the studio generated would have nothing left to bind to.",
                      }),
                    })}
                  </span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <Checkbox
                      checked={removeGeneratedChecked}
                      onChange={(e) => setRemoveGeneratedChecked(e.target.checked)}
                      data-testid="rename-dialog-orphan-remove-checkbox"
                    />
                    <Trans id="editor.assignLoop.keyGrid.renameDialog.orphan.removeCheckbox">
                      Remove them
                    </Trans>
                  </label>
                </>
              )}
              {orphanPlan.handWrittenRuleNodeIds.length > 0 && (
                <span data-testid="rename-dialog-orphan-handwritten">
                  {t({
                    id: "editor.assignLoop.keyGrid.renameDialog.orphan.handWritten",
                    message: plural(orphanPlan.handWrittenRuleNodeIds.length, {
                      one: "# hand-written or imported rule would still reference this id — left in place for the diagnostics to report.",
                      other: "# hand-written or imported rules would still reference this id — left in place for the diagnostics to report.",
                    }),
                  })}
                </span>
              )}
            </div>
          </Notice>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onCancel} data-testid="rename-dialog-cancel">
            <Trans id="editor.assignLoop.keyGrid.renameDialog.cancel">Cancel</Trans>
          </Button>
          <Button type="submit" variant="primary" disabled={!canConfirm} data-testid="rename-dialog-confirm">
            <Trans id="editor.assignLoop.keyGrid.renameDialog.confirm">Rename</Trans>
          </Button>
        </div>
      </form>
    </>
  );
}
