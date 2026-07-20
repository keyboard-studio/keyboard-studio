/**
 * Reordering-rules classifier (spec 041 US1, T017) — rule-structure archetype.
 *
 * Value ∈ {none, group-reorder-swap, inline-swap, mixed}, read from the parsed
 * rule structure:
 *   - `group-reorder-swap` — rules living in a dedicated `group(reorder…)` (the
 *     conventional home for context()-swap reorder rules);
 *   - `inline-swap` — a rule OUTSIDE a reorder group whose context references a
 *     prior `context(n)` element, i.e. it rearranges an already-emitted
 *     sequence inline amongst the output rules;
 *   - `none` — no reordering shape at all;
 *   - `mixed` — both shapes present.
 *
 * These are structural starter signals (measurement-only, FR-042): reorder
 * BEHAVIOUR is not modelled here, only its rule shape.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { assembleMeasurement, neutralContext, undeterminedFallback } from "./measurement.js";
import { eachRule } from "./ir-scan.js";
import type { AnalyzedSite } from "./measurement.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const REORDER_GROUP = /reorder/i;

export function classifyReorderingRules(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def;
  const ctx = neutralContext(ir);

  const sites: AnalyzedSite[] = [];
  for (const { group, rule, location } of eachRule(ir)) {
    if (REORDER_GROUP.test(group.name)) {
      sites.push({ location, value: "group-reorder-swap" });
    } else if (rule.context.some((el) => el.kind === "context")) {
      sites.push({ location, value: "inline-swap" });
    }
  }

  if (sites.length === 0) {
    return assembleMeasurement({
      sites: [{ location: "keyboard", value: "none" }],
      ctx,
      ir,
      dominant: "none",
      notes: "no reorder group and no inline context-swap rules",
    });
  }

  return assembleMeasurement({ sites, ctx, ir, mixedValue: "mixed" });
}

export function reorderingRulesFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no rule structure; reordering-rules undetermined");
}
