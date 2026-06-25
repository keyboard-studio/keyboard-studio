// §7.2 decision tree, expressed as data.
//
// This module is the SINGLE SOURCE OF TRUTH for the strategy decision tree:
// selectStrategy() (see ./index.ts) executes these tables, and the studio's
// developer "Flow Map" tab renders them. Editing a rule here changes BOTH the
// engine's behavior and the live map — there is no hand-maintained duplicate.
//
// Firing order is the array order of PRIMARY_RULES (first match wins), then the
// post-primary passes in SECONDARY_RULES order. The existing index.test.ts
// suite pins the exact behavior these tables must reproduce.
//
// NOTE on rule "3a": spec §7.2 documents a rule 3a (A2=alphabetic AND A3=strong
// AND A3a=postfix → S-03) that intercepts between rules 3 and 4. It is NOT yet
// implemented in the selector (A3a is not elicited end-to-end), so it is
// deliberately absent from PRIMARY_RULES below — the map reflects what the code
// actually does, not the spec's intended-but-unbuilt rule. See spec.md §7.2.

import type {
  DiscoveryAxisVector,
  StrategyId,
  PrimaryRuleNumber,
} from "@keyboard-studio/contracts";

/**
 * Human-readable label for each strategy id, mirroring the §7.2 table / §7.3
 * catalog headings. Used by the developer Flow Map; not part of the engine's
 * runtime decision (which works purely on ids).
 *
 * S-13 ("Touch layer switch") is intentionally absent from PRIMARY_RULES and
 * SECONDARY_RULES. It is not selected by the A1–A7 desktop decision tree at
 * all — it is selected by a separate touch-layout inspection pass that detects
 * the presence of more than one named layer (confirmed by `"nextlayer":` on one
 * or more keys). See spec §7.2 "Touch keyboards and S-13" and §7.5 "Touch
 * strategy validation (S-13)". The Flow Map does not render S-13 as a node
 * because no rule in PRIMARY_RULES or SECONDARY_RULES references it; it appears
 * here only so the full catalog label set is complete for any code that maps all
 * StrategyId values to display strings.
 */
export const STRATEGY_LABELS: Readonly<Record<StrategyId, string>> = {
  "S-01": "Simple swap",
  "S-02": "Deadkey composition",
  "S-03": "Sequence replace",
  "S-04": "Collapse with any/index",
  "S-05": "Mnemonic spelling",
  "S-06": "Chained deadkeys",
  "S-07": "Diacritic cycle",
  "S-08": "RAlt modifier-layer",
  "S-09": "Context-sensitive cluster",
  "S-10": "Constraints + beep",
  "S-11": "Stateful option toggle",
  "S-12": "DLL IME callout",
  "S-13": "Touch layer switch",
} as const;

/**
 * A secondary strategy appended when a primary rule fires. `whenText`/`when`
 * are present only for secondaries that are themselves conditional (e.g. rule 2
 * adds S-05 only when A3=strong); an omitted predicate means "always add when
 * the parent rule fires".
 */
export interface ConditionalSecondary {
  strategy: StrategyId;
  /** Human-readable condition; omit when the secondary is unconditional. */
  whenText?: string;
  /** Machine predicate; omit when the secondary is unconditional. */
  when?: (axes: DiscoveryAxisVector) => boolean;
}

/**
 * One primary-fixing rule (§7.2 pass 1). The first rule whose `when` matches
 * sets the recommendation's `primary` and `triggeredRule`. Rule 12 is the
 * catch-all fallback and its `when` is always true.
 */
export interface PrimaryRuleDef {
  /** §7.2 rule number (becomes StrategyRecommendation.triggeredRule). */
  rule: PrimaryRuleNumber;
  /** Human-readable predicate, mirroring the §7.2 table's left column. */
  conditionText: string;
  /** Machine predicate over the axis vector. */
  when: (axes: DiscoveryAxisVector) => boolean;
  /** Primary strategy selected when this rule fires. */
  primary: StrategyId;
  /** Secondaries appended, in order, when this rule fires as the primary. */
  secondaries: ConditionalSecondary[];
}

/** Identifier for a post-primary secondary-adding pass (§7.2 pass 2 + wrapper). */
export type SecondaryRuleId = "S-11-wrapper" | 9 | 10;

/**
 * One secondary-adding pass that runs after the primary is fixed (§7.2 pass 2),
 * plus the S-11 wrapper. These never change the primary; they only append to
 * `secondaries`. Evaluated in array order.
 */
export interface SecondaryRuleDef {
  id: SecondaryRuleId;
  /** Human-readable predicate. */
  conditionText: string;
  /** Predicate; the S-11 wrapper also depends on which primary rule fired. */
  when: (axes: DiscoveryAxisVector, triggeredRule: PrimaryRuleNumber) => boolean;
  /** Strategy appended when the predicate holds. */
  add: StrategyId;
}

/**
 * Primary-fixing rules in firing order (first match wins). Mirrors the §7.2
 * decision-tree table; rule 12 is the always-true fallback and MUST stay last.
 */
export const PRIMARY_RULES: readonly PrimaryRuleDef[] = [
  {
    rule: 1,
    conditionText: "A1=massive AND A2=logographic",
    when: (a) => a.scale === "massive" && a.scriptClass === "logographic",
    primary: "S-12",
    secondaries: [],
  },
  {
    rule: 2,
    conditionText: "A2=abjad OR (A2=abugida AND cluster-sensitivity=yes)",
    when: (a) =>
      a.scriptClass === "abjad" ||
      (a.scriptClass === "abugida" && a.clusterSensitivity === true),
    primary: "S-09",
    secondaries: [
      {
        strategy: "S-05",
        whenText: "A3=strong",
        when: (a) => a.phoneticIntuition === "strong",
      },
    ],
  },
  {
    rule: 3,
    conditionText: "A4=replacing-cycling",
    when: (a) => a.diacriticBehavior === "replacing-cycling",
    primary: "S-07",
    secondaries: [{ strategy: "S-04" }],
  },
  {
    rule: 4,
    conditionText: "A5=two-orthography",
    when: (a) => a.multiMode === "two-orthography",
    primary: "S-11",
    secondaries: [],
  },
  {
    rule: 5,
    conditionText: "A3=strong AND A1 ∈ {medium, large}",
    when: (a) =>
      a.phoneticIntuition === "strong" &&
      (a.scale === "medium" || a.scale === "large"),
    primary: "S-05",
    secondaries: [{ strategy: "S-04" }],
  },
  {
    rule: 6,
    conditionText: "A4=multi-family AND A1=large",
    when: (a) => a.diacriticBehavior === "multi-family" && a.scale === "large",
    primary: "S-06",
    secondaries: [{ strategy: "S-04" }],
  },
  {
    rule: 7,
    conditionText: "A4=stacking-combining AND A1 ∈ {small, medium}",
    when: (a) =>
      a.diacriticBehavior === "stacking-combining" &&
      (a.scale === "small" || a.scale === "medium"),
    primary: "S-02",
    secondaries: [{ strategy: "S-04" }],
  },
  {
    rule: 8,
    conditionText: "A2=alphabetic AND A7a=full-remap",
    when: (a) => a.scriptClass === "alphabetic" && a.remapPosture === "full-remap",
    primary: "S-06",
    secondaries: [{ strategy: "S-04" }, { strategy: "S-08" }],
  },
  {
    rule: 11,
    conditionText: "A1=tiny AND A3=strong",
    when: (a) => a.scale === "tiny" && a.phoneticIntuition === "strong",
    primary: "S-01",
    secondaries: [],
  },
  {
    rule: 12,
    conditionText: "(fallback — no earlier rule matched)",
    when: () => true,
    primary: "S-03",
    secondaries: [],
  },
];

/**
 * Post-primary passes, in evaluation order: the S-11 wrapper (added when a
 * NON-rule-4 primary fires under a two-orthography keyboard), then rule 9
 * (loud → S-10) and rule 10 (fully booked → S-08).
 */
export const SECONDARY_RULES: readonly SecondaryRuleDef[] = [
  {
    id: "S-11-wrapper",
    conditionText: "A5=two-orthography AND primary rule ≠ 4",
    when: (a, triggeredRule) =>
      triggeredRule !== 4 && a.multiMode === "two-orthography",
    add: "S-11",
  },
  {
    id: 9,
    conditionText: "A6=loud",
    when: (a) => a.constraintEnforcement === "loud",
    add: "S-10",
  },
  {
    id: 10,
    conditionText: "A7=fully booked",
    when: (a) => a.spareKeyAvailability === "fully booked",
    add: "S-08",
  },
];
