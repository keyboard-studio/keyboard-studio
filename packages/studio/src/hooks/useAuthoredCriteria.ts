// useAuthoredCriteria — the authored-mode criteria result for one
// artifact stage (spec 084, T4.2/T4.3).
//
// The one assembly both authored surfaces share: CriteriaScreen (the
// full page) and OutputScreen (the summary card) must judge the SAME
// artifact with the SAME inputs, or their counts could disagree. This
// hook wraps useCriteriaFindings (findings + contextMissing over the
// stage's VFS), the criteria record store's current attestations /
// confirmations, and the VFS-derived package facts, and runs the pure
// resolver over the full catalog.
//
// Returns null while the findings are not ready: a half-judged result
// would state verdicts the lint run has not actually produced, so both
// hosts render a not-ready statement instead (absence = a statement).
// The stage is a parameter for the reason useCriteriaFindings documents:
// the host owns the one usePreviewArtifact pipeline instance and hands
// its stage down — this hook mounts no pipeline of its own.

import { useMemo } from "react";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";

import { deriveCriteriaFacts } from "../criteria/deriveCriteriaFacts.ts";
import { resolveCriteria } from "../criteria/resolveCriteria.ts";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import { useCriteriaRecordStore } from "../stores/criteriaRecordStore.ts";
import type { Stage } from "./useKeyboardArtifact.ts";
import { useCriteriaFindings } from "./useCriteriaFindings.ts";

export function useAuthoredCriteria(stage: Stage): CriteriaResult | null {
  const findings = useCriteriaFindings(stage);
  const attestations = useCriteriaRecordStore((s) => s.attestations);
  const confirmations = useCriteriaRecordStore((s) => s.confirmations);

  const { ready, vfs, lintFindings, contextMissing } = findings;

  return useMemo(() => {
    if (!ready || vfs === null) return null;
    return resolveCriteria({
      criteria: ALL_CRITERIA,
      mode: "authored",
      lintFindings,
      record: { attestations, confirmations },
      facts: deriveCriteriaFacts(vfs),
      contextMissing,
    });
  }, [ready, vfs, lintFindings, contextMissing, attestations, confirmations]);
}
