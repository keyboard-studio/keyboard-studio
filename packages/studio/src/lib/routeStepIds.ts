// useRouteStepIds: the step ids on the author's current route, for the route-aware fallback in
// lint/lintToQuestion.ts (spec 108 FR-015). A pure memo over the decision set: no timer, no
// store write. The provider lives in decisions/routeProvider.ts (see the note there).

import { useMemo } from "react";
import { routeStepIdsOf } from "../decisions/routeProvider.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";

export { routeStepIdsOf };

export function useRouteStepIds(): ReadonlySet<string> | undefined {
  const decisions = useDecisionStore((s) => s.decisions);
  return useMemo(() => routeStepIdsOf(decisions), [decisions]);
}
