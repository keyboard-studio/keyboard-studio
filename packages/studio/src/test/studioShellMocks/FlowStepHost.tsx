// Stub for survey/FlowStepHost.tsx — the seam the three converged flows
// render through (makeFlowStepComponent imports FlowStepHost from this direct
// path). Branches on flow.flow_id (the real flow, loaded by the factory via
// loadModularFlow):
//
//   track: track-copy / track-adapt buttons complete with a SurveyPhaseResult
//     carrying track_choice. The factory's extract -> onCommit then fires
//     setSelectedTrack (+ setScaffoldSpec(null) on adapt) BEFORE the host
//     advance.
//   project_name: project-name-next completes with project_display_name
//     "Test Keyboard" + project_keyboard_id "test_keyboard", so the factory
//     extract yields {displayName, keyboardId} and onCommit fires
//     setScaffoldSpec + setIdentity.
//   phase_f_helpdocs: phaseF-complete completes with an empty phase result.
//     No factory onCommit (PhaseF has no pre-onComplete store writes).
//
// Any other flow renders an inert `flow-stub-<id>` marker.

import { fakePhaseResult } from "./fakes.ts";

export function FlowStepHost({
  flow,
  onComplete,
  onBack,
}: {
  flow: { flow_id: string };
  onComplete: (result: unknown) => void;
  onBack?: () => void;
}) {
  if (flow.flow_id === "track") {
    return (
      <div data-testid="stage-track">
        <button
          type="button"
          data-testid="track-copy"
          onClick={() =>
            onComplete({
              phase: "G",
              answers: [{ questionId: "track_choice", answerType: "select", value: "copy" }],
              confirmedInventory: [],
            })
          }
        >
          track-copy
        </button>
        <button
          type="button"
          data-testid="track-adapt"
          onClick={() =>
            onComplete({
              phase: "G",
              answers: [{ questionId: "track_choice", answerType: "select", value: "adapt" }],
              confirmedInventory: [],
            })
          }
        >
          track-adapt
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="track-back" onClick={onBack}>
            track-back
          </button>
        )}
      </div>
    );
  }
  if (flow.flow_id === "project_name") {
    return (
      <div data-testid="stage-project-name">
        <button
          type="button"
          data-testid="project-name-next"
          onClick={() =>
            onComplete({
              phase: "G",
              answers: [
                { questionId: "project_display_name", answerType: "text", value: "Test Keyboard" },
                { questionId: "project_keyboard_id", answerType: "text", value: "test_keyboard" },
              ],
              confirmedInventory: [],
            })
          }
        >
          project-name-next
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="project-name-back" onClick={onBack}>
            project-name-back
          </button>
        )}
      </div>
    );
  }
  if (flow.flow_id === "phase_f_helpdocs") {
    return (
      <div data-testid="stage-F">
        <button type="button" data-testid="phaseF-complete" onClick={() => onComplete(fakePhaseResult)}>
          phaseF-complete
        </button>
        {onBack !== undefined && (
          <button type="button" data-testid="phaseF-back" onClick={onBack}>
            phaseF-back
          </button>
        )}
      </div>
    );
  }
  return <div data-testid={`flow-stub-${flow.flow_id}`} />;
}
