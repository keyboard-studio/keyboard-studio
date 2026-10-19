// Output-form policy (issue #2297, as narrowed by Matthew's scope ruling
// 2026-10-19): ONE keyboard-wide composition policy — every marked character
// the keyboard sends is either a single ready-made character (NFC) or a
// base-plus-mark sequence (NFD). The author picks ONE policy for the whole
// keyboard. There is deliberately NO per-mark, per-class, or per-combination
// composition answer and no author-facing "mixed" option: the only variation
// is Unicode necessity, applied automatically — under the ready-made policy
// a combination with no ready-made single character is sent as base plus
// mark, because there is no single character to send.
//
// This supersedes spec 071 FR-013..FR-016's policy table, which derived the
// proposal from the S2 TREATMENT answer (an own-key mark pushed the keyboard
// to base-plus-mark) and, when any pair lacked a ready-made form, FORBADE
// the ready-made answer for the whole keyboard. Both were the conflation
// #2297 exists to remove: output composition is independent of input order
// (#2293) and of placement treatment. The proposal here derives from the
// INPUT ORDER alone — letter first, then mark pairs naturally with
// base-plus-mark; mark first (or a mark key that waits for the letter) pairs
// naturally with ready-made — and it is a suggestion only (Art. X): the
// author confirms or overturns it as the answer to THIS question, and the
// non-suggested pairing stays choosable (Keyman can rewrite context, so
// postfix input can emit ready-made characters and mark-first input can
// emit base plus mark).
//
// Designer-facing constraint (SC-005): no explanation below may contain the
// words "Unicode" or "normalization" — asserted mechanically in tests. (The
// fallback above is phrased as "no single character exists to send" for the
// same reason.)

import type { PosturePair } from "./nfc-posture-of-inventory.js";
import type { MarkInputOrder, OutputForm } from "@keyboard-studio/contracts";
import type { CharNormalizationForm } from "../character-discovery/suggestMissing.js";

// Canonical declaration lives in contracts (confirmedAlphabet.ts) — engine
// re-exports rather than declaring a divergent copy (contracts is the
// dependency root and cannot import engine's type back).
export type { OutputForm };

/**
 * Maps the chosen whole-keyboard output form to the Unicode normalization
 * form the carve gallery's produced-vs-needed comparison normalizes BOTH
 * sides to (see `isCharCoveredForLocale`'s `form` parameter and its callers
 * in `packages/studio/src/lib/irToCarveNodes.ts`) — "ready-made" produces
 * single precomposed characters (NFC), "base-plus-mark" produces decomposed
 * base+combining-mark sequences (NFD). `undefined` (no output-form decision
 * made yet — e.g. the marks series was skipped) degrades to "NFC", matching
 * pre-046 behavior exactly.
 */
export function normalizationFormForOutputForm(outputForm: OutputForm | undefined): CharNormalizationForm {
  return outputForm === "base-plus-mark" ? "NFD" : "NFC";
}

export interface OutputFormProposal {
  /** The suggested policy — a proposal (Art. X), never a silent derivation. */
  form: OutputForm;
  /** Plain-language reason shown with the proposal (consequence-led, no jargon). */
  explanation: string;
  /**
   * True when at least one attested/accepted pair has NO ready-made form.
   * Under the ready-made policy those pairs are sent as base plus mark
   * automatically (Unicode necessity, not an author-facing mix — see the
   * module doc); the station surfaces that fact as a note, never as a
   * per-pair question, and it never makes ready-made unchoosable.
   */
  anyPairLacksReadyMade: boolean;
}

/**
 * The exact text a base+marks stack is sent as under the recorded policy —
 * the single emission seam every consumer (carve's needed-set composition,
 * the produced-vs-needed comparison, generated rules) shares, so they can
 * never disagree about what a combination IS under a policy.
 *
 * - `"base-plus-mark"` (NFD): the literal base followed by its marks, even
 *   where a ready-made single character exists — and however the combination
 *   was called up (a mark key after the letter, a mark key before it, a
 *   waiting mark key, or a dedicated key of its own).
 * - `"ready-made"` (NFC, also the unset default): the sequence composed as
 *   far as single characters exist. A combination with a ready-made form
 *   becomes that one character; a combination without one stays base plus
 *   mark — automatically, because no single character exists for it.
 */
export function outputStringForStack(
  stack: { base: string; marks: readonly string[] },
  outputForm: OutputForm | undefined,
): string {
  const literal = stack.base + stack.marks.join("");
  return outputForm === "base-plus-mark" ? literal : literal.normalize("NFC");
}

/**
 * Resolve the output-form SUGGESTION from the author's input-order answer
 * and the posture table. First-match on the order only:
 *
 * - `postfix` (letter, then mark) → suggest `base-plus-mark`: the letter is
 *   already sent when the mark arrives, so sending letter and mark
 *   separately is the path that needs no rewriting.
 * - `prefix` (mark, then letter — including a mark key that waits for its
 *   letter) → suggest `ready-made`: nothing is sent until the combination is
 *   complete, so sending the single character is the clean path.
 *
 * The posture table contributes NO suggestion input — only the
 * `anyPairLacksReadyMade` fact the station notes under a ready-made answer.
 * Treatment contributes nothing at all (#2297 boundary: placement follows
 * the treatment answer alone; output form must not be inferred from it).
 */
export function resolveOutputFormProposal(
  posture: PosturePair[],
  inputOrder: MarkInputOrder,
): OutputFormProposal {
  const anyPairLacksReadyMade = posture.some((p) => !p.hasReadyMadeForm);
  if (inputOrder === "postfix") {
    return {
      form: "base-plus-mark",
      anyPairLacksReadyMade,
      explanation:
        "You type the letter first and then its mark, so we suggest your " +
        "keyboard sends the letter and the mark as separate characters, in " +
        "the order they were typed. You can choose single ready-made " +
        "characters instead — when the mark is typed, your keyboard can " +
        "replace the letter with the single character.",
    };
  }
  return {
    form: "ready-made",
    anyPairLacksReadyMade,
    explanation:
      "You press the mark before the letter, so nothing is sent until the " +
      "letter completes the combination — we suggest your keyboard sends " +
      "each accented letter as one single ready-made character. You can " +
      "choose letter plus mark instead — the letter and its mark are sent " +
      "as separate characters once the combination is complete.",
  };
}

/**
 * Whether the output-form station has anything to decide at all: zero
 * decidable pairs (no attested/accepted stacks) means the station must not
 * render (spec edge case — "there is nothing to decide").
 */
export function hasDecidablePairs(posture: PosturePair[]): boolean {
  return posture.length > 0;
}
