// charMechanisms — the single PRODUCES vs USES predicate shared by
// CharScrollStrip's per-character badge (Part 2) and each gallery's
// "sequences using this character" bottom list (Part 3). Both MechanismGallery
// and TouchGallery call this instead of re-deriving their own count/filter, so
// the two computations can never drift against each other or against what
// the badge shows.
//
// THE BADGE ITSELF is `getProducerBadge`, below (the 3-signal "how many
// independent ways can you produce this character" model — see that
// function's own doc comment for the full contract). This file's other
// export, `getCharMechanisms`, is the PRE-getProducerBadge PRODUCES/USES
// predicate: its `usesSequences` half is what actually feeds
// UsesSequencesCard's "sequences using this character" list (Part 3) today;
// its `producesCount` half is a narrower, non-composition-aware direct-match
// count (individual-scope, modality-matching mechanisms targeting `char`,
// same exclusion of `touch_inherited` as `getProducerBadge`'s signal (b)) —
// superseded by `getProducerBadge` for the badge itself, and kept only
// because `directProducesCount` (which both this and `getProducerBadge` call)
// is genuinely shared. Do not wire `getCharMechanisms.producesCount` into a
// new badge display — use `getProducerBadge`.
//
// USES (the bottom list): every recorded multi_char_sequence
// (PATTERN_SEQUENCE) MechanismRef where `char` appears in ANY slot —
// `firstLetterOut` (content), `secondLetter` (indicator), or `collapsedChar`
// (the sequence's own output) — regardless of the assignment's own modality.
// Sequences are always recorded with modality "physical" (the
// SequenceBuilderPanel only ever writes physical assignments), so this scans
// the FULL assignments list passed in, unfiltered by the `modality` parameter
// — a caller browsing
// the Touch Gallery still needs to see "this character is the indicator for
// some other character's desktop sequence", even though touch assignments
// themselves are a disjoint set.

import type { MechanismAssignment, MechanismRef, Modality } from "@keyboard-studio/contracts";
import { composableComponentsFor } from "@keyboard-studio/contracts";
import { PATTERN_SEQUENCE } from "../patternIds.ts";

/** One recorded sequence that uses `char` — paired with the assignment's own target (the char the sequence PRODUCES). */
export interface UsedSequenceEntry {
  /** The assignment's own target — the character this sequence's collapse produces. */
  target: string;
  /** The multi_char_sequence mechanism itself (slotValues carries firstLetterOut/secondLetter/collapsedChar). */
  ref: MechanismRef;
}

export interface CharMechanismsResult {
  /** Count of REAL (non-`touch_inherited`) mechanisms whose OUTPUT is `char` — individual-scope, this modality. Composition-unaware — see this file's own header comment for how this relates to `getProducerBadge`, the actual badge computation. */
  producesCount: number;
  /** Every recorded sequence where `char` appears in ANY slot (input or output), across all modalities in the given assignments. */
  usesSequences: UsedSequenceEntry[];
}

function sequenceRefUsesChar(ref: MechanismRef, char: string): boolean {
  if (ref.patternId !== PATTERN_SEQUENCE) return false;
  const sv = ref.slotValues ?? {};
  return sv["firstLetterOut"] === char || sv["secondLetter"] === char || sv["collapsedChar"] === char;
}

/**
 * The direct-match half of `producesCount` on its own: the count of REAL
 * (non-`touch_inherited`) mechanisms whose OUTPUT is `char` via an
 * individual-scope, `modality`-matching assignment in `assignments`.
 *
 * Exported as the shared primitive both `getCharMechanisms`'s own
 * `producesCount` and `getProducerBadge`'s signal (b) (SESSION-DIRECT) build
 * on, so the two can never drift against each other.
 */
export function directProducesCount(
  char: string,
  assignments: ReadonlyArray<MechanismAssignment>,
  modality: Modality,
): number {
  let count = 0;
  for (const a of assignments) {
    if (a.modality === modality && a.scope === "individual" && a.target === char) {
      // "touch_inherited" is a placeholder marker ("already reachable, not
      // user-configured"), never a real producing mechanism — exclude it so
      // it can't inflate the count. See file-header comment.
      count += a.mechanisms.filter((m) => m.patternId !== "touch_inherited").length;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// getProducerBadge — the 3-signal "how many independent ways can you produce
// this character" model behind CharScrollStrip's badge (deletion-safety
// signal, per product decision: a char reachable BOTH by its own key AND by
// composition shows 2, not 1). Replaces the former inheritedChars/
// directTargets-exclusion workaround each gallery used to build for itself
// (MechanismGallery's old `alreadyProducedSet` exclusion, TouchGallery's old
// `sessionDetectedChars` exclusion) — those built one combined "is this
// reachable at all" set and subtracted direct targets from it to avoid a
// double-count; this instead sums three DISJOINT signals directly, so the
// double-count can't recur.
//
//   (a) BASE-DIRECT (0/1)     — `char` is a member of `baseDirectSet`.
//   (b) SESSION-DIRECT (count) — `directProducesCount(char, assignments,
//       modality)`, counted PER MECHANISM (not collapsed to a boolean) — two
//       keys assigned to the same char is 2, not 1.
//   (c) COMPOSITION (0/1)    — `char`'s own canonical-NFD components are ALL
//       members of `preAugmentSessionAwareSet` (`composableComponentsFor`,
//       one level, no recursion — @keyboard-studio/contracts/ir/composable).
//
// (a)/(b) test `char`'s OWN direct output; (c) tests `char`'s COMPONENTS —
// this is what keeps the three signals disjoint. `baseDirectSet` and
// `preAugmentSessionAwareSet` MUST both be PRE-AUGMENT (never folded through
// `augmentWithComposable`) — an augmented set already contains composed
// characters as ordinary members, which would let (a) or (c) silently
// re-count a composition the OTHER signal already contributed, reintroducing
// the double-count this model exists to prevent. See MechanismGallery.tsx's
// and TouchGallery.tsx's own call-site doc comments for which pre-augment set
// each passes for which gallery/modality.
export interface ProducerBadge {
  /** Total independent ways `char` can be produced: baseDirect + sessionDirect + (isComposable ? 1 : 0). */
  count: number;
  /** True when signal (a) or (b) contributed > 0 — `char` has at least one non-composition producing mechanism. */
  hasDirect: boolean;
  /** True when signal (c) fired — `char`'s NFD components are all directly reachable, independent of whether `char` itself is. */
  isComposable: boolean;
  /**
   * `char`'s own canonical-NFD components, in NFD order, when `isComposable`
   * is true — empty otherwise. Exposed so a caller building a compose-clause
   * display string (CharScrollStrip's `composeComponentNames`) reuses the
   * decomposition `composableComponentsFor` already computed here, rather
   * than re-running `char.normalize("NFD")` a second time.
   */
  components: string[];
}

export function getProducerBadge(
  char: string,
  assignments: ReadonlyArray<MechanismAssignment>,
  modality: Modality,
  baseDirectSet: ReadonlySet<string>,
  preAugmentSessionAwareSet: ReadonlySet<string>,
): ProducerBadge {
  const baseDirect = baseDirectSet.has(char) ? 1 : 0;
  const sessionDirect = directProducesCount(char, assignments, modality);
  const composable = composableComponentsFor(preAugmentSessionAwareSet, char);
  const isComposable = composable !== undefined;
  return {
    count: baseDirect + sessionDirect + (isComposable ? 1 : 0),
    hasDirect: baseDirect > 0 || sessionDirect > 0,
    isComposable,
    components: composable?.components ?? [],
  };
}

/**
 * Compute both halves of the PRODUCES/USES split for `char` from
 * `assignments`. This function does not know where assignments come from,
 * only how to classify them — callers pass whichever list holds the
 * assignments relevant to the half they need. The sole production caller
 * (`UsesSequencesCard.tsx`) only reads the `usesSequences` half; the
 * `producesCount` half exists for callers/tests exercising the direct-match
 * predicate on its own (see this file's header comment re: `getProducerBadge`
 * being the actual badge computation).
 */
export function getCharMechanisms(
  char: string,
  assignments: ReadonlyArray<MechanismAssignment>,
  modality: Modality,
): CharMechanismsResult {
  const producesCount = directProducesCount(char, assignments, modality);
  const usesSequences: UsedSequenceEntry[] = [];

  for (const a of assignments) {
    for (const ref of a.mechanisms) {
      if (sequenceRefUsesChar(ref, char)) {
        usesSequences.push({ target: a.target, ref });
      }
    }
  }

  return { producesCount, usesSequences };
}
