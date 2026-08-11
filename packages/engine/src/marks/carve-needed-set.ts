// deriveCarveNeededSet — carve's tiered needed-set, DERIVED from the marks
// series' final answers (issue #1357's data-derivation prerequisite). This is
// a pure classification pass: it does not touch the working IR, does not
// build any interaction UI, and does not itself apply removal-safety
// machinery (collectCharContributors / classifyStoreSlotEdit) — the studio
// wiring layer (irToCarveNodes.ts) is the one place those run, unchanged.
//
// Corrected 3-tier model (ratified km-domain + km-keyman + km-strategy):
// carve must never recommend removing the author's NON-CHOSEN representation
// of a mark/letter — only genuinely unreachable base+mark combinations
// (blockedCombinations, FR-021) are new removal-candidate material.
//
//   1. REQUIRED-PRIMARY — never a removal candidate:
//        - every base letter (alphabet.bases);
//        - own-letter class: the reachable base+mark combo, composed;
//        - letter-plus-mark class: the bare mark itself (markUnits).
//   2. OPTIONAL-SECONDARY — keep (never auto-flagged for removal), but NOT
//      required by the author's confirmed mental model — the OTHER
//      representation:
//        - own-letter class: the bare mark itself (legacy/font/edge-case route);
//        - letter-plus-mark class: the reachable base+mark combo, composed
//          (legacy precomposed route).
//   3. BLOCK-CANDIDATE — the only NEW removal signal: worklist.blockedCombinations
//      verbatim (base+mark pairs FR-021 says must never be reachable). The
//      studio wiring layer is responsible for running these through the
//      existing contributor/removal-safety guards (G1/G3/G4) before treating
//      a block-candidate as an actual removable target — this function only
//      names the candidates, it does not clear them for removal.
//   4. Attested stacks (alphabet.attestedStacks, ANY length, including
//      single-mark): the composed form is always REQUIRED-PRIMARY, stacking
//      order preserved (closest-to-base first, per AttestedStack's own doc)
//      — the placement worklist does not model this composition, so these
//      are derived directly from the alphabet, not from the worklist. An
//      attested stack is by definition author-typed and needed, so it is
//      unioned in unconditionally — even a single-mark stack whose base+mark
//      pair also appears in worklist.blockedCombinations must land here, not
//      in blockCandidates (an attested grapheme is never removal material).
//
// Fallback: an empty/absent worklist (S0 skip, or no marks-series data at
// all) degrades to today's pre-046 behavior — the whole `deriveConfirmedInventory`
// projection is treated as needed, nothing is a block-candidate.

import type {
  BlockedCombination,
  ConfirmedAlphabet,
  OutputForm,
  PlacementWorklist,
} from "@keyboard-studio/contracts";
import { deriveConfirmedInventory, makeConfirmedAlphabet } from "@keyboard-studio/contracts";

export interface CarveNeededSet {
  /** Never a removal candidate. */
  requiredPrimary: Set<string>;
  /** Keep — the author's non-chosen representation; never auto-flagged for removal. */
  optionalSecondary: Set<string>;
  /** The only NEW removal-candidate signal (FR-021 unreachable pairs). */
  blockCandidates: BlockedCombination[];
  /**
   * The same block-candidates as concrete graphemes (#526 AC #3): each
   * `blockCandidates` pair run through {@link composeCombo} with this call's
   * `outputForm`, so a consumer comparing against produced characters never
   * has to re-derive NFC/NFD composition for itself. Derived from
   * `blockCandidates` verbatim — no shielding is applied here (an attested
   * combo that is also a blocked pair still appears, exactly as it does in
   * `blockCandidates`); the studio wiring layer's removal-safety guards are
   * what decide whether a candidate is actually removable.
   */
  blockCandidateChars: Set<string>;
}

/**
 * `true` iff the worklist carries at least one classification (i.e. is not
 * the S0-skip / absent case). A type predicate so callers narrow away the
 * `| undefined` without a manual cast.
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
 * Compose a base+marks literal into the grapheme string carve's needed-set
 * tracks. Stacking order is always preserved as given (closest-to-base
 * first) — never re-derived via generic Unicode canonical ordering, which
 * would not respect that contract.
 *
 * `outputForm` selects which concrete grapheme is "the precomposed combo":
 * "ready-made" (or unset — the policy default) NFC-composes the literal
 * concatenation, matching every other combo representation in this codebase
 * (`deriveConfirmedInventory`, the worklist's own `pushUnit`). Under
 * "base-plus-mark" the literal concatenation is left as authored (no NFC
 * compose attempt) — that is the grapheme the whole keyboard has committed
 * to producing when this form is chosen.
 *
 * Module-local by design: every tier of {@link CarveNeededSet} — including
 * `blockCandidateChars` (#526 AC #3) — is composed here, so no consumer needs
 * this helper to re-derive NFC/NFD composition for itself.
 */
function composeCombo(base: string, marks: readonly string[], outputForm: OutputForm | undefined): string {
  const literal = base + marks.join("");
  return outputForm === "base-plus-mark" ? literal : literal.normalize("NFC");
}

export interface DeriveCarveNeededSetArgs {
  alphabet: ConfirmedAlphabet | undefined;
  worklist: PlacementWorklist | undefined;
  /**
   * The S4 whole-keyboard output-form decision — selects which concrete
   * grapheme composeCombo produces for a combo (see its doc). Undefined
   * degrades to the "ready-made" (NFC-compose) default.
   */
  outputForm?: OutputForm;
  /**
   * Accepted for API symmetry with the rest of the #525/#1357 needed-set
   * pipeline, but deliberately UNUSED here: the Turkic case-fold suppression
   * (G5) is a CONSUMPTION-time concern (`isCharCoveredForLocale`, already
   * parameterized by `bcp47` in irToCarveNodes.ts) applied to the UNION of
   * this function's tiers with the CLDR needed-set — exactly how
   * `confirmedInventory` is treated today. Re-deriving a second case-fold
   * here would duplicate that logic rather than reuse it.
   */
  bcp47?: string | null;
}

/**
 * Derive carve's tiered needed-set from the marks series' final answers.
 * Deterministic and NFC-normalized (except combo graphemes under a
 * "base-plus-mark" outputForm — see {@link composeCombo}).
 */
export function deriveCarveNeededSet(args: DeriveCarveNeededSetArgs): CarveNeededSet {
  const { alphabet, worklist, outputForm } = args;

  const requiredPrimary = new Set<string>();
  const optionalSecondary = new Set<string>();
  const blockCandidates: BlockedCombination[] = [];
  const blockCandidateChars = new Set<string>();

  if (!hasWorklistContent(worklist)) {
    // Pre-046 / skipped-series fallback: today's behavior — the whole
    // confirmed-inventory projection is needed, nothing is a block-candidate.
    for (const ch of deriveConfirmedInventory(alphabet ?? makeConfirmedAlphabet())) {
      requiredPrimary.add(ch);
    }
    return { requiredPrimary, optionalSecondary, blockCandidates, blockCandidateChars };
  }

  const resolvedAlphabet = alphabet ?? makeConfirmedAlphabet();
  const resolvedWorklist = worklist; // non-empty per the `hasWorklistContent` narrowing above

  // Tier 1a — every base letter.
  for (const base of resolvedAlphabet.bases) requiredPrimary.add(base.normalize("NFC"));

  // Tier 1c / 2b — productive (letter-plus-mark) marks: bare mark required;
  // reachable precomposed combos are the optional "other representation".
  const productiveMarks = new Set(resolvedWorklist.markUnits.map((m) => m.mark));
  for (const mark of resolvedWorklist.markUnits) requiredPrimary.add(mark.mark.normalize("NFC"));

  // Reachability lookup, straight from blockedCombinations (SC-007: every
  // unchecked base × mark pair is blocked regardless of mental model).
  const blockedSet = new Set(resolvedWorklist.blockedCombinations.map((b) => `${b.base}\x00${b.mark}`));
  const isReachable = (base: string, mark: string): boolean => !blockedSet.has(`${base}\x00${mark}`);

  for (const mark of resolvedAlphabet.marks) {
    if (productiveMarks.has(mark)) {
      // Productive: reachable base+mark combos are the OPTIONAL (legacy
      // precomposed) representation — never removal-flagged. Not required by
      // THIS tier (Tier 2b); an attested combo also lands in requiredPrimary
      // separately via Tier 4, unconditionally.
      for (const base of resolvedAlphabet.bases) {
        if (isReachable(base, mark)) optionalSecondary.add(composeCombo(base, [mark], outputForm));
      }
    } else {
      // Own-letter: reachable combos are REQUIRED (tier 1b); the bare mark
      // itself is the OPTIONAL (other) representation. Also the DEFAULT
      // branch for a mark present in alphabet.marks but named in neither
      // markUnits nor ownLetterUnits — conservative-by-design (required, not
      // dropped), not an oversight.
      for (const base of resolvedAlphabet.bases) {
        if (isReachable(base, mark)) requiredPrimary.add(composeCombo(base, [mark], outputForm));
      }
      optionalSecondary.add(mark.normalize("NFC"));
    }
  }

  // Tier 3 — block-candidates, verbatim (the studio wiring layer runs these
  // through the existing removal-safety guards before acting on them), plus
  // their composed graphemes (#526 AC #3) so consumers comparing against
  // produced characters get the same concrete combo every other tier uses.
  blockCandidates.push(...resolvedWorklist.blockedCombinations);
  for (const bc of resolvedWorklist.blockedCombinations) {
    blockCandidateChars.add(composeCombo(bc.base, [bc.mark], outputForm));
  }

  // Tier 4 — attested stacks (any length, including single-mark): always
  // required, stacking order preserved. Unconditional — an attested stack is
  // author-typed and must never be treated as removal material, even when
  // its base+mark pair is also named in blockedCombinations.
  for (const stack of resolvedAlphabet.attestedStacks) {
    requiredPrimary.add(composeCombo(stack.base, stack.marks, outputForm));
  }

  return { requiredPrimary, optionalSecondary, blockCandidates, blockCandidateChars };
}
