/**
 * Caps-handling classifier (spec 041 US1, T011) — rule-structure archetype.
 *
 * Value ∈ {per-rule-duplication, any-index-fold, no-caps-rules, mixed}, read
 * from the parsed rule structure via the shared measurement assembly. GATED on
 * casing: a caseless keyboard (Arabic, Devanagari, …) has no uppercase variants,
 * so its caps-handling is not-applicable (FR-013, AS-4) — recorded as a
 * determinate `notApplicable`, never a forced value.
 *
 * Mechanism per keystroke rule:
 *   - `per-rule-duplication` — an explicit CAPS / NCAPS modifier on the rule
 *     (the author wrote a separate rule per case state).
 *   - `any-index-fold` — case-folding via `any(...)` context + `index(...)`
 *     output against a case-neutral store.
 * A keyboard whose caps rules use both mechanisms reads `mixed`; one with no
 * caps rules at all reads `no-caps-rules` (kmcmplib's automatic CAPS handling).
 */

import type { KeyboardIR, IRRule } from "@keyboard-studio/contracts";

import { assembleMeasurement, deriveScriptContext, notApplicableMeasurement, undeterminedFallback } from "./measurement.js";
import { eachRule } from "./ir-scan.js";
import type { AnalyzedSite } from "./measurement.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** An explicit CAPS / NCAPS modifier anywhere in the rule's context. */
function hasCapsModifier(rule: IRRule): boolean {
  return rule.context.some(
    (el) => el.kind === "vkey" && el.modifiers.some((m) => m === "CAPS" || m === "NCAPS"),
  );
}

/**
 * A case-fold shape: an `any(...)` context matched to an `index(...)` output.
 *
 * Starter heuristic (documented limitation): this matches on rule SHAPE only,
 * not on whether the referenced store is genuinely a case-neutral fold table. On
 * an abugida keyboard that also attests a cased Latin passthrough (so it clears
 * the caseless gate), a consonant/conjunct-formation `any→index` rule can be
 * counted as fold evidence. A store-semantics check (do the two stores form
 * case pairs?) is deferred — this measurement stays structural for v1.
 */
function isFold(rule: IRRule): boolean {
  const hasAny = rule.context.some((el) => el.kind === "any");
  const hasIndex = rule.output.some((el) => el.kind === "index");
  return hasAny && hasIndex;
}

export function classifyCapsHandling(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  const ctx = deriveScriptContext(ir, def);
  if (ctx.casing === "caseless") {
    return notApplicableMeasurement("script is caseless; caps-handling not applicable");
  }

  const capsSites: AnalyzedSite[] = [];
  for (const { rule, location } of eachRule(ir)) {
    // Not gated on isKeystrokeRule: a case-fold rule matches `any(store)` and
    // carries no vkey, but is exactly the any-index-fold shape we must catch.
    if (hasCapsModifier(rule)) capsSites.push({ location, value: "per-rule-duplication" });
    else if (isFold(rule)) capsSites.push({ location, value: "any-index-fold" });
  }

  if (capsSites.length === 0) {
    return assembleMeasurement({
      sites: [{ location: "keyboard", value: "no-caps-rules" }],
      ctx,
      ir,
      dominant: "no-caps-rules",
      notes: "no explicit CAPS/NCAPS or fold rules; relies on automatic case handling",
    });
  }

  // Both mechanisms present ⇒ the facet's explicit `mixed` value (the plurality
  // dominant + consistency still describe HOW mixed).
  return assembleMeasurement({ sites: capsSites, ctx, ir, mixedValue: "mixed" });
}

export function capsHandlingFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no rule structure; caps-handling undetermined");
}
