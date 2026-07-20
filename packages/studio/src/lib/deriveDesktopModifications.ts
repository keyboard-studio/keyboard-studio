// deriveDesktopModifications — pure studio helper (spec 035 T010).
//
// Derives the DesktopModifications overlay (character removals + individual
// letter placements) that the touch-layout replay (applyDesktopModifications,
// R3) needs to carry the locked desktop work onto a touch seed.
//
// See specs/035-mobile-touch-derivation/data-model.md Entity 2 and
// research.md R3 for the governing contract:
//   - removals  = buildProducedSet(baseIr) minus buildProducedSet(projectedIr),
//     a produced-*character* diff (not a rule-presence diff) because carve
//     nul-fills carved slots — the rule survives, outputting `nul`; only the
//     character disappears from the produced set. buildProducedSet's
//     run-merge NFC behavior means a carved base+combining (NFD-emitting)
//     sequence surfaces as its precomposed codepoint here (pinned by test 3).
//   - placements = Phase C physical + individual assignments, with a hostKey
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
// pass baseIr, the carve overlay, and phaseResults explicitly.

import type { KeyboardIR, MechanismRef, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { applyCarveMutate } from "../steps/editorMutate.js";
import { extractMechanismHostKey } from "./extractMechanismHostKey.js";

// ---------------------------------------------------------------------------
// hostKey extraction — shared with TouchGallery's per-character suggestion
// logic via extractMechanismHostKey (packages/studio/src/lib/extractMechanismHostKey.ts).
// ---------------------------------------------------------------------------

/**
 * Extract the physical host key a Phase C mechanism targets. An unrecognized
 * pattern, or a recognized pattern whose slot value fails its own extraction
 * regex (empty hostKey), both return `undefined` here so the caller omits the
 * placement rather than emitting one with an empty hostKey.
 */
function extractHostKey(m: MechanismRef): string | undefined {
  const result = extractMechanismHostKey(m);
  return result !== undefined && result.hostKey.length > 0 ? result.hostKey : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the {@link DesktopModifications} overlay from the working copy's
 * carve overlay and Phase C assignments.
 *
 * @param baseIr          The pristine instantiation-time base IR (never mutated).
 * @param deletedNodeIds  Whole-node carve deletions (group/rule/store/raw nodeIds).
 * @param deletedItemIds  Glyph-level carve item ids (store slots + bare node ids).
 * @param phaseResults    The working copy's survey phase results (Phase C holds
 *                        the physical desktop assignments).
 */
export function deriveDesktopModifications(
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  deletedItemIds: ReadonlySet<string>,
  phaseResults: readonly SurveyPhaseResult[],
): DesktopModifications {
  // --- removals: produced-set diff over the carve-projected IR -------------
  const projectedIr = applyCarveMutate(baseIr, deletedNodeIds, deletedItemIds);
  const baseProduced = buildProducedSet(baseIr);
  const projectedProduced = buildProducedSet(projectedIr);
  const removals = [...baseProduced]
    .filter((ch) => !projectedProduced.has(ch))
    .sort();

  // --- placements: Phase C physical + individual assignments ----------------
  const desktopAssignments = (
    phaseResults.find((p) => p.phase === "C")?.assignments ?? []
  ).filter((a) => a.modality === "physical" && a.scope === "individual");

  const placements: { char: string; hostKey: string }[] = [];
  for (const a of desktopAssignments) {
    const mechanism = a.mechanisms[0];
    if (mechanism === undefined) continue;
    const hostKey = extractHostKey(mechanism);
    if (hostKey !== undefined) {
      placements.push({ char: a.target, hostKey });
    }
  }

  return { removals, placements };
}
