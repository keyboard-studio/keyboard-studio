/**
 * Mandatory pre-filters for the placement post-pass.
 *
 * Filters run at two levels:
 *   - keyboard level:  isMnemonicKeyboard, hasNonUSBase
 *   - candidate level: dropPUACandidates, dedupCapsNcaps
 *
 * @see spec.md §7.6 (mnemonic/non-US exclusion, PUA drop, CAPS dedup)
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { PlacementCandidate } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Standard US-QWERTY letter-key map (unshifted BMP codepoint per vkey)
// ---------------------------------------------------------------------------

/**
 * Expected unshifted output for each letter vkey on a standard US keyboard.
 * This is the reference baseline used by hasNonUSBase to count deviations.
 */
const US_UNSHIFTED: Record<string, string> = {
  K_Q: "q", K_W: "w", K_E: "e", K_R: "r", K_T: "t",
  K_Y: "y", K_U: "u", K_I: "i", K_O: "o", K_P: "p",
  K_A: "a", K_S: "s", K_D: "d", K_F: "f", K_G: "g",
  K_H: "h", K_J: "j", K_K: "k", K_L: "l",
  K_Z: "z", K_X: "x", K_C: "c", K_V: "v", K_B: "b", K_N: "n", K_M: "m",
};

// ---------------------------------------------------------------------------
// Keyboard-level filters
// ---------------------------------------------------------------------------

/**
 * Accept predicate for the unshifted base layer: real keyboards encode it
 * with the NCAPS (caps-lock-off) modifier, so accept NCAPS-only alongside
 * bare rules; reject SHIFT/CAPS/AltGr layers.
 *
 * Shared by hasNonUSBase, detectBaseLayoutFamily, and hasInvertedNumberRow's
 * base-map read.
 */
const isBaseLayer = (_vkey: string, modifiers: string[]): boolean =>
  !modifiers.some((m) => m !== "NCAPS");

/**
 * Accept predicate for the Shift layer: requires SHIFT, rejects CAPS, and
 * allows NCAPS alongside SHIFT (real keyboards may encode the shifted state
 * as `[SHIFT NCAPS K_x]`).
 *
 * Used by hasInvertedNumberRow's shift-map read.
 */
const isShiftLayer = (_vkey: string, modifiers: string[]): boolean => {
  if (modifiers.includes("CAPS")) return false;
  if (!modifiers.includes("SHIFT")) return false;
  return !modifiers.some((m) => m !== "SHIFT" && m !== "NCAPS");
};

/**
 * Return true if this keyboard uses only the ANSI (positional) begin group and
 * has no Unicode begin group.  Mnemonic keyboards rely on the host OS's
 * character-map layer rather than Keyman rules, so placement extraction from
 * their IR would yield garbage.
 *
 * Detection: a Unicode keyboard declares at least one store whose name is
 * `"begin Unicode"` (case-insensitive, matching the codec's parse of
 * `begin Unicode > use(...)`).  An ANSI-only keyboard has `"begin ANSI"` and
 * no `"begin Unicode"`.
 *
 * @see spec.md §7.6 (mnemonic-exclusion filter)
 */
export function isMnemonicKeyboard(ir: KeyboardIR): boolean {
  // Prefer the encoding field set by the parser from the `begin` directive.
  if (ir.header.encoding !== undefined) {
    return ir.header.encoding === "ANSI";
  }
  // Fallback for IRs constructed in-memory (no begin directive parsed):
  // look for legacy store-based markers (backward-compat with hand-built IRs
  // in tests that use the old "begin unicode" / "begin ansi" naming).
  const storeNames = ir.stores.map((s) => s.name.toLowerCase());
  const hasUnicode = storeNames.some((n) => n === "begin unicode");
  const hasAnsi = storeNames.some((n) => n === "begin ansi");
  if (!hasUnicode && !hasAnsi) return false;
  return !hasUnicode && hasAnsi;
}

/**
 * Return true if the keyboard's unshifted letter-key layer deviates from the
 * standard US-QWERTY baseline by more than `threshold` positions.
 *
 * "Deviation" = a vkey that produces a codepoint other than the expected
 * US-ASCII value in the unshifted layer.  More than `threshold` deviations
 * implies a fundamentally different base layout (e.g. AZERTY, Dvorak, or a
 * localized base) that would corrupt cross-keyboard aggregation.
 *
 * @param threshold - maximum allowed deviations (default: 3)
 * @see spec.md §7.6 (non-US-base exclusion filter)
 */
export function hasNonUSBase(ir: KeyboardIR, threshold = 3): boolean {
  // Only look at the unshifted base row (NCAPS-only or bare; rejects
  // SHIFT/CAPS/AltGr layers). Mirrors detectBaseLayoutFamily.
  const map = collectVkeyChars(ir, isBaseLayer);
  let deviations = 0;
  for (const [vkey, char] of map) {
    const expected = US_UNSHIFTED[vkey];
    if (expected === undefined) continue;
    if (char !== expected) deviations++;
  }
  return deviations > threshold;
}

// ---------------------------------------------------------------------------
// Layout-family detection
// ---------------------------------------------------------------------------

/**
 * Walk `ir.groups[]` (skipping non-`usingKeys` groups) and collect a
 * `vkey -> char` map for rules whose context is a single vkey and whose
 * output is a single char element.  `accept(vkeyName, modifiers)` decides
 * whether a given rule's modifiers qualify it for inclusion — callers use
 * this to scope the walk to a particular layer (e.g. unshifted base, or
 * Shift).
 *
 * The FIRST occurrence per vkey wins: once a vkey has been recorded, later
 * matching rules for the same vkey are ignored, so the result has at most
 * one entry per vkey regardless of how many qualifying rules target it.
 * For detectBaseLayoutFamily (and hasInvertedNumberRow) this reproduces the
 * clobber-avoidance behaviour of their original inline map-building, where
 * only one value per key position is ever meaningful. For hasNonUSBase this
 * is more than incidental clobber-avoidance: because deviations are tallied
 * from this map, a vkey with several qualifying rules (e.g. a bare rule and
 * an NCAPS rule both targeting K_A) contributes at most one deviation, not
 * one per matching rule. That is the intended, more-correct semantic —
 * "non-US base" counts differing key *positions*, not differing rules — and
 * is a deliberate departure from hasNonUSBase's original per-rule tally, not
 * a re-statement of it.
 *
 * @see spec.md §7.6 (base-layout / AZERTY-derived detection helpers)
 */
export function collectVkeyChars(
  ir: KeyboardIR,
  accept: (vkey: string, modifiers: string[]) => boolean,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of ir.groups) {
    if (!group.usingKeys) continue;
    for (const rule of group.rules) {
      if (rule.context.length !== 1) continue;
      const ctx = rule.context[0];
      if (!ctx || ctx.kind !== "vkey") continue;
      if (!accept(ctx.name, ctx.modifiers)) continue;
      if (rule.output.length !== 1) continue;
      const out = rule.output[0];
      if (!out || out.kind !== "char") continue;
      if (!map.has(ctx.name)) map.set(ctx.name, out.value);
    }
  }
  return map;
}

/**
 * Detect the base layout family of a keyboard from its unshifted letter-key
 * layer.  Checks the three key positions (K_Q/K_A/K_Z) that distinguish the
 * three common European layouts.
 *
 * When the letter-row check is inconclusive ("other"), falls back to the
 * AZERTY-derived inverted-number-row signal (hasInvertedNumberRow): some
 * keyboards remap the letter row away from stock AZERTY but retain the
 * AZERTY-style inverted digit row, which is otherwise a reliable AZERTY
 * fingerprint.
 *
 * Used by the supportability scanner to annotate each KeyboardPlacementReport
 * with its layout family before passing reports to aggregatePlacements().
 *
 * @see spec.md §7.6 (bucketing by base-layout family; AZERTY-derived detection)
 */
export function detectBaseLayoutFamily(
  ir: KeyboardIR,
): "QWERTY" | "AZERTY" | "QWERTZ" | "other" {
  // Unshifted base layer only (see isBaseLayer).
  const map = collectVkeyChars(ir, isBaseLayer);
  const q = map.get("K_Q");
  const a = map.get("K_A");
  const z = map.get("K_Z");
  if (q === "q" && a === "a" && z === "z") return "QWERTY";
  if (q === "a" && a === "q" && z === "w") return "AZERTY";
  if (q === "q" && a === "a" && z === "y") return "QWERTZ";
  if (hasInvertedNumberRow(ir)) return "AZERTY";
  return "other";
}

// ---------------------------------------------------------------------------
// AZERTY-derived detection (inverted number row)
// ---------------------------------------------------------------------------

/** Digit vkeys in the standard number-row order, mapped to their digit char. */
const DIGIT_VKEYS: Record<string, string> = {
  K_1: "1", K_2: "2", K_3: "3", K_4: "4", K_5: "5",
  K_6: "6", K_7: "7", K_8: "8", K_9: "9", K_0: "0",
};

/**
 * Detect the AZERTY-style inverted number row: on the unshifted/base state,
 * digit keys produce a symbol (not the digit), while the digit itself lives
 * on Shift.  This survives letter-row remapping that defeats the primary
 * K_Q/K_A/K_Z check, so it is used as a fallback signal for AZERTY-derived
 * keyboards whose letter rows have been customised away from stock AZERTY.
 *
 * A digit vkey counts as "inverted" when:
 *   - the base (NCAPS-only, or bare) layer defines an output for it, AND
 *   - that base output is NOT the digit itself, AND
 *   - the Shift layer (SHIFT, optionally combined with NCAPS, but never CAPS)
 *     produces the digit.
 *
 * The base layer read is NCAPS-specific (not CAPS): with CapsLock on, real
 * AZERTY keyboards flip the number row back to plain digits (e.g.
 * `[CAPS K_1] > '1']`), which would look QWERTY-like if mistakenly read as
 * the base state.  Reading NCAPS (rejecting any rule carrying CAPS) avoids
 * that trap.
 *
 * @param threshold - minimum count of inverted digit keys (out of K_1..K_0)
 *   required to report true. The check is inclusive (`>=`); the default of 5
 *   requires at least half the number row to exhibit the inversion.
 * @see spec.md §7.6 (AZERTY-derived detection via the inverted number row)
 */
export function hasInvertedNumberRow(ir: KeyboardIR, threshold = 5): boolean {
  const baseMap = collectVkeyChars(ir, isBaseLayer);
  const shiftMap = collectVkeyChars(ir, isShiftLayer);

  let inverted = 0;
  for (const [vkey, digit] of Object.entries(DIGIT_VKEYS)) {
    const base = baseMap.get(vkey);
    if (base === undefined) continue;
    if (base === digit) continue;
    if (shiftMap.get(vkey) === digit) inverted++;
  }
  return inverted >= threshold;
}

// ---------------------------------------------------------------------------
// Candidate-level filters
// ---------------------------------------------------------------------------

/**
 * Deduplicate rule tuples where the CAPS-state and NCAPS-state produce the same
 * output codepoint for the same vkey.  Keeps the first occurrence and removes
 * duplicates that differ only in the CAPS/NCAPS modifier token.
 *
 * Two candidates are CAPS/NCAPS-duplicates when:
 *   - same vkey
 *   - one has CAPS in its modifiers, the other has NCAPS (or neither), and
 *     the rest of the slot is identical
 *
 * @see spec.md §7.6 (CAPS/NCAPS dedup filter)
 */
export function dedupCapsNcaps(
  tagged: Array<{ codepoint: number; candidate: PlacementCandidate }>,
): Array<{ codepoint: number; candidate: PlacementCandidate }> {
  /**
   * Normalise modifiers: strip CAPS/NCAPS, sort the rest, then return a stable
   * string key for set-membership checks.
   */
  function slotKey(cp: number, vkey: string, mods: string[]): string {
    const stripped = mods
      .filter((m) => m !== "CAPS" && m !== "NCAPS")
      .sort()
      .join(",");
    return `${cp}|${vkey}|${stripped}`;
  }

  const seen = new Set<string>();
  const result: Array<{ codepoint: number; candidate: PlacementCandidate }> = [];

  for (const item of tagged) {
    const key = slotKey(
      item.codepoint,
      item.candidate.vkey,
      item.candidate.modifiers,
    );
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
