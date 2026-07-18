// facet-transform — engine-owned transform engine (spec 039).
//
// Switches a keyboard base from one source-construction facet value to another on
// the single persistent working copy, via KeyboardIR mutation (copy-return),
// propose-then-confirm, serialized only at output. Owns the per-pair value-
// transition matrix + migration rules (split-C, design brief §6); consumes the
// 037/036 source-facet measurements as an INJECTED parameter (research D4).
//
// Curated barrel (named exports, not `export *`) — re-exported from the package
// root immediately after the pattern-apply block (research D1).

export { proposeFacetTransform } from "./propose.js";
export type { ProposeOptions } from "./propose.js";

export { applyFacetTransform, producedSetDelta, opaqueInventory } from "./verify.js";

export {
  TRANSITION_MATRIX,
  GATE_FACETS,
  FACET_IMPACT_CLASS,
  findTransition,
  isGateFacet,
} from "./transition-matrix.js";

export {
  DEFAULT_HOUSE_TARGET_POLICY,
  resolveHouseTarget,
} from "./house-target-policy.js";

export { MIGRATION_RULES } from "./migrations/index.js";
export { foldSplitModifiersToNamed, renderSourceDiff } from "./migrations/encoding-spelling.js";
export { composeOutputToNfc } from "./migrations/nfd-to-nfc.js";

export type {
  // Enums
  TransformImpactClass,
  LossProfile,
  CauseTag,
  ConfidenceClass,
  PreviewKind,
  DefaultDisposition,
  UserDisposition,
  ProposalStatus,
  // Entities
  ExceptionSite,
  SourceFacetMeasurement,
  FacetTransition,
  MigrationRule,
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
} from "./types.js";
