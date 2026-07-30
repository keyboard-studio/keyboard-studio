// The single authoritative key-budget determination (spec 052 FR-016, SC-008).
//
// One measurement, read by every consumer; nothing computes key availability
// independently. Before this module the project carried three competing
// notions, only one of which actually computed anything:
//
//   - the numeric `spareKeys` parameter on the marks-station prefill — a hole
//     with no producer, so a fully-booked base was always reported affordable;
//   - axis A7 `spareKeyAvailability` — also no producer, and its literal values
//     are §7.1 prose DISPLAY strings documented as unsafe for use as map keys;
//   - the facet-index `spare-key-budget` classifier — the only real,
//     deterministic, tested measurement.
//
// The third is promoted here verbatim. This is a RELOCATION, not a redesign:
// the algorithm, the pinned key table, the plane exclusions, and the half-of-N
// boundary are all unchanged, so the facet index's shipped values do not move.
// The classifier becomes a thin delegate, and A7 becomes a documented
// projection (see `keyBudgetToSpareKeyAvailability`).
//
// Contracts is the right home rather than engine because `utilities/facet-index`
// must keep reading it and a utility may not be depended upon by a package.
// Contracts is the shared floor both already import, and it already hosts
// comparable IR-analysis helpers (`buildProducedSet`).

import type { ContextElement, IRRule, KeyboardIR } from "./keyboard-ir";
import type { SpareKeyAvailability } from "./axes";
import baseLayoutsData from "../data/base-layouts.json" with { type: "json" };

/** The three availability bands. Programmatic form — safe as a map key. */
export type KeyBudgetBand = "many" | "ralt-only" | "fully-booked";

export interface KeyBudget {
  band: KeyBudgetBand;
  /** Unbound stock keys in the planes the band says are still available. */
  spareKeys: number;
  /** Measurement provenance: plane counts over the pinned stock layout. */
  notes: string;
  /**
   * The same plane counts `notes` renders in prose, in machine-readable form.
   *
   * Additive to the three fields
   * [contracts/key-budget.md](../../../specs/052-marks-treatment-question/contracts/key-budget.md)
   * pins, and deliberately so: the facet-index classifier reports the total
   * bound-key count as its `evidenceSize`, and the only alternative to exposing
   * it here is either re-deriving the plane analysis in the tool (the exact
   * duplication FR-016 exists to remove) or parsing `notes` back out of prose.
   */
  planes: {
    /** Distinct stock keys the base binds in the SHIFT plane. */
    shiftBound: number;
    /** Distinct stock keys the base binds in the AltGr plane. */
    altgrBound: number;
    /** N — the size of the pinned stock physical char-key universe. */
    stockKeys: number;
  };
}

/** The host-environment default base layout — the placement universe's family. */
export const DEFAULT_BASELAYOUT = "kbdus";

/**
 * The pinned stock base-layout table, `family -> (vkey -> unshifted char)`.
 * Relocated from `utilities/facet-index/data/` by spec 052 so this module and
 * the facet index read the same bytes; the file and its sha256 pin are
 * unchanged (see `utilities/facet-index/data/SOURCES.json`).
 */
export const STOCK_BASE_LAYOUTS: Readonly<Record<string, Readonly<Record<string, string>>>> =
  baseLayoutsData as Record<string, Record<string, string>>;

/** Modifiers that mark a rule as a reserved system chord (excluded from budget). */
const RESERVED_MODIFIERS = new Set(["CTRL", "LCTRL", "RCTRL", "ALT", "LALT"]);
/** Modifiers that select the AltGr plane. */
const ALTGR_MODIFIERS = new Set(["RALT", "ALTGR"]);

/**
 * The plane a struck-key context element occupies, or null when it is not a
 * physical-key press or is a reserved system chord.
 */
function planeOf(key: ContextElement | undefined): "shift" | "altgr" | "base" | null {
  if (key === undefined || key.kind !== "vkey") return null;
  const mods = key.modifiers;
  if (mods.some((m) => ALTGR_MODIFIERS.has(m))) return "altgr";
  if (mods.some((m) => RESERVED_MODIFIERS.has(m))) return null; // reserved system chord
  if (mods.includes("SHIFT")) return "shift";
  return "base";
}

/**
 * The struck key a rule matches — the LAST context element. The IR flattens a
 * rule's whole left-hand side into `context[]` with no explicit `+` marker, so
 * the key is positional.
 */
function ruleKey(rule: IRRule): ContextElement | undefined {
  return rule.context[rule.context.length - 1];
}

/** The stock physical char-key vkey set (the placement universe). */
function stockKeys(): Set<string> {
  return new Set(Object.keys(STOCK_BASE_LAYOUTS[DEFAULT_BASELAYOUT] ?? {}));
}

/**
 * Measure a base keyboard's spare-key budget from its typed `KeyboardIR`.
 *
 * The base (unshifted) plane is EXCLUDED: on desktop every physical char key
 * either produces directly or falls through to the OS layout, so it carries no
 * spare budget. Reserved Ctrl/Alt chords are excluded — they are not available
 * placement slots. Over the pinned stock key set, the distinct keys the base's
 * rules BIND are counted per plane, and half-of-N is the saturation boundary
 * (the same deterministic banding style `added-char-count` uses for axis A1).
 *
 * | Band | Condition |
 * |---|---|
 * | `many` | SHIFT plane less than half bound — ample primary room |
 * | `ralt-only` | SHIFT at least half bound, AltGr not |
 * | `fully-booked` | both SHIFT and AltGr at least half bound |
 *
 * Returns `null` when the base binds no stock physical key at all (empty or
 * opaque-only), so a caller falls through to its own honest "undetermined" —
 * never silently to `"many"`. Never throws.
 *
 * This reads the IR only; it never parses `.kmn` text. `RawKmnFragment` nodes
 * are unmeasured coverage the caller reports, never silently dropped.
 */
export function measureKeyBudget(ir: KeyboardIR): KeyBudget | null {
  const keys = stockKeys();
  const n = keys.size;
  if (n === 0) return null; // no pinned key set — nothing to measure.

  const shiftBound = new Set<string>();
  const altgrBound = new Set<string>();
  let sawStockKey = false;

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const key = ruleKey(rule);
      if (key === undefined || key.kind !== "vkey" || !keys.has(key.name)) continue;
      // A stock physical key is pressed here — the base HAS a physical-key
      // surface to measure, even if this particular rule is a reserved chord we
      // exclude from the budget.
      sawStockKey = true;
      const plane = planeOf(key);
      if (plane === null) continue; // reserved system chord — not an available slot.
      if (plane === "shift") shiftBound.add(key.name);
      else if (plane === "altgr") altgrBound.add(key.name);
    }
  }

  if (!sawStockKey) return null; // no physical-key rules — fall through.

  const half = n / 2;
  const shiftSaturated = shiftBound.size >= half;
  const altgrSaturated = altgrBound.size >= half;

  const band: KeyBudgetBand = !shiftSaturated
    ? "many"
    : !altgrSaturated
      ? "ralt-only"
      : "fully-booked";

  // The count of unbound stock keys in the planes still available — a saturated
  // plane contributes nothing, so `fully-booked` is always exactly 0 and the
  // count can never go negative.
  const spareKeys =
    (shiftSaturated ? 0 : n - shiftBound.size) + (altgrSaturated ? 0 : n - altgrBound.size);

  return {
    band,
    spareKeys,
    notes:
      `${shiftBound.size}/${n} shift-plane and ${altgrBound.size}/${n} AltGr-plane ` +
      `keys bound over stock ${DEFAULT_BASELAYOUT}`,
    planes: { shiftBound: shiftBound.size, altgrBound: altgrBound.size, stockKeys: n },
  };
}

/**
 * Project the canonical band onto axis A7's display-string form.
 *
 * TOTAL and BIJECTIVE on the three bands, which is what preserves the FR-016
 * boundary exactly: §7.2 decision rule 10 (`A7 = "fully booked"` → append S-08)
 * fires on exactly the set of inputs it fires on today.
 *
 * The two naming systems are reconciled HERE, at the boundary, not by renaming
 * either side: the programmatic form keeps hyphenated lowercase ids, and A7
 * keeps its §7.1 prose display strings, which `axes.ts` documents as unsafe for
 * use as object keys. Do not use `SpareKeyAvailability` values as map keys —
 * project first.
 */
export function keyBudgetToSpareKeyAvailability(band: KeyBudgetBand): SpareKeyAvailability {
  switch (band) {
    case "many":
      return "many";
    case "ralt-only":
      return "RAlt only";
    case "fully-booked":
      return "fully booked";
  }
}
