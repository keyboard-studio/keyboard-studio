// The shared per-pair posture table (specs/046-marks-question-series, R5) —
// the pure function content/facets/orth/mark-composition-posture.yaml names as
// its derivation. For every attested stack in the confirmed alphabet: does a
// ready-made (precomposed NFC) single-character form exist for it?
//
// Single source of truth: this one computed table feeds all four consumers —
// the posture facet, the S4 output-form proposal, the stepwise backspace-unwrap
// store generation, and the blocking rules — so they can never disagree.

import type { AttestedStack, ConfirmedAlphabet } from "@keyboard-studio/contracts";

export interface PosturePair {
  stack: AttestedStack;
  /** True iff the whole stack composes to a single ready-made character under NFC. */
  hasReadyMadeForm: boolean;
  /** The ready-made character, present only when {@link hasReadyMadeForm}. */
  readyMadeForm?: string;
}

/** Keyboard-level aggregate of the per-pair table (the facet's enum values). */
export type InventoryPosture = "precomposed" | "combining" | "mixed";

/**
 * Compute the per-pair posture table over the alphabet's attested stacks:
 * a stack has a ready-made form iff `base + marks` NFC-composes to exactly one
 * code point. Order-preserving input; one row per attested stack, in store
 * order (duplicates deduped by exact ordered shape).
 */
export function nfcPostureOfInventory(alphabet: ConfirmedAlphabet): PosturePair[] {
  const seen = new Set<string>();
  const pairs: PosturePair[] = [];
  for (const stack of alphabet.attestedStacks) {
    const key = `${stack.base} ${stack.marks.join(" ")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const nfc = (stack.base + stack.marks.join("")).normalize("NFC");
    const hasReadyMadeForm = [...nfc].length === 1;
    pairs.push({
      stack: { base: stack.base, marks: [...stack.marks] },
      hasReadyMadeForm,
      ...(hasReadyMadeForm ? { readyMadeForm: nfc } : {}),
    });
  }
  return pairs;
}

/**
 * Aggregate the per-pair table to the keyboard-level posture the facet
 * records: every pair composes → `"precomposed"`, no pair composes →
 * `"combining"`, otherwise `"mixed"`. Returns `undefined` on an empty table
 * (no attested stacks — nothing to have a posture about).
 */
export function aggregateInventoryPosture(pairs: PosturePair[]): InventoryPosture | undefined {
  if (pairs.length === 0) return undefined;
  const composed = pairs.filter((p) => p.hasReadyMadeForm).length;
  if (composed === pairs.length) return "precomposed";
  if (composed === 0) return "combining";
  return "mixed";
}
