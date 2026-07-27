/**
 * Diacritic-mechanism classifier (spec 043 US2, T029) — rule-structure archetype.
 *
 * Axis A4 (how the base applies diacritics): value ∈ {stacking-combining,
 * replacing-cycling, multi-family, none} (FR-020, data-model). A4 is a
 * BEHAVIOURAL distinction — does applying a mark ADD to a plain base, or REPLACE
 * the mark already on it (tone-cycling)? — not a syntactic one. Real corpus
 * keyboards implement both almost entirely through `any(base) + markKey >
 * index(accentedStore)` table-lookup composition (el_pasifika, vietnamese_telex),
 * with raw combining-mark output and `dk()` deadkeys as minority idioms. So the
 * classifier reads each diacritic-producing rule behaviourally:
 *
 *   A rule is a diacritic SITE when its output is diacritic-bearing — a raw
 *   Unicode combining mark (\p{M}), or an accented character (NFD-decomposes to
 *   base + combining mark), whether emitted directly or via `index()/outs()` into
 *   a store of accented characters.
 *
 *   - "add" site (→ stacking)  — a raw combining-mark output (it stacks onto the
 *     preceding base), OR an accented output over a PLAIN matched base (a plain
 *     letter gains a mark).
 *   - "replace" site (→ cycling) — an accented output over a base that is ALREADY
 *     accented (a `dk()` deadkey compose, or a matched `any(accentedStore)`): the
 *     mark on the base is swapped, the tone-cycling behaviour.
 *   A precomposed accented character on a plain key with NO matched base context
 *   is a direct character placement, not a mechanism, and contributes no site.
 *
 * Keyboard value: `none` when no site; otherwise the plurality of add vs replace
 * sites, with `multi-family` when BOTH mechanisms are substantially present (the
 * minority is at least MULTI_FAMILY_MIN_SHARE of all sites) — a base that both
 * adds and cycles marks. The share boundary is the deterministic, auditable
 * tie-break, validated against the three spec §7.5 A4 exemplars (el_pasifika →
 * stacking-combining, vietnamese_telex → replacing-cycling, sil_euro_latin →
 * multi-family).
 */

import type { ContextElement, KeyboardIR, OutputElement } from "@keyboard-studio/contracts";

import { computeAnalyzedCoverage } from "./outcome.js";
import { undeterminedFallback } from "./measurement.js";
import { eachRule, ruleContextPrefix } from "./ir-scan.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const COMBINING_MARK = /\p{M}/u;
/**
 * When both add and replace sites are present, the keyboard reads `multi-family`
 * only if the minority mechanism is at least this share of all sites; below it,
 * the plurality wins (so a tone keyboard with a few plain→toned first-application
 * rules amid many toned→toned cycle rules still reads `replacing-cycling`).
 * Tuned against the §7.5 exemplars.
 */
const MULTI_FAMILY_MIN_SHARE = 0.25;

/** A character is diacritic-bearing when its NFD form carries a combining mark. */
function isAccented(ch: string): boolean {
  return COMBINING_MARK.test(ch.normalize("NFD"));
}

// ---------------------------------------------------------------------------
// Store resolution (char members, expanding outs() composition)
// ---------------------------------------------------------------------------

/**
 * The concrete character members of a store, expanding `outs(other)` composition
 * (which the codec preserves as `raw` items) transitively. Non-character members
 * (vkey/deadkey/any) are ignored — only literal characters matter for the
 * accented/plain test. Cycle-safe via `seen`.
 */
function resolveStoreChars(ir: KeyboardIR, name: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const store = ir.stores.find((s) => s.name === name);
  if (!store) return [];
  const chars: string[] = [];
  for (const item of store.items) {
    if (item.kind === "char") {
      chars.push(item.value);
    } else if (item.kind === "raw") {
      for (const m of item.text.matchAll(/outs\(\s*([A-Za-z0-9_]+)\s*\)/g)) {
        chars.push(...resolveStoreChars(ir, m[1]!, seen));
      }
    }
  }
  return chars;
}

/** True when a store has at least one accented member (a store of accented forms). */
function storeHasAccented(ir: KeyboardIR, name: string): boolean {
  return resolveStoreChars(ir, name).some(isAccented);
}

// ---------------------------------------------------------------------------
// Per-rule mechanism
// ---------------------------------------------------------------------------

/** True when the rule emits a raw Unicode combining mark directly. */
function outputsRawCombining(output: OutputElement[]): boolean {
  return output.some((el) => el.kind === "char" && COMBINING_MARK.test(el.value));
}

/** True when the rule's output is diacritic-bearing (accented char or store of accented chars). */
function outputIsDiacritic(ir: KeyboardIR, output: OutputElement[]): boolean {
  for (const el of output) {
    if (el.kind === "char" && isAccented(el.value)) return true;
    if (el.kind === "index" && storeHasAccented(ir, el.storeRef)) return true;
    if (el.kind === "outs" && storeHasAccented(ir, el.storeRef)) return true;
  }
  return false;
}

/** Is the matched base (context before the struck key) already accented? */
function baseIsAccented(ir: KeyboardIR, prefix: ContextElement[]): boolean {
  for (const el of prefix) {
    if (el.kind === "deadkey") return true; // a deadkey compose replaces the armed state
    if (el.kind === "char" && isAccented(el.value)) return true;
    if ((el.kind === "any" || el.kind === "index") && storeHasAccented(ir, el.storeRef)) return true;
  }
  return false;
}

/** Does the prefix name any concrete base to compose onto (char / store / deadkey)? */
function prefixHasBase(prefix: ContextElement[]): boolean {
  return prefix.some((el) => el.kind === "char" || el.kind === "any" || el.kind === "index" || el.kind === "deadkey");
}

type SiteKind = "add" | "replace" | null;

function siteKindOf(ir: KeyboardIR, rule: KeyboardIR["groups"][number]["rules"][number]): SiteKind {
  // A raw combining mark in the output stacks onto the preceding base — an add.
  if (outputsRawCombining(rule.output)) return "add";
  if (!outputIsDiacritic(ir, rule.output)) return null; // not diacritic-bearing — no site.

  const prefix = ruleContextPrefix(rule);
  if (!prefixHasBase(prefix)) return null; // accented char on a bare key = direct placement, not a mechanism.
  return baseIsAccented(ir, prefix) ? "replace" : "add";
}

/**
 * Content-derived diacritic mechanism. Never throws. Returns a content-derived
 * `none` when the base has rules but no diacritic-producing rule; null only when
 * there are no rules at all so the caller falls through to the fallback.
 */
export function classifyDiacriticMechanism(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def; // every emitted value is one of the four members, within limits by construction.

  const allRules = eachRule(ir);
  if (allRules.length === 0) return null; // no rule surface — fall through.

  let add = 0;
  let replace = 0;
  for (const { rule } of allRules) {
    const kind = siteKindOf(ir, rule);
    if (kind === "add") add += 1;
    else if (kind === "replace") replace += 1;
  }
  const total = add + replace;

  const base = {
    confidence: null,
    provenanceTier: "content-derived" as const,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: (ir.raw.length > 0 ? "partially" : "fully") as Categorization["analysisOutcome"],
  };

  if (total === 0) {
    return {
      ...base,
      value: "none",
      confidenceClass: "confident",
      evidenceSize: 0,
      consistency: 1,
      notes: "no combining-mark, deadkey-compose, or table-composition diacritic rule; no diacritic mechanism",
    };
  }

  const minorityShare = Math.min(add, replace) / total;
  let value: string;
  if (add > 0 && replace > 0 && minorityShare >= MULTI_FAMILY_MIN_SHARE) {
    value = "multi-family";
  } else if (replace > add) {
    value = "replacing-cycling";
  } else if (add > replace) {
    value = "stacking-combining";
  } else {
    // Exact tie below the multi-family share (only reachable at add===replace and
    // 2*add/total < 0.25, impossible; kept for total determinism) — pick
    // lexicographically.
    value = "replacing-cycling";
  }

  const dominantShare = Math.max(add, replace) / total;
  const confidenceClass: ConfidenceClass = value === "multi-family" ? "mixed" : dominantShare >= 0.8 ? "confident" : "mixed";

  return {
    ...base,
    value,
    confidenceClass,
    evidenceSize: total,
    consistency: value === "multi-family" ? minorityShare : dominantShare,
    notes: `${add} add-site(s), ${replace} replace-site(s) over ${total} diacritic rule(s)`,
  };
}

/**
 * Fallback: reached when the base has no rule surface (empty/opaque-only) or
 * `parse()` threw. No declared-metadata source names a diacritic mechanism, so
 * this is an honest `undetermined` at the fallback tier.
 */
export function diacriticMechanismFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no rule surface (empty/opaque-only or parse failure); diacritic mechanism undetermined");
}
