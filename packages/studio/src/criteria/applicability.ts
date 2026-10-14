// Applicability predicates for the criteria resolver (spec 084, plan D7).
//
// Applicability is explicit, small, and conservative: a criterion becomes
// Not applicable only via one of the named predicates below, each carrying
// its reason as a plain evidence sentence the page can show. Everything
// else defaults to applicable — a criterion is never Not applicable merely
// because some data about the keyboard is absent.

import type { Criterion } from "@keyboard-studio/contracts";

import type { CriteriaFacts } from "./criteriaTypes.ts";

/** A named applicability verdict: the criterion does not apply, and why. */
export interface Applicability {
  reason: string;
}

/**
 * Whether `criterion` is Not applicable to a keyboard with the given
 * package facts, or null when it applies (the default). Predicates read
 * only the criterion's catalog section and the facts — nothing else.
 */
export function applicabilityFor(
  criterion: Criterion,
  facts: CriteriaFacts,
): Applicability | null {
  if (criterion.section.startsWith("9.") && !facts.fontBundled) {
    return {
      reason:
        "This criterion concerns fonts in the package, and this keyboard's package bundles no font.",
    };
  }
  if (criterion.section.startsWith("15.") && !facts.deprecated) {
    return {
      reason:
        "This criterion concerns deprecating a keyboard, and this keyboard is not deprecated.",
    };
  }
  if (criterion.section.startsWith("16.") && !facts.partnerPackage) {
    return {
      reason:
        "This criterion concerns partner-organization packages, and this package is not a partner-organization package.",
    };
  }
  return null;
}
