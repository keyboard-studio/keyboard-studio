// Applicability predicates for the criteria resolver (spec 084, plan D7).
//
// Applicability is explicit, small, and conservative: a criterion becomes
// Not applicable only via one of the named predicates below, each carrying
// its reason as a plain evidence sentence the page can show. Everything
// else defaults to applicable — a criterion is never Not applicable merely
// because some data about the keyboard is absent.

import type { Criterion } from "@keyboard-studio/contracts";

import { VERSION_VERDICT_CODES } from "./assemblyVerdicts.ts";
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
  // /review Batch 5: the §19 twin rows (19.1b/19.2b) concern keyboards
  // adapted from a release keyboard. Without an adaptation signal (PR
  // body / HISTORY.md, set by the /review host) they are Not applicable
  // — a regular contributor PR is not an adaptation. The bake rows
  // (19.1/19.2) are vacuously satisfied for non-adaptations (the
  // scaffolder's guarantee holds trivially), so they stay applicable.
  if (
    (criterion.id === "19.1b-import-attribution-in-pr-body" ||
      criterion.id === "19.2b-import-attribution-in-history-md") &&
    !facts.isAdaptation
  ) {
    return {
      reason:
        "This criterion concerns keyboards adapted from a release keyboard, and this keyboard shows no adaptation signal.",
    };
  }
  // Batch 3: the version-bump rows (2.1/2.2/2.6) presuppose a
  // previously deployed version. A new-from-base keyboard has none —
  // its first version is simply its version.
  const lintRuleId = "lintRuleId" in criterion ? criterion.lintRuleId : undefined;
  if (
    lintRuleId !== undefined &&
    VERSION_VERDICT_CODES.has(lintRuleId) &&
    facts.instantiationMode === "new-from-base"
  ) {
    return {
      reason:
        "This criterion concerns incrementing a previously deployed version, and a keyboard created new from a base has no previously deployed version.",
    };
  }
  return null;
}
