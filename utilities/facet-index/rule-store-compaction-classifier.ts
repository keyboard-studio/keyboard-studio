/**
 * Rule/store-compaction classifier (spec 041 US1, T018) — rule-structure.
 *
 * Value ∈ {inline-rules, consolidated-stores, mixed}, read from the parsed rule
 * structure:
 *   - `consolidated-stores` — a rule hoists its output into shared stores,
 *     referenced via `any(...)` context + `index(...)`/`outs(...)` output;
 *   - `inline-rules` — a rule writes its output character literals inline;
 *   - `mixed` — both shapes across the rule set.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { assembleMeasurement, neutralContext, undeterminedFallback } from "./measurement.js";
import { eachRule } from "./ir-scan.js";
import type { AnalyzedSite } from "./measurement.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

export function classifyRuleStoreCompaction(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def;
  const ctx = neutralContext(ir);

  const sites: AnalyzedSite[] = [];
  for (const { rule, location } of eachRule(ir)) {
    // Not gated on isKeystrokeRule: a consolidated rule matches `any(store)`
    // (no vkey) and outputs via `index(...)` — the exact store-compaction shape.
    const usesStore =
      rule.context.some((el) => el.kind === "any") ||
      rule.output.some((el) => el.kind === "index" || el.kind === "outs");
    const hasInline = rule.output.some((el) => el.kind === "char");
    if (usesStore) sites.push({ location, value: "consolidated-stores" });
    else if (hasInline) sites.push({ location, value: "inline-rules" });
  }

  if (sites.length === 0) return null; // no output-bearing keystroke rules — fall through

  return assembleMeasurement({ sites, ctx, ir, mixedValue: "mixed" });
}

export function ruleStoreCompactionFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no output-bearing rule structure; rule-store-compaction undetermined");
}
