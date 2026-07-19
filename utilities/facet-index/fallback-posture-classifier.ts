/**
 * Fallback-posture classifier (spec 041 US1, T014) — rule-structure archetype.
 *
 * Value ∈ {relies-on, blocks-comprehensively, mixed}: does the keyboard handle
 * every physical key itself, or rely on the OS base layout to fall through for
 * keys it leaves unruled (FR-015, AS-6)?
 *
 * Model: one analyzed SITE per standard physical character key. A key with an
 * explicit rule reads `blocks-comprehensively`; an unruled key "leaks" to the OS
 * layout and reads `relies-on` — so the leaked keys ARE the exception sites when
 * a comprehensive keyboard misses a few. Consistency = share of keys agreeing
 * with the dominant posture; a genuinely split keyboard (neither posture clearly
 * dominant) reads `mixed`.
 *
 * The `&baselayout` reliance is a packaging default when no `baselayout(...)`
 * context appears: recorded as **defaulted** in `notes`, not declared (FR-015).
 * Modality is physical desktop keys only.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { assembleMeasurement, neutralContext, undeterminedFallback } from "./measurement.js";
import { eachRule, ruleVkeys } from "./ir-scan.js";
import type { AnalyzedSite } from "./measurement.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** The standard US character-producing physical keys (the fall-through universe). */
const STANDARD_PHYSICAL_KEYS: readonly string[] = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `K_${c}`),
  ..."0123456789".split("").map((d) => `K_${d}`),
  "K_BKQUOTE", "K_HYPHEN", "K_EQUAL", "K_LBRKT", "K_RBRKT", "K_BKSLASH",
  "K_COLON", "K_QUOTE", "K_COMMA", "K_PERIOD", "K_SLASH",
];

/** Below this dominant share, the keyboard's posture reads genuinely `mixed`. */
const MIXED_BELOW = 0.6;

export function classifyFallbackPosture(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def;
  const ctx = neutralContext(ir);

  const ruled = new Set<string>();
  let usesBaselayout = false;
  for (const { rule } of eachRule(ir)) {
    for (const vk of ruleVkeys(rule)) ruled.add(vk);
    if (rule.context.some((el) => el.kind === "baselayout")) usesBaselayout = true;
  }

  // No keystroke rules at all — no posture to read.
  if (ruled.size === 0) return null;

  const sites: AnalyzedSite[] = STANDARD_PHYSICAL_KEYS.map((vk) => ({
    location: `key:${vk}`,
    value: ruled.has(vk) ? "blocks-comprehensively" : "relies-on",
  }));

  const cat = assembleMeasurement({
    sites,
    ctx,
    ir,
    notes: `baselayout fallthrough ${usesBaselayout ? "declared via baselayout()" : "defaulted (packaging default)"}`,
  });
  if (typeof cat.consistency === "number" && cat.consistency < MIXED_BELOW) cat.value = "mixed";
  return cat;
}

export function fallbackPostureFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no keystroke rules; fallback-posture undetermined");
}
