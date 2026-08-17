// The shared per-pair posture table (specs/046-marks-question-series, R5) —
// the pure function content/facets/orth/mark-composition-posture.yaml names as
// its derivation. For every attested stack in the confirmed alphabet: does a
// ready-made (precomposed NFC) single-character form exist for it?
//
// Single source of truth: this one computed table feeds all four consumers —
// the posture facet, the S4 output-form proposal, the stepwise backspace-unwrap
// store generation, and the blocking rules — so they can never disagree.
//
// Named fifth consumer, NOT actually called (spec 062 exception): spec.md's
// Key Entities section (§ Per-pair table) names canonical-equivalence context
// tolerance as this table's fifth consumer — each composed form's own
// decomposition being exactly the context variant to add is the same
// relationship this function already computes. In practice
// `pattern-apply/context-variants.ts` computes that per-candidate
// decomposability itself via plain `.normalize("NFD"/"NFC")` (research.md's
// own second Phase 0 decision, also used everywhere else in this codebase for
// decomposition) rather than calling `nfcPostureOfInventory` here, because
// this function's `alphabet: ConfirmedAlphabet` parameter is a
// survey-confirmed, studio-side structure spec 062's generator does not
// require — it runs over an arbitrary `KeyboardIR` (importantly including an
// IMPORTED keyboard with no confirmed alphabet at all, e.g. `sil_yoruba8`).
// See `context-variants.ts`'s own module doc for the same substitution
// spelled out at its two call sites.

import type { AttestedStack, ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { composeStack, stackKey } from "@keyboard-studio/contracts";

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
    const key = stackKey(stack);
    if (seen.has(key)) continue;
    seen.add(key);
    const nfc = composeStack(stack);
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
