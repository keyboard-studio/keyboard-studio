// pattern-apply barrel export.
// Provides slot substitution and assignment-map-to-.kmn injection.

export { substituteSlots } from "./substitute.js";
export type { SubstituteResult } from "./substitute.js";

export { applyAssignments, resolveRenderableMechanisms } from "./applyAssignments.js";
export type { ApplyAssignmentsResult } from "./applyAssignments.js";

export { applyAssignmentsToVfs } from "./applyAssignmentsToVfs.js";

export { applyCarveToVfs } from "./applyCarveToVfs.js";
export type { ApplyCarveToVfsOpts } from "./applyCarveToVfs.js";

export { carveFilterIr } from "./carveFilterIr.js";

export { applyStoreSlotRemovals, classifyStoreSlotEdit } from "./applyStoreSlotRemovals.js";
export type {
  StoreSlotRemovalResult,
  StoreSlotEditMode,
  StoreSlotBlockReason,
} from "./applyStoreSlotRemovals.js";

export { parseSlotId } from "./slotId.js";

export { applyKeycapLabelsToVfs } from "./applyKeycapLabelsToVfs.js";

export {
  applyCarveKeycapRemovalsToVfs,
  collectCarvedKeycapTexts,
} from "./applyCarveKeycapRemovalsToVfs.js";
export type { CarveKeycapRemovalInput } from "./applyCarveKeycapRemovalsToVfs.js";

export { applyTouchAssignments } from "./applyTouchAssignments.js";
export type { ApplyTouchAssignmentsResult } from "./applyTouchAssignments.js";

export { applyTouchAssignmentsToRawJson } from "./applyTouchAssignmentsToRawJson.js";
export type { ApplyTouchAssignmentsToRawJsonResult } from "./applyTouchAssignmentsToRawJson.js";

export { collectCharContributors } from "./collectCharContributors.js";
export type { CharContributors } from "./collectCharContributors.js";

export {
  isMnemonicLayout,
  keyHasCapsHandling,
  buildShiftRuleLines,
  planShiftAssignment,
} from "./shiftRules.js";
export type { ShiftAssignmentPlan } from "./shiftRules.js";

