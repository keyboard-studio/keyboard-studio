// evidence — pure evidence-key functions and the re-proposal view (spec 079
// R-02, R-03; data-model.md §2-§3).
//
// An answer is CURRENT while the key it was saved under equals the key computed
// now, and AFFECTED otherwise. Keys are answer-grained where a step asks about
// several subjects, so a one-letter alphabet change re-proposes only the answers
// that letter touches (SC-003), not the whole step.
//
// Every function here takes plain inputs — never a store. steps/ may not import
// stores/ (depcruise `steps-layer`), and a pure key is what makes "change it and
// change it back" free: the saved answer and its key are never rewritten by a
// re-proposal, so restoring the evidence restores the match (FR-014).

import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { confirmedAlphabetKey } from "@keyboard-studio/contracts";
import type {
  AnswerView,
  EvidenceKey,
  ReproposalReason,
  SavedAnswer,
} from "./answerTypes.ts";

/** Ids of the key functions a manifest step's `evidence` declaration may name. */
export type EvidenceKeyFnId = "alphabet" | "marks" | "punctuation" | "invisibles" | "convenience";

const sortedJoin = (xs: Iterable<string>): string => [...xs].sort().join(",");

// ---------------------------------------------------------------------------
// alphabet — the characters step (R-07)
// ---------------------------------------------------------------------------

export interface AlphabetEvidence {
  bcp47?: string | null;
  script?: string | null;
  variant?: string | null;
  baseId?: string | null;
}

/** `bcp47|script|variant|baseId` — what the alphabet proposal is built from. */
export function alphabetKey(e: AlphabetEvidence): EvidenceKey {
  return [e.bcp47 ?? "", e.script ?? "", e.variant ?? "", e.baseId ?? ""].join("|");
}

/**
 * The alphabet key of an identity answer and a chosen base — the ONE mapping
 * from session values to `AlphabetEvidence`, shared by the characters prefill
 * confirm and the pre-079 draft restore so the two can never disagree.
 * Structural parameter types: steps/ may not import survey/ or stores/.
 */
export function alphabetKeyOf(
  identity: { bcp47: string; targetScriptRaw: string; prefill: { script: string } },
  base: { id: string },
): EvidenceKey {
  return alphabetKey({
    bcp47: identity.bcp47,
    script: identity.prefill.script,
    variant: identity.targetScriptRaw,
    baseId: base.id,
  });
}

// ---------------------------------------------------------------------------
// marks — the accents & marks series (R-02, R-04)
// ---------------------------------------------------------------------------

/** Step-level marks key: the confirmed alphabet's content key. */
export function marksKey(alphabet: ConfirmedAlphabet | undefined): EvidenceKey {
  return confirmedAlphabetKey(alphabet);
}

/** Whether `ch` (a base or a mark) is present anywhere in `alphabet`. Exported
 * for the two per-answer keys below whose key depends on the SAVED value's own
 * components, not just the alphabet as a whole (spec 079 US3 item 5). */
export function hasChar(alphabet: ConfirmedAlphabet, ch: string): boolean {
  return alphabet.bases.includes(ch) || alphabet.marks.includes(ch);
}

/** Attachment of mark M on base B: `has(M)|has(B)|attested(B+M)`. */
export function marksAttachmentKey(
  alphabet: ConfirmedAlphabet,
  mark: string,
  base: string,
): EvidenceKey {
  const attested = alphabet.attestedStacks.some((s) => s.base === base && s.marks.includes(mark));
  return `att|${hasChar(alphabet, mark) ? 1 : 0}|${hasChar(alphabet, base) ? 1 : 0}|${attested ? 1 : 0}`;
}

/** A class's treatment depends on the class's member set. */
export function marksClassTreatmentKey(members: readonly string[]): EvidenceKey {
  return `cls|${sortedJoin(members)}`;
}

/** A per-mark treatment override depends on the mark's presence and its class. */
export function marksMarkTreatmentKey(
  alphabet: ConfirmedAlphabet,
  mark: string,
  classId: string,
): EvidenceKey {
  return `mk|${hasChar(alphabet, mark) ? 1 : 0}|${classId}`;
}

/** A stack answer depends on every member being present. */
export function marksStackKey(alphabet: ConfirmedAlphabet, members: readonly string[]): EvidenceKey {
  return `stk|${members.every((m) => hasChar(alphabet, m)) ? 1 : 0}`;
}

/** The output form depends on the inventory's NFC posture. */
export function marksOutputFormKey(postureId: string): EvidenceKey {
  return `nfc|${postureId}`;
}

/** Input order depends on which marks are typed on a key of their own. */
export function marksInputOrderKey(ownKeyMarks: readonly string[]): EvidenceKey {
  return `ord|${sortedJoin(ownKeyMarks)}`;
}

/**
 * `marks_stacking.allowed`'s key (spec 079 US3 item 5): keyed over the SET of
 * attested multi-mark stacks, not the whole alphabet (`marksKey`) — so adding
 * an unrelated single-mark letter never flags this answer (SC-003). Callers
 * pass `stackKey(s)` for each attested stack with `marks.length >= 2`.
 */
export function marksStackingAllowedKey(multiMarkStackKeys: readonly string[]): EvidenceKey {
  return `stkallow|${sortedJoin(multiMarkStackKeys)}`;
}

/**
 * `marks_treatment.promoted`'s key (spec 079 US3 item 5): keyed over the
 * presence of each CURRENTLY SAVED promoted character's own components (base +
 * combining marks via NFD), not the whole alphabet. An unrelated letter
 * addition leaves every existing promotion's components' presence unchanged,
 * so the key is stable; removing a component flips its presence bit, which is
 * what should re-propose (prune) that one promotion.
 */
export function marksPromotedKey(alphabet: ConfirmedAlphabet, promoted: readonly string[]): EvidenceKey {
  const perChar = promoted.map((c) => {
    const present = [...c.normalize("NFD")].every((ch) => hasChar(alphabet, ch));
    return `${c}:${present ? 1 : 0}`;
  });
  return `promoted|${sortedJoin(perChar)}`;
}

// ---------------------------------------------------------------------------
// punctuation, invisibles, convenience
// ---------------------------------------------------------------------------

/** `resolvedTag|baseId` — the punctuation seed-key parts. */
export function punctuationKey(resolvedTag: string | null | undefined, baseId: string | null | undefined): EvidenceKey {
  return `${resolvedTag ?? ""}|${baseId ?? ""}`;
}

/** The sorted candidate set the invisibles step offers. */
export function invisiblesKey(candidates: Iterable<string>): EvidenceKey {
  return sortedJoin(candidates);
}

/** `signalState|sorted surplus` — what the convenience question is built from. */
export function convenienceKey(signalState: string, surplus: Iterable<string>): EvidenceKey {
  return `${signalState}|${sortedJoin(surplus)}`;
}

/**
 * Per-candidate key for a step that offers a set of candidates (invisibles,
 * convenience): `null` when the candidate is no longer offered, so its saved
 * answer reads as inactive rather than re-proposed.
 */
export function offeredKey(candidate: string, offered: ReadonlySet<string> | readonly string[]): EvidenceKey | null {
  const has = Array.isArray(offered)
    ? (offered as readonly string[]).includes(candidate)
    : (offered as ReadonlySet<string>).has(candidate);
  return has ? `offered|${candidate}` : null;
}

// ---------------------------------------------------------------------------
// reconcile — the re-proposal view (R-03)
// ---------------------------------------------------------------------------

const UNSPECIFIED_REASON: ReproposalReason = {
  code: "evidence-added",
  subject: "",
  sourceStepId: "",
};

/**
 * The view a step renders for one answer. Pure: it never writes. Only the
 * author's confirm or overturn saves a new value, stamped with the current key,
 * which is what clears a flag.
 *
 * - `currentKey === null`: the answer's subject is gone from the evidence. A
 *   saved answer is `inactive` (kept, not asked); with nothing saved the
 *   proposal is shown as usual.
 * - nothing saved: `proposed`.
 * - key matches: `current`, saved value unmodified.
 * - key differs: `reproposed`, rendering `adjust(saved, proposal)` when the step
 *   defines one (FR-012), else the proposal.
 *
 * "Changed back to the original" needs no special case (FR-014): the key, not a
 * history of changes, is what is compared.
 */
export function reconcile<V>(
  saved: SavedAnswer | undefined,
  currentKey: EvidenceKey | null,
  proposal: V,
  adjust?: (savedValue: V, proposal: V) => V,
  reason: ReproposalReason = UNSPECIFIED_REASON,
): AnswerView<V> {
  if (saved === undefined) return { state: "proposed", value: proposal };
  if (currentKey === null) return { state: "inactive", value: saved.value as V, saved };
  if (saved.evidenceKey === currentKey) return { state: "current", value: saved.value as V, saved };
  const value = adjust !== undefined ? adjust(saved.value as V, proposal) : proposal;
  return { state: "reproposed", value, saved, reason };
}
