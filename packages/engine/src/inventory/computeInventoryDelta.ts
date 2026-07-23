/**
 * computeInventoryDelta — pure §8 Phase B coverage diff.
 *
 * Given a needed character inventory (already discovered by one of the Phase B
 * methods — see @keyboard-studio/contracts characterDiscovery.ts) and a base
 * KeyboardIR, partitions `needed` into `missing` (the worklist) and `covered`
 * (already produced by the base), and flags whether that verdict is fully
 * trustworthy via `coverageComplete`.
 *
 * Reuses `producedGlyphs` (this module's sibling) for base-coverage discovery
 * rather than re-walking the IR — `producedGlyphs` already returns an NFC,
 * sorted, deadkey/space-filtered string[].
 *
 * Comparison is NFC-based (the needed `char` is normalized before the Set
 * membership test), but the `char` value on returned items is the caller's
 * original, un-normalized form — only used for the membership check.
 *
 * Pure, synchronous, no I/O, no CLDR/LLM calls. `needed` is expected to be
 * pre-computed by a discovery method upstream; this module does not discover
 * or harvest characters itself.
 */

import type { KeyboardIR, InventoryChar } from "@keyboard-studio/contracts";
import { producedGlyphs } from "./producedGlyphs.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InventoryDelta {
  /** Needed chars NOT produced by the base — the worklist. Each retains its source `method` tag. */
  missing: InventoryChar[];
  /** Needed chars the base already produces. */
  covered: InventoryChar[];
  /**
   * False when the base IR contains opaque RawKmnFragment node(s) lacking
   * `producedOutput`: their output is invisible, so a `missing` verdict may be
   * a false positive (coverage unknowable). True when every produced
   * character is accounted for.
   */
  coverageComplete: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * True when `ir.raw` contains at least one opaque fragment whose codec-
 * extracted `producedOutput` sketch is absent or empty — its actual output is
 * invisible to static analysis, so `producedGlyphs` cannot have accounted for
 * whatever it emits.
 */
function hasUnaccountedOpaqueFragment(ir: KeyboardIR): boolean {
  return ir.raw.some(
    (frag) => frag.producedOutput === undefined || frag.producedOutput.length === 0,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Diff a needed-character inventory against what a base keyboard already
 * produces.
 *
 * @param needed  - The confirmed target inventory (from any Phase B discovery
 *                  method). Not mutated; the returned `covered`/`missing`
 *                  items are fresh shallow copies with `inBaseOutput` stamped
 *                  to match their bucket (`true` for `covered`, `false` for
 *                  `missing`) — every other field, including `method`, is
 *                  preserved unchanged.
 * @param baseIr  - The base keyboard's parsed IR.
 * @param options - Forwarded to `producedGlyphs` (e.g. `includeSpace`).
 * @returns An `InventoryDelta` partitioning `needed` into `missing`/`covered`.
 *
 * @example
 * ```ts
 * const { missing, covered, coverageComplete } = computeInventoryDelta(needed, baseIr);
 * const worklist = missing; // characters Phase B still needs to place
 * ```
 */
export function computeInventoryDelta(
  needed: InventoryChar[],
  baseIr: KeyboardIR,
  options: { includeSpace?: boolean } = {},
): InventoryDelta {
  const produced = new Set(producedGlyphs(baseIr, options));

  const missing: InventoryChar[] = [];
  const covered: InventoryChar[] = [];

  for (const item of needed) {
    // producedGlyphs output is already NFC; normalize the needed char to match
    // before the Set membership test (ad-hoc convention — no shared NFC helper).
    // Only used for the membership check — the returned `char` is the item's
    // original, un-normalized form.
    const normalized = item.char.normalize("NFC");
    // Source-agnostic by design: `method` is preserved as-is on the returned
    // char, unchanged. The richer 4-way CLDR main/aux/harvest/author source
    // split is a deferred need-side concern, out of scope for this pure delta.
    if (produced.has(normalized)) {
      covered.push({ ...item, inBaseOutput: true });
    } else {
      missing.push({ ...item, inBaseOutput: false });
    }
  }

  return {
    missing,
    covered,
    coverageComplete: !hasUnaccountedOpaqueFragment(baseIr),
  };
}
