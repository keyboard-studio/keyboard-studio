// useDisplacementProposal — the demotion proposal for a displaced glyph
// (#2300, gate G3: no displacement without a demotion proposal).
//
// When an author assigns a character onto a slot that already types a
// still-needed glyph, the incumbent is silently shadowed (Keyman
// first-match-wins) unless it is re-homed. Following the studio's
// propose-then-confirm posture (spec v1.3.1 §3c — never a silent
// auto-insert, and never a silent loss either), the apply itself proceeds
// (the author chose the key), and this hook then holds ONE pending
// proposal to DEMOTE the displaced glyph: rank 1 is the RAlt layer on the
// SAME key; the fallback is a deadkey, used only when the RAlt slot is
// taken or unavailable. The gallery decides the method at propose time
// (it owns the occupancy ledger) and records the demotion assignment on
// confirm, through the same builders the manual paths use.
//
// Modeled on useCasePairCompanion (casePairCompanion.ts): the hook NEVER
// records anything; it only decides whether a proposal exists and holds
// it. It has its OWN state slot — a displacement can be raised by the
// same Apply that raises a case-pair companion, and the two banners
// co-render (the SiblingAccent precedent).
//
// "Leave it" is an explicit, recorded choice: dismiss() records the
// dismissal (keyed by displaced glyph + slot) in the working copy's
// `displacedDeclined` list (spec 106 FR-043), which persists with the
// draft and rides the physical-layout decision, so the same displacement
// is not re-proposed and the loss is on the record. The dismissal records
// NO assignment — the honest consequence (the glyph stays shadowed on
// that key) is stated in the banner copy.

import { useCallback, useState } from "react";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

export interface DisplacementProposal {
  /** The glyph that was displaced from its slot. */
  displacedChar: string;
  /** The character whose assignment displaced it. */
  incomingChar: string;
  /** The physical key both characters contend for. */
  vkey: string;
  /** Modifiers of the slot that was taken (the incoming assignment's slot). */
  modifiers: string[];
  /** The demotion the banner proposes (decided by the caller, see header). */
  demotionMethod: "ralt" | "deadkey";
  /**
   * WHO gets demoted, decided by orthography tier (steer 2 — frequency
   * data does not exist, so tier decides): "demote-incumbent" (core
   * incoming, convenience incumbent), "demote-incoming" (convenience
   * incoming loses the primary slot to a core incumbent — the confirm
   * path swaps them), or "both-core" (neither is demoted by default;
   * the banner states the frequency-data gap and demotion is only an
   * explicit author override).
   */
  direction: "demote-incumbent" | "demote-incoming" | "both-core";
  /** Identity (object reference) of the assignment that displaced — the
   *  confirm handler's stale-proposal guard (FR-008 pattern). */
  baseAssignment: MechanismAssignment;
}

export type DisplacementProposalInput = DisplacementProposal & {
  /**
   * Optional caller predicate: is the displaced glyph ALREADY demoted (or
   * otherwise re-homed) for this key? `true` raises nothing — a redundant
   * proposal is noise. Input-time gate only; never stored.
   */
  alreadyDemoted?: () => boolean;
};

export interface UseDisplacementProposal {
  proposal: DisplacementProposal | null;
  /** Raise a proposal, or do nothing when suppressed / already dismissed. */
  propose: (input: DisplacementProposalInput) => boolean;
  /** "Leave it": record the dismissal in the working copy and clear. */
  dismiss: () => void;
  /** Clear without recording a dismissal (caller confirmed, or stale). */
  clear: () => void;
  /** Re-point a pending proposal raised for `from` at its replacement `to` (the same assignment, edited). */
  rebase: (from: MechanismAssignment, to: MechanismAssignment) => void;
}

/**
 * The `displacedDeclined` key: displaced glyph, vkey, sorted modifiers, and
 * the incoming character. The incoming character is part of it so that a
 * different character later displacing the same glyph is proposed afresh.
 */
export function displacementDismissalKey(p: {
  displacedChar: string;
  incomingChar: string;
  vkey: string;
  modifiers: readonly string[];
}): string {
  return `${p.displacedChar}|${p.vkey}|${[...p.modifiers].sort().join(",")}|${p.incomingChar}`;
}

/**
 * Decide whether a displacement proposal is raised: pure, reads no store.
 * The hook's `propose` is exactly this plus `setProposal`. `declined` is the
 * working copy's `displacedDeclined` list. Null when the caller's
 * `alreadyDemoted` says the glyph is re-homed already, or the same
 * displacement was declined before.
 */
export function acceptDisplacementProposal(
  input: DisplacementProposalInput,
  declined: readonly string[],
): DisplacementProposal | null {
  const { alreadyDemoted, ...parts } = input;
  if (alreadyDemoted?.() === true) return null;
  if (declined.includes(displacementDismissalKey(parts))) return null;
  return parts;
}

/**
 * "Leave it" / "Keep both": record the dismissal in the working copy's
 * `displacedDeclined` list. The hook's `dismiss` is exactly this plus
 * clearing its pending proposal.
 */
export function declineDisplacementProposal(proposal: DisplacementProposal): void {
  useWorkingCopyStore.getState().declineDisplacement(displacementDismissalKey(proposal));
}

export function useDisplacementProposal(): UseDisplacementProposal {
  const [proposal, setProposal] = useState<DisplacementProposal | null>(null);
  const declined = useWorkingCopyStore((s) => s.displacedDeclined);

  const propose = useCallback(
    (input: DisplacementProposalInput): boolean => {
      const next = acceptDisplacementProposal(input, declined);
      if (next === null) return false;
      setProposal(next);
      return true;
    },
    [declined],
  );

  const dismiss = useCallback(() => {
    if (proposal !== null) declineDisplacementProposal(proposal);
    setProposal(null);
  }, [proposal]);

  const clear = useCallback(() => setProposal(null), []);
  const rebase = useCallback((from: MechanismAssignment, to: MechanismAssignment) => {
    setProposal((current) =>
      current !== null && current.baseAssignment === from ? { ...current, baseAssignment: to } : current,
    );
  }, []);

  return { proposal, propose, dismiss, clear, rebase };
}
