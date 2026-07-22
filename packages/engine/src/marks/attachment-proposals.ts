// Attachment proposals (spec 046, FR-006/FR-007/FR-008/FR-009): the prefilled
// tri-state each S1 attachment row starts from. Attested pairs (observed in
// the confirmed alphabet) come pre-checked; bases judged plausible by
// mark-class heuristics come proposed-but-unchecked; every other base is
// blocked by default — and an unchecked base at the row MEANS blocked on the
// finished keyboard (the row's help text states that consequence).

import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { caseCounterpart } from "../character-discovery/casePair.js";
import type { MarkClass } from "./mark-classes.js";
import { attestedBasesOf } from "./mark-classes.js";

/**
 * The PROPOSAL tri-state — distinct from the contracts' AttachmentState:
 * "plausible" here is a proposal awaiting the designer's acceptance; only an
 * accepted proposal becomes the contract's "plausible-accepted".
 */
export type ProposedAttachmentState = "attested" | "plausible" | "blocked";

export interface AttachmentProposal {
  mark: string;
  /** Keyed by base letter — every confirmed base has an entry. */
  states: Record<string, ProposedAttachmentState>;
  /**
   * FR-008: exactly one attested base and no plausible additions — the row
   * renders as an already-confirmed summary, not a question (still editable).
   */
  autoConfirmed: boolean;
}

/**
 * Compute one proposal row per mark. The plausibility heuristic is the
 * mark-class one: a base is plausible for a mark when it is attested for a
 * DIFFERENT mark of the same class (marks that behave alike attach alike).
 */
export function proposeAttachments(
  alphabet: ConfirmedAlphabet,
  classes: MarkClass[],
): AttachmentProposal[] {
  const attested = attestedBasesOf(alphabet);
  const classOf = new Map<string, MarkClass>();
  for (const markClass of classes) {
    for (const mark of markClass.marks) classOf.set(mark, markClass);
  }

  return alphabet.marks.map((mark) => {
    const own = attested.get(mark) ?? new Set<string>();
    const siblings = classOf.get(mark)?.marks.filter((m) => m !== mark) ?? [];
    const plausible = new Set<string>();
    for (const sibling of siblings) {
      for (const base of attested.get(sibling) ?? []) {
        if (!own.has(base)) plausible.add(base);
      }
    }

    const states: Record<string, ProposedAttachmentState> = {};
    for (const base of alphabet.bases) {
      states[base] = own.has(base) ? "attested" : plausible.has(base) ? "plausible" : "blocked";
    }
    return {
      mark,
      states,
      autoConfirmed: own.size === 1 && plausible.size === 0,
    };
  });
}

/**
 * FR-009: derive the base+mark combinations whose base has an upper/lowercase
 * counterpart that is ALSO in the confirmed alphabet — no separate
 * capitals-and-marks question needed. Keyed by the stack's ordered shape;
 * the value is the counterpart base (the mark carries over unchanged).
 */
export function deriveCaseCounterparts(
  alphabet: ConfirmedAlphabet,
  bcp47?: string,
): Map<string, string> {
  const bases = new Set(alphabet.bases);
  const result = new Map<string, string>();
  for (const stack of alphabet.attestedStacks) {
    const pair = caseCounterpart(stack.base, bcp47);
    if (pair !== null && bases.has(pair.counterpart)) {
      result.set(`${stack.base} ${stack.marks.join(" ")}`, pair.counterpart);
    }
  }
  return result;
}
