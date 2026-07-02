/**
 * emitPlacementMap — placement post-pass over a parsed KeyboardIR.
 *
 * Walks ir.groups[].rules[], extracts (vkey, modifiers, output-codepoint,
 * mechanism) tuples, applies the five mandatory pre-filters, and returns a
 * flat array of PlacementCandidate records ready for aggregation.
 *
 * v1 scope (D-INT-3): S-01 (direct substitution) and S-08 (RALT-layer) only.
 * Deadkey, mnemonic, cycle, and cluster rules are skipped or produce an
 * 'opaque' candidate that is discarded by the SMP/PUA filter.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 * @see D-INT-3 / D-INT-4 in utilities/kbgen/INTEGRATION.md
 */

import type { KeyboardIR, ContextElement, OutputElement } from "@keyboard-studio/contracts";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import {
  isMnemonicKeyboard,
  hasNonUSBase,
  dedupCapsNcaps,
} from "./filters.js";

// ---------------------------------------------------------------------------
// Internal tagged tuple (codepoint attached for filtering stages)
// ---------------------------------------------------------------------------

interface TaggedCandidate {
  /** Numeric codepoint (for PUA/SMP checks and dedup keying). */
  codepoint: number;
  candidate: PlacementCandidate;
}

// ---------------------------------------------------------------------------
// Rule-level extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a single vkey + modifiers from a rule context array.
 * Returns null when the context has no vkey, has more than one vkey, or
 * contains conditional elements (any, notany, index, context) that make the
 * rule store-driven rather than direct.
 */
function extractVkey(
  context: ContextElement[],
): { vkey: string; modifiers: string[] } | null {
  let vkeyEl: { name: string; modifiers: string[] } | null = null;
  for (const el of context) {
    switch (el.kind) {
      case "vkey":
        if (vkeyEl !== null) return null; // two vkeys → not a simple direct rule
        vkeyEl = { name: el.name, modifiers: el.modifiers };
        break;
      case "any":
      case "notany":
      case "index":
      case "context":
        // Conditional/store-driven context — not a simple direct rule.
        return null;
      case "char":
      case "deadkey":
      case "baselayout":
      case "raw":
        // These can appear as pre-context chars (lookahead) — allow them but do
        // not prevent extraction if we already have a vkey.
        break;
    }
  }
  if (vkeyEl === null) return null;
  return { vkey: vkeyEl.name, modifiers: vkeyEl.modifiers };
}

/**
 * Determine the PlacementMechanism and output character from a rule's output
 * element list.
 *
 * Returns null when:
 *   - the output is empty or has no extractable char
 *   - a deadkey element is present (v1 scope: skip deadkey rules per D-INT-3)
 *   - the output has multiple chars (ambiguous)
 *   - the output uses store-index (any/index pair — classified as store-index,
 *     but v1 only emits direct candidates)
 *
 * The returned mechanism is 'direct' for simple single-char output, 'opaque'
 * for raw fragments or outs() calls (which are later discarded).  'store-index'
 * and 'deadkey' are not returned — those rules are skipped in v1.
 */
function extractOutput(
  output: OutputElement[],
): { char: string; mechanism: "direct" | "opaque" } | null {
  if (output.length === 0) return null;

  // v1: skip any rule that involves a deadkey output element (D-INT-3).
  if (output.some((el) => el.kind === "deadkey")) return null;

  // v1: skip rules with store-index patterns (index() output — D-INT-3).
  if (output.some((el) => el.kind === "index")) return null;

  // Single char output → direct.
  if (output.length === 1) {
    const el = output[0];
    if (!el) return null;
    if (el.kind === "char") {
      return { char: el.value, mechanism: "direct" };
    }
    if (el.kind === "beep") return null; // beep is not a character placement
    if (el.kind === "outs" || el.kind === "raw") {
      // Opaque — will be dropped downstream (SMP/PUA filter).
      return { char: "\0", mechanism: "opaque" };
    }
    return null;
  }

  // Multi-element output: if all elements are chars it could be a ligature —
  // out of scope for v1 single-BMP-codepoint constraint.  Treat as opaque.
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Walk a parsed KeyboardIR and extract placement candidates keyed by codepoint.
 *
 * Returns an empty Map when:
 *   - the keyboard is mnemonic (isMnemonicKeyboard returns true)
 *   - the keyboard has a non-US base layout (hasNonUSBase returns true)
 *
 * The returned candidates have:
 *   - priorSource: 'corpus'
 *   - priorCount: 1  (aggregation multiplies this)
 *   - confidence: 0.5 (placeholder; aggregation normalises it)
 *   - mechanism: 'direct' (only direct rules are emitted in v1)
 *
 * Map key is 4-char uppercase hex codepoint (e.g. "0253").
 *
 * @see spec.md §7.6
 */
export function emitPlacementMap(ir: KeyboardIR): Map<string, PlacementCandidate[]> {
  if (isMnemonicKeyboard(ir)) return new Map();
  if (hasNonUSBase(ir)) return new Map();

  const raw: TaggedCandidate[] = [];

  for (const group of ir.groups) {
    // Skip non-key groups — rules inside `group(x)` without `using keys` are
    // deadkey-body groups and produce no direct key→char mappings.
    if (!group.usingKeys) continue;

    for (const rule of group.rules) {
      // Skip group-transition rules (match/nomatch > use(...)).
      if (rule.matchKind !== undefined) continue;

      // Skip ANSI-only rules (targetSelector = keymanonly means desktop only —
      // but we still keep them; keymanweb means web-only — still keep; the
      // mnemonic-exclusion filter at the top covers the ANSI-begin-group case).
      // Per filter #4: skip rules gated with begin ANSI.  These are already
      // excluded by isMnemonicKeyboard(), but defensively also skip any rule
      // in a usingKeys group that has no vkey context (non-key context rule).

      const vkeyInfo = extractVkey(rule.context);
      if (vkeyInfo === null) continue;

      const outputInfo = extractOutput(rule.output);
      if (outputInfo === null) continue;

      // Opaque mechanism: discard (v1 scope = direct only per D-INT-3).
      if (outputInfo.mechanism === "opaque") continue;

      const cp = outputInfo.char.codePointAt(0) ?? 0;

      // Skip null/control characters.
      if (cp === 0) continue;

      // Skip SMP codepoints for v1 (only BMP direct candidates).
      if (cp > 0xffff) continue;

      // Drop PUA range (U+E000–U+F8FF) inline — no separate tagged-filter step needed.
      if (cp >= 0xe000 && cp <= 0xf8ff) continue;

      raw.push({
        codepoint: cp,
        candidate: {
          vkey: vkeyInfo.vkey,
          modifiers: vkeyInfo.modifiers,
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 1,
          confidence: 0.5,
        },
      });
    }
  }

  // Apply CAPS/NCAPS dedup.
  const deduped = dedupCapsNcaps(raw);

  // Build codepoint-keyed map.
  const result = new Map<string, PlacementCandidate[]>();
  for (const { codepoint, candidate } of deduped) {
    const hexKey = codepoint.toString(16).toUpperCase().padStart(4, "0");
    let bucket = result.get(hexKey);
    if (bucket === undefined) {
      bucket = [];
      result.set(hexKey, bucket);
    }
    bucket.push(candidate);
  }
  return result;
}

// Re-export filter helpers so the supportability scanner can use them directly.
export {
  isMnemonicKeyboard,
  hasNonUSBase,
  detectBaseLayoutFamily,
  hasInvertedNumberRow,
} from "./filters.js";

// Re-export corpus loader so the studio can convert placement-priors.json
// into a PlacementMap without importing engine internals directly.
export { corpusPriorsToPlacementMap } from "./corpus-loader.js";

// Re-export the PlacementPriorsJSON type for consumers (e.g. usePlacementPriors hook).
export type { PlacementPriorsJSON } from "./model.js";
