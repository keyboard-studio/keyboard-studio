// Build the spec 039 `TransformProposal` the context-tolerance station previews
// (spec 078, contracts/marks-context-tolerance-station.md).
//
// One site per fixable rule (siteId = the source rule id), every site
// pre-accepted (spec §3c propose-then-confirm). `causeTag` is set on every site
// so `applyFacetTransform` honours the author's per-site ticks instead of
// applying the site unconditionally. The rule itself is not looked up by id:
// the apply effect passes `createContextToleranceMigrationRule(...)` as
// `ruleOverride`, because the rule is built from an async-computed result.

import type { RuleToleranceFinding, SimKeyInput } from "@keyboard-studio/contracts";
import type { TransformProposal } from "@keyboard-studio/engine";

import { vkeyLabel } from "../../lib/irToCarveNodes.ts";

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
