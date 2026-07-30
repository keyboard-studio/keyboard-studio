// Promoted composed characters (spec 052, FR-002/FR-003/FR-023).
//
// A promotion is a specific base+mark combination the author has elected onto a
// dedicated key. It is a SET, independent of mark treatment (FR-003): a mark may
// be `own-key` and still have promoted combinations — precisely the Cameroonian
// tone case, where a productive tone mark earns a key AND two or three prominent
// composed vowels earn keys of their own.
//
// Two rules shape what may be promoted:
//
//   1. REACHABILITY — a pair is promotable only when the author checked it at
//      the attachment station (S1). A member whose pair becomes blocked by an
//      alphabet edit is withdrawn on re-proposal.
//   2. CASE — promotion is offered on LOWERCASE AND CASELESS bases only,
//      matching the station's existing convention (spec 049 US1). The uppercase
//      counterpart is DERIVED, never asked (FR-023), and the derivation is
//      additive: it never withdraws a promotion the author made.
//
// The casing rule is `caseCounterpart` — the same primitive
// `expandCaseCounterpartAttachments` uses. There is deliberately no second
// casing rule in this file.

import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { caseCounterpart } from "../character-discovery/casePair.js";
import type { MarkClass } from "./mark-classes.js";
import type { PromotedComposedCharacter } from "./treatment.js";

/**
 * The uppercase bases hidden behind a present lowercase counterpart — the same
 * fold the attachment station displays (spec 049 FR-001). Caseless input, and
 * uppercase-only input with no lowercase in the alphabet, yield an empty set.
 */
function hiddenUppercaseBases(bases: readonly string[], bcp47?: string): Set<string> {
  const hidden = new Set<string>();
  for (const base of bases) {
    const pair = caseCounterpart(base, bcp47);
    if (pair?.direction === "toUpper") hidden.add(pair.counterpart);
  }
  return hidden;
}

/** NFC form of a base+mark pair — the canonical identity of a promotion. */
function composedForm(base: string, mark: string): PromotedComposedCharacter {
  return (base + mark).normalize("NFC");
}

/**
 * Every composed character the author may promote for one mark-class: each
 * reachable base+mark pair of the class's marks, on lowercase and caseless
 * bases only, NFC-normalised and deduped in first-appearance order.
 *
 * An empty result means promotion is **absent** — there is nothing to decide, so
 * the station must render no promotion group at all (distinct from
 * *unavailable*, which is a decision the key budget cannot honour; see
 * `MarkTreatmentPrefill.signals.promotionAffordable`).
 */
export function promotableCharacters(
  alphabet: ConfirmedAlphabet,
  markClass: MarkClass,
  attachments: Record<string, Record<string, boolean>>,
  bcp47?: string,
): PromotedComposedCharacter[] {
  const hidden = hiddenUppercaseBases(alphabet.bases, bcp47);
  const seen = new Set<PromotedComposedCharacter>();
  const out: PromotedComposedCharacter[] = [];

  for (const mark of markClass.marks) {
    const row = attachments[mark] ?? {};
    for (const base of alphabet.bases) {
      if (hidden.has(base)) continue; // uppercase counterpart — derived, never asked
      if (row[base] !== true) continue; // unreachable pair
      const composed = composedForm(base, mark);
      if (seen.has(composed)) continue;
      seen.add(composed);
      out.push(composed);
    }
  }

  return out;
}

/**
 * Additively derive the uppercase counterpart of every promoted composed
 * character (FR-023).
 *
 * For each member, the base grapheme is re-cased through `caseCounterpart` and
 * the uppercase composed form is added when that uppercase base is present in
 * `alphabet.bases`. The result is a superset of `promoted` — **a promotion is
 * never withdrawn** (FR-023). A cased base whose uppercase form is absent from
 * the alphabet, or which has no single-character uppercase form, is promotable
 * on its own without error, and a caseless base derives nothing (there is no
 * case pair to derive, so the derived-capitals note must not claim otherwise).
 */
export function expandCaseCounterpartPromotions(
  alphabet: ConfirmedAlphabet,
  promoted: readonly PromotedComposedCharacter[],
  bcp47?: string,
): PromotedComposedCharacter[] {
  const present = new Set(alphabet.bases);
  const seen = new Set<PromotedComposedCharacter>();
  const out: PromotedComposedCharacter[] = [];

  const push = (member: PromotedComposedCharacter): void => {
    const nfc = member.normalize("NFC");
    if (seen.has(nfc)) return;
    seen.add(nfc);
    out.push(nfc);
  };

  for (const member of promoted) {
    push(member);

    // Split the member back into its base grapheme and trailing marks. NFD
    // gives the base as the first codepoint; everything after it is the mark
    // sequence the counterpart carries over unchanged.
    const decomposed = [...member.normalize("NFD")];
    const [base, ...marks] = decomposed;
    if (base === undefined || marks.length === 0) continue;

    const pair = caseCounterpart(base, bcp47);
    if (pair?.direction !== "toUpper") continue;
    if (!present.has(pair.counterpart)) continue;

    push(pair.counterpart + marks.join(""));
  }

  return out;
}

/**
 * Drop promotions whose pair is no longer reachable (FR-020: an alphabet edit
 * withdraws a member the attachment map no longer reaches). Compared on NFC
 * form against the (case-expanded) attachment map, so an uppercase derivation
 * survives exactly as long as its own row does.
 */
export function prunePromotions(
  alphabet: ConfirmedAlphabet,
  promoted: readonly PromotedComposedCharacter[],
  attachments: Record<string, Record<string, boolean>>,
): PromotedComposedCharacter[] {
  const reachable = new Set<PromotedComposedCharacter>();
  for (const [mark, row] of Object.entries(attachments)) {
    for (const base of alphabet.bases) {
      if (row[base] === true) reachable.add(composedForm(base, mark));
    }
  }
  return promoted.filter((member) => reachable.has(member.normalize("NFC")));
}
