// useOpenWalkCriteria: the live authored criteria result for an Open-walk step
// that needs it (Missing letters, Upgrades). Same assembly CriteriaScreen runs:
// one artifact pipeline instance for the mounted step (the OutputScreen
// precedent in usePreviewArtifact's header), judged by useAuthoredCriteria.
// No timer of its own: the pipeline's single debounce cycle drives it (D3).

import { usePreviewArtifact } from "./usePreviewArtifact.ts";
import { useAuthoredCriteria } from "./useAuthoredCriteria.ts";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import type { Stage } from "./useKeyboardArtifact.ts";

export interface OpenWalkCriteria {
  /** Null while the compiled keyboard or the lint run is not ready. */
  result: CriteriaResult | null;
  stage: Stage;
}

export function useOpenWalkCriteria(): OpenWalkCriteria {
  const artifact = usePreviewArtifact();
  const result = useAuthoredCriteria(artifact.stage);
  return { result, stage: artifact.stage };
}
