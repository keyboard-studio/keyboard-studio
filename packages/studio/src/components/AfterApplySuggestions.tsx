// AfterApplySuggestions: shows the consistency suggestions an applied change
// raised, on every screen except the criteria page (which lists them itself).
// Mounted once in the studio shell; also runs the Apply watcher (spec 111 US5).

import { useConsistencyOnApply } from "../hooks/useConsistencyOnApply.ts";
import { useRouteSuggestedFix } from "../hooks/useRouteSuggestedFix.ts";
import { SuggestedFixesPanel } from "./SuggestedFixes.tsx";

export function AfterApplySuggestions({ showPanel }: { showPanel: boolean }) {
  useConsistencyOnApply();
  const onAccept = useRouteSuggestedFix();
  if (!showPanel) return null;
  return (
    <div style={{ padding: "0 12px", maxHeight: "30vh", overflowY: "auto" }}>
      <SuggestedFixesPanel onAccept={onAccept} testId="after-apply-suggestions" />
    </div>
  );
}
