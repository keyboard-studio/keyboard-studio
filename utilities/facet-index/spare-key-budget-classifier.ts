/**
 * Spare-key-budget classifier (spec 043 US2, T031) — rule-structure archetype.
 *
 * Axis A7 (how much room the base has to place more characters): value ∈
 * {many, ralt-only, fully-booked} (FR-022, data-model). Read from how saturated
 * the base's SHIFT and AltGr (RALT) planes are over the stock physical key set.
 *
 * The base (unshifted) plane is the always-occupied primary layer on desktop —
 * every physical char key either produces directly or falls through to the OS
 * layout — so it carries no spare budget and is excluded. The spare budget lives
 * in the SHIFT and AltGr planes. Reserved system combos (Ctrl/Alt chords that are
 * not AltGr) are excluded — they are not available placement slots (FR-022).
 *
 * Over the stock `kbdus` physical char keys (N ≈ 47, the pinned base-layout
 * table), we count the distinct keys the base's rules BIND in each plane:
 *   - `many`         — the SHIFT plane is less than half bound: lots of primary
 *                      spare room, regardless of AltGr.
 *   - `ralt-only`    — SHIFT is at least half bound but the AltGr plane is not:
 *                      the remaining budget is the AltGr plane.
 *   - `fully-booked` — both SHIFT and AltGr planes are at least half bound: little
 *                      room left anywhere.
 * Half-of-N is the deterministic saturation boundary (auditable, tunable), the
 * same style of contiguous banding `added-char-count` uses for axis A1.
 */

import type { ContextElement, KeyboardIR } from "@keyboard-studio/contracts";

import { loadBaseLayoutTable, DEFAULT_BASELAYOUT } from "./base-layout.js";
import { undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import { eachRule, ruleKey } from "./ir-scan.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** Modifiers that mark a rule as a reserved system chord (excluded from budget). */
const RESERVED_MODIFIERS = new Set(["CTRL", "LCTRL", "RCTRL", "ALT", "LALT"]);
/** Modifiers that select the AltGr plane. */
const ALTGR_MODIFIERS = new Set(["RALT", "ALTGR"]);

export type SpareKeyBudget = "many" | "ralt-only" | "fully-booked";

/** The plane a struck-key context element occupies, or null when it is not a physical-key press / is reserved. */
function planeOf(key: ContextElement | undefined): "shift" | "altgr" | "base" | null {
  if (key === undefined || key.kind !== "vkey") return null;
  const mods = key.modifiers;
  if (mods.some((m) => ALTGR_MODIFIERS.has(m))) return "altgr";
  if (mods.some((m) => RESERVED_MODIFIERS.has(m))) return null; // reserved system chord
  if (mods.includes("SHIFT")) return "shift";
  return "base";
}

/** The stock `kbdus` physical char-key vkey set (the placement universe). */
function stockKeys(): Set<string> {
  const table = loadBaseLayoutTable();
  return new Set(table.get(DEFAULT_BASELAYOUT)?.keys() ?? []);
}

/**
 * Content-derived spare-key budget, or null when the base binds no physical key
 * at all (empty/opaque-only) so the caller falls through to the fallback. Never
 * throws.
 */
export function classifySpareKeyBudget(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def; // every emitted value is one of the three members, within limits by construction.

  const keys = stockKeys();
  const n = keys.size;
  if (n === 0) return null; // no pinned key set — nothing to measure.

  const shiftBound = new Set<string>();
  const altgrBound = new Set<string>();
  let sawStockKey = false;

  for (const { rule } of eachRule(ir)) {
    const key = ruleKey(rule);
    if (key === undefined || key.kind !== "vkey" || !keys.has(key.name)) continue;
    // A stock physical key is pressed here — the base HAS a physical-key surface
    // to measure, even if this particular rule is a reserved (Ctrl/Alt) chord we
    // exclude from the budget.
    sawStockKey = true;
    const plane = planeOf(key);
    if (plane === null) continue; // reserved system chord — not an available slot.
    if (plane === "shift") shiftBound.add(key.name);
    else if (plane === "altgr") altgrBound.add(key.name);
  }

  if (!sawStockKey) return null; // no physical-key rules — fall through.

  const half = n / 2;
  const shiftSaturated = shiftBound.size >= half;
  const altgrSaturated = altgrBound.size >= half;

  let value: SpareKeyBudget;
  if (!shiftSaturated) value = "many";
  else if (!altgrSaturated) value = "ralt-only";
  else value = "fully-booked";

  return {
    value,
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    evidenceSize: shiftBound.size + altgrBound.size,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: 1, // a single keyboard-level budget determination
    notes: `${shiftBound.size}/${n} shift-plane and ${altgrBound.size}/${n} AltGr-plane keys bound over stock ${DEFAULT_BASELAYOUT}`,
  };
}

/**
 * Fallback: the base binds no physical key (empty/opaque-only) or `parse()`
 * threw. No declared-metadata source names a spare-key budget, so this is an
 * honest `undetermined`.
 */
export function spareKeyBudgetFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no physical-key rules (empty/opaque-only or parse failure); spare-key budget undetermined");
}
