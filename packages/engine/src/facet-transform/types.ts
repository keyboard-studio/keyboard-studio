// facet-transform — engine types (spec 039, Phase 1 data-model).
//
// 039 owns the value-transition matrix + migration rules (split-C, design brief
// §6). These are engine/content-adjacent data, NOT a locked `packages/contracts`
// type until an evaluation round — the field names here are the contract 039 ships.
//
// FRAMEWORK-INDEPENDENCE DISCLAIMER (research D5): the transition matrix and its
// house-target decision-table are *modeled on* the spec §7.2 ordered/first-match-
// wins PATTERN only. They do NOT import, extend, or modify `StrategyId` /
// `PrimaryRuleNumber` / the locked §7.2 tree (`packages/contracts/src/strategy.ts`).
// Any resemblance between `source.desktop-combo-mechanism` values (`deadkey`,
// `context-match`) and §7 strategy cards is a documentation cross-link, never a
// type dependency. Do not wire `source.*` values into `StrategyId`.

import type { KeyboardIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

/** The transform-impact taxonomy every transition declares (FR-003). */
export type TransformImpactClass =
  | "behavior-preserving"
  | "ux-changing"
  | "output-changing";

/** Loss profile of a supported transition (Entity 1). */
export type LossProfile = "lossless" | "lossy-with-named-loss" | "one-way";

/** Predicate-fit cause tag on a measured exception site (design brief §4). */
export type CauseTag = "principled-split" | "capacity-forced" | "gap-omission";

/** 037's outcome triad for a measurement. */
export type ConfidenceClass = "confident" | "mixed" | "undetermined";

/** Preview surface dispatched by impact class (FR-002/FR-003). */
export type PreviewKind = "source-diff" | "ux-description" | "output-diff";

/** How a proposal's affected site is treated by default (FR-005). */
export type DefaultDisposition =
  | "preserve"
  | "consolidate-offered"
  | "fix-offered"
  | "apply";

/** The user's decision on one affected site. */
export type UserDisposition = "pending" | "accepted" | "declined";

/** A proposal's lifecycle status (Entity 3). */
export type ProposalStatus =
  | "proposed"
  | "partially-accepted"
  | "accepted"
  | "declined"
  | "commit-failed";

// ---------------------------------------------------------------------------
// Entity 0 (input) — injected measurement produced by 037/036 (research D4)
// ---------------------------------------------------------------------------

/**
 * A single measured deviation from the dominant facet value (037-produced;
 * 039 consumes verbatim and layers disposition on top).
 */
export interface ExceptionSite {
  /** Stable id for the deviating rule/key/layer location. */
  siteId: string;
  /** The value at this site (differs from `dominantValue`). */
  siteValue: string;
  /** Predicate-fit cause; `gap-omission` = residue when no predicate fits. */
  causeTag: CauseTag;
  /** The predicate that fired (auditable; absent for gap-omission). */
  predicateId?: string;
}

/**
 * The injected source-facet measurement. 039 does NOT derive this — the caller
 * (studio) loads the 036/037 index record and hands it to `proposeFacetTransform`.
 */
export interface SourceFacetMeasurement {
  /** e.g. `source.touch-combo-mechanism`. Matches a 036/037 facet definition. */
  facetId: string;
  /** Dominant value over the base (037 Entity 2 `value`). */
  dominantValue: string;
  /** 037's outcome triad. `undetermined`/below floor ⇒ transform declines. */
  confidenceClass: ConfidenceClass;
  /** Share following the dominant value (037 distribution), 0–1. */
  consistency: number;
  /** Enumerated deviations. */
  exceptionSites: ExceptionSite[];
  /** Population the measurement was computed over. */
  evidenceSize: number;
}

// ---------------------------------------------------------------------------
// Entity 1 — FacetTransition (a row of the value-transition matrix)
// ---------------------------------------------------------------------------

export interface FacetTransition {
  /** Facet OR sub-profile key — e.g. `source.encoding.output-spelling`. */
  facetId: string;
  /** One of the facet's values; `mixed` is a legal `fromValue`. */
  fromValue: string;
  /** One of the facet's values; `fromValue !== toValue`. */
  toValue: string;
  /** FR-004. `false` ⇒ declined; still present so the decline is explainable. */
  supported: boolean;
  /** `lossless` is legal ONLY when `transformImpactClass = behavior-preserving`. */
  lossProfile: LossProfile;
  /** Present when `lossy-with-named-loss`. Concrete "what is lost" statements. */
  namedLosses: string[];
  /** Denormalized; a build-time check asserts it matches the facet's class. */
  transformImpactClass: TransformImpactClass;
  /** FK → MigrationRule.id. Null when `supported: false`. */
  migrationRuleId: string | null;
  /** Present when `supported: false`; shown verbatim on request (FR-004). */
  declineReason?: string;
  /**
   * Classifies an unsupported row's refusal so the UI can distinguish a
   * permanent "never" from a "not yet" — feeds `TransformRefusal.kind`.
   */
  declineKind?: "permanent" | "deferred" | "gate";
}

// ---------------------------------------------------------------------------
// Entity 2 — MigrationRule
// ---------------------------------------------------------------------------

/** Per-site ledger entry produced by a migration's apply(). */
export interface SiteLedgerEntry {
  siteId: string;
  outcome: "applied" | "skipped" | "refused";
  /** Present for `refused`: the per-site reason (never truncated silently). */
  reason?: string;
}

/** The candidate IR + per-site ledger a migration returns (copy-return). */
export interface RewriteResult {
  /** The candidate IR (a fresh object; `workingCopyIr` is never mutated). */
  candidateIr: KeyboardIR;
  /** Per-site applied/skipped/refused ledger (FR-012 partial acceptance). */
  ledger: SiteLedgerEntry[];
  /** Derived-parameter table to review before commit, when the rule derives values. */
  derivedParameterReview?: DerivedParameterReview;
  /** Companion rewrites performed (FR-008), e.g. backspace-rule removals. */
  companionRewrites?: CompanionRewrite[];
}

/** A coordinated companion edit performed alongside the primary rewrite (FR-008). */
export interface CompanionRewrite {
  /** e.g. `backspace-rule-removal`. */
  kind: string;
  /** Human-readable description of what changed. */
  description: string;
  /** nodeIds affected (removed/rewritten). */
  affectedNodeIds: string[];
}

/** A derived-parameter review table (e.g. the flick-direction assignment). */
export interface DerivedParameterReview {
  kind: string;
  /** One row per derived value the user should confirm. */
  rows: Array<{ siteId: string; label: string; derivedValue: string }>;
  /** Reminder that the derivation is not authoritative (spec Assumption). */
  note: string;
}

/**
 * The procedure that rewrites the working copy for one transition. Copy-return
 * (research D2), parameterized by the accepted-site subset (FR-012).
 */
export interface MigrationRule {
  id: string;
  /** Facet/sub-profile this rule rewrites. */
  facetId: string;
  /** Rewrites `KeyboardIR`, copy-return, scoped to `acceptedSiteIds`. */
  apply(
    workingCopyIr: KeyboardIR,
    acceptedSiteIds: string[],
    measurement: SourceFacetMeasurement,
  ): RewriteResult;
  /** FR-008 — true when the rule performs coordinated companion edits. */
  hasCompanionRewrites: boolean;
  /** True for rules that derive values the user reviews before commit. */
  derivesParameters: boolean;
  /** Declared inverse producer for behavior-preserving invertibility (D7). */
  inverse?(candidateIr: KeyboardIR): KeyboardIR;
}

// ---------------------------------------------------------------------------
// Entity 4 — HouseTargetPolicyRow + HouseTargetResolution
// ---------------------------------------------------------------------------

export interface HouseTargetPolicyRow {
  /** Which facet/sub-profile policy this belongs to. */
  policyId: string;
  /** Evaluation order; first match wins. */
  order: number;
  /** Starter inputs — `script` (037) and `displayDifficulty` (037's input facet). */
  conditions: { script?: string; displayDifficulty?: string };
  /** The `toValue` this row resolves to. */
  target: string;
  /** Authored, deterministic chip text — not synthesized at display time. */
  explanation: string;
  /** The unconditional fallback row. */
  isDefault: boolean;
}

export interface HouseTargetResolution {
  policyId: string;
  matchedRowOrder: number;
  matchedInputs: { script?: string; displayDifficulty?: string };
  target: string;
  explanation: string;
  /** Provenance chip renders only when `isDefault === false`. */
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Entity 3 — TransformProposal + AffectedSite
// ---------------------------------------------------------------------------

export interface AffectedSite {
  /** From the measurement (or a dominant-pattern site). */
  siteId: string;
  /** Absent for dominant-pattern sites (applied unconditionally). */
  causeTag?: CauseTag;
  /** Derived from cause tag (FR-005). */
  defaultDisposition: DefaultDisposition;
  /** Starts `pending`; set by the user. */
  userDisposition: UserDisposition;
  /** Human-readable framing (why preserved/offered), for the preview. */
  framing?: string;
}

/** A per-role before/after entry for the `source-diff` preview. */
export interface SourceDiffRow {
  role: string;
  before: string;
  after: string;
}

/** The preview payload — one variant per `previewKind`. */
export interface TransformPreview {
  previewKind: PreviewKind;
  /** `source-diff`: per-role before/after spelling. */
  sourceDiff?: SourceDiffRow[];
  /** `output-diff`: emitted-byte changes. */
  outputDiff?: Array<{ before: string; after: string }>;
  /** `ux-description`: prose describing the UX change. */
  uxDescription?: string;
}

export interface TransformProposal {
  /** Discriminant so callers can narrow against `TransformRefusal`. */
  kind: "proposal";
  /** The requested pair (natural key of Entity 1). */
  transitionId: { facetId: string; fromValue: string; toValue: string };
  /** The transition's impact class — drives the gate's verify dispatch. */
  transformImpactClass: TransformImpactClass;
  /**
   * The measurement this proposal was built from (research D4 injected input).
   * Carried so `applyFacetTransform(ir, proposal)` can re-run the migration
   * without the caller re-threading the measurement.
   */
  measurement: SourceFacetMeasurement;
  /** Dominant-pattern sites + measured exception sites with disposition. */
  affectedSites: AffectedSite[];
  /** FR-006 — facet `implications` prose composed with `namedLosses`. */
  implications: string[];
  /** FR-002/FR-003 dispatch by `transformImpactClass`. */
  previewKind: PreviewKind;
  /** The assembled preview payload. */
  preview: TransformPreview;
  /** Present when `migrationRule.derivesParameters`. */
  derivedParameterReview?: DerivedParameterReview;
  /** Present for `source.encoding` "normalize to house style". */
  houseTargetProvenance?: HouseTargetResolution;
  /** FR-011 — populated when the transition (un)blocks fall-through. */
  fallThroughImpact?: { producedCharacterSetDelta: ProducedSetDelta };
  /** FR-009 — what the transform could not model (reuses I4's shape). */
  opaqueUntouched?: Array<{ feature: string; count: number }>;
  /** FR-010/FR-013 outcomes. */
  status: ProposalStatus;
  /** Non-persisted handle the apply() step uses to run the right migration. */
  migrationRuleId: string;
  /** Named losses for the transition (fed into the preview + SC-003 checks). */
  namedLosses: string[];
  /** Companion rewrites the migration will perform (FR-008 preview surface). */
  companionRewrites?: CompanionRewrite[];
}

/** FR-011 — the produced-character-set delta a transition causes. */
export interface ProducedSetDelta {
  added: string[];
  removed: string[];
}

// ---------------------------------------------------------------------------
// TransformRefusal — gate facets, undetermined, declined-with-reason (FR-004)
// ---------------------------------------------------------------------------

export interface TransformRefusal {
  kind: "refusal";
  facetId: string;
  /** Requested target (or `house-style` preset). */
  requested: string;
  /** Verbatim reason shown to the user. */
  reason: string;
  /** Distinguishes permanent / deferred / gate / undetermined. */
  refusalKind: "permanent" | "deferred" | "gate" | "undetermined";
}

// ---------------------------------------------------------------------------
// CommitResult — the outcome of applyFacetTransform (the gate)
// ---------------------------------------------------------------------------

export interface CommitFailure {
  /** Why the commit was rejected. */
  reason: string;
  /** Categorizes the failure for the UI. */
  cause:
    | "compile-regression"
    | "parity-violation"
    | "invertibility-violation"
    | "opaque-integrity-violation";
  /** Compile/validator diagnostics or diff detail. */
  detail?: string[];
}

export type CommitResult =
  | {
      status: "committed";
      /** The next working-copy IR (studio writes it via setWorkingIR). */
      nextIr: KeyboardIR;
      /** FR-011/FR-013 — drives axis re-seed when true. */
      producedSetChanged: boolean;
      /** The produced-set delta, when it changed. */
      producedSetDelta?: ProducedSetDelta;
      /** Per-site ledger from the migration. */
      ledger: SiteLedgerEntry[];
    }
  | {
      status: "commit-failed";
      /** Working copy is UNCHANGED; failure attributed to the proposal (FR-010). */
      failure: CommitFailure;
    };

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

export type TransformRequest =
  | { facetId: string; toValue: string }
  | { facetId: string; preset: "house-style" };
