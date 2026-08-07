// pattern-apply barrel export.
// Provides slot substitution and assignment-map-to-.kmn injection.

export { substituteSlots } from "./substitute.js";
export type { SubstituteResult } from "./substitute.js";

export { applyAssignments, resolveRenderableMechanisms } from "./applyAssignments.js";
export type { ApplyAssignmentsResult } from "./applyAssignments.js";

export { buildSessionProducedSet } from "./sessionProducedSet.js";

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

// Row geometry + the one keys-per-row threshold table (spec 061 T019). A shim
// over contracts — see rowMetrics.ts for why the definitions cannot live in
// engine.
export {
  DEFAULT_KEY_WIDTH_PCT,
  DEFAULT_KEY_PAD_PCT,
  PLATFORM_MAX_KEYS_PER_ROW,
  platformMaxKeysPerRow,
  countInteractiveRowKeys,
  computeRowMetrics,
} from "./rowMetrics.js";
export type { RowMetricKey, RowMetrics } from "./rowMetrics.js";

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
  proposeSuppressFields,
  applySuppressSemantics,
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
  SuppressShapeChoice,
  SuppressRejectionReason,
  SuppressSemanticsResult,
} from "./keyEditOps.js";

// spec 058 T118 — edit-time REJECTION (FR-045), the counterpart to the
// reporting path in touchKeyDiagnostics.
export { checkKeyEditRejections } from "./keyEditOps.js";
export type {
  KeyEditRejection,
  KeyEditRejectionReason,
  KeyEditRejectionVerdict,
  UnsequencedKeyEditOperation,
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

export {
  enumerateKeyLinkedOutputs,
  analyzeKeyEditCollateral,
} from "./touchKeyCollateral.js";
export type {
  LinkedOutputMechanismKind,
  LinkedOutput,
  LinkedOutputReachability,
  ClassifiedLinkedOutput,
  KeyEditCollateralReport,
} from "./touchKeyCollateral.js";

export {
  decomposeLayerId,
  groupLayerFamilies,
  findFamilyParallelismBreaks,
  keyEditAffectsFamilyParallelism,
  classifyPlane,
  severityForPlane,
} from "./layerFamilies.js";
export type {
  ParsedLayerId,
  FreeformLayerId,
  LayerIdDecomposition,
  LayerFamily,
  LayerFamilyGrouping,
  FamilyParallelismSeverity,
  FamilyParallelismBreakKind,
  FamilyParallelismFinding,
  ReviewFamilyMemberFix,
  PlaneClass,
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

// Spec 061 US5 — the inherit-first wrapper and the keycap judgement.
export { proposeTouchKeyId } from "./proposeTouchKeyId.js";
export type {
  TouchKeyIdProposalRequest,
  TouchKeyIdProposal,
  TouchKeyIdProposalReason,
  NoProposalReason,
} from "./proposeTouchKeyId.js";
export { proposeKeycap, isKeycapRelated, isCombiningMark } from "./keycapRelatedness.js";
export type {
  KeycapProposal,
  KeycapForm,
  KeycapConsequence,
  KeycapRelatednessOptions,
} from "./keycapRelatedness.js";

// The finding/fix shape and every layout/rule detector live in contracts as of
// spec 058 T113/T114 (FR-040's one-implementation rule — Layer C cannot import
// engine); `touchKeyDiagnostics.ts` re-exports them, so this barrel and its
// consumers are unchanged. See that module's doc for the move's rationale.
export {
  computeAllTouchKeyDiagnostics,
  computeTouchKeyDiagnostics,
  groupTouchKeyFindingsByAddress,
  touchKeyFindingScope,
  findCrowdedTouchRows,
  findKeycapMismatches,
  findDeadTouchKeys,
  findDuplicateTouchKeyIds,
  findHalfDoneSuppressions,
  findLayerSwitchActiveMismatches,
  findMissingRequiredTouchKeys,
  findMissingTouchLayers,
  findMixedSuppressRemove,
  findSpecialLabelOnNormalKeys,
  findTouchKeyIdCaseMismatches,
  findTouchRuleOrphans,
  findUnidentifiedTouchKeys,
} from "./touchKeyDiagnostics.js";
export type {
  TouchKeyDiagnosticInputs,
  TouchKeyFindingSeverity,
  TouchKeyFindingCode,
  TouchKeyFindingScope,
  TouchKeyFinding,
  TouchKeyFix,
  TrimRowFix,
  AddRequiredKeysFix,
  AddRuleFix,
  ClearSpecialLabelFix,
  CompleteSuppressionFix,
  ConvertToUnicodeIdFix,
  MarkAsFrameKeyFix,
  RemoveNextlayerFix,
  RenameKeyFix,
  RepointNextlayerFix,
  ReviewKeyFix,
  SetLayerSwitchSpFix,
} from "./touchKeyDiagnostics.js";

