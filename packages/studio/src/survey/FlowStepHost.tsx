// FlowStepHost — pure generic survey-flow host (spec 029 Stage 6, T002).
//
// Renders the shared shell that all modular-flow wizard steps share:
//   dark #0d1117 container + blue #6ea8fe <h2>{title}</h2> + <SurveyRunner>
//
// This component is PURE — no store imports, no steps/flowSources import
// (runtime), no dashboard/ or lib/ imports (contract C1.3). All store effects
// and flow resolution live in the factory layer (editors/adapters/).
//
// Props are forwarded to SurveyRunner ONLY when defined, matching the optional-
// prop guarding the three bespoke wrappers use today (C1.2).
//
// C1.4: exported from survey/index.ts so the golden-walk vi.mock("../survey/index.ts")
// seam intercepts it.

import type { LintFinding, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import type { FlowDef, SurveyContext } from "./types.ts";

export interface FlowStepHostProps {
  /** Pre-loaded modular flow (factory calls loadModularFlow(source.raw)). */
  flow: FlowDef;
  /** Header text (from options.title / flowSource.title). */
  title: string;
  /** Survey context passed to SurveyRunner (from options.buildContext). */
  context: SurveyContext;
  /** Runner completion — the factory wraps this to run onCommit + extract first. */
  onComplete: (result: SurveyPhaseResult) => void;
  /** Back — forwarded to SurveyRunner (StepHost pop when the runner stack bottoms out). */
  onBack?: () => void;
  /** Optional seeding (project_name slug). Forwarded to SurveyRunner. */
  getSeedValue?: (questionId: string) => string | string[] | undefined;
  onAnswerCommit?: (questionId: string, value: string | string[] | undefined) => void;
  /** Optional per-question lint findings (phase_f). Forwarded to SurveyRunner. */
  findingsByQuestionId?: Record<string, LintFinding[]>;
}

// ---------------------------------------------------------------------------
// FlowStepHost
// ---------------------------------------------------------------------------

export function FlowStepHost({
  flow,
  title,
  context,
  onComplete,
  onBack,
  getSeedValue,
  onAnswerCommit,
  findingsByQuestionId,
}: FlowStepHostProps) {
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
        {title}
      </h2>
      <SurveyRunner
        key={flow.flow_id}
        flow={flow}
        context={context}
        onComplete={onComplete}
        {...(onBack !== undefined ? { onBack } : {})}
        {...(getSeedValue !== undefined ? { getSeedValue } : {})}
        {...(onAnswerCommit !== undefined ? { onAnswerCommit } : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}

