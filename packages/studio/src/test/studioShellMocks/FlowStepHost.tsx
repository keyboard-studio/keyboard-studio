// Stub for survey/FlowStepHost.tsx — the seam the three converged flows
// render through (makeFlowStepComponent imports FlowStepHost from this direct
// path). Branches on flow.flow_id (the real flow, loaded by the factory via
// loadFlowSourceDef):
//
// It stands in for FlowStepHost AND the SurveyRunner inside it, so it publishes
// the footer nav the way SurveyRunner does, under SurveyRunner's handles
// (survey-back / survey-advance, spec 081).
//
//   track: track-copy / track-adapt buttons complete with a SurveyPhaseResult
//     carrying track_choice. Spec 089: the factory forwards the result
//     untouched; the host records the authoring-track decision, from which
//     the track is derived at advance.
//   project_name: survey-advance completes with project_display_name
//     "Test Keyboard" + project_keyboard_id "test_keyboard"; the host
//     records the project decisions and project_keyboard_id's apply lands
//     setIdentity on the working copy.
//   phase_f_helpdocs: survey-advance completes with an empty phase result.
//
// Any other flow renders an inert `flow-stub-<id>` marker.

import { fakePhaseResult } from "./fakes.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

const PROJECT_NAME_RESULT = {
  phase: "G",
  answers: [
    { questionId: "project_display_name", answerType: "text", value: "Test Keyboard" },
    { questionId: "project_keyboard_id", answerType: "text", value: "test_keyboard" },
  ],
  confirmedInventory: [],
};

export function FlowStepHost({
  flow,
  onComplete,
  onBack,
}: {
  flow: { flow_id: string };
  onComplete: (result: unknown) => void;
  onBack?: () => void;
}) {
  const stubbed = ["track", "project_name", "phase_f_helpdocs"].includes(flow.flow_id);
  const advance: Record<string, () => void> = {
    project_name: () => onComplete(PROJECT_NAME_RESULT),
    phase_f_helpdocs: () => onComplete(fakePhaseResult),
  };
  const onAdvance = advance[flow.flow_id];
  usePublishStepNav({
    ...(stubbed && onBack !== undefined
      ? { back: { label: "survey-back", onClick: onBack, testId: "survey-back" } }
      : {}),
    // The track stub completes from its in-page choice buttons, so it offers no Next.
    ...(onAdvance !== undefined
      ? { forward: { label: "survey-advance", onClick: onAdvance, testId: "survey-advance" } }
      : {}),
  });

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
      </div>
    );
  }
  if (flow.flow_id === "project_name") return <div data-testid="stage-project-name" />;
  if (flow.flow_id === "phase_f_helpdocs") return <div data-testid="stage-F" />;
  return <div data-testid={`flow-stub-${flow.flow_id}`} />;
}
