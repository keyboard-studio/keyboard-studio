// deriveDesktopModifications — pure studio helper (spec 035 T010).
//
// Derives the DesktopModifications overlay (character removals + individual
// letter placements) that the touch-layout replay (applyDesktopModifications,
// R3) needs to carry the locked desktop work onto a touch seed.
//
// See specs/035-mobile-touch-derivation/data-model.md Entity 2 and
// research.md R3 for the governing contract:
//   - removals  = buildProducedSet(startIr) minus buildProducedSet(projectedIr),
//     a produced-*character* diff (not a rule-presence diff) because carve
//     nul-fills carved slots — the rule survives, outputting `nul`; only the
//     character disappears from the produced set. buildProducedSet's
//     run-merge NFC behavior means a carved base+combining (NFD-emitting)
//     sequence surfaces as its precomposed codepoint here (pinned by test 3).
//   - placements = Phase C physical + individual assignments, with a baseKey
//     extracted the same way TouchGallery's per-character suggestion useMemo
//     does (packages/studio/src/editors/assignLoop/TouchGallery.tsx).
//
// Projection reuse: `applyCarveMutate` (packages/studio/src/steps/editorMutate.ts)
// is the existing pure carve-overlay projector — it composes
// applyStoreSlotRemovals (store-slot nul-fill) + carveFilterIr (whole-node
// deletion) from `@keyboard-studio/engine` and returns a fresh KeyboardIR
// without touching the VFS/assignments/identity layers. This function reuses
// it rather than re-deriving carve semantics.
//
// Pure: no store reads, no React imports. Callers (the touch build pipeline)
// pass startIr, the carve overlay, and phaseResults explicitly.

import type { KeyboardIR, MechanismRef, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { applyCarveMutate } from "../steps/editorMutate.js";
import { extractMechanismBaseKey } from "./extractMechanismBaseKey.js";

/** Shared empty carved-character set for the `carveChars` default parameter. */
const EMPTY_DERIVE_CARVE_CHARS: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------
// baseKey extraction — shared with TouchGallery's per-character suggestion
// logic via extractMechanismBaseKey (packages/studio/src/lib/extractMechanismBaseKey.ts).
// ---------------------------------------------------------------------------

/**
 * Extract the physical host key a Phase C mechanism targets. An unrecognized
 * pattern, or a recognized pattern whose slot value fails its own extraction
 * regex (empty baseKey), both return `undefined` here so the caller omits the
 * placement rather than emitting one with an empty baseKey.
 */
function extractBaseKey(m: MechanismRef): string | undefined {
  const result = extractMechanismBaseKey(m);
  return result !== undefined && result.baseKey.length > 0 ? result.baseKey : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the {@link DesktopModifications} overlay from the working copy's
 * carve overlay and Phase C assignments.
 *
 * @param startIr          The pristine instantiation-time base IR (never mutated).
 * @param deletedNodeIds  Whole-node carve deletions (group/rule/store/raw nodeIds).
 * @param deletedItemIds  Glyph-level carve item ids (store slots + bare node ids).
 * @param phaseResults    The working copy's survey phase results (Phase C holds
 *                        the physical desktop assignments).
 * @param carveChars      Issue #1809, ruling §1: the aggregated carved character
 *                        set; the single aggregated-R pass is unioned over the
 *                        incremental `deletedItemIds` union so this view consumes
 *                        the same pruned result as the .kmn projection (§11).
 */
export function deriveDesktopModifications(
  startIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  deletedItemIds: ReadonlySet<string>,
  phaseResults: readonly SurveyPhaseResult[],
  carveChars: ReadonlySet<string> = EMPTY_DERIVE_CARVE_CHARS,
): DesktopModifications {
  // --- removals: produced-set diff over the carve-projected IR -------------
  const projectedIr = applyCarveMutate(startIr, deletedNodeIds, deletedItemIds, carveChars);
  const baseProduced = buildProducedSet(startIr);
  const projectedProduced = buildProducedSet(projectedIr);
  const removals = [...baseProduced]
    .filter((ch) => !projectedProduced.has(ch))
    .sort();

  // --- placements: Phase C physical + individual assignments ----------------
  const desktopAssignments = (
    phaseResults.find((p) => p.phase === "C")?.assignments ?? []
  ).filter((a) => a.modality === "physical" && a.scope === "individual");

  const placements: { char: string; baseKey: string }[] = [];
  for (const a of desktopAssignments) {
    const mechanism = a.mechanisms[0];
    if (mechanism === undefined) continue;
    const baseKey = extractBaseKey(mechanism);
    if (baseKey !== undefined) {
      placements.push({ char: a.target, baseKey });
    }
  }

  return { removals, placements };
}
