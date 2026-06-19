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
  let deviations = 0;
  for (const group of ir.groups) {
    if (!group.usingKeys) continue;
    for (const rule of group.rules) {
      // Only look at unshifted (no modifier) vkey rules.
      if (rule.context.length !== 1) continue;
      const ctx = rule.context[0];
      if (!ctx || ctx.kind !== "vkey") continue;
      if (ctx.modifiers.length !== 0) continue;
      const expected = US_UNSHIFTED[ctx.name];
      if (expected === undefined) continue;
      // Output must be a single char.
      if (rule.output.length !== 1) continue;
      const out = rule.output[0];
      if (!out || out.kind !== "char") continue;
      if (out.value !== expected) {
        deviations++;
        if (deviations > threshold) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Layout-family detection
// ---------------------------------------------------------------------------

/**
 * Detect the base layout family of a keyboard from its unshifted letter-key
 * layer.  Checks the three key positions (K_Q/K_A/K_Z) that distinguish the
 * three common European layouts.
 *
 * Used by the supportability scanner to annotate each KeyboardPlacementReport
 * with its layout family before passing reports to aggregatePlacements().
 *
 * @see spec.md §7.6 (bucketing by base-layout family)
 */
export function detectBaseLayoutFamily(
  ir: KeyboardIR,
): "QWERTY" | "AZERTY" | "QWERTZ" | "other" {
  const map = new Map<string, string>();
  for (const group of ir.groups) {
    if (!group.usingKeys) continue;
    for (const rule of group.rules) {
      if (rule.context.length !== 1) continue;
      const ctx = rule.context[0];
      if (!ctx || ctx.kind !== "vkey" || ctx.modifiers.length !== 0) continue;
      if (rule.output.length !== 1) continue;
      const out = rule.output[0];
      if (!out || out.kind !== "char") continue;
      map.set(ctx.name, out.value);
    }
  }
  const q = map.get("K_Q");
  const a = map.get("K_A");
  const z = map.get("K_Z");
  if (q === "q" && a === "a" && z === "z") return "QWERTY";
  if (q === "a" && a === "q" && z === "w") return "AZERTY";
  if (q === "q" && a === "a" && z === "y") return "QWERTZ";
  return "other";
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
