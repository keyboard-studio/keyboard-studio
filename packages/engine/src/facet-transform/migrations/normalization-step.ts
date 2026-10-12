// facet-transform migration for the generated normalization step (spec 086).
//
// Like `createContextToleranceMigrationRule`, a factory over an
// already-computed result: the step was derived once, statically, so `apply()`
// is a plain synchronous copy-return that appends it. The step is one
// all-or-nothing site (`NORMALIZATION_STEP_SITE_ID`); declining it returns the
// IR untouched. The facet-transform gate then checks opaque integrity and the
// compile-regression gate on the candidate.

import type { KeyboardIR, NormalizationStep } from "@keyboard-studio/contracts";
import type { MigrationRule, RewriteResult } from "../types.js";
import { applyNormalizationStep } from "../../pattern-apply/normalization-step/insert.js";
import { NORMALIZATION_STEP_SITE_ID } from "../../pattern-apply/context-tolerance-overlay.js";
import { CONTEXT_TOLERANCE_FACET_ID, CONTEXT_TOLERANCE_RULE_ID } from "./context-tolerance.js";

export function createNormalizationStepMigrationRule(step: NormalizationStep): MigrationRule {
  return {
    id: CONTEXT_TOLERANCE_RULE_ID,
    facetId: CONTEXT_TOLERANCE_FACET_ID,
    hasCompanionRewrites: false,
    derivesParameters: false,
    apply(workingCopyIr: KeyboardIR, acceptedSiteIds: string[]): RewriteResult {
      const accepted = acceptedSiteIds.includes(NORMALIZATION_STEP_SITE_ID);
      return {
        candidateIr: accepted ? applyNormalizationStep(workingCopyIr, step) : workingCopyIr,
        ledger: [{ siteId: NORMALIZATION_STEP_SITE_ID, outcome: accepted ? "applied" : "skipped" }],
      };
    },
  };
}
