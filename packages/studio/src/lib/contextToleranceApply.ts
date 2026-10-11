// Applying a recorded context-tolerance decision (spec 078 FR-005a, second
// half; contracts/studio-tolerance-state.md § Apply effect, as amended in
// research.md §10 "apply path").
//
// The marks step only records the decision. This module turns an accepted
// decision into the verified fix, against the analysis of the keyboard the
// preview last compiled:
//   1. The analysis must be of the same rules the decision was taken on (its
//      fingerprint), or every accepted site is stale and nothing is applied.
//   2. Accepted site keys map back to the analysis's rule ids; a key with no
//      matching fixable rule is stale.
//   3. `applyFacetTransform` verifies the candidate (opaque integrity, compile
//      regression) with the context-tolerance rule passed as `ruleOverride`.
//   4. The accepted generated rules become an overlay, which the projection
//      replays into the preview and the download, and which is also committed
//      to the working IR through the mutate seam (see the hook).
//
// Pure and async: the engine and the facet-transform gate are injected, so the
// logic is testable without a compile.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  isNormalizationStepBatch,
  type applyFacetTransform as ApplyFacetTransform,
  type ContextToleranceOverlay,
} from "@keyboard-studio/engine";

import type { ContextToleranceState } from "../stores/workingCopyStore.ts";
import {
  buildContextToleranceProposal,
  buildNormalizationStepProposal,
  NORMALIZATION_STEP_SITE,
} from "../survey/marks/contextToleranceProposal.ts";
import type { ContextToleranceEngine } from "./contextToleranceEngine.ts";

type Ready = Extract<ContextToleranceState, { status: "ready" }>;

export interface ContextToleranceApplyDecision {
  acceptedSiteIds: readonly string[];
  fingerprint: string;
}

export type ContextToleranceApplyOutcome =
  /** Verified; `overlay` holds the accepted rules. Some accepted sites may still be stale. */
  | { kind: "applied"; overlay: ContextToleranceOverlay; staleSiteIds: string[] }
  /** Nothing applied: the rules changed since the decision. */
  | { kind: "stale"; staleSiteIds: string[] }
  /** Nothing applied: the gate refused the candidate. */
  | { kind: "refused"; reason: string };

export interface ContextToleranceApplyDeps {
  engine: Pick<
    ContextToleranceEngine,
    | "createContextToleranceMigrationRule"
    | "buildContextToleranceOverlay"
    | "createNormalizationStepMigrationRule"
    | "buildNormalizationStepOverlay"
  >;
  applyFacetTransform: typeof ApplyFacetTransform;
}

export async function applyContextToleranceDecision(
  decision: ContextToleranceApplyDecision,
  analysis: Ready,
  deps: ContextToleranceApplyDeps,
): Promise<ContextToleranceApplyOutcome> {
  if (analysis.fingerprint !== decision.fingerprint) {
    return { kind: "stale", staleSiteIds: [...decision.acceptedSiteIds] };
  }

  if (analysis.normalizationStep !== undefined) {
    return applyNormalizationStepDecision(decision, analysis, analysis.normalizationStep, deps);
  }

  const ruleIdBySite = new Map(analysis.fixableRuleIds.map((id) => [analysis.siteKeys[id] ?? id, id] as const));
  const staleSiteIds = decision.acceptedSiteIds.filter((k) => !ruleIdBySite.has(k));
  const accepted = new Set(decision.acceptedSiteIds.flatMap((k) => ruleIdBySite.get(k) ?? []));
  if (accepted.size === 0) return { kind: "stale", staleSiteIds };

  const fixable = new Set(analysis.fixableRuleIds);
  const proposal = buildContextToleranceProposal({
    fixableRuleIds: analysis.fixableRuleIds,
    findings: analysis.report.findings,
    addedRuleCount: analysis.proposal.variants.filter((v) => fixable.has(v.sourceRuleId)).length,
    text: { siteFraming: () => "", description: () => "" },
    declinedRuleIds: new Set(analysis.fixableRuleIds.filter((id) => !accepted.has(id))),
  });
  const ruleOverride = deps.engine.createContextToleranceMigrationRule(analysis.proposal, "echo");
  const result = await deps.applyFacetTransform(analysis.analysedIr, proposal, { ruleOverride });
  if (result.status !== "committed") {
    return { kind: "refused", reason: result.failure.reason };
  }

  const overlay = deps.engine.buildContextToleranceOverlay(
    { ir: result.nextIr, variants: analysis.proposal.variants },
    accepted,
    analysis.siteKeys,
  );
  return { kind: "applied", overlay, staleSiteIds };
}

/**
 * The working-IR half of the write: replace any previously applied overlay's
 * rules with `next`'s, as a patch over exactly the paths the seam allows.
 * Returns the patch for `applyMutatePatch`.
 */
export function contextTolerancePatch(
  working: KeyboardIR,
  previous: ContextToleranceOverlay | null,
  next: ContextToleranceOverlay | null,
  engine: {
    removeContextToleranceOverlay: (ir: KeyboardIR, o: ContextToleranceOverlay) => KeyboardIR;
    applyContextToleranceOverlay: (ir: KeyboardIR, o: ContextToleranceOverlay) => { ir: KeyboardIR };
  },
): Pick<KeyboardIR, "groups" | "comments"> {
  // A normalization step also moves the entry point, which is outside the seam's
  // declared writes, so it lives only in the overlay the projection replays;
  // the working IR carries no step and has nothing to strip or add for it.
  const stripped =
    previous === null || previous.batches.some(isNormalizationStepBatch)
      ? working
      : engine.removeContextToleranceOverlay(working, previous);
  const target =
    next === null || next.batches.some(isNormalizationStepBatch)
      ? stripped
      : engine.applyContextToleranceOverlay(stripped, next).ir;
  return { groups: target.groups, comments: target.comments };
}

/**
 * The step is one all-or-nothing site: accepted when the decision names it,
 * otherwise nothing is applied. The gate verifies the candidate exactly as it
 * does for the variants; the overlay records the step for the projection.
 */
async function applyNormalizationStepDecision(
  decision: ContextToleranceApplyDecision,
  analysis: Ready,
  step: NonNullable<Ready["normalizationStep"]>,
  deps: ContextToleranceApplyDeps,
): Promise<ContextToleranceApplyOutcome> {
  const staleSiteIds = decision.acceptedSiteIds.filter((k) => k !== NORMALIZATION_STEP_SITE);
  if (!decision.acceptedSiteIds.includes(NORMALIZATION_STEP_SITE)) return { kind: "stale", staleSiteIds };

  const proposal = buildNormalizationStepProposal({ ruleCount: step.ruleCount, framing: "", description: "" });
  const ruleOverride = deps.engine.createNormalizationStepMigrationRule(step);
  const result = await deps.applyFacetTransform(analysis.analysedIr, proposal, { ruleOverride });
  if (result.status !== "committed") {
    return { kind: "refused", reason: result.failure.reason };
  }
  return { kind: "applied", overlay: deps.engine.buildNormalizationStepOverlay(step), staleSiteIds };
}
