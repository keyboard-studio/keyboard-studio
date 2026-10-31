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
//                         Also drops the starting rules an assignment shadows
//                         (claimedInputs.ts, spec 106 US4) — per projection only.
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
//                         cannot be inherited from the working IR). Rule
//                         SYNTHESIS policy (minting a new producing/guard
//                         rule pair for a freshly assigned character) is
//                         Phase 6/touchRuleSynthesis.ts, not this pass —
//                         see the step's own comment below for the seam.
//   2. Assignments      — applyAssignmentsToVfs (injects mechanism patterns).
//                         With a marks decision recorded, the output form and
//                         the mark attachment matrix ride along so every
//                         emitted string follows the one form (spec 106 US3);
//                         a uniformity scan then warns on wrong-form text the
//                         assignments introduced
//   2.5 Layer propagation — propagateDesktopLayersToTouch (surfaces S-08
//                         generalized modifier-combo layers onto the
//                         .keyman-touch-layout written by step 0; no-op when
//                         the VFS has no touch layout file)
//   2.6 Mark guards     — applyMarkGuards from the recorded marks-treatment
//                         decision (spec 106 FR-010/FR-011): the guard group
//                         and the backspace rules. The only place they are
//                         generated; after 2 so they see assignment rules,
//                         before 2.7 because that step repoints the entry group
//   2.7 Context tolerance — applyContextToleranceOverlay (spec 078)
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
// preserved must clone it before calling (e.g. createVirtualFS(startVfs.entries())).

import type {
  AttestedStack,
  BackspaceBehaviour,
  KeyboardIR,
  OutputForm,
  PackageFontSet,
  Pattern,
  PlacementWorklist,
  VirtualFS,
} from "@keyboard-studio/contracts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import type { FallbackPolicy } from "@keyboard-studio/contracts";
import type { KeyEditOperation, RenameKeyOp } from "@keyboard-studio/engine";
import type { DeadkeyOperation } from "./deadkeyOps.ts";
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
  applyContextToleranceOverlay,
  applyMarkGuards,
  TOUCH_LAYOUT_JSON_INDENT,
} from "@keyboard-studio/engine";
import type { ContextToleranceOverlay } from "@keyboard-studio/engine";
import type { PackageDescriptorIdentity } from "@keyboard-studio/engine";
import type { ApplyCarveToVfsResult } from "@keyboard-studio/engine";
import {
  applyCarveMutate,
  applyAddGalleryMutate,
  unionAggregatedCarveIds,
} from "../steps/editorMutate.ts";

import { findTouchLayoutPath } from "./findTouchLayoutPath.ts";
import { readVfsText } from "./vfsText.ts";
import { markAttachmentsFromWorklist } from "./markAttachments.ts";
import { formViolations, outputFormWarning } from "./outputFormUniformity.ts";
import { claimedInputRuleIds } from "./claimedInputs.ts";

/** Violation scan that never throws: an unparseable .kmn is reported elsewhere. */
function safeFormViolations(
  kmn: string | undefined,
  keyboardId: string,
  form: OutputForm,
): Set<string> | undefined {
  if (kmn === undefined) return undefined;
  try {
    return formViolations(kmn, keyboardId, form);
  } catch {
    return undefined;
  }
}
import {
  spliceRuleAdditions,
  hasRuleAdditions,
  type DerivedRuleAdditions,
} from "../survey/rules/ruleAdditions.ts";
import { applyDeadkeyOpsToVfs } from "./deadkeyOps.ts";

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
 * - `startIr`          — the source-of-truth IR (never mutated by projection).
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
  startIr: KeyboardIR;
  deletedNodeIds: ReadonlySet<string>;
  /** Individual rule nodeIds (and store-slot ids) removed via character-level carving. */
  deletedItemIds?: ReadonlySet<string>;
  /**
  /**
   * Keyboard-wide fallback policy (T015, FR-019) for the suppression stage.
   * The caller (useWorkingCopyTransform) reads it from the working-copy
   * store. The engine expands it over the live carve set, so it can never
   * rewrite an uncarved rule. Omitted degrades to the legacy carve behavior,
   * content-identical.
   */
  fallbackPolicy?: FallbackPolicy;
  /**
   * Ids inside `deletedItemIds` that are plain removals rather than carves
   * (disabled-family rules). They are removed outright, never rewritten into
   * suppression rules by the fallback policy.
   */
  suppressionExemptIds?: ReadonlySet<string>;
  /**
   * A6 loud/soft for the suppression stage (FR-009). Default false (soft).
   * Follows the A6 survey answer when it exists.
   */
  carveLoud?: boolean;
  /**
   * Touch-layout keep-inert overrides, 076 FR-023 (T020): carved NFC
   * characters to keep — visibly inert, "does nothing" — in the touch
   * layout instead of removed. Threaded to the step-1.5 keycap projection
   * as keepInertTouchChars. Omit or pass an empty set for the default
   * ("removed from the touch layout").
   */
  carveTouchKeepInert?: ReadonlySet<string>;
  /**
   * Issue #1809, ruling §1: the aggregated carved character set (NFC-normalized).
   * The projection runs ONE aggregated-R pass (`collectTaintedContributors`) and
   * unions it over `deletedItemIds`, because the per-character union is not
   * equivalent to the aggregated pass for whole-rule "no rows left" deletion
   * and fully-tainted literal outputs. Omit or pass an empty set when nothing
   * was carved via the gallery.
   */
  carveChars?: ReadonlySet<string>;

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
  /**
   * The committed deadkey lifecycle overlay (spec 083): every define /
   * rename / delete / retarget / pair / name-token mutation the Deadkeys
   * step committed to the working IR, in commit order. Replayed at step
   * 1.8 (via `applyDeadkeyOpsToVfs`) so working-IR deadkey edits reach the
   * projected VFS — the working IR itself is never emitted into artifacts.
   * Omit or pass an empty array when no deadkey edits were committed.
   */
  deadkeyOps?: readonly DeadkeyOperation[];
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
   * spec 079 FR-002/FR-006: bare names of the files the OUTPUT projection
   * ships in `source/welcome/` beside the page (inherited base images,
   * generated charts), so step 3.6's descriptor `<Files>` list names them.
   * Optional: the OSK preview path omits it — it builds no package, and the
   * files themselves are only written at output (step 5c of
   * `projectWorkingCopyForOutput`) — so its descriptor lists the page alone.
   */
  welcomeFolderFiles?: readonly string[];
  /**
   * The starting keyboard's packaged fonts, which step 3.6's
   * descriptor declares (`<Files>` + OSK/display selection; criteria 8/9/10).
   * Optional for the same reason as `welcomeFolderFiles`: the OSK preview
   * builds no package, so only the output projection passes it.
   */
  packageFonts?: PackageFontSet;
  /**
   * The base keyboard's own display name — the value the `.kmn`'s existing
   * `store(&NAME)` already holds. Step 3 treats the overlay's display name as an
   * EDIT and rewrites the name store ONLY when it DIFFERS from this. It is the
   * anchor that keeps the no-identity output byte-identical to the base: the
   * output path passes this same value as its display-name fallback, so the two
   * compare equal and the name store is left untouched.
   *
   * Optional. When omitted, the comparison falls back to `startIr.header.name`.
   * The gallery's `StartKeyboard.displayName` and the parsed `startIr.header.name`
   * are the same in practice; passing it explicitly lets a caller whose overlay
   * fallback is the gallery name (rather than the parsed `.kmn` name) match on
   * the exact value it fell back to.
   */
  baseDisplayName?: string;
  /**
   * The recorded marks-treatment decision's guard inputs (spec 106 FR-010),
   * generated into the .kmn by step 2.6. Absent or `null` when the marks
   * series has not completed.
   */
  marksGuards?: MarksGuardsInput | null;
  /**
   * The applied context-tolerance fix (spec 078): verified generated rules,
   * replayed by step 2.7. Absent or `null` when no fix is applied.
   */
  contextToleranceOverlay?: ContextToleranceOverlay | null;
  /**
   * The rules survey step's additions (spec 082: pack install, guard
   * synthesis, Narrow exceptions), pre-derived by the caller with
   * `deriveRuleAdditions(workingIr, startIr)`. Spliced into the
   * carve-filtered IR in working-IR order by step 1.8 before the `.kmn`
   * re-emit, so the additions take effect in the preview and download.
   *
   * Optional. When omitted (or empty), the projection stays byte-identical
   * to the no-additions path — the additions only ever widen the emitted
   * `.kmn`, never rewrite the no-edit fast path.
   */
  ruleAdditions?: DerivedRuleAdditions;
}

/** Step 2.6's input: the marks completion payload (buffer-start behaviour is per mark on the worklist, issue #2374). */
export interface MarksGuardsInput {
  worklist: PlacementWorklist;
  outputForm: OutputForm;
  backspace?: BackspaceBehaviour;
  stacks?: readonly AttestedStack[];
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
 * Re-indent a single-line `.keyman-touch-layout` string to the tabulated form
 * every writer now emits (`TOUCH_LAYOUT_JSON_INDENT`). `touchLayoutJson` is
 * persisted with the draft and restored verbatim, so a draft saved before the
 * writers were fixed still carries compact JSON — which Keyman Developer
 * cannot open. Already-multi-line input and unparseable input pass through
 * unchanged, so a current draft's bytes are never rewritten.
 */
export function tabulateTouchLayoutJson(json: string): string {
  if (json.includes("\n")) return json;
  try {
    return JSON.stringify(JSON.parse(json), null, TOUCH_LAYOUT_JSON_INDENT);
  } catch {
    return json;
  }
}

/**
 * Apply carve + assignments + identity projection layers onto `input.vfs`
 * in-place, returning any accumulated warnings.
 *
 * `input.vfs` IS mutated. Callers that need the original VFS preserved must
 * clone it before calling: `createVirtualFS(startVfs.entries())`.
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
    startIr,
    deletedNodeIds,
    deletedItemIds = new Set<string>(),
    carveChars = new Set<string>(),
    deletedTouchKeyIds = new Set<string>(),
    fallbackPolicy,
    suppressionExemptIds,
    carveLoud = false,
    carveTouchKeepInert,
    keyEditOps = [],
    deadkeyOps = [],
    assignments,
    getPattern,
    identity,
    touchLayoutJson,
    baseDisplayName,
    marksGuards = null,
    contextToleranceOverlay = null,
    ruleAdditions,
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
    vfs.set(
      `source/${keyboardId}.keyman-touch-layout`,
      tabulateTouchLayoutJson(touchLayoutJson),
      false,
    );
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
  // but whose store is not found in startIr also falls through to wholeNodeItemIds
  // and becomes a no-op whole-node deletion (applyStoreSlotRemovals never sees it).
  const storeNodeIdSet = new Set(startIr.stores.map((s) => s.nodeId));

  // Issue #1809, ruling §1: ONE aggregated carved set R, one nomination pass.
  // Union the aggregated pass over the incremental per-character union before
  // partitioning, so the .kmn slot pruning, the whole-node filter, and the
  // keycap projection below all consume the same pruned result (§11).
  const aggregatedItemIds = unionAggregatedCarveIds(
    startIr,
    deletedItemIds,
    carveChars,
  );

  // Spec 106 US4 (FR-040): starting rules an assignment shadows (same key,
  // same modifiers, merged ahead of them in step 2) are dropped here, fresh
  // every projection and never stored — removing the assignment restores
  // them. They are plain removals, not carves: exempt from the fallback
  // policy's suppression rewrite, and kept out of the keycap cascade (step
  // 1.5), whose key the assignment itself still needs.
  const claimedRuleIds = claimedInputRuleIds(startIr, assignments, getPattern);
  const effectiveItemIds =
    claimedRuleIds.size === 0
      ? aggregatedItemIds
      : new Set([...aggregatedItemIds, ...claimedRuleIds]);

  const slotIds = new Set<string>();
  const wholeNodeItemIds = new Set<string>();

  for (const id of effectiveItemIds) {
    const parsed = parseSlotId(id);
    if (parsed !== null && storeNodeIdSet.has(parsed.storeNodeId)) {
      slotIds.add(id);
    } else {
      wholeNodeItemIds.add(id);
    }
  }

  // 1a/1b: Whole-node deletions + store-slot removals + VFS re-emit.
  //
  // T015 carve pipeline (suppression → slot removals → filter, carvePipeline.ts
  // in the engine). When a fallback policy is present, the pipeline derives the
  // carved IR from the PRE-carve startIr — the T013 constraint: guard selector
  // chars are read from the pre-removal stores and are unrecoverable after
  // slot removal. Since spec 089 T021 the pipeline runs through the mutate
  // seam (applyCarveMutate) whenever there is a projection edit; the legacy
  // derivation below survives only for the no-projection-edit case
  // (slot-item nul-rewrites first via applyStoreSlotRemovals, then whole-node
  // deletions inside applyCarveToVfs).
  //
  // The slot partition above is kept for that legacy path and for the keycap
  // cascade (step 1.5), which is driven off startIr.
  const allWholeNodeIds = new Set([...deletedNodeIds, ...wholeNodeItemIds]);
  // The same set without the claimed-only rules (US4): the keycap cascade's
  // input. A rule the author also carved stays in it.
  const carvedWholeNodeIds =
    claimedRuleIds.size === 0
      ? allWholeNodeIds
      : new Set(
        [...allWholeNodeIds].filter(
          (id) => !claimedRuleIds.has(id) || deletedNodeIds.has(id) || aggregatedItemIds.has(id),
        ),
      );

  // spec-014 T016c — carve IR-projection via the single mutate() write seam.
  //
  // Derive the deletion-filtered carve IR through applyCarveMutate
  // (which routes the carve patch through applyMutatePatch / CARVE_WRITES) and
  // hand THAT pre-filtered IR to applyCarveToVfs with an empty deletion set so
  // the emit step only serializes — the seam, not applyCarveToVfs's internal
  // filter, is the canonical IR producer (M6/SC-001).
  //
  // The patch is built from startIr (never a slot-rewritten IR) so it is a
  // pure function of the overlay (idempotent + reversible). The entry-group
  // safety gate is preserved: when the deletion set would remove the entry group
  // we DEFER to the legacy applyCarveToVfs call, which warns and skips the
  // re-emit (the seam IR would otherwise have silently dropped it). This keeps
  // the emitted artifact byte-identical to the flag-off path.
  const entryGroup = startIr.groups.find((g) => !g.readonly);
  const entryGroupDeleted =
    entryGroup !== undefined && allWholeNodeIds.has(entryGroup.nodeId);

  // Whether carve has any edit at all. The legacy path re-emits the .kmn iff
  // there is a whole-node deletion OR a store-slot rewrite; with no edits it
  // leaves the fetched base .kmn untouched (no re-emit). The seam path must
  // match this exactly so an unedited working copy stays byte-identical.
  const hasCarveEdit = allWholeNodeIds.size > 0 || slotIds.size > 0;

  // Step 1.8 (spec 082): working-IR rule additions. The rules survey step
  // (pack install, guard synthesis, Narrow) writes its additions through
  // `setWorkingIR`, but this projection builds from the base IR plus
  // replayable overlays — so the additions are spliced into the
  // carve-filtered IR in working-IR order before emit. `deriveRuleAdditions`
  // collected them (marked `rulesStepAdded`, absent from the base IR); the
  // splice walks each group's working order so a Narrow exception stays
  // immediately BEFORE its guard (first-match semantics), and skips any
  // added rule the deletion set filtered out (carve deletions and
  // disabled-family members are never resurrected). Context-tolerance and
  // touch-synthesis rules carry no marker and are unaffected — they reach
  // the artifact through their own projection paths. With no additions the
  // splice is the identity and the emit gate below is unchanged, so the
  // no-additions path stays byte-identical.
  const additions = ruleAdditions;
  const additionsPresent = additions !== undefined && hasRuleAdditions(additions);
  const hasProjectionEdit = hasCarveEdit || additionsPresent;

  let carveResult: ApplyCarveToVfsResult;
  // The post-carve IR, for the add-gallery mutate derivation (step 2) — only
  // used as the mutate base, never re-emitted. Spec 089 T021: the seam path
  // below is THE carve path (the flag that selected it is deleted, OI-1
  // ruled global); the legacy flag-off suppression branch it shadowed was
  // unreachable under the un-gated condition and is deleted with it.
  let carveIr: KeyboardIR;
  if (!entryGroupDeleted && hasProjectionEdit) {
    // Seam path (T015): applyCarveMutate runs the shared pipeline
    // (suppression → slot removals → filter) from the pre-carve startIr.
    // effectiveItemIds already carries the #1809 §1 aggregated union, so
    // carveChars takes the plain default (buildCarvePatch would union it
    // again idempotently).
    const seamIr = applyCarveMutate(
      startIr,
      deletedNodeIds,
      effectiveItemIds,
      undefined,
      {
        ...(fallbackPolicy !== undefined ? { fallbackPolicy } : {}),
        ...(suppressionExemptIds !== undefined || claimedRuleIds.size > 0
          ? {
            suppressionExemptIds: new Set([
              ...(suppressionExemptIds ?? []),
              ...claimedRuleIds,
            ]),
          }
          : {}),
        loud: carveLoud,
        // The pipeline's slot-removal warnings (blocked stores, skips) are
        // part of this projection's warning surface — the legacy path
        // pushed applyStoreSlotRemovals' warnings directly, and the seam
        // path must surface the same set (spec 089 T021 fix).
        onWarnings: (w) => warnings.push(...w),
      },
    );
    carveIr = seamIr;
    // The seam already filtered every node; hand it to emit with an empty
    // deletion set. irRewritten:true because there IS an edit (matching the
    // legacy emit-when-edited behavior) and the seam IR is already filtered,
    // not the parsed original; an unedited copy never reaches here.
    const mergedSeamIr =
      additions !== undefined
        ? spliceRuleAdditions(seamIr, additions, allWholeNodeIds)
        : seamIr;
    carveResult = applyCarveToVfs(vfs, keyboardId, mergedSeamIr, EMPTY_DELETION_SET, {
      irRewritten: true,
    });
  } else {
    // Legacy path without suppression — unchanged pre-T015 behavior:
    // slot-item nul-rewrites first, then whole-node deletions inside
    // applyCarveToVfs (filter+emit or text-splice).
    //     irRewritten: true when any slots were targeted — the nul-modified IR must
    //     be written into the VFS even if no whole-node deletions are present, and
    //     its node positions no longer match the .kmn text, so text-splice is off.
    //     When all slot ids are rejected by the transform's guards, irRewritten
    //     still triggers a (harmless, idempotent) re-emit of the unmodified IR.
    // Carve-scoped `notany()` hygiene (issue #1809, ruling §3).
    const removalResult = applyStoreSlotRemovals(startIr, slotIds, {
      carveNotAnyHygiene: true,
    });
    warnings.push(...removalResult.warnings);
    carveIr = removalResult.ir; // equals startIr when slotIds was empty
    // spec 082: splice the rules step's additions into the carve-filtered IR
    // (in working-IR order; carve-deleted and disabled-family rules are never
    // resurrected — spliceRuleAdditions skips anything in allWholeNodeIds).
    // With no additions the splice is the identity and this path is
    // byte-identical to pre-082.
    const mergedCarveIr =
      additions !== undefined
        ? spliceRuleAdditions(carveIr, additions, allWholeNodeIds)
        : carveIr;
    carveResult = applyCarveToVfs(vfs, keyboardId, mergedCarveIr, allWholeNodeIds, {
      irRewritten: slotIds.size > 0 || additionsPresent,
    });
  }
  warnings.push(...carveResult.warnings);

  // Step 1.5: Carve keycap projection — blank carved characters off the .kvks
  // keycaps IN PLACE (layer/row/key structure is never dropped), so the live
  // preview's visual keyboard keeps its full layout with just the carved caps
  // blank; on the .keyman-touch-layout a carved main key is REMOVED by
  // default (076 FR-023, T020) unless listed in carveTouchKeepInert, in which
  // case it is kept visibly inert ("does nothing"). Runs before Step 3.5 so a
  // subsequent assignment label re-populates a blanked keycap, and before
  // Step 4 so paths resolve against the pre-rename source/<keyboardId>.* filenames.
  if (carvedWholeNodeIds.size > 0 || slotIds.size > 0) {
    try {
      const keycapRemovalResult = applyCarveKeycapRemovalsToVfs(
        vfs,
        keyboardId,
        startIr,
        {
          slotIds,
          wholeNodeIds: carvedWholeNodeIds,
          // exactOptionalPropertyTypes: only pass the seam when non-empty —
          // an explicit undefined is not assignable to the optional field.
          ...(carveTouchKeepInert !== undefined && carveTouchKeepInert.size > 0
            ? { keepInertTouchChars: carveTouchKeepInert }
            : {}),
        },
      );
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
  //
  // One composition is NOT Phase 6 policy and does not wait for it: the
  // spec-104 key-identity commit (severance transplant composed with the
  // AssignPanel's synthesis by `mergeSeveranceWithSynthesis`). Its rules
  // are already fully decided in the working IR, so they reach the artifact
  // through the step-1.8 additions seam (stamped `rulesStepAdded`), and
  // this pass must not re-decide them — see the severance exception at the
  // `renameOps` filter below.
  // Severance exception (spec 104): the key-identity commit re-keys the
  // transplant's sibling layer occurrences with ordinary `rename` ops, but
  // those renames are NOT pure renames — their rule half was decided by
  // the severance composition in the working IR (the source key KEEPS its
  // bindings; the target's clones and synthesized rules are composed, not
  // copied), and that composition reaches this projection through the
  // step-1.8 additions seam (the composed delta is stamped
  // `rulesStepAdded` by `mergeSeveranceWithSynthesis`). Running the
  // mechanical fix-up for such a rename would rewrite the source key's
  // producing rule onto the target id — a guarded T_0301 minted from K_1
  // typed K_1's "&" in the OSK preview and the download (walk 1). So a
  // rename whose target id is already bound by a projected addition is
  // skipped here, loudly: its layout half (step 1.7) still applies, and
  // its rule half is the additions splice, never this rewrite. A rename
  // whose target carries no composed rules (the RenameDialog case) is
  // unaffected.
  const additionBoundIds = new Set<string>();
  if (additions !== undefined) {
    for (const group of additions.groups) {
      for (const rule of group.added) {
        for (const el of rule.context) {
          if (el.kind === "vkey") additionBoundIds.add(el.name.toUpperCase());
        }
      }
    }
  }
  const renameOps = keyEditOps.filter((op): op is RenameKeyOp => {
    if (op.kind !== "rename") return false;
    if (additionBoundIds.has(op.toId.toUpperCase())) {
      warnings.push(
        `[project-working-copy] key edit rule projection: rename to "${op.toId}" ` +
          `skipped — the working IR already carries composed rules for this id ` +
          `(severance/synthesis); its rule half is projected via the rule additions.`,
      );
      return false;
    }
    return true;
  });
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

  // Step 1.8: Deadkey lifecycle overlay projection (spec 083). Replays the
  // committed DeadkeyOperation[] log (define/rename/delete/retarget, pair
  // edits, name tokens, merge/repoint/repair, named-deadkey ops) onto the
  // projected .kmn via applyDeadkeyOpsToVfs. The working IR (`store.ir`,
  // written by `setWorkingIR`) is NEVER emitted into the artifact — this
  // replay is the only path a Deadkeys-step edit reaches the preview or
  // the zip through.
  //
  // ORDER IS LOAD-BEARING: this runs BEFORE step 2 (assignments), not
  // after. The ops were authored and validated against the working IR,
  // which never contains assignment overlays — replaying here keeps the
  // replay base closest to the editor's validation context. S-02
  // assignment ids are allocated to avoid working-IR ids
  // (MechanismGallery's allocateS02DeadkeyId seam note), so the assignment
  // layer then composes on top without id collision. An op whose
  // preconditions no longer hold is skipped with a warning inside
  // applyDeadkeyOpsToVfs — never a silent no-op, never a corrupt .kmn.
  if (deadkeyOps.length > 0) {
    try {
      const deadkeyResult = applyDeadkeyOpsToVfs(vfs, keyboardId, deadkeyOps);
      warnings.push(...deadkeyResult.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `[project-working-copy] deadkey overlay projection skipped: ${msg}`,
      );
    }
  }

  // Step 2: Assignments projection — inject mechanism pattern fragments.
  // Physical-only: touch assignments are handled by a separate gallery.
  // Skipped when there are no physical assignments.
  const physicalAssignments = assignments.filter(
    (a) => a.modality === "physical",
  );
  if (physicalAssignments.length > 0) {
    // Spec 106 US3: the recorded output form reaches the engine here, so every
    // string the assignments emit follows it (FR-020..FR-023). Stored
    // assignments stay form-independent; the engine picks the shape.
    const formOptions =
      marksGuards !== null
        ? {
            outputForm: marksGuards.outputForm,
            markAttachments: markAttachmentsFromWorklist(marksGuards.worklist),
          }
        : undefined;
    const kmnPathForForm = `source/${keyboardId}.kmn`;
    const violationsBefore =
      marksGuards !== null
        ? safeFormViolations(readVfsText(vfs, kmnPathForForm), keyboardId, marksGuards.outputForm)
        : undefined;
    const assignResult =
      formOptions === undefined
        ? applyAssignmentsToVfs(vfs, keyboardId, physicalAssignments, getPattern)
        : applyAssignmentsToVfs(vfs, keyboardId, physicalAssignments, getPattern, formOptions);
    warnings.push(...assignResult.warnings);
    // Plan P2.4 uniformity assertion: wrong-form text the assignments added
    // (runs already wrong before step 2 belong to the starting keyboard).
    if (marksGuards !== null && violationsBefore !== undefined) {
      const after = safeFormViolations(readVfsText(vfs, kmnPathForForm), keyboardId, marksGuards.outputForm);
      if (after !== undefined) {
        const warning = outputFormWarning(violationsBefore, after, marksGuards.outputForm);
        if (warning !== undefined) warnings.push(warning);
      }
    }

    // spec-014 T017 — add-gallery IR projection via the single mutate() seam.
    //
    // The reference emit above is text-based (applyAssignmentsToVfs writes the
    // injected .kmn directly). We ALSO derive the canonical assignment IR
    // through the mutate() write path — unconditionally since spec 089 T021
    // deleted the flag (OI-1 ruled global): parse the just-written .kmn back
    // to IR and route its physical-assignment arrays (groups[]/stores[])
    // through applyAddGalleryMutate (applyMutatePatch / ADD_GALLERY_WRITES).
    // This makes mutate() the single IR write route for the add surface
    // (M6/SC-001) and enforces declared-writes containment (M3) — the patch
    // can never reach header, comments, or the deferred keycap/touch targets.
    // The derived IR is intentionally NOT re-emitted: the text artifact is
    // the same one the pre-flag path produced. Keycap-label / touch-layout
    // projection is deferred to US2.
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

  // Step 2.5: Desktop -> touch layer propagation — surface any generalized
  // S-08 (modifier_as_layer_switch) combo layer already in the IR, or about
  // to be authored via a physical assignment just projected above, onto the
  // `.keyman-touch-layout` written by step 0 (or shipped by the base VFS).
  // A no-op when the VFS has no touch layout file, OR when there is no S-08
  // combo to surface at all — propagateDesktopLayersToTouch always
  // round-trips the JSON through JSON.parse/stringify even when nothing
  // changes, which would needlessly reformat (and break byte-identical
  // golden-artifact comparisons for) a keyboard that never touches this
  // pattern, so the cheap startIr/assignment check below gates the call.
  //
  // Re-parses the just-written .kmn (rather than reusing startIr/carveIr)
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
  const hasLayerSwitchInStartIr = collectLayerCombosInUse(startIr).length > 0;
  if (hasLayerSwitchAssignment || hasLayerSwitchInStartIr) {
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
          const freshIr = parseKmn(
            kmnEntryForPropagation.content,
            keyboardId,
          ).ir;
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

  // Step 2.6: Mark guards (spec 106 FR-010/FR-011). The marks decision's
  // guard group and backspace rules are generated here and nowhere else:
  // the working IR never reaches the artifact (see step 1.7b), so a guard
  // generated only there would be missing from the preview and the zip.
  // After step 2 so the guards see the assignment rules; before step 2.7,
  // whose replay repoints the entry group the guard hop is added to.
  // applyMarkGuards strips and rebuilds its own artifacts, so a starting
  // keyboard that already carries them is not doubled; the .kmn is only
  // re-emitted when the IR changed.
  if (marksGuards !== null) {
    const kmnPathForGuards = `source/${keyboardId}.kmn`;
    const kmnTextForGuards = readVfsText(vfs, kmnPathForGuards);
    if (kmnTextForGuards !== undefined) {
      try {
        const parsedForGuards = parseKmn(kmnTextForGuards, keyboardId).ir;
        const guarded = applyMarkGuards(
          parsedForGuards,
          marksGuards.worklist,
          marksGuards.outputForm,
          marksGuards.backspace ?? "peel",
          marksGuards.stacks ?? [],
        );
        if (guarded.ir !== parsedForGuards) vfs.set(kmnPathForGuards, emitKmn(guarded.ir), false);
        if (guarded.guardHopSkipped === true) {
          warnings.push(
            "[project-working-copy] mark guards not reached: the entry group's match rule already ends in another use()",
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`[project-working-copy] mark guard projection skipped: ${msg}`);
      }
    }
  }

  // Step 2.7: Context-tolerance projection (spec 078). Replays the author's
  // accepted fix: the generated rules were computed and verified once, by
  // hooks/useContextToleranceApply.ts, because generating them compiles and
  // simulates; here they are only inserted, synchronously, before the rule
  // each batch was verified against. After carve and assignments (so the
  // anchors reflect the keyboard as the author left it), before identity and
  // the id rename (so the path still resolves under the pre-rename id).
  // A batch whose anchor is gone is skipped with a warning, never misplaced.
  if (
    contextToleranceOverlay !== null &&
    contextToleranceOverlay.batches.length > 0
  ) {
    const kmnPathForTolerance = `source/${keyboardId}.kmn`;
    const kmnTextForTolerance = readVfsText(vfs, kmnPathForTolerance);
    if (kmnTextForTolerance !== undefined) {
      try {
        const parsedForTolerance = parseKmn(kmnTextForTolerance, keyboardId).ir;
        const replay = applyContextToleranceOverlay(
          parsedForTolerance,
          contextToleranceOverlay,
        );
        vfs.set(kmnPathForTolerance, emitKmn(replay.ir), false);
        warnings.push(
          ...replay.warnings.map((w) => `[project-working-copy] ${w}`),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `[project-working-copy] context-tolerance projection skipped: ${msg}`,
        );
      }
    }
  }

  // Step 3: Identity projection — write &NAME (display name) into the .kmn.
  //
  // The display name is treated as an EDIT, reflected only when it CHANGES.
  // `store(&NAME)` is rewritten in place ONLY when the effective display name
  // DIFFERS from the base keyboard's own name (`baseDisplayName`, falling back
  // to `startIr.header.name`). When they match — which includes the no-identity-
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
    const baseName = baseDisplayName ?? startIr.header.name;
    const identityArg: { name?: string; copyright?: string; version?: string } =
      {};
    if (
      identity.displayName !== undefined &&
      identity.displayName !== baseName
    ) {
      identityArg.name = identity.displayName;
    }
    if (identity.copyright !== undefined)
      identityArg.copyright = identity.copyright;
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
      const keycapResult = applyKeycapLabelsToVfs(
        vfs,
        keyboardId,
        physicalAssignments,
      );
      warnings.push(...keycapResult.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `[project-working-copy] keycap label projection skipped: ${msg}`,
      );
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
      input.welcomeFolderFiles ?? [],
      // Warnings name the file the author will actually receive: step 4 renames
      // it, so the pre-rename (base) id must not appear in them.
      targetKeyboardId ?? keyboardId,
      input.packageFonts,
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
  if (targetKeyboardId !== undefined && targetKeyboardId !== keyboardId) {
    effectiveKeyboardId = targetKeyboardId;
    const kmnPath = `source/${keyboardId}.kmn`;
    const kmnText = readVfsText(vfs, kmnPath);
    if (kmnText !== undefined) {
      try {
        const parsed = parseKmn(kmnText, keyboardId);
        // The release version is the overlay's (serializeWorkingCopy always sets
        // it to the shipped version, spec 102 FR-009) or resetIdentity's "1.0"
        // default; the start keyboard's own version is never carried over.
        const overlayVersion = identity?.version;
        resetIdentity(parsed.ir, {
          keyboardId: targetKeyboardId,
          displayName:
            identity?.displayName ?? parsed.ir.header.name ?? targetKeyboardId,
          ...(identity?.bcp47 !== undefined && identity.bcp47 !== ""
            ? { bcp47: [identity.bcp47] }
            : {}),
          ...(overlayVersion !== undefined ? { version: overlayVersion } : {}),
          ...(identity?.copyright !== undefined
            ? { copyright: identity.copyright }
            : {}),
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
