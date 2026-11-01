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

/** Lint codes of the criteria that judge the content of the help .php. */
const HELP_PHP_CONTENT_CODES: ReadonlySet<string> = new Set([
  "KM_LINT_PHP_OSK_LAYERS_INCOMPLETE", // 11.2
  "KM_LINT_PHP_STYLE_OUTSIDE", // 11.3b
  "KM_LINT_PHP_CLOSING_TAGS", // 11.4b
  "KM_LINT_PHP_DATA_STATES_INCOMPLETE", // 11.6
  "KM_LINT_PHP_PAGENAME_FORMAT", // 11.7
  "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED", // 11.8
]);

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
  // scaffolder's guarantee holds trivially), so they stay applicable
  // here. That carve-out is correct for AUTHORED mode only: in foreign
  // mode the resolver resolves every bake row Not applicable in favour
  // of its lint twin (see resolveCriteria's scaffolder-bake case).
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
  // /review: the help-page content rows judge a help .php that is not
  // there. Its absence is the §11.1b finding, not a pass or fail here.
  const lintCode = "lintRuleId" in criterion ? criterion.lintRuleId : undefined;
  if (
    facts.helpPhpAbsent === true &&
    lintCode !== undefined &&
    HELP_PHP_CONTENT_CODES.has(lintCode)
  ) {
    return {
      reason: "No help .php; its absence is reported by 11.1b.",
    };
  }
  // /review: 3.4 compares against the keyboard's earlier HISTORY.md; a
  // keyboard the PR adds has none.
  if (
    facts.newKeyboardAtBase === true &&
    lintCode === "KM_LINT_HISTORY_TRUNCATED"
  ) {
    return {
      reason:
        "This PR adds the keyboard, so there is no earlier HISTORY.md whose entries must be preserved.",
    };
  }
  // Batch 3: the version-bump rows (2.1/2.2/2.6) presuppose a
  // previously deployed version. A new-from-base keyboard has none —
  // its first version is simply its version.
  if (
    lintCode !== undefined &&
    VERSION_VERDICT_CODES.has(lintCode) &&
    facts.instantiationMode === "new-from-base"
  ) {
    return {
      reason:
        "This criterion concerns incrementing a previously deployed version, and a keyboard created new from a base has no previously deployed version.",
    };
  }
  // Named positive facts from the lint pass (spec 084 D7): the check ran
  // and found nothing, so the documentation/judgment rows about that
  // thing have nothing to judge. A check that did not run sets no fact.
  if (
    facts.noPuaInOutput === true &&
    (criterion.id === "7.13-pua-documentation" ||
      criterion.id === "13.2-pua-notices-in-docs")
  ) {
    return {
      reason:
        "The produced output contains no Private Use Area codepoints (check 13.1), so there is nothing to document.",
    };
  }
  if (
    facts.noMathLatinLookalikes === true &&
    criterion.id === "13.5-math-latin-not-spoofing"
  ) {
    return {
      reason:
        "The produced output contains no mathematical Latin look-alikes (check 13.4), so there is nothing to compare for spoofing.",
    };
  }
  // /review language tags (languageTags.ts): langtags and Glottolog say
  // there is nothing to flag.
  if (
    facts.kpsTagsAllInLangtags === true &&
    criterion.id === "10.4-kps-unusual-tag-flagged"
  ) {
    return {
      reason:
        "Every .kps language tag is one langtags records, so none is new or unusual.",
    };
  }
  if (
    facts.kpsTagsNoConstructed === true &&
    criterion.id === "10.5-kps-conlang-flagged"
  ) {
    return {
      reason:
        "Glottolog classifies every .kps language as a natural language, none as constructed.",
    };
  }
  if (
    facts.outputScriptRecordedByLangtags === true &&
    (criterion.id === "12.5-script-mismatch-flagged" ||
      criterion.id === "12.6-script-mismatch-submitted-to-langtags")
  ) {
    return {
      reason:
        "langtags records the keyboard's output script for every .kps language, so there is no script mismatch to flag.",
    };
  }
  if (
    facts.copyrightSingleYear === true &&
    criterion.id === "4.8-year-range-starts-at-original"
  ) {
    return {
      reason: "The LICENSE.md copyright states a single year, not a range.",
    };
  }
  if (
    facts.copyrightAndHistoryOneYear === true &&
    criterion.id === "4.2-copyright-year-range-if-multiyear"
  ) {
    return {
      reason:
        "The LICENSE.md year and every HISTORY.md entry fall in the same year, so the keyboard was not updated across multiple years.",
    };
  }
  if (
    criterion.id === "17.1-build-trigger-pr-comments-resolved" &&
    (facts.noPrComments === true || facts.notAPullRequest === true)
  ) {
    return {
      reason:
        facts.notAPullRequest === true
          ? "This is a published keyboard, not a pull request, so there are no PR comments to resolve."
          : "This PR has no diff comments, conversation comments or reviews requesting changes, so there is nothing to resolve.",
    };
  }
  if (
    facts.newKeyboardAtBase === true &&
    criterion.id === "14.1-third-party-patch-author-consulted"
  ) {
    return {
      reason:
        "This PR adds the keyboard, so it patches no existing third-party keyboard whose author needs consulting.",
    };
  }
  return null;
}
