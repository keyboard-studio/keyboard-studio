// phaseCInventory — the ONE phase-C `confirmedInventory` both of its emitters
// report (spec 075 FR-014 / FR-024).
//
// `recordPhase` shallow-merges same-phase results field-wise
// ({ ...prev, ...result }), so two steps that each emit their own
// `confirmedInventory` on a phase:"C" result would overwrite each other —
// whichever completed last would erase the other's characters from the
// session. PunctuationStep and InvisiblesStep therefore both emit THIS union:
// the draft's `punctuation` slice plus every invisible character the author
// accepted. Whichever step completes last, the phase-C slice is the full set,
// and the session-level mergePhaseResults union folds it together with the
// phase-B alphabet exactly as before.
//
// Accepted invisibles are read from `invisibleDecisions`, never from `chars`
// — they are deliberately kept out of the draft's pick list so they cannot
// fall into the unrendered `controls` bucket (FR-014).

import { parseUPlusNotation } from "@keyboard-studio/contracts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { nfcDedup } from "./charNormUtils.ts";

/** The characters of every `"accepted"` invisible decision, in insertion order. */
export function acceptedInvisibleChars(): string[] {
  const decisions = usePhaseBDraftStore.getState().invisibleDecisions;
  const out: string[] = [];
  for (const [notation, decision] of Object.entries(decisions)) {
    if (decision !== "accepted") continue;
    // Keys are canonical `U+XXXX` (the store normalises through the same
    // contracts parser), so a null here can only mean a hand-edited snapshot.
    const ch = parseUPlusNotation(notation);
    if (ch !== null) out.push(ch);
  }
  return out;
}

/**
 * The NFC-deduped union of the draft's punctuation slice and the accepted
 * invisible characters — what every phase-C inventory emitter reports.
 */
export function phaseCConfirmedInventory(): string[] {
  const s = usePhaseBDraftStore.getState();
  return nfcDedup([], [...s.punctuation, ...acceptedInvisibleChars()]);
}
