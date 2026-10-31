// placementInventory — the ONE derivation of "which characters are
// PLACEMENT units" for the assign-loop galleries (issue #2293).
//
// Placement set ≠ production-coverage set. `session.confirmedInventory` is
// the coverage denominator (criterion 18.6 — every character the keyboard
// must PRODUCE), and `mergePhaseResults` builds it by folding the whole
// alphabet projection in: every base, every attested stack composed to NFC,
// and every lone mark — BOTH representations of a marked letter, whatever
// the author answered in the marks series. That is correct for coverage:
// under a productive mark key a composed form is still must-produce,
// credited by base+mark production.
//
// It is wrong as a placement walk. The marks series' answers already chose
// ONE representation (`buildPlacementWorklist`, spec 052/071): a composed
// combination is a placement unit only when its mark's treatment is
// `composed` (or the combination was promoted onto a dedicated key);
// an own-key mark is itself the placement unit and its combinations are
// not. The composed forms stay in the alphabet as what they are — the
// attestation exemplars the attachment questions (S1) ran on — they just
// do not get walked for placement.
//
// Before #2293 each gallery handled this itself: MechanismGallery
// re-derived the exclusion at render time from `worklist.markUnits`
// (asymmetrically — it never removed a lone mark whose treatment was
// `composed`), and TouchGallery did not re-derive it at all, so both forms
// were walked there. This module derives the set once, upstream of both
// galleries; consumers walk THIS list, never the flat inventory.
//
// Fallbacks (identity — the flat inventory, unchanged):
//   - no worklist (marks series never ran, pre-046 session), or
//   - an empty worklist (the S0-skip sentinel `makeEmptyPlacementWorklist`:
//     no marks in the alphabet — its `ownLetterUnits` is empty even though
//     bases exist, so it cannot be read as a placement set), or
//   - no alphabet (the non-alphabet complement cannot be computed —
//     `nonAlphabetConfirmedInventory` against an absent alphabet returns
//     the whole inventory, which would silently un-filter everything).
//
// Pure: no store reads, no I/O. The hook in hooks/usePlacementInventory.ts
// is the only store-facing wrapper.

import type {
  ConfirmedAlphabet,
  PlacementWorklist,
} from "@keyboard-studio/contracts";
import { nonAlphabetConfirmedInventory } from "@keyboard-studio/contracts";

/** The session loanword tier as a Set; empty when the session carries none. */
export function loanwordSetOf(chars: readonly string[] | undefined): Set<string> {
  return new Set(chars ?? []);
}

/**
 * True iff the worklist carries at least one classification (the same
 * content test `deriveCarveNeededSet` applies to decide it is not looking
 * at the S0-skip / absent case).
 */
function hasWorklistContent(worklist: PlacementWorklist | undefined): worklist is PlacementWorklist {
  return (
    worklist !== undefined &&
    (worklist.ownLetterUnits.length > 0 ||
      worklist.markUnits.length > 0 ||
      worklist.blockedCombinations.length > 0)
  );
}

/**
 * Derive the placement walk inventory from the marks series' answers:
 * the worklist's `ownLetterUnits` (plain bases, composed combinations of
 * `composed`-treatment marks, and every promoted combination) plus its
 * `markUnits`' marks (the productive mark keys), plus the non-alphabet
 * confirmed inventory (punctuation / invisibles / loanwords / convenience
 * retentions — the `nonAlphabetConfirmedInventory` complement carve
 * already uses, so a character no store of the alphabet claims is never
 * dropped from placement).
 *
 * Ordering: flat-inventory order for everything the flat inventory
 * carries (the normal case — every worklist unit is also an alphabet
 * projection member), then any worklist unit the flat inventory does not
 * carry (e.g. a plausible-accepted composed combination the author
 * checked at S1 that was never an attested exemplar), in worklist order.
 * Entries are NFC-normalised and deduped, matching the flat inventory's
 * own contract.
 */
export function derivePlacementInventory(
  confirmedInventory: readonly string[],
  alphabet: ConfirmedAlphabet | undefined,
  worklist: PlacementWorklist | undefined,
): string[] {
  if (!hasWorklistContent(worklist) || alphabet === undefined) {
    return [...confirmedInventory];
  }

  const units = new Set<string>();
  for (const unit of worklist.ownLetterUnits) units.add(unit.normalize("NFC"));
  for (const unit of worklist.markUnits) units.add(unit.mark.normalize("NFC"));
  const nonAlphabet = nonAlphabetConfirmedInventory(confirmedInventory, alphabet);

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string): void => {
    const nfc = raw.normalize("NFC");
    if (nfc.length === 0 || seen.has(nfc)) return;
    seen.add(nfc);
    out.push(nfc);
  };

  for (const raw of confirmedInventory) {
    const nfc = raw.normalize("NFC");
    if (units.has(nfc) || nonAlphabet.has(nfc)) push(raw);
  }
  // Worklist units the flat inventory never carried (see doc): appended in
  // worklist order — own-letter units first, then the productive marks.
  for (const unit of worklist.ownLetterUnits) push(unit);
  for (const unit of worklist.markUnits) push(unit.mark);

  return out;
}

/**
 * The characters the marks treatment answer removed from placement
 * (issue #2293): every attested composed form and every lone mark the
 * alphabet claims that is NOT in the placement set — a composed form
 * whose mark is a productive own-key mark, or (the mirror case) a lone
 * mark whose treatment is `composed`. The galleries' SHOW-ALL strip
 * still renders these characters (the coverage denominator is the flat
 * inventory, criterion 18.6), but they are not placement units:
 * selecting one must not open the placement pane, because placement
 * follows the treatment answer, not whichever chip the author taps.
 * Empty whenever the placement derivation falls back to the flat
 * inventory (no/empty worklist, no alphabet), so pre-marks and
 * pre-046 sessions keep the unfiltered selection behaviour.
 */
/**
 * The lone marks whose production obligation is discharged through their
 * composed combinations — the mirror image of the composed-form credit
 * (issue #2293's ruling, applied to the coverage gate by the fix for the
 * 2026-10-19 main-CI gallery cluster).
 *
 * A mark whose treatment is `composed` is NOT a placement unit (see
 * {@link derivePlacementInventory}): the author never gives it a key of
 * its own, on desktop or on touch — the keyboard produces it only as
 * part of its composed combinations. It stays in the flat inventory (the
 * criterion-18.6 production denominator), so a coverage gate that simply
 * asks "is this inventory character produced?" can never be satisfied
 * for it: no placement exists that could produce it, and the galleries'
 * walks (correctly) never offer one. That mismatch trapped every
 * composed-treatment session at the Output gate from #2294 on: the walk
 * believed it had finished every character, the gate still demanded the
 * mark (verified live: basic_kbdfr + é — lettersToAdd [U+0301], gate
 * blocked with zero possible assignments).
 *
 * The credit: a non-placement mark is credited when EVERY attested
 * combination containing it composes (NFC) to a form in `coveredSet`
 * — the caller's own production truth for the modality being gated
 * (desktop: the session-aware produced set; touch: the layout's covered
 * set). A mark with NO attested combinations is never credited on
 * vacuous truth: nothing attests that its combinations are produced.
 * A mark that IS a placement unit (an own-key mark unit) is never
 * credited either — it has a real placement obligation of its own.
 *
 * Pure, like the rest of this module: the caller supplies the covered
 * set, so desktop and touch each credit against their own coverage
 * without this function knowing about either modality.
 */
export function treatmentCreditedMarks(
  alphabet: ConfirmedAlphabet | undefined,
  worklist: PlacementWorklist | undefined,
  coveredSet: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  if (alphabet === undefined || !hasWorklistContent(worklist)) return out;

  const covered = new Set<string>();
  for (const c of coveredSet) covered.add(c.normalize("NFC"));

  const markUnits = new Set(worklist.markUnits.map((u) => u.mark.normalize("NFC")));

  for (const rawMark of alphabet.marks) {
    const mark = rawMark.normalize("NFC");
    if (markUnits.has(mark)) continue; // a placement unit — must be placed, not credited
    const forms: string[] = [];
    for (const stack of alphabet.attestedStacks) {
      if (stack.marks.some((m) => m.normalize("NFC") === mark)) {
        forms.push((stack.base + stack.marks.join("")).normalize("NFC"));
      }
    }
    if (forms.length > 0 && forms.every((f) => covered.has(f))) {
      out.add(mark);
    }
  }
  return out;
}

export function deriveTreatmentFilteredChars(
  confirmedInventory: readonly string[],
  alphabet: ConfirmedAlphabet | undefined,
  worklist: PlacementWorklist | undefined,
): Set<string> {
  const out = new Set<string>();
  if (alphabet === undefined) return out;
  const placement = new Set(
    derivePlacementInventory(confirmedInventory, alphabet, worklist).map((c) =>
      c.normalize("NFC"),
    ),
  );
  for (const stack of alphabet.attestedStacks) {
    const form = (stack.base + stack.marks.join("")).normalize("NFC");
    if (!placement.has(form)) out.add(form);
  }
  for (const mark of alphabet.marks) {
    const m = mark.normalize("NFC");
    if (!placement.has(m)) out.add(m);
  }
  return out;
}
