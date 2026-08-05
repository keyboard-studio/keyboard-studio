// Engine package — implementation in issues #14–#19, #64.
// Issue #16 lands the kmcmplib WASM oracle wrapper.

export { runLexicalChecks, runReferenceChecks, runAllChecks } from "./validator/index.js";

// Issue #20 — base-browser GitHub API client.
export { createBaseBrowser } from "./base-browser/index.js";
export type { BaseBrowserConfig } from "./base-browser/index.js";

// Issue #16 — WASM oracle public surface.
export {
  validateWithOracle,
  oracle,
  _createOracle,
} from "./validator/oracle.js";
export { OracleLoadError } from "./validator/OracleLoadError.js";
export type { OracleLoadReason } from "./validator/OracleLoadError.js";
export type {
  GroupName,
  LintOptions,
} from "./validator/types.js";
export { ALL_GROUPS, TS_GROUPS, WASM_GROUPS } from "./validator/types.js";
export type {
  WasmOracleHandle,
  RawWasmFinding,
} from "./validator/wasmLoader.js";
export { loadWasmOracle } from "./validator/wasmLoader.js";
export { CODE_MAP, translatePassthrough, translateWasmFinding } from "./validator/codeMap.js";
export type { CodeMapEntry } from "./validator/codeMap.js";

// Issue #17 — Compiler service public surface (in-browser kmcmplib WASM).
export { compile, init, isReady, compilerService } from "./compiler/index.js";
export { stripDanglingAssetStores } from "./compiler/stripDanglingAssetStores.js";
export { parseKmnHeaderStores } from "./compiler/parseKmnHeaderStores.js";
export type { KmnHeaderStore } from "./compiler/parseKmnHeaderStores.js";
export { parseKpjFlags } from "./compiler/parseKpjFlags.js";
export type { CompilerOptions } from "./compiler/parseKpjFlags.js";

// Issue #39 — release-tree source loader (proxy + VFS hydration).
export { fetchKeyboardSourceToVfs } from "./loader/fetchKeyboardSourceToVfs.js";
export type {
  FetchFn,
  FetchKeyboardSourceOptions,
  FetchKeyboardSourceResult,
  KpsFontEntry,
  KpsStylesheetEntry,
} from "./loader/fetchKeyboardSourceToVfs.js";

// Issues #46/#47 — output service (zip download + GitHub OAuth fork+PR).
export { createOutputService, toZip, serializeToZip, createGitHubOutputService } from "./output/index.js";
export type { GitHubOutputConfig, GitHubFetchFn, ToZipOptions } from "./output/index.js";

// Option B (org-mediated PR) output service.
export { createManagedPROutputService } from "./output/index.js";
export type { ManagedPRFetchFn, ManagedPROutputConfig } from "./output/index.js";

// Issue #233 — KeyboardIR codec public surface.
export { parse as parseKmn, emit as emitKmn, parseKvks, parseTouchLayout, emitTouchLayout, OPAQUE_REASONS } from "./codec/index.js";
export type { ParseResult, OpaqueReason } from "./codec/index.js";

// Issue #239 — .kmn.imported sidecar + import-attribution.
export { addSidecar, isSidecarPath, buildImportAttributionBlock } from "./output/index.js";
export type { ImportAttributionInput } from "./output/index.js";

// Track 2 adapt-staging helpers (output-only; not used in the OSK preview path).
export { bumpKeyboardVersion, stageAdaptHistory } from "./output/index.js";

// Per-keyboard decision audit (specs/053-decision-audit) — the pure differ,
// serializer, tolerant reader, save-budget shed pass, and the two evidence
// surfaces the record ships through (the pull-request block and the packaged
// `.studio/` sidecar). The recording seam itself is a studio concern
// (packages/studio/src/decisions/).
export {
  addDecisionRecordSidecar,
  buildDecisionSummaryBlock,
  DECISION_RECORD_VFS_PATH,
  diffLines,
  diffMagnitude,
  normalizeDecisionRecord,
  parseDecisionRecord,
  PR_SUMMARY_MAX_ENTRIES,
  serializeDecisionRecord,
  serializedRecordBytes,
  shedDecisionDetail,
  STUDIO_METADATA_PREFIX,
} from "./decision-audit/index.js";
export type {
  DecisionSummaryOptions,
  ParseDecisionRecordResult,
  PreMigrationDecisionRecord,
  PreMigrationEntry,
} from "./decision-audit/index.js";

// Issue #183 — headless simulate() API is exposed via the `./simulator`
// subpath export, NOT from this main entry. The vendored Keyman engine
// uses bare import specifiers (e.g. `@keymanapp/common-types`) that resolve
// via tsconfig paths at compile time but cannot be resolved by browser
// bundlers like Vite. Keeping simulator off the main entry prevents the
// browser-targeted SPA from following that import chain.

// Issue #234 — pattern recognizer public surface.
export { recognizePatterns, classifyRemovalCapabilities } from "./recognizer/index.js";
export type { RecognizerRule, MatchResult, RecognizeResult } from "./recognizer/index.js";
export { isParallelIndexFanOut } from "./recognizer/rules/parallel-index-fanout.js";

// spec 057 — the single package-descriptor writer. Both authoring tracks reach
// `source/<id>.kps` through this module and nowhere else (FR-005).
export {
  buildKpsContent,
  buildLanguageElement,
  buildLanguagesBlock,
  applyIdentityToKps,
  DESCRIPTOR_CONSUMED_FIELDS,
} from "./package-descriptor/index.js";
export type {
  PackageDescriptorIdentity,
  ApplyIdentityToKpsResult,
} from "./package-descriptor/index.js";

// Issue #19 — scaffolder (template-cleanup pipeline).
export { createScaffolderService, renameFilesInVfs, generateStubs } from "./scaffolder/index.js";
export { scaffoldIR, resetIdentity } from "./scaffolder/scaffold-ir.js";
export {
  scaffoldTouchLayout,
  scaffoldTouchLayoutWithDiagnostics,
  buildMinimalPhoneTouchLayout,
} from "./scaffolder/index.js";
export type { ScaffoldTouchLayoutResult } from "./scaffolder/index.js";
// spec 035 — touch coverage guard (FR-008/SC-003).
export { touchCoverage } from "./pattern-apply/touchCoverage.js";
export type { TouchCoverageResult } from "./pattern-apply/touchCoverage.js";
// spec 051 — shared "absent touch `layer` slot === default" rule, plus the
// shared case->layer placement rule the studio's touch gallery consumes (it
// used to keep a hand-synced copy — see touchLayer.ts).
export {
  DEFAULT_TOUCH_LAYER,
  SHIFT_TOUCH_LAYER,
  resolveTouchLayerId,
  touchLayerForChar,
} from "./pattern-apply/touchLayer.js";
export type { ScaffolderServiceOptions } from "./scaffolder/index.js";
export type { ScaffoldIROptions, ScaffoldIRIdentity } from "./scaffolder/scaffold-ir.js";

// Issue #21 — Pattern-library loader.
export { loadPatterns, getPatterns, getById, toPattern } from "./pattern-library/index.js";
export type { PatternFilter, LoadReport } from "./pattern-library/index.js";

// toPattern/rankPatterns have no node:fs/node:path dependency (unlike
// loadPatterns, whose fs/path use is behind a dynamic import()), so they are
// safe to bundle for the browser — the studio's browser pattern library
// reuses them instead of re-implementing the RawPattern->Pattern mapping and
// the strategy-partition ranking.
export { filterFor, rankPatterns } from "./pattern-library/index.js";

// Strategy selector: §7.2 decision tree.
export { selectStrategy } from "./strategy-selector/index.js";
// §7.2 decision tree as data — drives both selectStrategy and the studio Flow Map.
export {
  PRIMARY_RULES,
  SECONDARY_RULES,
  STRATEGY_LABELS,
} from "./strategy-selector/rules.js";
export type {
  PrimaryRuleDef,
  SecondaryRuleDef,
  SecondaryRuleId,
  ConditionalSecondary,
} from "./strategy-selector/rules.js";
// §7.2 script-class default-fill prior — pre-fill step run before selectStrategy().
export { defaultFillAxes } from "./strategy-selector/default-fill.js";
export type { DefaultFillResult } from "./strategy-selector/default-fill.js";
// §7.2 rule 3a — base-derived A3a detection on the Track 2 import path.
export { detectMarkInputOrderFromImport } from "./strategy-selector/import-mark-order.js";

// Issue #248 — Sprint-1 identity stub mutator (deleted at Sprint-2 start per #238).
export { applyIdentityStubMutation } from "./stub-mutator/index.js";

// Issue #141 — character discovery service (Phase B).
// Public surface: factory + injectable types only.
// Internal helpers (buildLinguistPrompt, parseLinguistJson, cldrCrossCheck,
// parseUnicodeSet, loadExemplars, SCRIPT_BLOCKS) are NOT re-exported here;
// tests import them directly from the module file.
export { createCharacterDiscoveryService } from "./character-discovery/CharacterDiscoveryServiceImpl.js";
export type { LLMCompleter } from "./character-discovery/CharacterDiscoveryServiceImpl.js";
export type { CldrLoader, CldrFullLoader, ExemplarResult } from "./character-discovery/cldr.js";
// The live-CLDR fetch path. NOT the authoring path since spec 044 — authoring
// reads the committed offline CLDR+SLDR index via sourceExemplars below. These
// stay exported unchanged as the opt-in live-refresh route and the injection
// seam every existing test uses.
export { createFetchCldrLoader, createFetchCldrFullLoader } from "./character-discovery/cldr.js";
// The single exemplar-sourcing path (spec 044 FR-015): offline, deterministic,
// version-pinned, covering both CLDR and SLDR with per-character attribution.
export {
  loadExemplarSource,
  sourceExemplars,
  exemplarLocaleCandidates,
  isGatedTag,
  charactersInTier,
} from "./character-discovery/exemplarSource.js";
export type {
  ExemplarTier,
  ExemplarSource,
  ExemplarConfidence,
  SourcedCharacter,
  SourcedInventory,
} from "./character-discovery/exemplarTypes.js";
// Phase B high-confidence missing-character suggestions, now CLDR+SLDR-grounded.
export { suggestMissingCharacters, neededCharsForLanguage, isCharCoveredForLocale } from "./character-discovery/suggestMissing.js";
export type { MissingCharSuggestions, CharNormalizationForm } from "./character-discovery/suggestMissing.js";
// Case-pair proposal helper for the shift-layer studio feature (bidirectional;
// distinct from suggestMissing's isCovered coverage check — see casePair.ts docstring).
export { caseCounterpart } from "./character-discovery/casePair.js";
// Pre-carve "keep these for convenience?" candidates: basic-Latin letters the
// base produces that the orthography does not use (loanwords / email / URLs).
export { surplusBasicLatinCandidates, candidateChars } from "./character-discovery/convenienceChars.js";
export type { ConvenienceCandidate, SurplusBasicLatinArgs } from "./character-discovery/convenienceChars.js";
// Phase B tiered/browsable character-map candidate builder (right pane).
// Reuses the cldr.ts exemplar-loading path; CHARACTER_MAP_BLOCKS is a
// SEPARATE, multi-block-per-script table from cldr.ts's calibrated SCRIPT_BLOCKS.
export { buildCharacterMap, CHARACTER_MAP_BLOCKS, isCombiningMarkChar, isPrivateUseCodePoint } from "./character-discovery/characterMap.js";
export type { CharacterMapTier, CharacterMapCell, CharacterMapGroup } from "./character-discovery/characterMap.js";
// Whole-grapheme decomposition for the three-store confirmed alphabet (spec 046):
// one base + ordered combining marks; null for PUA / plain letters / digraphs.
export { decomposeGrapheme } from "./character-discovery/decompose.js";
export type { GraphemeDecomposition } from "./character-discovery/decompose.js";
// spec 047 — pure Unicode General-Category classifier for the inventory breakdown.
export { glyphCategory } from "./character-discovery/glyphCategory.js";
export type { GlyphCategory } from "./character-discovery/glyphCategory.js";

// Marks question series (spec 046): pure engine functions behind the S0-S5
// stations — the shared posture table is the single source the facet, the S4
// proposal, the unwrap stores, and the blocking rules all read.
export { nfcPostureOfInventory, aggregateInventoryPosture } from "./marks/nfc-posture-of-inventory.js";
export type { PosturePair, InventoryPosture } from "./marks/nfc-posture-of-inventory.js";
export { groupMarkClasses, attestedBasesOf, ATTACHMENT_SIMILARITY_THRESHOLD } from "./marks/mark-classes.js";
export type { MarkClass } from "./marks/mark-classes.js";
export { proposeAttachments, deriveCaseCounterparts } from "./marks/attachment-proposals.js";
export type { AttachmentProposal, ProposedAttachmentState } from "./marks/attachment-proposals.js";
export { resolveOutputFormProposal, hasDecidablePairs, normalizationFormForOutputForm } from "./marks/output-form-policy.js";
export type { OutputForm, OutputFormProposal } from "./marks/output-form-policy.js";
// The S2 answer (spec 052): treatment + promotion + input order, replacing the
// single "own letter of the alphabet" enum. See specs/052-marks-treatment-question.
export { treatmentFor, makeMarkTreatmentAnswer, pruneMarkOverrides, dominantTreatment, isClassMixed } from "./marks/treatment.js";
export type { MarkTreatment, MarkTreatmentAnswer, PromotedComposedCharacter } from "./marks/treatment.js";
export { promotableCharacters, expandCaseCounterpartPromotions, prunePromotions } from "./marks/promotion.js";
export { computeMarkTreatmentPrefills, detectBaseMarkMechanism, unaffordableReasonFor, PRODUCTIVITY_SPREAD_THRESHOLD } from "./marks/treatment-prefill.js";
export type { MarkTreatmentPrefill, MarkTreatmentPrefillOptions, KeyBudgetSignal, BaseMarkMechanism } from "./marks/treatment-prefill.js";
export { deriveMarksComputedAxes, surfaceStrategyDisagreement } from "./marks/strategy-reconcile.js";
export type { MarksComputedAxes, MarksReconcileInputs, DisagreementInputs } from "./marks/strategy-reconcile.js";
export { buildPlacementWorklist, verifyWorklistCoverage } from "./marks/worklist.js";
export type { WorklistInputs } from "./marks/worklist.js";
export { expandCaseCounterpartAttachments } from "./marks/case-fold.js";
export { deriveCarveNeededSet } from "./marks/carve-needed-set.js";
export type { CarveNeededSet, DeriveCarveNeededSetArgs } from "./marks/carve-needed-set.js";
export { applyMarkGuards, MARKS_GUARD_GROUP, MARKS_UNWRAP_FROM_STORE, MARKS_UNWRAP_TO_STORE } from "./pattern-apply/mark-guards.js";
export type { MarkGuardsResult } from "./pattern-apply/mark-guards.js";

// Pattern-apply: slot substitution + MechanismAssignment[] to .kmn injection.
export { substituteSlots, applyAssignments, applyAssignmentsToVfs, applyCarveToVfs, carveFilterIr, applyKeycapLabelsToVfs, applyCarveKeycapRemovalsToVfs, collectCarvedKeycapTexts, resolveRenderableMechanisms, applyTouchAssignments, applyTouchAssignmentsToRawJson, applyDesktopModifications, applyDesktopModificationsToRawJson, propagateDesktopLayersToTouch, applyStoreSlotRemovals, classifyStoreSlotEdit, describeStorePairing, analyzeStores, storeRoleOf, buildProducerIndex, parseSlotId, makeSlotId, collectCharContributors, collectCompositionMethod, isMnemonicLayout, keyHasCapsHandling, buildShiftRuleLines, buildBaseRuleLines, buildCasePairRuleLines, planShiftAssignment, MODIFIER_EXCLUSIONS, canonicalizeCombo, comboToKeySpec, parseKeySpec, comboToTouchLayerId, comboToKvksShiftToken, collectModifierTokensInUse, collectLayerCombosInUse, buildComboKeyMap, addableTouchLayerTokens, optionsForTouchLayerSlot, isPlusSeparator, touchKeyAddress, touchSubKeyAddress, touchFlickAddress, enumerateTouchMethodsForChar, applyTouchKeycapRemovalsToLayout, applyTouchKeycapRemovalsToRawJson, applyTouchKeycapRemovalsToVfs, buildSessionProducedSet } from "./pattern-apply/index.js";
export type { SubstituteResult, ApplyAssignmentsResult, ApplyTouchAssignmentsResult, ApplyTouchAssignmentsToRawJsonResult, DesktopModifications, ApplyDesktopModificationsResult, ApplyDesktopModificationsToRawJsonResult, PropagateDesktopLayersToTouchResult, ApplyCarveToVfsOpts, CarveKeycapRemovalInput, StoreSlotRemovalResult, StoreSlotEditMode, StoreSlotBlockReason, StorePairingDescription, StoreAnalysis, StoreRole, ProducerIndex, CharContributors, ContributorDescriptor, ShiftAssignmentPlan, ModifierToken, TouchMethodDescriptor, ApplyTouchKeycapRemovalsResult, ApplyTouchKeycapRemovalsToRawJsonResult } from "./pattern-apply/index.js";

// Facet-transform (spec 039): switch a base's source-construction facet value on
// the working copy — propose-then-confirm, KeyboardIR copy-return, gated commit.
export {
  proposeFacetTransform,
  applyFacetTransform,
  TRANSITION_MATRIX,
  GATE_FACETS,
  FACET_IMPACT_CLASS,
  findTransition,
  isGateFacet,
  DEFAULT_HOUSE_TARGET_POLICY,
  resolveHouseTarget,
  MIGRATION_RULES,
  foldSplitModifiersToNamed,
  renderSourceDiff,
  composeOutputToNfc,
  producedSetDelta,
  opaqueInventory,
} from "./facet-transform/index.js";
export type {
  TransformImpactClass,
  LossProfile,
  CauseTag,
  ConfidenceClass,
  PreviewKind,
  DefaultDisposition,
  UserDisposition,
  ProposalStatus,
  ExceptionSite,
  SourceFacetMeasurement,
  FacetTransition,
  MigrationRule as FacetMigrationRule,
  RewriteResult,
  SiteLedgerEntry,
  CompanionRewrite,
  DerivedParameterReview,
  HouseTargetPolicyRow,
  HouseTargetResolution,
  AffectedSite,
  SourceDiffRow,
  TransformPreview,
  TransformProposal,
  ProducedSetDelta,
  TransformRefusal,
  CommitFailure,
  CommitResult,
  TransformRequest,
  ProposeOptions,
  ApplyFacetTransformOptions,
  InjectedSimulate,
} from "./facet-transform/index.js";

// Inventory diff (spec §8): static extraction of a keyboard's produced glyph set.
export { producedGlyphs, collectFromOutput } from "./inventory/producedGlyphs.js";
export type { ProducedGlyphsOptions } from "./inventory/producedGlyphs.js";

// Inventory diff (spec §8): needed-vs-produced coverage delta.
//
// Intentionally unwired for now — a pure, tested primitive published ahead of
// its caller, not leftover rebase debris. It is the coverage-diff half of the
// Phase B worklist derivation sketched in docs/design-notes/survey-flow-rework.md;
// the caller lands with that rework. Landed here deliberately (see the "My
// keyboards" PR discussion) rather than split out, so the primitive and the
// design note that motivates it stay together in history.
//
// If you are about to flag this as dead code: it is reachable and tested via
// computeInventoryDelta.test.ts, and the lack of a production caller is the
// documented state above, not an oversight.
export { computeInventoryDelta } from "./inventory/computeInventoryDelta.js";
export type { InventoryDelta } from "./inventory/computeInventoryDelta.js";
