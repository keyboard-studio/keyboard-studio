// The step-driver contract (spec 107 T016). A driver stands in for one step's
// React component: it reads what the product offers, lets the walk policy
// pick, applies the pick through the function the UI control's handler calls
// (FR-015), and returns the result the component would hand to `onComplete`.
// The routing loop then runs the same completion path StepHost runs
// (lib/completeStep.ts).
//
// A driver that needs an `if` the UI does not have is reporting a missing
// lift: stop and lift (FR-040) or list it as Playwright-only (FR-042); never
// write the branch (FR-017).

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { Case } from "../caseTypes.ts";
import type { RunReportAccumulator } from "../runReport.ts";
import type { DecisionRecorder } from "../../../decisions/createDecisionRecorder.ts";

export interface DriverContext {
  case: Case;
  /** The copied keyboard's IR as instantiated (the starting point). */
  startIr: KeyboardIR;
  report: RunReportAccumulator;
  /**
   * The loop's decision recorder (the `recordDecision` dep it built for
   * `completeStep`). StepHost hands its `recordQuestionAnswers` to a flow's
   * runner, and StudioShell calls `recordStartContributionNow` after the
   * instantiation; a driver for those steps calls the same methods on the same
   * instance (its snapshotter is stateful, so a second one would diverge).
   * Optional until runAuthorCase.ts passes it.
   */
  recorder?: DecisionRecorder;
}

/** Returns the step component's `onComplete` result (undefined when it passes none). */
export type StepDriver = (ctx: DriverContext) => Promise<unknown> | unknown;

/** A driver module's dispatch entries, keyed by the manifest step id it stands in for. */
export type StepDrivers = Readonly<Record<string, StepDriver>>;
