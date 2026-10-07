// FlowStepHost — pure generic survey-flow host (spec 029 Stage 6, T002).
//
// Renders the shared shell that all modular-flow wizard steps share:
//   the survey card shell (epic #533, surveyStyles.ts) + <h2>{title}</h2>
//   + <SurveyRunner>
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

import type { DecisionProposalSource, LintFinding, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { surveyPageColumn, phaseHeading } from "./surveyStyles.ts";
import type { FlowDef, SurveyContext } from "./types.ts";

export interface FlowStepHostProps {
  /** Pre-loaded flow (factory calls loadFlowSourceDef(source)). */
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
  /** Where a seed came from. Forwarded to SurveyRunner. */
  getSeedSource?: (questionId: string) => DecisionProposalSource | undefined;
  onAnswerCommit?: (questionId: string, value: string | string[] | undefined) => void;
  /**
   * Optional per-question `required` override (spec 079 FR-009's adaptive
   * description proposal). Forwarded to SurveyRunner unchanged — see its own
   * doc for the override contract.
   */
  getRequiredOverride?: (questionId: string) => boolean | undefined;
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
  getSeedSource,
  onAnswerCommit,
  findingsByQuestionId,
  getRequiredOverride,
}: FlowStepHostProps) {
  // Spec 089 T020: the spec-087 mutateDeps seam is retired with the
  // `mutate` contract itself — it had no production injector (the factory
  // never passed it), and the write path it prototyped is now the StepHost
  // completion runner (applyDecisionEffects). onAnswerCommit forwards
  // unchanged.

  return (
    <div style={surveyPageColumn}>
      <h2 style={phaseHeading}>{title}</h2>
      <SurveyRunner
        key={flow.flow_id}
        flow={flow}
        context={context}
        onComplete={onComplete}
        {...(onBack !== undefined ? { onBack } : {})}
        {...(getSeedValue !== undefined ? { getSeedValue } : {})}
        {...(getSeedSource !== undefined ? { getSeedSource } : {})}
        {...(onAnswerCommit !== undefined
          ? { onAnswerCommit }
          : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
        {...(getRequiredOverride !== undefined ? { getRequiredOverride } : {})}
      />
    </div>
  );
}

