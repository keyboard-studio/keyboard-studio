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
  addableTouchLayerTokens,
  optionsForTouchLayerSlot,
  TOUCH_LAYER_PRECEDENCE_ORDER,
} from "./modifierCombos.js";
export type { ModifierToken } from "./modifierCombos.js";

export {
  touchKeyAddress,
  touchSubKeyAddress,
  touchFlickAddress,
  parseTouchKeyAddress,
} from "./touchKeyAddress.js";
export type { TouchKeyAddressParts } from "./touchKeyAddress.js";

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

export {
  resolveKeyAddress,
  resolveSubKeyEntry,
  applyFieldSemantics,
  declaredOperationOutput,
} from "./keyEditOps.js";
export type {
  KeyEditOperation,
  KeyEditOperationBase,
  SetKeyOp,
  RenameKeyOp,
  AddKeyOp,
  RemoveKeyOp,
  SuppressKeyOp,
  SetSubKeyOp,
  RemoveSubKeyOp,
  EditableKeySp,
  EditableKeyFields,
  NewKeySpec,
  SubKeyRef,
  AddressableKeyLike,
  AddressableLayoutLike,
  ResolvedKeyLocation,
  SubKeyLocation,
  KeyEditOverlay,
} from "./keyEditOps.js";

export { applyKeyEditsToRawJson } from "./applyKeyEditsToRawJson.js";
export type { ApplyKeyEditsToRawJsonResult } from "./applyKeyEditsToRawJson.js";

export { applyKeyEditsToLayout, replayKeyEditOverlay } from "./applyKeyEditsToLayout.js";
export type {
  ApplyKeyEditsToLayoutResult,
  ReplayKeyEditOverlayResult,
} from "./applyKeyEditsToLayout.js";

export { applyKeyEditsToVfs } from "./applyKeyEditsToVfs.js";
export type { ApplyKeyEditsToVfsResult } from "./applyKeyEditsToVfs.js";

export { decomposeLayerId, groupLayerFamilies } from "./layerFamilies.js";
export type {
  ParsedLayerId,
  FreeformLayerId,
  LayerIdDecomposition,
  LayerFamily,
  LayerFamilyGrouping,
} from "./layerFamilies.js";

export {
  TOUCH_SYNTH_NODE_ID_PREFIX,
  TOUCH_SYNTH_STORE_NAME_PREFIX,
  TOUCH_SYNTH_GUARD_STORE_NAME,
  isSingleCombiningMark,
  checkOpaqueGate,
  ensureTouchKeyRule,
  isGuardShapedStore,
  findReusableGuardStore,
  planGuardSynthesis,
  applyGuardSynthesis,
  planCaseTripleSynthesis,
  applyCaseTripleSynthesis,
  removeTouchKeyRule,
  planKeyDeletionRuleRemoval,
  applyKeyDeletionRuleRemoval,
  renameTouchKeyRule,
  renameTouchKey,
} from "./touchRuleSynthesis.js";
export type {
  OpaqueGateResult,
  TouchRuleSynthesisBlocked,
  EnsureTouchKeyRuleRequest,
  EnsureTouchKeyRuleResult,
  EnsureTouchKeyRuleOutcome,
  GuardRuleDescription,
  GuardSynthesisPlan,
  GuardSynthesisPlanResult,
  ApplyGuardSynthesisResult,
  CaseTripleRuleDescription,
  CaseTriplePlan,
  CaseTriplePlanResult,
  ApplyCaseTripleSynthesisResult,
  RemoveTouchKeyRuleResult,
  KeyDeletionRuleRemovalPlan,
  RenameTouchKeyRuleResult,
  RenameTouchKeyResult,
} from "./touchRuleSynthesis.js";

export {
  RESERVED_KEY_ID_PREFIXES,
  RESERVED_SENTINEL_KEY_IDS,
  RESERVED_PRIVATE_USE_KEY_IDS,
  checkKeyIdSyntax,
  checkReservedKeyId,
  validateCandidateKeyId,
  proposeKeyId,
} from "./keyIdMinting.js";
export type {
  KeyIdSyntaxRejectionReason,
  KeyIdSyntaxCheckResult,
  ReservedKeyIdRejectionReason,
  ExistingKeyIdInScope,
  KeyIdCandidateContext,
  KeyIdRejectionReason,
  ValidateKeyIdResult,
  KeyIdMintingPath,
  NoCaseTripleReason,
  CaseTripleRuleLines,
  KeyIdMintingAlternativeReason,
  KeyIdMintingAlternative,
  KeyIdMintingProposal,
  KeyIdMintingRequest,
} from "./keyIdMinting.js";

