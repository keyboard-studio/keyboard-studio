/**
 * Cause-predicate library (spec 041 US1, T005; FR-002/003/004, research R4).
 *
 * When a construction facet's analyzed sites are not fully consistent, the
 * measurement assembly (measurement.ts) runs this ordered predicate array over
 * the exception set to explain WHY the sites deviate. The first predicate whose
 * `guard` and `fits` both pass tags the whole set with its `CauseTag`; if none
 * fit, the set is `gap-omission` — the residue (FR-002), not a predicate.
 *
 * The library is content-team-extensible: adding a cause is appending an entry
 * (FR-003). Ordering is significant (first-match-wins, FR-006) — more specific,
 * guarded predicates come before broader ones.
 *
 * Starter library (FR-003):
 *   - `character-class` → principled-split. GUARD: the keyboard's script family
 *     is alphabetic-with-diacritics (Latin/Cyrillic/Greek), the only families
 *     where a base/combining split is a principled construction choice rather
 *     than a gap (FR-004). On abugida/abjad the guard fails and the set falls
 *     through — so a diacritic-oriented predicate never mis-tags those.
 *     FITS: every deviating site's observed content is combining marks only.
 *   - `layer-capacity` → capacity-forced. No family guard. FITS: every deviation
 *     lives past the primary layer — classifiers signal this by prefixing the
 *     site `location` with `"overflow"` (the primary layer filled, so the
 *     remaining assignments spilled into an overflow layer). Deterministic and
 *     location-only, so it does not depend on script family. NOTE: the nine P1
 *     desktop classifiers never emit `"overflow"` locations — a physical desktop
 *     layer does not "fill" — so this predicate is exercised in isolation by its
 *     unit test but only fires end-to-end for the P2 touch-layer classifiers
 *     (reproduced ALT/RALT layers past a full primary layer). It ships now as
 *     part of the extensible library the touch facets will wire, not dead code.
 */

import type { CauseTag, ClassifierContext, ExceptionSite } from "./types.js";

/** ISO-15924 codes for the alphabetic-with-diacritics families (FR-004). */
const ALPHABETIC_DIACRITIC_FAMILIES = new Set(["Latn", "Cyrl", "Grek"]);

/** Matches a string that is one-or-more Unicode combining marks and nothing else. */
const COMBINING_MARKS_ONLY = /^\p{M}+$/u;

/**
 * A cause predicate. `id` is the tag it assigns; `guard` scopes applicability
 * (e.g. by script family); `fits` decides whether it explains the WHOLE
 * exception set. `gap-omission` is never a predicate — it is the residue.
 */
export interface CausePredicate {
  id: Exclude<CauseTag, "gap-omission">;
  guard(ctx: ClassifierContext): boolean;
  fits(exceptions: ExceptionSite[], ctx: ClassifierContext): boolean;
}

/**
 * The ordered predicate library. Exported so tests and future content-team
 * additions compose against the same array the assembly uses.
 */
export const CAUSE_PREDICATES: readonly CausePredicate[] = [
  {
    id: "principled-split",
    guard: (ctx) => ctx.scriptFamily !== null && ALPHABETIC_DIACRITIC_FAMILIES.has(ctx.scriptFamily),
    fits: (exceptions) =>
      exceptions.length > 0 && exceptions.every((e) => COMBINING_MARKS_ONLY.test(e.observedValue)),
  },
  {
    id: "capacity-forced",
    guard: () => true,
    fits: (exceptions) =>
      exceptions.length > 0 && exceptions.every((e) => e.location.startsWith("overflow")),
  },
];

/**
 * Assign a single cause tag to the whole exception set (first-match-wins over
 * `CAUSE_PREDICATES`); `gap-omission` when no predicate fits (FR-002). An empty
 * exception set runs no predicate and yields no tag (caller omits
 * `causeTagCounts` — Edge Case).
 */
export function tagExceptionSet(
  exceptions: ExceptionSite[],
  ctx: ClassifierContext,
  predicates: readonly CausePredicate[] = CAUSE_PREDICATES,
): CauseTag | null {
  if (exceptions.length === 0) return null;
  for (const predicate of predicates) {
    if (predicate.guard(ctx) && predicate.fits(exceptions, ctx)) return predicate.id;
  }
  return "gap-omission";
}
