// Build the spec 039 `TransformProposal` the context-tolerance station previews
// (spec 078, contracts/marks-context-tolerance-station.md).
//
// One site per fixable rule (siteId = the source rule id), every site
// pre-accepted (spec §3c propose-then-confirm). `causeTag` is set on every site
// so `applyFacetTransform` honours the author's per-site ticks instead of
// applying the site unconditionally. The rule itself is not looked up by id:
// the apply effect passes `createContextToleranceMigrationRule(...)` as
// `ruleOverride`, because the rule is built from an async-computed result.

import type { MarksContextToleranceDecision, RuleToleranceFinding, SimKeyInput } from "@keyboard-studio/contracts";
import type { TransformProposal } from "@keyboard-studio/engine";

import { vkeyLabel } from "../../lib/irToCarveNodes.ts";
import type { ContextToleranceState } from "../../stores/workingCopyStore.ts";

/** Plain-text pieces the builder needs; the caller localizes them. */
export interface ContextToleranceProposalText {
  /** One line per site, from the rule's line and key. */
  siteFraming: (line: number, key: string) => string;
  /** The behaviour-in-words summary (FR-006). */
  description: (addedRuleCount: number, siteCount: number) => string;
}

export const CONTEXT_TOLERANCE_FACET = "context-tolerance";

/** `Shift + ]` style key name for a simulated keystroke. */
export function keyDisplayName(key: SimKeyInput | undefined): string {
  if (key === undefined) return "";
  const base = vkeyLabel(key.vkey) ?? key.vkey;
  const mods = key.modifiers.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
  return [...mods, base].join(" + ");
}

export function buildContextToleranceProposal(args: {
  fixableRuleIds: readonly string[];
  findings: readonly RuleToleranceFinding[];
  addedRuleCount: number;
  text: ContextToleranceProposalText;
  /**
   * Site id per rule id. The station passes the position-independent site
   * keys (what a decision records); the apply effect omits it so the sites
   * carry the rule ids the migration rule filters on.
   */
  siteIds?: Readonly<Record<string, string>>;
  /** Rule ids to leave unticked (the apply effect's declined sites). */
  declinedRuleIds?: ReadonlySet<string>;
}): TransformProposal {
  const { fixableRuleIds, findings, addedRuleCount, text, siteIds, declinedRuleIds } = args;
  const byId = new Map(findings.map((f) => [f.ruleId, f] as const));
  const description = text.description(addedRuleCount, fixableRuleIds.length);
  return {
    kind: "proposal",
    transitionId: { facetId: CONTEXT_TOLERANCE_FACET, fromValue: "joined-only", toValue: "joined-or-separate" },
    // Not behaviour-preserving: decomposed input changes (that is the fix).
    // Composed input is unchanged, which the apply effect's own checks and
    // the corpus harness hold it to (FR-008).
    transformImpactClass: "ux-changing",
    measurement: {
      facetId: CONTEXT_TOLERANCE_FACET,
      dominantValue: "joined-only",
      confidenceClass: "confident",
      consistency: 1,
      exceptionSites: [],
      evidenceSize: fixableRuleIds.length,
    },
    affectedSites: fixableRuleIds.map((ruleId) => {
      const finding = byId.get(ruleId);
      return {
        siteId: siteIds?.[ruleId] ?? ruleId,
        causeTag: "gap-omission" as const,
        defaultDisposition: "fix-offered" as const,
        userDisposition: declinedRuleIds?.has(ruleId) === true ? ("declined" as const) : ("accepted" as const),
        framing: text.siteFraming(finding?.location.line ?? 0, keyDisplayName(finding?.failingKeystrokes?.[0])),
      };
    }),
    implications: [],
    previewKind: "ux-description",
    preview: { previewKind: "ux-description", uxDescription: description },
    status: "proposed",
    migrationRuleId: "context-tolerance",
    namedLosses: [],
  };
}

/** The one site a normalization step offers (spec 086); mirrors the engine's constant. */
export const NORMALIZATION_STEP_SITE = "normalization-step";

/**
 * The proposal for a normalization step: one all-or-nothing site, pre-accepted.
 * The panel is mounted without per-site ticks for it, so the author's choice is
 * the single confirm or decline.
 */
export function buildNormalizationStepProposal(args: {
  ruleCount: number;
  framing: string;
  description: string;
}): TransformProposal {
  const { ruleCount, framing, description } = args;
  return {
    kind: "proposal",
    transitionId: { facetId: CONTEXT_TOLERANCE_FACET, fromValue: "joined-only", toValue: "joined-or-separate" },
    transformImpactClass: "ux-changing",
    measurement: {
      facetId: CONTEXT_TOLERANCE_FACET,
      dominantValue: "joined-only",
      confidenceClass: "confident",
      consistency: 1,
      exceptionSites: [],
      evidenceSize: ruleCount,
    },
    affectedSites: [
      {
        siteId: NORMALIZATION_STEP_SITE,
        causeTag: "gap-omission" as const,
        defaultDisposition: "fix-offered" as const,
        userDisposition: "accepted" as const,
        framing,
      },
    ],
    implications: [],
    previewKind: "ux-description",
    preview: { previewKind: "ux-description", uxDescription: description },
    status: "proposed",
    migrationRuleId: "context-tolerance",
    namedLosses: [],
  };
}

/** Wording-free text: the decision a proposal yields never depends on it. */
const NO_TEXT: ContextToleranceProposalText = { siteFraming: () => "", description: () => "" };

/**
 * The station's proposal for the latest analysis (spec 078): `null` when there
 * is nothing to propose (no analysis yet, failed, or no fixable rule;
 * could-not-check items are never author-facing). A generated normalization
 * step is one all-or-nothing site; otherwise one site per fixable rule.
 * `text` is the caller's localized wording; omit it where only the proposal's
 * sites matter.
 */
export function toleranceProposalFor(
  tolerance: ContextToleranceState,
  text: ContextToleranceProposalText = NO_TEXT,
): TransformProposal | null {
  if (tolerance.status !== "ready" || tolerance.fixableRuleIds.length === 0) return null;
  if (tolerance.normalizationStep !== undefined) {
    // The station's own intro, examples and disclosure carry the wording; the
    // panel's description and the (hidden) site framing stay empty.
    return buildNormalizationStepProposal({
      ruleCount: tolerance.normalizationStep.ruleCount,
      framing: "",
      description: "",
    });
  }
  const fixable = new Set(tolerance.fixableRuleIds);
  const addedRuleCount = tolerance.proposal.variants.filter((v) => fixable.has(v.sourceRuleId)).length;
  return buildContextToleranceProposal({
    fixableRuleIds: tolerance.fixableRuleIds,
    findings: tolerance.report.findings,
    addedRuleCount,
    siteIds: tolerance.siteKeys,
    text,
  });
}

/** Whether the series shows the context-tolerance station: the analysis is running, or it produced a proposal. */
export function toleranceStationShown(tolerance: ContextToleranceState, proposal: TransformProposal | null): boolean {
  return tolerance.status === "analysing" || proposal !== null;
}

/** Map the panel's confirmed dispositions onto the decision shape. */
export function decisionFromProposal(
  confirmed: TransformProposal,
  fingerprint: string,
): Omit<MarksContextToleranceDecision, "appliedFingerprint"> {
  const proposedSiteIds = confirmed.affectedSites.map((s) => s.siteId);
  const acceptedSiteIds = confirmed.affectedSites.filter((s) => s.userDisposition === "accepted").map((s) => s.siteId);
  const decision =
    acceptedSiteIds.length === proposedSiteIds.length ? "accept" : acceptedSiteIds.length === 0 ? "decline" : "partial";
  return { decision, acceptedSiteIds, proposedSiteIds, fingerprint };
}
