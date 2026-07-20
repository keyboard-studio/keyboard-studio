/**
 * Added-char-count classifier (spec 043 US1, T011) — character-content archetype.
 *
 * Axis A1 (adaptation distance): how many characters the base produces BEYOND a
 * stock physical layout. Computed by diffing the base's produced-character set
 * — `buildProducedSet(ir)` unioned with the spec-040 base-layout fall-through
 * fold — against the stock `kbdus` char set from the pinned
 * `data/base-layouts.json` (FR-011, research Decision 2). No character walk is
 * re-derived: the same produced set the `script`/`target-mix` facets read.
 *
 * The emitted `value` is the spec-§7 axis-A1 BAND (tiny/small/medium/large/
 * massive); the raw count is carried in `evidenceSize` (and echoed in `notes`)
 * so both are surfaced (data-model: band via value, count via evidenceSize).
 *
 * Band boundaries follow spec §7 axis A1 (tiny <5 / small 5–20 / medium 20–100
 * / large 100–300 / massive 1000+). The §7 numeric hints leave a gap between the
 * `large` top (300) and the `massive` hint (1000+); we make the bands CONTIGUOUS
 * at 300 so no count is unbanded — every count ≥ 300 reads `massive` (the
 * logographic-IME territory the hint describes). Deterministic and auditable.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { loadBaseLayoutTable, leakedChars, hasBaseLayerRuleSurface, DEFAULT_BASELAYOUT } from "./base-layout.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import { undeterminedFallback } from "./measurement.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** Axis-A1 band labels, low → high (the facet's enum value set). */
export type A1Band = "tiny" | "small" | "medium" | "large" | "massive";

/** Contiguous axis-A1 band for a non-negative added-char count (spec §7 A1). */
export function a1Band(count: number): A1Band {
  if (count < 5) return "tiny";
  if (count < 20) return "small";
  if (count < 100) return "medium";
  if (count < 300) return "large";
  return "massive";
}

/** The stock physical-layout char set — the pinned `kbdus` base-layout values (a–z). */
function stockBaseLayoutChars(): Set<string> {
  const table = loadBaseLayoutTable();
  return new Set(table.get(DEFAULT_BASELAYOUT)?.values() ?? []);
}

/**
 * The base's full produced-character set: the rule outputs (`buildProducedSet`)
 * unioned with the spec-040 base-layout fall-through leak — but only when the
 * base has a desktop base-layer rule surface, exactly as spec 040 gates the
 * fold. A touch-only base names no base-layer vkey (leaking the full alphabet is
 * meaningless there), so its fall-through fold is skipped.
 */
function producedWithFallthrough(ir: KeyboardIR): Set<string> {
  const produced = new Set(buildProducedSet(ir));
  if (hasBaseLayerRuleSurface(ir)) {
    for (const ch of leakedChars(ir)) produced.add(ch);
  }
  return produced;
}

/**
 * Content-derived added-char count, or `null` when the base produces nothing at
 * all (empty/opaque-only) — the caller falls through to the undetermined
 * fallback. Never throws.
 */
export function classifyAddedCharCount(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def;

  const produced = producedWithFallthrough(ir);
  if (produced.size === 0) return null;

  const stock = stockBaseLayoutChars();
  let count = 0;
  for (const ch of produced) {
    if (!stock.has(ch)) count += 1;
  }

  const band = a1Band(count);
  const confidenceClass: ConfidenceClass = ir.raw.length > 0 ? "mixed" : "confident";

  return {
    value: band,
    confidence: null,
    confidenceClass,
    provenanceTier: "content-derived",
    evidenceSize: count, // the raw added-char count; `value` is its axis-A1 band
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: 1, // a single keyboard-level count → a single determinate band
    notes: `${count} character(s) added beyond stock ${DEFAULT_BASELAYOUT} (axis A1 band: ${band})`,
  };
}

/**
 * Fallback: reached when the base produces no characters at all or `parse()`
 * threw. There is no declared-metadata source for an added-char count, so this
 * is an honest `undetermined` at the fallback tier (never a forced band).
 */
export function addedCharCountFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no produced characters (empty/opaque-only or parse failure); added-char count undetermined");
}
