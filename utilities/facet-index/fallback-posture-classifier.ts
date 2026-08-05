/**
 * Fallback-posture classifier (spec 041 US1, T014) — rule-structure archetype.
 *
 * Value ∈ {relies-on, blocks-comprehensively, mixed}: does the keyboard handle
 * every physical key itself, or rely on the OS base layout to fall through for
 * keys it leaves unruled (FR-015, AS-6)?
 *
 * Model: one analyzed SITE per standard physical character key. A key handled by
 * an UNCONDITIONAL keystroke rule (the bare keystroke is intercepted) reads
 * `blocks-comprehensively`; a key with no such rule "leaks" to the OS layout and
 * reads `relies-on` — so the leaked keys ARE the exception sites when a
 * comprehensive keyboard misses a few. Consistency = share of keys agreeing with
 * the dominant posture; a genuinely split keyboard reads `mixed`.
 *
 * A key handled only under a CONTEXT PREFIX (`";" + any(basekey) > …`, the
 * adiga_danef archetype) does NOT block: the bare keystroke still falls through
 * to the base layout, so such a rule is a base-layout overlay and reads
 * `relies-on`. A keyboard with keystroke rules but none unconditional is
 * therefore `relies-on`, not undetermined. The struck key is resolved to
 * physical keys via {@link physicalKeysForRuleKey} — a `[vkey]`, a char literal,
 * or `any(store)` all count (the pre-fix behaviour saw only positional vkeys and
 * dropped every store-driven keyboard to undetermined).
 *
 * The `&baselayout` reliance is a packaging default when no `baselayout(...)`
 * context appears: recorded as **defaulted** in `notes`, not declared (FR-015).
 * Modality is physical desktop keys only.
 */

import type { KeyboardIR, IRStore } from "@keyboard-studio/contracts";

import { assembleMeasurement, neutralContext, undeterminedFallback } from "./measurement.js";
import { eachRule, isKeystrokeRule, ruleKey, ruleContextPrefix } from "./ir-scan.js";
import { physicalKeysForRuleKey } from "./key-map.js";
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

  const stores: ReadonlyMap<string, IRStore> = new Map(ir.stores.map((s) => [s.name, s]));

  // A physical key BLOCKS only when an unconditional keystroke rule handles it;
  // a key handled only under a context prefix leaks the bare keystroke to base.
  const blocked = new Set<string>();
  let keystrokeRules = 0;
  let usesBaselayout = false;
  for (const { rule, group } of eachRule(ir)) {
    if (rule.context.some((el) => el.kind === "baselayout")) usesBaselayout = true;
    if (!isKeystrokeRule(rule, group)) continue;
    keystrokeRules += 1;
    // Unconditional = nothing but the struck key (baselayout scoping aside)
    // precedes it in the context.
    const unconditional = !ruleContextPrefix(rule).some((el) => el.kind !== "baselayout");
    if (!unconditional) continue;
    for (const vk of physicalKeysForRuleKey(ruleKey(rule), stores)) blocked.add(vk);
  }

  // No keystroke rules at all — no posture to read. (A keyboard WITH keystroke
  // rules but none unconditional is a base-layout overlay → relies-on, below.)
  if (keystrokeRules === 0) return null;

  const sites: AnalyzedSite[] = STANDARD_PHYSICAL_KEYS.map((vk) => ({
    location: `key:${vk}`,
    value: blocked.has(vk) ? "blocks-comprehensively" : "relies-on",
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
