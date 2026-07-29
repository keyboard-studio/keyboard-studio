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

export {
  applyStoreSlotRemovals,
  classifyStoreSlotEdit,
  describeStorePairing,
  analyzeStores,
  storeRoleOf,
} from "./applyStoreSlotRemovals.js";
export type {
  StoreSlotRemovalResult,
  StoreSlotEditMode,
  StoreSlotBlockReason,
  StorePairingDescription,
  StoreAnalysis,
  StoreRole,
} from "./applyStoreSlotRemovals.js";

export { buildProducerIndex } from "./producerIndex.js";
export type { ProducerIndex } from "./producerIndex.js";

export { parseSlotId, makeSlotId } from "./slotId.js";

export { isPlusSeparator } from "../shared/rule-shape.js";

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

export { applyDesktopModifications } from "./applyDesktopModifications.js";
export type {
  DesktopModifications,
  ApplyDesktopModificationsResult,
} from "./applyDesktopModifications.js";

export { applyDesktopModificationsToRawJson } from "./applyDesktopModificationsToRawJson.js";
export type { ApplyDesktopModificationsToRawJsonResult } from "./applyDesktopModificationsToRawJson.js";

export { propagateDesktopLayersToTouch } from "./propagateDesktopLayersToTouch.js";
export type { PropagateDesktopLayersToTouchResult } from "./propagateDesktopLayersToTouch.js";

export { collectCharContributors } from "./collectCharContributors.js";
export type { CharContributors, ContributorDescriptor } from "./collectCharContributors.js";

export { collectCompositionMethod } from "./collectCompositionMethod.js";

export {
  isMnemonicLayout,
  keyHasCapsHandling,
  buildShiftRuleLines,
  buildBaseRuleLines,
  buildCasePairRuleLines,
  planShiftAssignment,
} from "./shiftRules.js";
export type { ShiftAssignmentPlan } from "./shiftRules.js";

export {
  MODIFIER_EXCLUSIONS,
  canonicalizeCombo,
  comboToKeySpec,
  parseKeySpec,
  comboToTouchLayerId,
  comboToKvksShiftToken,
  collectModifierTokensInUse,
  collectLayerCombosInUse,
  buildComboKeyMap,
} from "./modifierCombos.js";
export type { ModifierToken } from "./modifierCombos.js";

export { touchKeyAddress, touchSubKeyAddress, touchFlickAddress } from "./touchKeyAddress.js";

export { enumerateTouchMethodsForChar } from "./enumerateTouchMethodsForChar.js";
export type { TouchMethodDescriptor } from "./enumerateTouchMethodsForChar.js";

export {
  applyTouchKeycapRemovalsToLayout,
  applyTouchKeycapRemovalsToRawJson,
  applyTouchKeycapRemovalsToVfs,
} from "./applyTouchKeycapRemovalsToVfs.js";
export type {
  ApplyTouchKeycapRemovalsResult,
  ApplyTouchKeycapRemovalsToRawJsonResult,
} from "./applyTouchKeycapRemovalsToVfs.js";

