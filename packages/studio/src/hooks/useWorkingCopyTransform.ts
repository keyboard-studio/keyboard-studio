// useWorkingCopyTransform — builds a memoized VfsTransform from the live
// working-copy store layers (carve deletions + mechanism assignments +
// identity overlay) for use with useKeyboardArtifact.
//
// This is the single shared factory for the OSK projection. Both the
// SurveyView OSK and the gallery OSK call this hook and pass the
// resulting VfsTransform into useKeyboardArtifact. The transform is memoized
// on the layer values (not object references) so a recompile fires only when
// a layer actually changes — no spurious compile cycles, no second timer
// (single 300 ms debounce contract upheld; spec §8 Decision D3).
//
// Projection order (§12 "re-projected layers"):
//   0. Touch layout — inject Phase E touchLayoutJson into .keyman-touch-layout so
//      the OSK preview reflects the touch layout the author built. Omitted when
//      touchLayoutJson is null (no Phase E edits yet).
//   1. Carve deletions — re-emit the filtered IR into the VFS .kmn, replacing
//      the fetched source. baseIr is never mutated; a filtered copy is used.
//   1.7/1.7b. Key edit overlay (spec 058) — applyKeyEditsToVfs splices the
//      committed KeyEditOperation[] overlay onto .keyman-touch-layout (layout
//      half), and a `rename` op's vkey-binding fix-up is re-emitted into the
//      .kmn (rule half) — see projectWorkingCopyVfs.ts's own step comments.
//      Sourced from the caller's `liveLayoutOverride.keyEditOps` (below) —
//      omitted entirely (empty array) when no override is supplied.
//   2. Assignments — applyAssignmentsToVfs on the carved .kmn. If no patternMap
//      is provided (SurveyView path), this step is skipped (no assignments
//      to apply until Phase C completes).
//   2.5 Layer propagation — propagateDesktopLayersToTouch surfaces any S-08
//      generalized modifier-combo layer onto the touch layout injected at
//      step 0 (no-op when the VFS has no touch layout file).
//   3. Identity — applyIdentityStubMutation writes &NAME (display name) into the
//      .kmn so the compiled keyboard's spacebar shows the new name.
//
// The actual projection logic lives in projectWorkingCopyVfs
// (packages/studio/src/lib/projectWorkingCopyVfs.ts), a pure (non-React)
// function. serializeWorkingCopy (the download/output path) also calls
// projectWorkingCopyVfs directly, so the OSK preview and the downloaded artifact
// are guaranteed equivalent for the same working-copy state.
//
// Memoization key:
//   - deletedNodeIds: serialized as a sorted join of the node ID strings.
//   - assignments: serialized as a compact key string (same as GalleryPreviewWithPatterns).
//   - identity.displayName: string or undefined.
//   - touchLayoutJson: the store's field, OR (when `liveLayoutOverride` is
//     supplied) the override's own in-progress value — see
//     UseWorkingCopyTransformOptions.liveLayoutOverride below. Either way it
//     is already a primitive (string | null), so it drops straight into the
//     dep array.
//   - keyEditOps (spec 058): NOT primitive on its own (an array), so it is
//     never put in the dep array directly — a JSON-serialized string key
//     derived from it is used instead (keyEditOpsKey), exactly mirroring how
//     deletedNodeIds/deletedItemIds (Sets) are reduced to `deletedKey` and
//     assignments (an array) to `assignmentsKey` below. Passing the raw
//     `keyEditOps` array as a dependency instead of a derived primitive key
//     is the bug this hook exists to prevent (T053/T055): every render of a
//     caller that doesn't memoize its own override object would produce a
//     new array reference, defeating memoization; and if the array were
//     *omitted* from the dep list entirely (relying on object identity),
//     the closure would keep the array from the FIRST render forever and a
//     later key-edit commit/undo would never refresh the preview.
//
// None of the above change on every render, so the VfsTransform reference
// is stable across renders when the working copy has not changed.

import { useMemo, useRef } from "react";
import type { Pattern, VirtualFS } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { KeyEditOperation } from "@keyboard-studio/engine";
import type { VfsTransform } from "./useKeyboardArtifact.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyVfs } from "../lib/projectWorkingCopyVfs.ts";
import { physicalAssignmentsOf } from "../lib/physicalAssignments.ts";

/** Stable empty default for `liveLayoutOverride.keyEditOps` when the option
 * (or the whole override) is omitted — avoids allocating a fresh empty array
 * reference every render (though only the derived `keyEditOpsKey` string
 * actually matters for memoization; see the module docstring above). */
const EMPTY_KEY_EDIT_OPS: readonly KeyEditOperation[] = [];

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface UseWorkingCopyTransformOptions {
  /**
   * Synchronous pattern resolver required by applyAssignmentsToVfs.
   * Pass null/undefined when assignments should not be projected (e.g. the
   * SurveyView path before Phase C completes). When assignments exist
   * in the store but no patternMap is supplied, a warning is added but the
   * transform still proceeds with carve + identity.
   */
  patternMap?: Map<string, Pattern> | null;
  /**
   * The id of the BaseKeyboard the returned transform is about to be plugged
   * into (i.e. the `baseKeyboard` argument passed to the SAME
   * `useKeyboardArtifact` call this transform feeds). Bug F4: preview-before-
   * commit (StudioShell's `localBase`, usePreviewArtifact's own picker state)
   * lets the author preview a DIFFERENT base than the one already committed
   * to `workingCopyStore` — e.g. commit base A, carve some of it, then preview
   * candidate base B before deciding whether to switch. `baseIr` /
   * `deletedNodeIds` / `deletedItemIds` below are keyed to A's IR node ids;
   * projecting them onto B's freshly-fetched VFS is not merely stale, it is
   * incoherent (B's IR has no relation to A's node ids), and left the
   * candidate base's compile pipeline unable to reach "ready" (kmcmplib
   * errors on the cross-base projected .kmn, and Retry hits the same
   * mismatch every time — the only escape was "Start over").
   *
   * When provided (non-undefined) and it does not match the store's own
   * `baseKeyboard.id`, the returned transform is `null` — the candidate
   * base compiles cleanly with NO carve/assignment/identity overlay, exactly
   * like previewing it for the very first time. The store's carve state for
   * the committed base is untouched (not cleared), so re-previewing that SAME
   * base again (before confirming the switch) restores the projected
   * preview. Omit this option (existing behavior) for callers that always
   * operate on the already-instantiated working copy's own base (the post-
   * commit galleries — MechanismGallery, TouchGallery) — there is no
   * "different candidate base" for them to diverge from.
   *
   * Tri-state contract — the three states are NOT interchangeable:
   *   - **omitted** (`undefined`): no gating at all. Correct only for post-
   *     commit call sites (MechanismGallery, TouchGallery) that always render
   *     the store's own already-instantiated base and have no candidate-base
   *     picker of their own. A dev-mode warning fires (once) if a call site
   *     omits this while a transform is actually being built, since a new
   *     call site with its own candidate-base state that omits it would
   *     silently reintroduce bug F4 — pass the store's own base id explicitly
   *     if omission really is correct, to document intent and silence the
   *     warning.
   *   - **`null`**: "no candidate base chosen yet" — gates the transform to
   *     `null` unconditionally (there is nothing to match). Callers with a
   *     candidate-base picker MUST initialize that picker state
   *     *synchronously* from the store (e.g. `useState(() =>
   *     store.baseKeyboard?.id ?? null)`, not a lazy post-mount effect) —
   *     `null` suppresses the overlay, so a lazily-initialized picker renders
   *     one frame of the (incorrect) ungated preview before its effect runs
   *     and flips the gate on, i.e. a visible ungated→gated preview flash.
   *   - **string**: gate on equality with the store's `baseKeyboard.id`;
   *     mismatch → `null`, match → the normal overlaid transform.
   */
  previewedBaseId?: string | null;

  /**
   * Live-layout override (spec 058) — the touch key editor's IN-PROGRESS
   * projection inputs, distinct from the store's own (post-Phase-E-commit)
   * `touchLayoutJson` field. Both pieces travel together in one option
   * because they both originate from the touch step's in-authoring state:
   *
   *   - `touchLayoutJson`: the caller's own in-progress derived touch layout
   *     (e.g. TouchGallery's `touchLayoutResult.json`), used INSTEAD OF the
   *     store's `touchLayoutJson` field for step 0 injection. Pass `null`
   *     when the R11 emission matrix decided not to emit yet — this is NOT
   *     the same as omitting the whole override (which falls back to the
   *     store's field instead).
   *   - `keyEditOps`: the committed `KeyEditOperation[]` overlay (spec 058
   *     FR-031…FR-034) to project at `projectWorkingCopyVfs`'s step
   *     1.7/1.7b. Read straight from `workingCopyStore.keyEditOverlay.ops`
   *     by the caller — this hook does not read the store's overlay field
   *     itself, so a caller that never authors key edits (every gallery
   *     except TouchGallery) never needs to think about it.
   *
   * Omit entirely for callers with no in-progress touch-editor state (every
   * caller except TouchGallery) — the hook then falls back to the store's
   * own `touchLayoutJson` field and an empty key-edit overlay, exactly
   * matching pre-058 behavior.
   *
   * **The subtle part (T053/T055):** this hook's own memoization key is
   * deliberately primitive-stable (see the module docstring) — an object or
   * array passed here that is not ALSO reduced to a primitive somewhere in
   * the `useMemo` dependency array will not refresh the preview on change.
   * `touchLayoutJson` is already a primitive (string | null) and goes
   * straight into the dep array; `keyEditOps` is an array and is instead
   * reduced to a JSON-serialized string key (`keyEditOpsKey`) for that
   * purpose — the array reference itself is still used inside the returned
   * transform closure, just not as the dependency that decides whether a
   * new closure is built.
   */
  liveLayoutOverride?: {
    touchLayoutJson: string | null;
    keyEditOps: readonly KeyEditOperation[];
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Builds a memoized {@link VfsTransform} from the live working-copy layers.
 * Re-memoizes only when a layer value actually changes.
 *
 * The transform closure delegates to {@link projectWorkingCopyVfs} — the same
 * pure helper used by {@link serializeWorkingCopy} — so the OSK preview and
 * the downloaded artifact are guaranteed equivalent for the same working-copy state.
 *
 * Returns `null` when the working copy is not yet instantiated (no baseIr
 * means carve cannot run) — callers should pass `null` directly to
 * `useKeyboardArtifact`'s `vfsTransform` parameter in that case.
 */
export function useWorkingCopyTransform(
  opts?: UseWorkingCopyTransformOptions,
): VfsTransform | null {
  const patternMap = opts?.patternMap ?? null;
  // undefined (the default) means "no gating" — see the option's doc comment.
  const previewedBaseId = opts?.previewedBaseId;
  // undefined (the default) means "no live-layout override" — falls back to
  // the store's own touchLayoutJson field and an empty key-edit overlay. See
  // the option's doc comment (UseWorkingCopyTransformOptions.liveLayoutOverride).
  const liveLayoutOverride = opts?.liveLayoutOverride;

  // P1 fix (bug F4 footgun): omitting previewedBaseId is legitimate for
  // post-commit call sites (MechanismGallery, TouchGallery) but is a silent
  // way for a FUTURE call site with its own candidate-base picker to
  // reintroduce F4. Warn once per hook instance (mount), dev-only, only when
  // a transform is actually being built (not while baseIr is still null) —
  // see the gate check below where this ref is consulted.
  const omittedWarnedRef = useRef(false);

  // Layer values — read individually so the memo only fires when they change.
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  // The base id the store's carve/identity layers actually belong to. Compared
  // against previewedBaseId below (F4 fix) so a candidate-base preview never
  // receives another base's carve overlay.
  const storeBaseKeyboardId = useWorkingCopyStore((s) => s.baseKeyboard?.id ?? null);
  // The base keyboard's own display name — the anchor for projectWorkingCopyVfs
  // step 3's "is the display name an EDIT?" test, so the OSK preview and the zip
  // agree about when `store(&NAME)` is rewritten.
  const storeBaseDisplayName = useWorkingCopyStore((s) => s.baseKeyboard?.displayName ?? null);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const deletedTouchKeyIds = useWorkingCopyStore((s) => s.deletedTouchKeyIds);
  const identity = useWorkingCopyStore((s) => s.identity);
  // Assignments: physical only (touch is projected via touchLayoutJson below).
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  // Phase E touch layout — a primitive string | null; injected into the VFS by
  // projectWorkingCopyVfs (step 0) so the OSK preview reflects Phase E edits.
  // Read unconditionally (a cheap store subscription) even though
  // `liveLayoutOverride` may supersede it below — Rules of Hooks forbid a
  // conditional useWorkingCopyStore call, and this is the existing pre-058
  // behavior for every caller that omits the override.
  const storeTouchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);

  // Effective touch layout JSON: the live-layout override's own in-progress
  // value takes precedence over the store's field WHEN the override is
  // supplied at all (an override with touchLayoutJson: null still wins —
  // that is "the R11 matrix hasn't decided to emit yet", not "no override").
  // Omitting the whole `liveLayoutOverride` option (undefined) is what falls
  // back to the store's field — see the option's doc comment.
  const touchLayoutJson =
    liveLayoutOverride !== undefined
      ? liveLayoutOverride.touchLayoutJson
      : storeTouchLayoutJson;

  // Key edit overlay ops (spec 058) — sourced ONLY from the live-layout
  // override (this hook does not read workingCopyStore.keyEditOverlay
  // itself; see the option's doc comment). Empty array when no override is
  // supplied, matching projectWorkingCopyVfs's own "omit or pass an empty
  // array" contract for keyEditOps.
  const keyEditOps = liveLayoutOverride?.keyEditOps ?? EMPTY_KEY_EDIT_OPS;

  // Derive the current physical assignments from phaseResults.
  const sessionAssignments = useMemo(
    () => physicalAssignmentsOf(phaseResults),
    [phaseResults],
  );

  // Memoization keys — primitive-stable so useMemo doesn't fire on reference churn.

  // Deleted node IDs: sorted, joined string. O(n) but the carve set is small.
  const deletedKey = useMemo(
    () =>
      [...deletedNodeIds].sort().join("|") +
      ";" +
      [...deletedItemIds].sort().join("|") +
      ";" +
      [...deletedTouchKeyIds].sort().join("|"),
    [deletedNodeIds, deletedItemIds, deletedTouchKeyIds],
  );

  // Assignments key — compact string (scope:target:patternId/slotValues per assignment).
  const assignmentsKey = useMemo(
    () =>
      sessionAssignments
        .map(
          (a) =>
            `${a.scope}:${a.target}:${a.mechanisms
              .map((m) => `${m.patternId}/${JSON.stringify(m.slotValues ?? {})}`)
              .join(",")}`,
        )
        .join("|"),
    [sessionAssignments],
  );

  // Key edit overlay key (spec 058, T053) — a JSON-serialized string derived
  // from `keyEditOps`, the ONLY thing that goes into the outer transform's
  // dependency array below (never the raw array — see the module docstring's
  // "keyEditOps" bullet and the option's own doc comment for why). Committed
  // ops are append-only/pop-on-undo and never mutated in place once
  // committed, so a full JSON.stringify is a correct (if slightly more
  // conservative than strictly necessary) equality check, and the overlay is
  // always small.
  const keyEditOpsKey = useMemo(() => JSON.stringify(keyEditOps), [keyEditOps]);

  // Identity display name + Track-1 rename id + bcp47.
  // identityKeyboardId triggers projectWorkingCopyVfs step 4 (rewrites
  // `.kmw-keyboard-<baseId>` selectors and renames siblings) when it differs
  // from the keyboardId the transform is invoked with.
  // identityBcp47 is forwarded so resetIdentity inside step 4 stamps the
  // chosen language tag onto the .kmn instead of falling back to the base's.
  const identityDisplayName = identity?.displayName ?? null;
  const identityKeyboardId = identity?.keyboardId ?? null;
  const identityBcp47 = identity?.bcp47 ?? null;
  // spec 057: the descriptor's <Language> display text. Forwarded so the OSK
  // preview sees the same package descriptor the zip does (FR-004/SC-005).
  const identityLanguageName = identity?.languageName ?? null;

  return useMemo<VfsTransform | null>(() => {
    // No baseIr → carve step cannot run. The transform is not usable yet.
    if (baseIr === null) return null;

    // P1 fix (bug F4 footgun): a transform is genuinely about to be built —
    // warn (once per mount, dev-only) if the caller omitted previewedBaseId
    // rather than explicitly opting into "no gating". This is advisory, not
    // enforced: MechanismGallery/TouchGallery's omission is correct and will
    // warn once too, which is an acceptable, non-spammy cost for catching a
    // future candidate-base-picker call site that forgets the option.
    if (previewedBaseId === undefined && !omittedWarnedRef.current) {
      omittedWarnedRef.current = true;
      devLog.warn(
        "[useWorkingCopyTransform] previewedBaseId was omitted. If this call site can preview a candidate base " +
          "other than the store's committed baseKeyboard (bug F4), pass previewedBaseId explicitly. If this call " +
          "site only ever renders the store's own already-instantiated base (e.g. a post-commit gallery), pass " +
          "the store's own base id to document that intent and silence this warning.",
      );
    }

    // F4 fix: the store's carve/identity layers belong to storeBaseKeyboardId.
    // When the caller tells us which base its OWN pipeline is about to compile
    // (previewedBaseId) and that differs from the base the layers belong to,
    // the overlay does not apply — return null rather than project one base's
    // node ids onto a different base's freshly-fetched VFS.
    if (previewedBaseId !== undefined && previewedBaseId !== storeBaseKeyboardId) {
      return null;
    }

    return (vfs: VirtualFS, keyboardId: string): { warnings: string[]; effectiveKeyboardId?: string } => {
      // Assignment-warning: when assignments exist but no patternMap was supplied,
      // emit a diagnostic and skip assignments (pass empty array to projectWorkingCopyVfs).
      const preWarnings: string[] = [];
      let effectiveAssignments = sessionAssignments;
      if (patternMap === null) {
        if (sessionAssignments.length > 0) {
          preWarnings.push(
            "[working-copy-transform] assignments exist but no patternMap supplied — assignment projection skipped",
          );
        }
        effectiveAssignments = [];
      }

      // Delegate to the pure projection helper. The VfsTransform contract is
      // in-place mutation of `vfs`; projectWorkingCopyVfs also mutates in-place.
      const hasDisplayName = identityDisplayName !== null;
      const hasBcp47 = identityBcp47 !== null && identityBcp47 !== "";
      const hasLanguageName = identityLanguageName !== null && identityLanguageName !== "";
      const identityArg =
        hasDisplayName || hasBcp47 || hasLanguageName
          ? ({
              ...(hasDisplayName ? { displayName: identityDisplayName } : {}),
              ...(hasBcp47 ? { bcp47: identityBcp47 } : {}),
              ...(hasLanguageName ? { languageName: identityLanguageName } : {}),
            } as import("../lib/projectWorkingCopyVfs").IdentityOverlay)
          : null;

      const targetKeyboardId =
        identityKeyboardId !== null && identityKeyboardId !== keyboardId
          ? identityKeyboardId
          : undefined;

      const { warnings: projectionWarnings, effectiveKeyboardId } = projectWorkingCopyVfs({
        vfs,
        keyboardId,
        ...(targetKeyboardId ? { targetKeyboardId } : {}),
        baseIr,
        deletedNodeIds,
        deletedItemIds,
        deletedTouchKeyIds,
        keyEditOps,
        assignments: effectiveAssignments,
        getPattern: (id) => patternMap?.get(id),
        identity: identityArg,
        ...(touchLayoutJson !== null ? { touchLayoutJson } : {}),
        ...(storeBaseDisplayName !== null ? { baseDisplayName: storeBaseDisplayName } : {}),
      });

      return {
        warnings: [...preWarnings, ...projectionWarnings],
        ...(effectiveKeyboardId ? { effectiveKeyboardId } : {}),
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseIr,
    previewedBaseId,
    storeBaseKeyboardId,
    storeBaseDisplayName,
    deletedKey,
    assignmentsKey,
    identityDisplayName,
    identityKeyboardId,
    identityBcp47,
    identityLanguageName,
    patternMap,
    touchLayoutJson,
    keyEditOpsKey,
  ]);
}
