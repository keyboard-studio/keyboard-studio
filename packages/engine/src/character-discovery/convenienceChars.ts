/**
 * convenienceChars — the pre-carve "keep these for convenience?" candidate set.
 *
 * When a Latin-script author's orthography uses only part of the alphabet, the
 * carve gallery correctly reads the rest of the base keyboard's A-Z as surplus
 * and proposes removing it. That is right for the language and wrong for the
 * author, who still has to type borrowed words, email addresses, and web
 * addresses on this keyboard. This module computes what the pre-carve
 * convenience question offers: the basic-Latin letters the base produces that
 * the orthography does not use.
 *
 * Scope is deliberately BASIC LATIN ONLY (U+0041-005A / U+0061-007A). The
 * loanword/URL case is specifically about a-z; a Cyrillic or Greek base's own
 * surplus letters stay a pure carve-gallery decision rather than being
 * pre-empted by a question the author has no general reason to answer. Digits
 * and punctuation need no question at all — carve never proposes them (see
 * `isAlwaysKeepCategory` in the studio's irToCarveNodes).
 *
 * Case pairing is plain ASCII (`a`<->`A`), not locale-aware `caseCounterpart`.
 * Within basic Latin the only locale divergence is Turkish dotted/dotless i,
 * and a Turkish orthography contains `i` and `ı` outright, so the needed-set
 * check below already suppresses that pair before casing could matter. Pairing
 * by codepoint keeps the offered list identical in every locale.
 *
 * Pure, browser-safe, no I/O.
 */

/**
 * One offered choice: a cased letter pair the author keeps or drops as a unit.
 * Keeping `q` without `Q` is never what anyone means, so the question offers
 * the pair once and retains whichever members the base actually produces.
 */
export interface ConvenienceCandidate {
  /** The lowercase letter — the chip's stable identity and its sort key. */
  primary: string;
  /**
   * Everything retaining this candidate keeps: the lowercase and/or uppercase
   * member, restricted to those the base keyboard actually produces. Never
   * empty. Lowercase first when both are present.
   */
  chars: string[];
}

/** `a`..`z`, the offer order. */
const LOWER_BASIC_LATIN = "abcdefghijklmnopqrstuvwxyz";

export interface SurplusBasicLatinArgs {
  /** Glyphs the working keyboard can statically produce (`buildProducedSet`). */
  produced: ReadonlySet<string>;
  /**
   * Characters the orthography needs. Any pair with either member in here is
   * not surplus and is not offered — the author never sees a question about a
   * letter their language already uses.
   */
  needed: ReadonlySet<string>;
}

/**
 * The basic-Latin letters the base produces but the orthography does not use,
 * folded into case pairs and returned in `a`..`z` order.
 *
 * A pair is offered only when the base actually produces at least one of its
 * members — there is nothing to "keep" about a letter the keyboard cannot type
 * in the first place — and when neither member is needed.
 */
export function surplusBasicLatinCandidates(
  { produced, needed }: SurplusBasicLatinArgs,
): ConvenienceCandidate[] {
  const out: ConvenienceCandidate[] = [];
  for (const lower of LOWER_BASIC_LATIN) {
    const upper = lower.toUpperCase();
    if (needed.has(lower) || needed.has(upper)) continue;
    const chars: string[] = [];
    if (produced.has(lower)) chars.push(lower);
    if (produced.has(upper)) chars.push(upper);
    if (chars.length === 0) continue;
    out.push({ primary: lower, chars });
  }
  return out;
}

/** Flatten candidates to the flat character list carried on a phase result. */
export function candidateChars(candidates: readonly ConvenienceCandidate[]): string[] {
  return candidates.flatMap((c) => c.chars);
}
