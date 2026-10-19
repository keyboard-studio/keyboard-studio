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
