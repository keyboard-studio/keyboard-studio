// addTouchAdapter — wraps TouchGallery as an EditorStep (P4a, T012).
//
// TouchGallery's onComplete receives TouchAssignment[] — the adapter wraps
// them in a TouchCompleteResult-shaped payload (assignments + baseIr +
// baseVfs + mods + seedSource) so the manifest reducer's TOUCH_STEP_ID case
// can call buildTouchLayoutJson with the full spec 035 replay + R11 emission
// inputs.
//
// mods (spec 035 R3 — carve removals + Phase C letter placements) is computed
// HERE via deriveDesktopModifications rather than inside reducer.ts: steps/
// may not import lib/ or stores/ (steps-layer boundary), but editors/ may
// import both. seedSource is read raw from surveySessionStore (possibly
// null — the reducer's injected buildTouchLayoutJson dep applies the R11
// Entity-5 default, see lib/touchEmission.ts resolveTouchSeedSource).

import { useMemo } from "react";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { TouchGallery } from "../assignLoop/TouchGallery.tsx";
import type { TouchAssignment } from "@keyboard-studio/contracts";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { deriveDesktopModifications } from "../../lib/deriveDesktopModifications.ts";
import { usePlacementPriors } from "../../hooks/usePlacementPriors.ts";

const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };

/**
 * EditorStep adapter for the Touch Gallery (Phase E — touch key assignment
 * loop). Satisfies React.ComponentType<EditorStepProps>.
 *
 * Wraps TouchGallery's raw TouchAssignment[] in a TouchCompleteResult so the
 * manifest reducer's TOUCH_STEP_ID case receives assignments + baseIr +
 * baseVfs + mods + seedSource and can apply the spec 035 replay + R11
 * emission matrix correctly.
 */
export function AddTouchAdapter({ onComplete, onBack }: EditorStepProps) {
  // Self-source baseIr and baseVfs from the working-copy store (FR-007).
  // These are the post-lockDesktop snapshots needed by buildTouchLayoutJson.
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  // Raw fork choice (spec 035 FR-006) — may legitimately be null (defensive
  // edge case); the reducer's injected buildTouchLayoutJson dep resolves the
  // Entity-5 default, not this adapter.
  const seedSource = useSurveySessionStore((s) => s.touchSeedSource);
  // Self-sources the same corpus placement map addPhysicalAdapter passes to
  // MechanismGallery (spec §7.6) — TouchGallery only reads its `touch` field
  // (placement-priors v2's corpus-mined longpress hosts) as a tie-breaker
  // fallback below the NFD-decomposition path. Null while loading/unavailable
  // ⇒ TouchGallery's existing NFD-only suggestion behavior, unchanged.
  const placementMap = usePlacementPriors();

  // Stable primitive key so the mods memo only recomputes when the carve
  // overlay or Phase C assignments actually change — the sets/array are
  // replaced immutably on every mutation, so a size/length-based key is a
  // cheap, correct proxy (mirrors TouchGallery's touchKey precedent).
  const modsDepsKey = `${deletedNodeIds.size}:${deletedItemIds.size}:${phaseResults.length}`;

  const mods = useMemo<DesktopModifications>(() => {
    if (baseIr === null) return EMPTY_MODS;
    return deriveDesktopModifications(baseIr, deletedNodeIds, deletedItemIds, phaseResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, modsDepsKey]);

  function handleComplete(assignments: TouchAssignment[]) {
    onComplete({ assignments, baseIr, baseVfs, mods, seedSource });
  }

  // TouchGallery requires onBack (its own prop is non-optional — it never
  // gates its Back button's render on onBack's presence, unlike
  // MechanismGallery). StepHost only ever omits `onBack` from EditorStepProps
  // when there is genuinely nothing to back into (F7 defect 2,
  // expectedBackTarget in stores/surveySessionStore.ts) — and for the "touch"
  // step specifically that function always returns a target (the
  // touch_seed_source chooser never no-ops), so `onBack` is provably always
  // defined here in normal operation. The `?? (() => undefined)` fallback is
  // therefore pure type-level defense against a genuinely misconfigured
  // manifest (a step wired to AddTouchAdapter without id "touch"), not a
  // reachable silent-no-op path — kept rather than removed only because
  // TypeScript can't otherwise satisfy TouchGallery's required prop from
  // EditorStepProps's optional one.
  return (
    <TouchGallery
      onComplete={handleComplete}
      onBack={onBack ?? (() => undefined)}
      {...(placementMap ? { placementMap } : {})}
    />
  );
}
