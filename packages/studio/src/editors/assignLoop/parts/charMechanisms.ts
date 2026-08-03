// charMechanisms — the single PRODUCES vs USES predicate shared by
// CharScrollStrip's per-character badge (Part 2) and each gallery's
// "sequences using this character" bottom list (Part 3). Both MechanismGallery
// and TouchGallery call this instead of re-deriving their own count/filter, so
// the two computations can never drift against each other or against what
// the badge shows.
//
// PRODUCES (the badge count): mechanisms whose OUTPUT is `char` — i.e. an
// `individual`-scope assignment TARGETING `char`, in the caller's own
// modality. Deliberately counts EVERY mechanism type (S-01/S-02/S-03/S-08 on
// desktop; longpress/flick/multitap/replace on touch) — sequences count as
// producers here even though each gallery's own excludeSequenceMechanisms
// filter (MechanismGallery.tsx) hides sequence-owned assignments from THAT
// gallery's own "Added"/"Applied methods" chips. That exclusion is a
// sequence-ownership concern for THIS gallery's own edit surface; the
// badge is a cross-cutting "how many ways in total" count and must not
// inherit it. The one type NEVER counted here is TouchGallery's own
// `touch_inherited` placeholder mechanism — it marks "already reachable via
// the base touch layout, not user-configured" (see TouchGallery.tsx's own
// exclusion of it), not a real producer; every other touch-coverage check in
// the codebase excludes it, so this selector must too. Seed reachability is
// instead counted through the separate `inheritedChars` parameter below, so
// that a character the base layout already produces badges as reachable
// whether or not the author ever accepted its "already in layout" suggestion
// — and is never double-counted when they did. producesCount counts MECHANISMS, not assignments — a
// single assignment may carry more than one real mechanism for the same
// target (MechanismGallery's multiple-methods-per-character support), and
// each counts as a separate "way", matching the badge's own aria-label
// ("# way(s) produce this character").
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
import { PATTERN_SEQUENCE } from "../patternIds.ts";

/** One recorded sequence that uses `char` — paired with the assignment's own target (the char the sequence PRODUCES). */
export interface UsedSequenceEntry {
  /** The assignment's own target — the character this sequence's collapse produces. */
  target: string;
  /** The multi_char_sequence mechanism itself (slotValues carries firstLetterOut/secondLetter/collapsedChar). */
  ref: MechanismRef;
}

export interface CharMechanismsResult {
  /** Count of ways `char` is produced: mechanisms (any pattern) whose OUTPUT is `char` — individual-scope, this modality — plus one for seed reachability when `char` is in the caller's `inheritedChars`. */
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
 * Compute both halves of the PRODUCES/USES split for `char` from
 * `assignments`. This function does not know where assignments come from,
 * only how to classify them — callers pass whichever list holds the
 * assignments relevant to the half they need. MechanismGallery passes its
 * own physical `sessionAssignments` for both halves. TouchGallery passes two
 * different lists for its two call sites: its local `charTouch` map values
 * (touch) for the PRODUCES badge, and its Phase C desktop assignments
 * (physical) for the USES list, since sequences are always recorded with
 * physical modality — neither call site concatenates the two.
 *
 * `inheritedChars` (optional) is the set of characters the caller's SEED
 * layout already produces without any author edit — TouchGallery's
 * `detectedChars` (the "already in touch layout" set). A character in that
 * set is genuinely produced by the keyboard, so it contributes one way to
 * `producesCount`. MechanismGallery has no such notion and omits it.
 */
/**
 * The direct-match half of `producesCount` on its own, with none of the
 * `inheritedChars`/seed-reachability bonus folded in: the count of REAL
 * (non-`touch_inherited`) mechanisms whose OUTPUT is `char` via an
 * individual-scope, `modality`-matching assignment in `assignments`.
 *
 * Exported so a caller building its OWN session-aware "inherited" bonus set
 * — MechanismGallery's `alreadyProducedSet`, TouchGallery's
 * `sessionDetectedChars` — can EXCLUDE a character this returns > 0 for
 * before passing that set as `inheritedChars` below. Both of those
 * session-aware sets are (in part) *re-derived* from the very same
 * assignments this function scans — a session-produced glyph set is built
 * by re-parsing the base .kmn AS MODIFIED by this session's assignments
 * (`buildSessionProducedSet`) — so a char already counted here would
 * otherwise be counted a SECOND time via the `inheritedChars` bonus below
 * for the exact same single mechanism, not a genuinely distinct second way
 * to produce it. See MechanismGallery.tsx's/TouchGallery.tsx's own
 * `alreadyProducedSet`/`sessionDetectedChars` doc comments for the full
 * rationale, and this file's own `getCharMechanisms` — which now calls this
 * helper for its own direct-match half, so the two can never drift.
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

export function getCharMechanisms(
  char: string,
  assignments: ReadonlyArray<MechanismAssignment>,
  modality: Modality,
  inheritedChars?: ReadonlySet<string>,
): CharMechanismsResult {
  // Seed reachability is one way to produce the character, independent of the
  // touch_inherited placeholder the "already" suggestion records (which is
  // excluded below) — so accepting that suggestion cannot double-count it.
  let producesCount = inheritedChars?.has(char) === true ? 1 : 0;
  producesCount += directProducesCount(char, assignments, modality);
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
