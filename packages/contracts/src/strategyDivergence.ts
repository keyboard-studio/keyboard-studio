// see specs/007-strategy-selection/spec.md §7.5.1 — corpus-scale evaluation
// of the §7.2 decision tree.
//
// A `StrategyDivergence` is emitted for every corpus keyboard whose
// recognizer-dominant strategy disagrees with the strategy the §7.2 decision
// tree selects from the axis vector derived out of that same keyboard's IR.
// It is an OFFLINE corpus-evaluation artifact (produced by
// utilities/corpus-eval over a keymanapp/keyboards `release/` tree, in the
// supportability-scanner tradition of §13): it never runs inside the author's
// survey walk and is never a `Pattern` (§5) — the §7.5.1 amendment
// forward-declared this type as prose only; this module is the declaration.
//
// Divergence *clusters* — many keyboards mis-routed the same way — are the
// tree-rule discovery mechanism: the EuroLatin and IPA mismatches in the §7.5
// hand table were found by hand; the corpus pass finds the rest. A record
// therefore carries enough provenance to triage the disagreement without
// re-running the pass: the full derived axis vector, the tree's pick, the
// recognizer's tally, and the import-fidelity context.

import type { DiscoveryAxisVector } from "./axes";
import type { AxisFill } from "./axisFill";
import type { ImportStatus } from "./keyboard-ir";
import type { PrimaryRuleNumber, StrategyId } from "./strategy";

/**
 * Agreement test (§7.5.1): a keyboard AGREES when its recognizer-dominant
 * strategy is the tree's primary OR one of the tree's secondaries. The
 * secondary clause is what the §7.5 hand table already encodes — e.g.
 * `sil_yoruba8` counts as agreement because the tree wraps its pick in S-11
 * (a secondary) while S-11 is the keyboard's dominant recognized strategy.
 * Anything else is a divergence and produces one of these records.
 */
export interface StrategyDivergence {
  /** Keyboard id — the `<id>` directory name within the corpus `release/` tree. */
  keyboardId: string;
  /**
   * Corpus-relative path of the evaluated `.kmn` (forward slashes), e.g.
   * `release/sil/sil_euro_latin/source/sil_euro_latin.kmn`. Provenance for
   * re-checking the record against the exact source it was derived from.
   */
  sourcePath: string;
  /**
   * Import-fidelity status the keyboard passed Layer A′ with — the §7.5.1
   * round-trip only runs over keyboards that pass, so this is always one of
   * the two clean statuses. (`ParseFailure` / `RoundTripDivergence` keyboards
   * are counted in the run summary, never given a record.)
   */
  importStatus: ImportStatus;
  /** The full axis vector the tree ran on (derived values + prior fills). */
  axes: DiscoveryAxisVector;
  /**
   * Provenance for every axis value the script-class prior filled rather than
   * the extractor derived from IR structure — mirrors the `axisFills`
   * round-trip on the survey result (§7.2), so a triage reader can tell
   * "measured" from "assumed the unmarked default".
   */
  axisFills: AxisFill[];
  /** The §7.2 tree's primary strategy for {@link axes}. */
  treePrimary: StrategyId;
  /** The §7.2 tree's secondaries for {@link axes} (may be empty). */
  treeSecondaries: StrategyId[];
  /** The §7.2 rule that fixed the primary (provenance for cluster triage). */
  triggeredRule: PrimaryRuleNumber;
  /**
   * The dominant `strategyId` among the keyboard's recognized patterns —
   * arg-max of {@link recognizedTally}. On a tie the arg-max is the
   * lexicographically smallest tied id and {@link recognizedTally} shows the
   * tie; the tally is the authority, this field is its headline.
   */
  recognizedPrimary: StrategyId;
  /**
   * Owned-rule counts per recognized strategy (the recognizer's tally the
   * dominant was taken from). Only strategies the recognizer actually lifted
   * appear; counts sum to the number of recognized rules.
   */
  recognizedTally: Partial<Record<StrategyId, number>>;
  /** Fraction of the keyboard's rules the recognizer lifted (0–1). */
  recognizedRatio: number;
}

/**
 * A cluster of divergences that share one mis-routing signature — the unit
 * tree-rule discovery works on (§7.5.1). Two records cluster together when
 * the tree picked the same primary by the same rule while the recognizer's
 * dominant strategy was the same different strategy.
 */
export interface StrategyDivergenceCluster {
  /** The tree's primary for every member. */
  treePrimary: StrategyId;
  /** The §7.2 rule that fixed that primary for every member. */
  triggeredRule: PrimaryRuleNumber;
  /** The recognizer-dominant strategy every member actually uses. */
  recognizedPrimary: StrategyId;
  /** Number of keyboards in the cluster. */
  count: number;
  /** Member keyboard ids, sorted. */
  keyboardIds: string[];
}
