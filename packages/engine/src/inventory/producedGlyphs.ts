/**
 * producedGlyphs — thin wrapper over the canonical `buildProducedSet` utility
 * in @keyboard-studio/contracts.
 *
 * Returns a sorted string[] (ascending Unicode codepoint) for use by the §8
 * inventory diff: `alphabet − producedGlyphs = letters-to-add`.
 *
 * The NFC run-merge semantics (consecutive {kind:"char"} elements accumulated
 * into a run buffer, joined, then NFC-normalized on flush) live in
 * buildProducedSet. This module preserves the existing public API shape:
 * sorted string[], ProducedGlyphsOptions, and the collectFromOutput helper.
 *
 * Browser-safe: operates entirely on the in-memory IR, does no I/O.
 */

import type { KeyboardIR, IRStore, OutputElement } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Options (re-exported for backward compatibility)
// ---------------------------------------------------------------------------

export interface ProducedGlyphsOptions {
  /**
   * When true, U+0020 SPACE is included in the output set.
   * Default: false (space is excluded as it is not a language character).
   */
  includeSpace?: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the distinct set of glyphs the keyboard can produce, derived
 * statically from the in-memory `KeyboardIR`.
 *
 * Delegates to `buildProducedSet` from @keyboard-studio/contracts for the
 * core logic (including the NFC run-merge fix for base+combining sequences).
 *
 * @param ir - The parsed keyboard IR.
 * @param options - Optional filtering overrides.
 * @returns A sorted array of distinct NFC codepoints (one JS character each).
 *          Order is deterministic: ascending Unicode code-point value.
 *
 * @example
 * ```ts
 * const glyphs = producedGlyphs(ir);
 * const delta = linguistAlphabet.filter(ch => !glyphs.includes(ch));
 * ```
 */
export function producedGlyphs(
  ir: KeyboardIR,
  options: ProducedGlyphsOptions = {},
): string[] {
  const set = buildProducedSet(ir, options);
  return [...set].sort((a, b) => {
    const cpA = a.codePointAt(0) ?? 0;
    const cpB = b.codePointAt(0) ?? 0;
    return cpA - cpB;
  });
}

/**
 * Collect glyphs from a single rule's output element array.
 * Exported for unit-testing individual output sequences.
 *
 * NOTE: This helper accumulates directly into the provided collector Set.
 * Consecutive char elements are run-merged (via buildProducedSet semantics)
 * by operating on a one-rule IR constructed in-memory.
 *
 * @param output      - The output elements of a single rule.
 * @param storeMap    - Store lookup map for the IR.
 * @param collector   - Set to accumulate results into.
 * @param includeSpace - Whether to include U+0020.
 */
export function collectFromOutput(
  output: readonly OutputElement[],
  storeMap: ReadonlyMap<string, IRStore>,
  collector: Set<string>,
  includeSpace: boolean,
): void {
  // Synthesize a minimal IR containing just this one rule so we can delegate
  // to buildProducedSet and get the correct run-merge behavior.
  const syntheticIR: KeyboardIR = {
    origin: "synthesized",
    header: {
      keyboardId: "_collect_helper",
      name: "",
      bcp47: [],
      copyright: "",
      version: "0",
      targets: [],
      storeDirectives: [],
    },
    stores: [...storeMap.values()],
    groups: [
      {
        nodeId: "_g",
        name: "_g",
        usingKeys: false,
        readonly: false,
        rules: [
          {
            nodeId: "_r",
            context: [],
            output: output as OutputElement[],
          },
        ],
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };

  const set = buildProducedSet(syntheticIR, { includeSpace });
  for (const ch of set) {
    collector.add(ch);
  }
}

// Re-export the contracts type so callers can import it from this module
// if they prefer (backward-compatible convenience).
export type { KeyboardIR };
