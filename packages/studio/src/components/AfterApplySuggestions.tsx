// AfterApplySuggestions: shows the consistency suggestions an applied change
// raised, on every screen except the criteria page (which lists them itself).
// Mounted once in the studio shell; also runs the Apply watcher (spec 111 US5).
//
// #2528: on the survey route the panel shows only fixes owned by the active
// step or an earlier one (manifest order) — a follow-up for a LATER step
// (e.g. a docs fix on the Touch Gallery) stays hidden until the author
// reaches that step. Off the survey route (output, decisions, flowmap,
// preview) everything shows: Output is the roll-up.

import type { RouteId } from "../lib/location.ts";
import type { ActiveStepId } from "../stores/surveySessionStore.ts";
import { useConsistencyOnApply } from "../hooks/useConsistencyOnApply.ts";
import { useRouteSuggestedFix } from "../hooks/useRouteSuggestedFix.ts";
import { SuggestedFixesPanel } from "./SuggestedFixes.tsx";

export function AfterApplySuggestions({
  showPanel,
  route,
  activeStepId,
  stepOrder,
}: {
  showPanel: boolean;
  /** Current top-level route; the step filter applies only on "survey". */
  route: RouteId;
  /** Active survey step; only meaningful when route === "survey". */
  activeStepId: ActiveStepId;
  /** Manifest step-id order for the #2528 filter. */
  stepOrder: readonly string[];
}) {
  useConsistencyOnApply();
  const onAccept = useRouteSuggestedFix();
  if (!showPanel) return null;
  return (
    <div style={{ padding: "0 12px", maxHeight: "30vh", overflowY: "auto" }}>
      <SuggestedFixesPanel
        onAccept={onAccept}
        testId="after-apply-suggestions"
        {...(route === "survey" ? { activeStepId, stepOrder } : {})}
      />
    </div>
  );
}
