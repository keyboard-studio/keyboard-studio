// useValidatorFindings — single owner of the per-question findings projection.
//
// Reads the flat `validatorFindings` array from workingCopyStore (the spec-014
// V3 store bridge that the single useValidator in SurveyView publishes into)
// and derives the per-question lookup via buildFindingsByQuestionId.
//
// This is the authoritative memoisation site for that projection. Call it once
// per component tree that needs findingsByQuestionId; do NOT call
// buildFindingsByQuestionId directly in component code (that duplicates the
// memo and introduces inconsistency).
//
// spec-014 V3 store bridge: workingCopyStore.validatorFindings is the single
// source of truth — the hook never sources findings from a second store field
// or a second debounce timer.

import { useMemo } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { buildFindingsByQuestionId } from "../lint/lintToQuestion.ts";

/**
 * Returns a stable `Record<string, LintFinding[]>` that maps each survey
 * question ID to the validator findings relevant to it, derived from the
 * current `validatorFindings` in workingCopyStore.
 *
 * Re-derives only when `validatorFindings` changes (reference equality).
 * Empty store → `{}`.
 *
 * Single ownership: this is the only place in the SPA that memoises the
 * `buildFindingsByQuestionId` projection (spec-014 V3 store bridge).
 */
export function useValidatorFindings(): Record<string, LintFinding[]> {
  const validatorFindings = useWorkingCopyStore((s) => s.validatorFindings);
  return useMemo(
    () => buildFindingsByQuestionId(validatorFindings),
    [validatorFindings],
  );
}
