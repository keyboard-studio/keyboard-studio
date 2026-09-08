// projectWorkingCopyVfs — pure (non-React) helper that applies the working-copy
// projection layers onto a VirtualFS.
//
// Called by both:
//   - useWorkingCopyTransform (hook, React path) — for the live OSK preview;
//     the caller passes the VFS already scoped to the current compile cycle.
//   - serializeWorkingCopy (async function, output path) — for the download zip;
//     the caller passes a freshly cloned VFS so the base is not mutated.
//
// This shared helper is the single definition of the projection ordering, so the
// preview and the downloaded artifact are guaranteed equivalent for any given
// working-copy state.
//
// Projection order (spec §12 "re-projected layers"):
//   0. Touch layout     — inject Phase E touchLayoutJson into .keyman-touch-layout
//   1. Carve deletions  — applyCarveToVfs (re-emits filtered IR into .kmn)
//   1.5 Carve keycaps   — applyCarveKeycapRemovalsToVfs (blanks carved chars off
//                         .kvks / .keyman-touch-layout keycaps in place)
//   1.6 Touch method deletions — applyTouchKeycapRemovalsToVfs (blanks/drops
//                         individually deleted pre-existing touch methods —
//                         main key / longpress / multitap / flick — off
//                         .keyman-touch-layout, addressed by
//                         workingCopyStore.deletedTouchKeyIds; runs AFTER the
//                         carve keycap cascade so an address already
//                         neutralized by that step resolves to nothing here,
//                         never a double-blank)
//   1.7 Key edit overlay (layout half) — applyKeyEditsToVfs splices the
//                         committed KeyEditOperation[] overlay (spec 063)
//                         directly onto .keyman-touch-layout (Case B, never
//                         round-tripped through the IR — spec 035 R9). Runs
//                         AFTER step 1.6 so an id it already neutralized
//                         resolves to nothing here.
//   1.7b Key edit overlay (rule half) — a `rename` op's vkey-binding fix-up,
//                         re-emitted into the .kmn. Runs immediately after
//                         1.7 so a rename's layout half and rule half land
//                         in the SAME projection (contracts/
//                         key-edit-overlay.md §6.2, R10.2 — the working IR
//                         is never emitted into the artifact, so this pass
//                         cannot be inherited from applyMarkGuards). Rule
//                         SYNTHESIS policy (minting a new producing/guard
//                         rule pair for a freshly assigned character) is
//                         Phase 6/touchRuleSynthesis.ts, not this pass —
//                         see the step's own comment below for the seam.
//   2. Assignments      — applyAssignmentsToVfs (injects mechanism patterns)
//   2.5 Layer propagation — propagateDesktopLayersToTouch (surfaces S-08
//                         generalized modifier-combo layers onto the
//                         .keyman-touch-layout written by step 0; no-op when
//                         the VFS has no touch layout file)
//   3. Identity         — applyIdentityStubMutation (writes &NAME)
//   3.5 Keycap labels   — applyKeycapLabelsToVfs (see step 3.5 below)
//   3.6 Package descriptor — applyIdentityToKps writes the AUTHOR's language +
//                         display name into source/<keyboardId>.kps, generating
//                         the descriptor when the track has none (spec 059).
//                         Runs after the .kmn is final (the <Files> list derives
//                         from it) and before the step-4 rename (which owns <ID>
//                         and the <Files> paths).
//
// Touch layout is injected FIRST (step 0) so:
//   - Step 2.5 layer propagation patches the injected layout (or the base
//     VFS's shipped one, when no Phase E edits exist yet).
//   - Step 3.5 keycap-label patch (applyKeycapLabelsToVfs) patches the injected layout.
//   - Step 4 id-rename pass renames source/<keyboardId>.keyman-touch-layout →
//     source/<targetKeyboardId>.keyman-touch-layout when the author chose a new id.
// Previously the output path (serializeWorkingCopy) injected touchLayoutJson inline
// before calling this helper; centralizing it here ensures the preview path also
// receives the Phase E touch layout.
//
// The function mutates `vfs` in-place. Callers that need the original VFS
// preserved must clone it before calling (e.g. createVirtualFS(baseVfs.entries())).

import type { KeyboardIR, Pattern, VirtualFS } from "@keyboard-studio/contracts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import type { KeyEditOperation, RenameKeyOp } from "@keyboard-studio/engine";
import {
  applyCarveToVfs,
  applyCarveKeycapRemovalsToVfs,
  applyStoreSlotRemovals,
  applyAssignmentsToVfs,
  applyIdentityStubMutation,
  applyKeycapLabelsToVfs,
  applyTouchKeycapRemovalsToVfs,
  applyKeyEditsToVfs,
  parseTouchKeyAddress,
  parseKmn,
  emitKmn,
  resetIdentity,
  renameFilesInVfs,
  parseSlotId,
  propagateDesktopLayersToTouch,
  collectLayerCombosInUse,
  applyIdentityToKps,
} from "@keyboard-studio/engine";
import type { PackageDescriptorIdentity } from "@keyboard-studio/engine";
import { applyCarveMutate, applyAddGalleryMutate } from "../steps/editorMutate.ts";
import { isMutateSeamEnabled } from "../flags/mutateFlag.ts";
import { findTouchLayoutPath } from "./findTouchLayoutPath.ts";
import { readVfsText } from "./vfsText.ts";

/** Shared empty deletion set for the seam-path emit (the seam already filtered). */
const EMPTY_DELETION_SET: ReadonlySet<string> = new Set<string>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All inputs needed to project a working copy onto a VFS.
 *
 * - `vfs`             — the VFS to mutate in-place (clone before calling if you
 *                       need to preserve the original).
 * - `keyboardId`      — keyboard identifier used to derive source/<id>.kmn paths.
 * - `baseIr`          — the source-of-truth IR (never mutated by projection).
 * - `deletedNodeIds`  — set of carve deletions.
 * - `assignments`     — mechanism assignments from phaseResults. Physical-only
 *                       filtering is applied inside this function defensively, so
 *                       callers may pass the full list or a pre-filtered physical one.
 * - `getPattern`      — synchronous pattern resolver for assignments.
 * - `touchLayoutJson` — optional Phase E touch layout JSON string to inject into
 *                       `source/<keyboardId>.keyman-touch-layout` before any other
 *                       projection step. When `null` or `undefined`, no touch layout
 *                       is written (the base VFS touch layout file, if any, is used).
 * - `identity`        — display name (and optionally other fields) to inject.
 */
export interface ProjectWorkingCopyVfsInput {
  vfs: VirtualFS;
  /**
   * Keyboard identifier used to locate `source/<keyboardId>.kmn` for the carve /
   * assignment / identity projection steps. This is the base keyboard's id while
   * the rest of the VFS still uses base-id filenames; the optional id rename
   * step (below) renames it to `targetKeyboardId` at the end.
   */
  keyboardId: string;
  /**
   * Optional new keyboard id chosen by the author (Track 1 identity rename or
   * Track 2 fork). When set and different from `keyboardId`, the projection
   * adds a final pass that:
   *   - rewrites the .kmn's sibling-file path stores (&KMW_EMBEDCSS,
   *     &KMW_HELPFILE, &VISUALKEYBOARD, &LAYOUTFILE, &BITMAP) via resetIdentity,
   *   - renames source/<keyboardId>.* → source/<targetKeyboardId>.* for
   *     `.kmn .kps .kvks .keyman-touch-layout .ico .css .htm .js` and the
   *     `help/<id>.php` sibling, and
   *   - rewrites `.kmw-keyboard-<keyboardId>` selectors in *.css and
   *     `<ID>` / `<kbdname>` references in *.kps and *.kvks.
   * Omit or pass the same value as `keyboardId` to skip the rename pass.
   */
  targetKeyboardId?: string;
  baseIr: KeyboardIR;
  deletedNodeIds: ReadonlySet<string>;
  /** Individual rule nodeIds removed via glyph-level carving (GlyphCell clicks). */
  deletedItemIds?: ReadonlySet<string>;
  /**
   * Individually-deleted pre-existing touch methods (main key / longpress /
   * multitap / flick), addressed by the `touchKeyAddress.ts` scheme. Applied
   * at step 1.6, after the carve keycap cascade. Omit or pass an empty set
   * when there are no touch-method deletions.
   */
  deletedTouchKeyIds?: ReadonlySet<string>;
  /**
   * The committed key-level touch layout edit overlay (spec 063
   * FR-031…FR-034), in commit order (`seq` ascending; this projection sorts
   * defensively, so an out-of-commit-order array is not required). Applied
   * at step 1.7 (layout half, via `applyKeyEditsToVfs` — Case B, never
   * round-tripped through the IR per spec 035 R9) and, for `rename` ops
   * only, at the rule-half pass immediately after (contracts/
   * key-edit-overlay.md §6.2, R10.2). Omit or pass an empty array when
   * there is no key-edit overlay yet.
   */
  keyEditOps?: readonly KeyEditOperation[];
  assignments: ReadonlyArray<MechanismAssignment>;
  /** Synchronous resolver. Pass `() => undefined` when no pattern library is available. */
  getPattern: (id: string) => Pattern | undefined;
  /**
   * Optional Phase E touch layout JSON string. When provided (non-null, non-undefined),
   * written into `source/<keyboardId>.keyman-touch-layout` at step 0, before carve,
   * assignments, identity, and the keycap-label + id-rename passes.
   *
   * Injecting first ensures the keycap-label patch (step 3.5) and the id-rename pass
   * (step 4) operate on the Phase E layout rather than the base VFS's layout.
   */
  touchLayoutJson?: string | null;
  /** Identity overlay. Pass `null` to skip identity projection. */
  identity: IdentityOverlay | null;
  /**
   * The base keyboard's own display name — the value the `.kmn`'s existing
   * `store(&NAME)` already holds. Step 3 treats the overlay's display name as an
   * EDIT and rewrites the name store ONLY when it DIFFERS from this. It is the
   * anchor that keeps the no-identity output byte-identical to the base: the
   * output path passes this same value as its display-name fallback, so the two
   * compare equal and the name store is left untouched.
   *
   * Optional. When omitted, the comparison falls back to `baseIr.header.name`.
   * The gallery's `BaseKeyboard.displayName` and the parsed `baseIr.header.name`
   * are the same in practice; passing it explicitly lets a caller whose overlay
   * fallback is the gallery name (rather than the parsed `.kmn` name) match on
   * the exact value it fell back to.
   */
  baseDisplayName?: string;
}

/**
 * Shape of the optional identity overlay accepted by {@link ProjectWorkingCopyVfsInput}.
 *
 * Exported so callers (e.g. serializeWorkingCopy) can type their local overlay
 * variable against this single source rather than repeating the inline literal.
 */
export type IdentityOverlay = {
  displayName?: string;
  copyright?: string;
  version?: string;
  /**
   * The author's composed BCP47 tag.
   *
   * Consumed by `resetIdentity` during the step-4 id rename AND, since spec 059,
   * by step 3.6 as the package descriptor's declared language tag. Taken whole
   * from the identity-lite result — never re-composed here (FR-001).
   */
  bcp47?: string;
  /**
   * The language's name in English, display text for the descriptor's
   * `<Language>` element (spec 059 FR-002).
   *
   * Descriptor-only: the codec does not serialize a language name, and teaching
   * it to is out of scope, so this never reaches the `.kmn`.
   */
  languageName?: string;
  /**
   * The project link, written into the descriptor's `<WebSite>` element
   * (spec 061 FR-012). Sourced from `HelpDocsAnswers.projectHomeUrl` only —
   * never the help-page line (research D-06). Omitted entirely when absent.
   */
  websiteUrl?: string;
};

export interface ProjectWorkingCopyVfsResult {
  /** Warnings from any of the three projection steps (empty when all is well). */
  warnings: string[];
  /**
   * The keyboard id the VFS actually ends up keyed under after projection —
   * i.e. `targetKeyboardId` when the Step 4 id-rename pass fired (author chose
   * a new id different from `keyboardId`), otherwise `undefined`.
   *
   * Callers that need to locate `source/<id>.kmn` (or any other id-derived
   * path) AFTER calling this function — most importantly the compile step —
   * must use this value when present instead of the `keyboardId` they passed
   * in, or they will look for the pre-rename filename and fail to find it.
   */
  effectiveKeyboardId?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Apply carve + assignments + identity projection layers onto `input.vfs`
 * in-place, returning any accumulated warnings.
 *
 * `input.vfs` IS mutated. Callers that need the original VFS preserved must
 * clone it before calling: `createVirtualFS(baseVfs.entries())`.
 *
 * Projection steps are identical for both the OSK preview path
 * (`useWorkingCopyTransform`) and the output/serialization path
 * (`serializeWorkingCopy`), ensuring the two are always equivalent.
 */
export function projectWorkingCopyVfs(
  input: ProjectWorkingCopyVfsInput,
): ProjectWorkingCopyVfsResult {
  const {
    vfs,
    keyboardId,
    targetKeyboardId,
    baseIr,
    deletedNodeIds,
    deletedItemIds = new Set<string>(),
    deletedTouchKeyIds = new Set<string>(),
    keyEditOps = [],
    assignments,
    getPattern,
    identity,
    touchLayoutJson,
    baseDisplayName,
  } = input;

  const warnings: string[] = [];

  // Step 0: Touch layout injection — write the Phase E touch layout JSON into
  // `source/<keyboardId>.keyman-touch-layout` before any other projection step.
  // Injecting here (rather than at each call site) ensures that:
  //   - the keycap-label patch (step 3.5) patches the injected layout, and
  //   - the id-rename pass (step 4) renames the file when the author chose a new id.
  // Previously serializeWorkingCopy injected this inline before calling this helper;
  // centralizing it here is the fix that makes the OSK preview equivalent to the ZIP.
  if (touchLayoutJson !== null && touchLayoutJson !== undefined) {
    vfs.set(`source/${keyboardId}.keyman-touch-layout`, touchLayoutJson, false);
  }

  // Step 1: Carve projection — re-emit IR with deleted nodes filtered out.
  //
  // deletedItemIds can carry two kinds of entries:
  //   a) Slot ids: "<storeNodeId>#<itemsIndex>" — parallel-store deadkey slots to
  //      replace with `nul` fillers (alignment-preserving; see applyStoreSlotRemovals).
  //   b) Whole-node item ids: bare rule/store nodeIds from glyph-level carving.
  //
  // Partition them so the two mechanisms receive the correct inputs.
  // An id that does not parse as a slot id (parseSlotId returns null — e.g. bare
  // rule nodeIds whose suffix is not an integer) falls through to wholeNodeItemIds
  // and is treated as a whole-node deletion. An id that does parse as a slot id
  // but whose store is not found in baseIr also falls through to wholeNodeItemIds
  // and becomes a no-op whole-node deletion (applyStoreSlotRemovals never sees it).
  const storeNodeIdSet = new Set(baseIr.stores.map((s) => s.nodeId));

  const slotIds = new Set<string>();
  const wholeNodeItemIds = new Set<string>();

  for (const id of deletedItemIds) {
    const parsed = parseSlotId(id);
    if (parsed !== null && storeNodeIdSet.has(parsed.storeNodeId)) {
      slotIds.add(id);
    } else {
      wholeNodeItemIds.add(id);
    }
  }

  // 1a: Replace output-store slots with nul fillers (store-slot deletion path).
  const removalResult = applyStoreSlotRemovals(baseIr, slotIds);
  warnings.push(...removalResult.warnings);

  // 1b: Whole-node deletions + VFS re-emit.
  //     irRewritten: true when any slots were targeted — the nul-modified IR must
  //     be written into the VFS even if no whole-node deletions are present, and
  //     its node positions no longer match the .kmn text, so text-splice is off.
  //     When all slot ids are rejected by the transform's guards, irRewritten
  //     still triggers a (harmless, idempotent) re-emit of the unmodified IR.
  const carveIr = removalResult.ir; // equals baseIr when slotIds was empty
  const allWholeNodeIds = new Set([...deletedNodeIds, ...wholeNodeItemIds]);

  // spec-014 T016c — carve IR-projection via the single mutate() write seam.
  //
  // Flag-on: derive the deletion-filtered carve IR through applyCarveMutate
  // (which routes the carve patch through applyMutatePatch / CARVE_WRITES) and
  // hand THAT pre-filtered IR to applyCarveToVfs with an empty deletion set so
  // the emit step only serializes — the seam, not applyCarveToVfs's internal
  // filter, is the canonical IR producer (M6/SC-001).
  //
  // The patch is built from baseIr (never the slot-rewritten carveIr) so it is a
  // pure function of the overlay (idempotent + reversible). The entry-group
  // safety gate is preserved: when the deletion set would remove the entry group
  // we DEFER to the legacy applyCarveToVfs call, which warns and skips the
  // re-emit (the seam IR would otherwise have silently dropped it). This keeps
  // the emitted artifact byte-identical to the flag-off path.
  const entryGroup = baseIr.groups.find((g) => !g.readonly);
  const entryGroupDeleted =
    entryGroup !== undefined && allWholeNodeIds.has(entryGroup.nodeId);

  // Whether carve has any edit at all. The legacy path re-emits the .kmn iff
  // there is a whole-node deletion OR a store-slot rewrite; with no edits it
  // leaves the fetched base .kmn untouched (no re-emit). The seam path must
  // match this exactly so an unedited working copy stays byte-identical.
  const hasCarveEdit = allWholeNodeIds.size > 0 || slotIds.size > 0;

  let carveResult: { warnings: string[] };
  if (isMutateSeamEnabled() && !entryGroupDeleted && hasCarveEdit) {
    const seamIr = applyCarveMutate(baseIr, deletedNodeIds, deletedItemIds);
    // The seam already filtered every node; hand it to emit with an empty
    // deletion set. irRewritten:true because there IS an edit (matching the
    // legacy emit-when-edited behavior) and the seam IR is already filtered,
    // not the parsed original; an unedited copy never reaches here.
    carveResult = applyCarveToVfs(vfs, keyboardId, seamIr, EMPTY_DELETION_SET, {
      irRewritten: true,
    });
  } else {
    carveResult = applyCarveToVfs(vfs, keyboardId, carveIr, allWholeNodeIds, {
      irRewritten: slotIds.size > 0,
    });
  }
  warnings.push(...carveResult.warnings);

  // Step 1.5: Carve keycap projection — blank carved characters off the .kvks /
  // .keyman-touch-layout keycaps IN PLACE (layer/row/key structure is never
  // dropped), so the live preview's visual keyboard keeps its full layout with
  // just the carved caps blank. Runs before Step 3.5 so a subsequent assignment
  // label re-populates a blanked keycap, and before Step 4 so paths resolve
  // against the pre-rename source/<keyboardId>.* filenames.
  if (hasCarveEdit) {
    try {
      const keycapRemovalResult = applyCarveKeycapRemovalsToVfs(vfs, keyboardId, baseIr, {
        slotIds,
        wholeNodeIds: allWholeNodeIds,
      });
      warnings.push(...keycapRemovalResult.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `[project-working-copy] carve keycap projection skipped: ${msg}`,
      );
    }
  }

  // Step 1.6: Touch method deletion projection — blank/drop individually
  // deleted pre-existing touch methods (main key / longpress / multitap /
  // flick) off `.keyman-touch-layout`, addressed by
  // workingCopyStore.deletedTouchKeyIds. Runs AFTER step 1.5 so an address
  // the carve keycap cascade already neutralized resolves to nothing here
  // (idempotent — never a double-blank or an error).
  if (deletedTouchKeyIds.size > 0) {
    try {
      const touchKeycapRemovalResult = applyTouchKeycapRemovalsToVfs(
        vfs,
        keyboardId,
        deletedTouchKeyIds,
      );
      warnings.push(...touchKeycapRemovalResult.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `[project-working-copy] touch method deletion projection skipped: ${msg}`,
      );
    }
  }

  // Step 1.7: Key edit overlay projection — layout half (spec 063
  // FR-031…FR-034, contracts/key-edit-overlay.md §6.1 "new step 1.7").
  // Splices the committed KeyEditOperation[] overlay directly onto
  // `.keyman-touch-layout` (Case B, never round-tripped through the IR —
  // spec 035 R9). Runs AFTER step 1.6 so an id it already neutralized
  // (blanked/dropped) resolves to nothing here rather than double-processing,
  // and gates on a non-empty overlay so an unedited working copy leaves the
  // file byte-identical (FR-033).
  if (keyEditOps.length > 0) {
    try {
      const keyEditResult = applyKeyEditsToVfs(vfs, keyboardId, keyEditOps);
      warnings.push(...keyEditResult.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `[project-working-copy] key edit layout projection skipped: ${msg}`,
      );
    }
  }

  // Step 1.7b: Key edit overlay projection — rule half (contracts/
  // key-edit-overlay.md §6.2 "the rule pass — required, not inherited";
  // R10.2). The working IR (`store.ir`, written by `setWorkingIR`) is NEVER
  // emitted into the artifact — this VFS-mutating chain is the only path a
  // rule reaches the preview or the zip through — so a rule consequence
  // synthesized only into the working IR (e.g. by `applyMarkGuards`) would
  // be a silent no-op here. Runs immediately after step 1.7 so a rename's
  // LAYOUT half (above) and RULE half (here) land in the SAME projection,
  // never split across two debounce cycles.
  //
  // Scope, deliberately narrow: rule SYNTHESIS policy — minting a brand-new
  // producing/guard rule pair for a freshly assigned character, guard-store
  // reuse-vs-mint, CAPS triplication, idempotent dedup against a
  // hand-written rule, and propose-then-confirm removal of a now-orphaned
  // rule — is Phase 6 (`touchRuleSynthesis.ts`, not yet written) and is
  // deliberately NOT implemented here. What this pass DOES handle is the one
  // rule consequence that is purely mechanical, not policy: a `rename` op's
  // contractual obligation to "rewrite the vkey name on every binding for
  // the old id, guard and producing alike" (touch-key-rule-join.md §6.1) — a
  // reference fix-up, not a synthesis decision. `set` / `add` / `remove` /
  // `suppress` / `setSubKey` / `removeSubKey` carry no rule consequence this
  // pass can respond to without that policy, so they are a no-op here today;
  // Phase 6's touchRuleSynthesis.ts is the seam that extends this switch
  // with `ensure` (mint) and `remove` (orphan cleanup) passes of its own.
  const renameOps = keyEditOps.filter(
    (op): op is RenameKeyOp => op.kind === "rename",
  );
  if (renameOps.length > 0) {
    const kmnPathForRename = `source/${keyboardId}.kmn`;
    const kmnTextForRename = readVfsText(vfs, kmnPathForRename);
    if (kmnTextForRename !== undefined) {
      try {
        const parsedForRename = parseKmn(kmnTextForRename, keyboardId);
        const renameResult = applyKeyRenamesToRuleBindings(
          parsedForRename.ir,
          renameOps,
        );
        if (renameResult.changed) {
          vfs.set(kmnPathForRename, emitKmn(renameResult.ir), false);
        }
        warnings.push(...renameResult.warnings);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `[project-working-copy] key edit rule projection skipped: ${msg}`,
        );
      }
    }
  }

  // Step 2: Assignments projection — inject mechanism pattern fragments.
  // Physical-only: touch assignments are handled by a separate gallery.
  // Skipped when there are no physical assignments.
  const physicalAssignments = assignments.filter((a) => a.modality === "physical");
  if (physicalAssignments.length > 0) {
    const assignResult = applyAssignmentsToVfs(
      vfs,
      keyboardId,
      physicalAssignments,
      getPattern,
    );
    warnings.push(...assignResult.warnings);

    // spec-014 T017 — add-gallery IR projection via the single mutate() seam.
    //
    // The reference emit above is text-based (applyAssignmentsToVfs writes the
    // injected .kmn directly, byte-identical in both flag states). When the flag
    // is on we ALSO derive the canonical assignment IR through the mutate() write
    // path: parse the just-written .kmn back to IR and route its physical-assignment
    // arrays (groups[]/stores[]) through applyAddGalleryMutate (applyMutatePatch /
    // ADD_GALLERY_WRITES). This makes mutate() the single IR write route for the
    // add surface (M6/SC-001) and enforces declared-writes containment (M3) — the
    // patch can never reach header, comments, or the deferred keycap/touch targets.
    // The derived IR is intentionally NOT re-emitted: the text artifact stays
    // byte-identical to the flag-off path. Keycap-label / touch-layout projection
    // is deferred to US2.
    if (isMutateSeamEnabled()) {
      const kmnText = readVfsText(vfs, `source/${keyboardId}.kmn`);
      if (kmnText !== undefined) {
        try {
          const assignedIr = parseKmn(kmnText, keyboardId).ir;
          // Route through the seam; a containment violation (M3) surfaces here.
          applyAddGalleryMutate(carveIr, assignedIr);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(
            `[project-working-copy] add-gallery mutate-seam derivation skipped: ${msg}`,
          );
        }
      }
    }
  }

  // Step 2.5: Desktop -> touch layer propagation — surface any generalized
  // S-08 (modifier_as_layer_switch) combo layer already in the IR, or about
  // to be authored via a physical assignment just projected above, onto the
  // `.keyman-touch-layout` written by step 0 (or shipped by the base VFS).
  // A no-op when the VFS has no touch layout file, OR when there is no S-08
  // combo to surface at all — propagateDesktopLayersToTouch always
  // round-trips the JSON through JSON.parse/stringify even when nothing
  // changes, which would needlessly reformat (and break byte-identical
  // golden-artifact comparisons for) a keyboard that never touches this
  // pattern, so the cheap baseIr/assignment check below gates the call.
  //
  // Re-parses the just-written .kmn (rather than reusing baseIr/carveIr)
  // so a combo the author just added via step 2 gets real key text instead
  // of blanks — feeding propagateDesktopLayersToTouch a stale IR is a known
  // limitation of the engine helper. Runs AFTER step 2 (assignments) so it
  // sees those combos, and BEFORE step 4 (id rename) so the path it edits
  // still resolves under the pre-rename keyboardId; TouchGallery's own
  // step-0 edits are preserved — propagateDesktopLayersToTouch only ever
  // sets `text`/`output` on keys its own combo key-map defines, and never
  // deletes or restructures existing keys/rows/layers.
  const hasLayerSwitchAssignment = physicalAssignments.some((a) =>
    a.mechanisms.some((m) => m.patternId === "modifier_as_layer_switch"),
  );
  const hasLayerSwitchInBaseIr = collectLayerCombosInUse(baseIr).length > 0;
  if (hasLayerSwitchAssignment || hasLayerSwitchInBaseIr) {
    const touchLayoutPath = findTouchLayoutPath(vfs);
    if (touchLayoutPath !== undefined) {
      const touchEntry = vfs.get(touchLayoutPath);
      const kmnEntryForPropagation = vfs.get(`source/${keyboardId}.kmn`);
      if (
        touchEntry !== undefined &&
        typeof touchEntry.content === "string" &&
        kmnEntryForPropagation !== undefined &&
        typeof kmnEntryForPropagation.content === "string"
      ) {
        try {
          const freshIr = parseKmn(kmnEntryForPropagation.content, keyboardId).ir;
          const propagateResult = propagateDesktopLayersToTouch(
            touchEntry.content,
            freshIr,
            physicalAssignments,
          );
          vfs.set(touchLayoutPath, propagateResult.json, false);
          warnings.push(...propagateResult.warnings);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(
            `[project-working-copy] desktop-to-touch layer propagation skipped: ${msg}`,
          );
        }
      }
    }
  }

  // Step 3: Identity projection — write &NAME (display name) into the .kmn.
  //
  // The display name is treated as an EDIT, reflected only when it CHANGES.
  // `store(&NAME)` is rewritten in place ONLY when the effective display name
  // DIFFERS from the base keyboard's own name (`baseDisplayName`, falling back
  // to `baseIr.header.name`). When they match — which includes the no-identity-
  // set case, where `serializeWorkingCopy` passes the base's own display name
  // straight back as a fallback so the `.kmp` descriptor writer (step 3.6) has a
  // non-null overlay to key on — the name is NOT an edit and the base's name
  // store is left untouched, so the output `.kmn` stays byte-identical to the
  // base. The store is never deleted and never duplicated:
  // `applyIdentityStubMutation` rewrites the existing line in place (or, only on
  // a genuine change to a base that never had a &NAME store, inserts one).
  //
  // This is the single seam BOTH output paths (zip + pull request via
  // `serializeWorkingCopy`) and the OSK preview (`useWorkingCopyTransform`) pass
  // through, so they cannot disagree about whether the name changed.
  if (identity !== null) {
    const baseName = baseDisplayName ?? baseIr.header.name;
    const identityArg: { name?: string; copyright?: string; version?: string } = {};
    if (identity.displayName !== undefined && identity.displayName !== baseName) {
      identityArg.name = identity.displayName;
    }
    if (identity.copyright !== undefined) identityArg.copyright = identity.copyright;
    if (identity.version !== undefined) identityArg.version = identity.version;

    if (Object.keys(identityArg).length > 0) {
      try {
        applyIdentityStubMutation(vfs, keyboardId, identityArg);
      } catch (err: unknown) {
        // The stub mutator throws if the file is missing (e.g. carve removed all
        // rules and the file was never written). Warn rather than abort.
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `[project-working-copy] identity projection skipped: ${msg}`,
        );
      }
    }
  }

  // Step 3.5: Keycap label projection — patch .kvks and .keyman-touch-layout so
  // the desktop and touch OSK preview shows the swapped character on the keycap.
  // Runs after identity (which only touches .kmn) and before id-rename (which
  // renames source/<keyboardId>.* siblings — patched assets are carried along).
  if (physicalAssignments.length > 0) {
    try {
      const keycapResult = applyKeycapLabelsToVfs(vfs, keyboardId, physicalAssignments);
      warnings.push(...keycapResult.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`[project-working-copy] keycap label projection skipped: ${msg}`);
    }
  }

  // Step 3.6: Package-descriptor identity — write the AUTHOR's language and
  // display name into `source/<keyboardId>.kps`, generating the descriptor when
  // the track never had one (spec 059 FR-001…FR-006).
  //
  // ORDER IS LOAD-BEARING, in both directions:
  //
  //   After step 3/3.5, because the descriptor's `<Files>` list is derived from the
  //   final `.kmn` — a list that named artifacts this build does not emit fails
  //   `kmc`.
  //
  //   Before step 4, because `rewriteKpsFilePaths` owns `<ID>` and the `<Files>`
  //   paths. This step deliberately writes neither, under the PRE-rename keyboard
  //   id, so the rename pass composes with no new code. That pass's skip of
  //   non-path-shaped `<Name>` values is exactly what preserves the display names
  //   set here (research D-02). Inverting the two would either strand the
  //   descriptor under the old filename or have the rename mangle the author's
  //   name into a path.
  //
  // Runs for BOTH tracks and on BOTH the preview and output paths, which is what
  // makes FR-004/SC-005 true: the OSK preview, the zip, and the pull request all
  // see one descriptor because they all come through here.
  if (identity !== null) {
    const kmnTextForKps = readVfsText(vfs, `source/${keyboardId}.kmn`) ?? "";
    const kpsIdentity: PackageDescriptorIdentity = {
      // Passed through as-is, INCLUDING a blank: the writer owns the fallback
      // (`effectiveDisplayName`) so both its paths apply the same one. Note `??`
      // would not be enough here — an author who clears the display-name field
      // commits `""`, not `undefined`, and `""` is exactly the case that must not
      // leave the base keyboard's name standing in the descriptor.
      displayName: identity.displayName ?? "",
      ...(identity.bcp47 !== undefined && identity.bcp47 !== ""
        ? { languageTag: identity.bcp47 }
        : {}),
      ...(identity.languageName !== undefined && identity.languageName !== ""
        ? { languageName: identity.languageName }
        : {}),
      ...(identity.websiteUrl !== undefined && identity.websiteUrl !== ""
        ? { websiteUrl: identity.websiteUrl }
        : {}),
    };
    // `applyIdentityToKps` never throws — an absent or unreadable descriptor
    // reports through its warnings, which merge into the projection's own. A
    // silent no-op here is the defect this step exists to remove (FR-006).
    const kpsResult = applyIdentityToKps(
      vfs,
      keyboardId,
      kpsIdentity,
      kmnTextForKps,
      identity.version,
    );
    warnings.push(...kpsResult.warnings);
  }

  // Step 4: Id rename — only when the author chose a different keyboard id.
  // Rewrites the .kmn's sibling-file path stores (so &KMW_EMBEDCSS et al. point
  // at the new filenames), renames source/<keyboardId>.* siblings, and rewrites
  // `.kmw-keyboard-<keyboardId>` selectors in *.css plus <ID> / <kbdname>
  // references in *.kps / *.kvks. Without this, a renamed keyboard ships with
  // CSS that targets the base id's wrapper class and never matches.
  //
  // When this pass fires, the VFS's `.kmn` (and siblings) now live under
  // `source/<targetKeyboardId>.*`, not `source/<keyboardId>.*`. Report the new
  // id via the result so callers that compile/re-read from the VFS after this
  // function returns know to use `targetKeyboardId`, not `keyboardId`.
  let effectiveKeyboardId: string | undefined;
  if (
    targetKeyboardId !== undefined &&
    targetKeyboardId !== keyboardId
  ) {
    effectiveKeyboardId = targetKeyboardId;
    const kmnPath = `source/${keyboardId}.kmn`;
    const kmnText = readVfsText(vfs, kmnPath);
    if (kmnText !== undefined) {
      try {
        const parsed = parseKmn(kmnText, keyboardId);
        // Preserve the base keyboard's release version on the copy path. Without
        // this, resetIdentity() defaults &KEYBOARDVERSION to "1.0" while the .kps
        // <Version> and the zip filename both keep the base version (serialize-
        // WorkingCopy uses baseIr.header.version) — leaving the three disagreeing
        // inside one package. An explicit identity.version still wins; an empty
        // base version falls through so resetIdentity applies its "1.0" default
        // (matching serializeWorkingCopy's `|| "1.0"`).
        const copyVersion =
          identity?.version ?? (parsed.ir.header.version?.trim() || undefined);
        resetIdentity(parsed.ir, {
          keyboardId: targetKeyboardId,
          displayName: identity?.displayName ?? parsed.ir.header.name ?? targetKeyboardId,
          ...(identity?.bcp47 !== undefined && identity.bcp47 !== ""
            ? { bcp47: [identity.bcp47] }
            : {}),
          ...(copyVersion !== undefined ? { version: copyVersion } : {}),
          ...(identity?.copyright !== undefined ? { copyright: identity.copyright } : {}),
        });
        vfs.set(kmnPath, emitKmn(parsed.ir), false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `[project-working-copy] id rename: .kmn store rewrite skipped: ${msg}`,
        );
      }
    }
    renameFilesInVfs(vfs, keyboardId, targetKeyboardId);
  }

  return {
    warnings,
    ...(effectiveKeyboardId !== undefined ? { effectiveKeyboardId } : {}),
  };
}

// ---------------------------------------------------------------------------
// Step 1.7b helper — the mechanical half of key-edit rule projection
// ---------------------------------------------------------------------------

/**
 * Rewrite every `vkey` context element in `ir` whose name case-insensitively
 * matches a `rename` op's PRE-rename id (the `keyId` its `address` parses
 * to) to that op's `toId`, across every group/rule — "guard and producing
 * alike" (touch-key-rule-join.md §6.1). Purely a reference fix-up: it does
 * not decide whether a rule is NEEDED (that's rule-synthesis policy, Phase
 * 6) — only that an EXISTING binding must not silently point at an id no key
 * carries any more once the layout half has renamed it.
 *
 * `renameOps` is sorted by `seq` before replay so a rename authored after an
 * upstream rename in the same overlay sees the upstream rewrite already
 * applied — the same ordering guarantee `replayKeyEditOverlay` gives the
 * layout side (contracts/key-edit-overlay.md §2, "ordered, not keyed").
 *
 * A malformed `address` is reported as a warning and skipped, never thrown —
 * matching every other resolver in this feature's never-throw convention. A
 * rename whose old id matches no `vkey` binding is NOT warned about: not
 * every key has a rule (e.g. a `U_` id that self-outputs), so this is the
 * ordinary case, not a sign of drift.
 */
function applyKeyRenamesToRuleBindings(
  ir: KeyboardIR,
  renameOps: readonly RenameKeyOp[],
): { ir: KeyboardIR; changed: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let currentIr = ir;
  let anyChanged = false;

  const orderedRenames = [...renameOps].sort((a, b) => a.seq - b.seq);

  for (const op of orderedRenames) {
    const parts = parseTouchKeyAddress(op.address);
    if (parts === undefined) {
      warnings.push(
        `[key-edit-rule-rename] op #${op.seq}: malformed address "${op.address}" — rule rewrite skipped`,
      );
      continue;
    }

    const oldUpper = parts.keyId.toUpperCase();
    const newId = op.toId;
    if (oldUpper === newId.toUpperCase()) continue; // nothing to rewrite

    let renameTouchedAnything = false;
    const nextGroups = currentIr.groups.map((group) => {
      let groupTouched = false;
      const nextRules = group.rules.map((rule) => {
        let ruleTouched = false;
        const nextContext = rule.context.map((el) => {
          if (el.kind === "vkey" && el.name.toUpperCase() === oldUpper) {
            ruleTouched = true;
            return { ...el, name: newId };
          }
          return el;
        });
        if (!ruleTouched) return rule;
        groupTouched = true;
        return { ...rule, context: nextContext };
      });
      if (!groupTouched) return group;
      renameTouchedAnything = true;
      return { ...group, rules: nextRules };
    });

    if (renameTouchedAnything) {
      currentIr = { ...currentIr, groups: nextGroups };
      anyChanged = true;
    }
  }

  return { ir: currentIr, changed: anyChanged, warnings };
}
