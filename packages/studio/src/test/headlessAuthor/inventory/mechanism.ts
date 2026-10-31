// Inventory entries for the mechanism step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).
//
// Lifted handler logic (spec 107 FR-040) is listed under the component or
// hook that now calls it. A composite no production file names (a hook that
// memoizes its pieces separately, or a function the hook in the same file
// calls) is admitted with `provenBy`.

import type { InventoryEntry } from "./types.ts";

const GALLERY = "editors/assignLoop/MechanismGallery.tsx";
const PLACEMENT = "editors/assignLoop/mechanismPlacement.ts";
const COMPLETION = "lib/mechanismStepCompletion.ts";
const DISPLACEMENT_HOOK = "editors/assignLoop/useDisplacementProposal.ts";
const CASE_PAIR = "editors/assignLoop/casePairCompanion.ts";

export const mechanismInventory: readonly InventoryEntry[] = [
  // --- Step completion: what Continue / Done run ---
  { fn: "completeDeadkeysStep", module: COMPLETION, callers: ["editors/adapters/deadkeyAdapter.tsx"] },
  { fn: "completeRulesStep", module: COMPLETION, callers: ["survey/rules/RulesStep.tsx"] },
  { fn: "completePhysicalLayoutStep", module: COMPLETION, callers: ["editors/adapters/addPhysicalAdapter.tsx"] },

  // --- What the gallery reads ---
  { fn: "loadPlacementMap", module: "lib/placementMapLoader.ts", callers: ["hooks/usePlacementPriors.ts"] },
  {
    // The Phase F gate's diff, composed from the pieces useInventoryDiff memoizes.
    fn: "deriveInventoryDiff",
    module: "lib/inventoryDiff.ts",
    callers: [],
    provenBy: "lib/inventoryDiff.test.ts",
  },
  { fn: "derivePlacementInventory", module: "lib/placementInventory.ts", callers: ["hooks/usePlacementInventory.ts"] },
  { fn: "loanwordSetOf", module: "lib/placementInventory.ts", callers: ["hooks/useLoanwordSet.ts"] },
  { fn: "selectDesktopAssignments", module: "lib/unimplementedInventory.ts", callers: [GALLERY] },
  { fn: "buildSlotOccupancy", module: "survey/slotOccupancy.ts", callers: [GALLERY] },
  { fn: "displacementActions", module: "survey/slotOccupancy.ts", callers: [GALLERY] },
  { fn: "preselectMethod", module: "editors/assignLoop/suggestionOrder.ts", callers: [GALLERY] },

  // --- Lifted from MechanismGallery (mechanismPlacement.ts) ---
  { fn: "baseOnlyProducedSetFor", module: PLACEMENT, callers: [GALLERY] },
  { fn: "buildDeadkeyBaseLetterResolveOptions", module: PLACEMENT, callers: [GALLERY] },
  { fn: "buildNeedSets", module: PLACEMENT, callers: [GALLERY] },
  { fn: "canGoNextFor", module: PLACEMENT, callers: [GALLERY] },
  { fn: "companionConfirmAssignments", module: PLACEMENT, callers: [GALLERY] },
  { fn: "dismissedSuggestionEntryKey", module: PLACEMENT, callers: [GALLERY] },
  { fn: "displacementOutcomeFor", module: PLACEMENT, callers: [GALLERY] },
  { fn: "excludeSequenceMechanisms", module: PLACEMENT, callers: [GALLERY] },
  { fn: "placementOffer", module: PLACEMENT, callers: [GALLERY] },
  { fn: "placementSequence", module: PLACEMENT, callers: [GALLERY] },
  { fn: "placementWalkList", module: PLACEMENT, callers: [GALLERY] },
  { fn: "planDeadkeyApply", module: PLACEMENT, callers: [GALLERY] },
  { fn: "planSuggestionAccept", module: PLACEMENT, callers: [GALLERY] },
  { fn: "planSwapApply", module: PLACEMENT, callers: [GALLERY] },
  { fn: "sequenceCompanionInput", module: PLACEMENT, callers: [GALLERY] },

  // --- Lifted from the sequence builder and the two proposal hooks ---
  {
    fn: "sequenceApplyFor",
    module: "editors/assignLoop/sequenceApply.ts",
    callers: ["editors/assignLoop/SequenceBuilderPanel.tsx"],
  },
  {
    // The hook's `propose` body; the hook is the only caller.
    fn: "acceptCasePairCompanion",
    module: CASE_PAIR,
    callers: [],
    provenBy: "editors/assignLoop/casePairCompanion.test.ts",
  },
  {
    fn: "acceptDisplacementProposal",
    module: DISPLACEMENT_HOOK,
    callers: [],
    provenBy: "editors/assignLoop/useDisplacementProposal.test.ts",
  },
  {
    fn: "declineDisplacementProposal",
    module: DISPLACEMENT_HOOK,
    callers: [],
    provenBy: "editors/assignLoop/useDisplacementProposal.test.ts",
  },
];
