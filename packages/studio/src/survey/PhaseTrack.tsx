// PhaseTrack — modular survey runner for the track-selection wizard step.
//
// Loads track.modular.yaml, resolves track_choice via the registry, and runs it
// through SurveyRunner. On completion it extracts the "copy" | "adapt" answer
// and calls the appropriate StudioShell handler.
//
// The base keyboard's display name is passed via SurveyContext so the runner
// interpolates {{base_name}} in the track_choice prompt — identical information
// to what TrackStep.tsx displayed in its <p> introduction.
//
// Behavior parity contract:
//   copy  → onTrackSelected("copy")
//   adapt → onTrackSelected("adapt")
// The caller (SurveyView) maps onTrackSelected to handleTrackSelected — zero
// change to the fork/scaffold logic.

import { useMemo } from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext } from "./types.ts";
import type { Track } from "../editors/panels/TrackStep.tsx";

// Vite ?raw import — typed via the `*.yaml?raw` declaration in src/vite-env.d.ts.
import trackRaw from "../../../../content/flows/track.modular.yaml?raw";

// ---------------------------------------------------------------------------
// PhaseTrack component
// ---------------------------------------------------------------------------

export interface PhaseTrackProps {
  /** Base keyboard display name — interpolated into {{base_name}} in the prompt. */
  baseDisplayName: string;
  /** Called when the user commits a track choice. */
  onTrackSelected: (track: Track) => void;
  /** Back handler — passed to SurveyRunner so the Back button goes up the wizard. */
  onBack: () => void;
}

export function PhaseTrack({ baseDisplayName, onTrackSelected, onBack }: PhaseTrackProps) {
  const flow = useMemo(() => loadModularFlow(trackRaw as string), []);

  // Pass base_name into context so the SurveyRunner interpolates {{base_name}}.
  const context: SurveyContext = useMemo(
    () => ({ base_name: baseDisplayName }),
    [baseDisplayName],
  );

  function handleComplete(result: SurveyPhaseResult) {
    // Extract the track_choice answer value.
    const answer = result.answers.find((a) => a.questionId === "track_choice");
    const trackValue =
      answer !== undefined && (answer.answerType === "select" || answer.answerType === "text")
        ? String(answer.value)
        : undefined;
    if (trackValue === "copy" || trackValue === "adapt") {
      onTrackSelected(trackValue);
    }
    // If answer is missing or unrecognised, stay on the step (no call).
  }

  return (
    <div
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Authoring Track
      </h2>
      <SurveyRunner
        key={flow.flow_id}
        flow={flow}
        context={context}
        onComplete={handleComplete}
        onBack={onBack}
      />
    </div>
  );
}
