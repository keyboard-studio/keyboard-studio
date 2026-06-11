// Phase F survey wrapper — Help documentation authoring (spec §8 step 9).
//
// Loads phase_f_helpdocs.yaml and runs it through SurveyRunner.
// The welcome.htm template is in the YAML but rendered by the scaffolder at
// output time — this wrapper only collects the user's answers.

import { useMemo } from "react";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { parseFlow } from "./loadFlow.ts";
import type { SurveyContext } from "./types.ts";

// Vite ?raw import
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite resolves ?raw at build/dev time
import phaseFRaw from "../../../../content/flows/phase_f_helpdocs.yaml?raw";

// ---------------------------------------------------------------------------
// PhaseF component
// ---------------------------------------------------------------------------

export interface PhaseFProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack?: () => void;
  findings?: LintFinding[];
}

export function PhaseF({ context = {}, onComplete, onBack, findings }: PhaseFProps) {
  const flow = useMemo(() => parseFlow(phaseFRaw as string), []);

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
        Phase F — Help documentation
      </h2>
      <SurveyRunner
        flow={flow}
        context={context}
        onComplete={onComplete}
        {...(onBack !== undefined ? { onBack } : {})}
        {...(findings !== undefined ? { findings } : {})}
      />
    </div>
  );
}
