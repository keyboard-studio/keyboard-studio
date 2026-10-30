// Context-tolerance station inside the marks step: the analysis the preview
// pipeline publishes, the station's pre-accepted proposal, and applying the
// recorded decision. Used by marks.ts; not a step of its own.
//
// The live station is hidden in the default walk unless the analysis yields a
// proposal (or is still running). The author awaits the analysis the UI would
// have waited on screen for. An analysis that fails is published as failed, as
// the preview does, and the series continues without the station; the run
// report names it. (The engine call itself is caught inside
// runContextToleranceAnalysis, so a throw never reaches this driver.)

import type { KeyboardIR, MarksContextToleranceDecision } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore, type ContextToleranceState } from "../../../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "../../../lib/serializeWorkingCopy.ts";
import { readVfsText } from "../../../lib/vfsText.ts";
import { runContextToleranceAnalysis } from "../../../lib/contextToleranceRun.ts";
import { applyToleranceDecision } from "../../../lib/contextToleranceCommit.ts";
import {
  decisionFromProposal,
  toleranceProposalFor,
  toleranceStationShown,
} from "../../../survey/marks/contextToleranceProposal.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import type { DriverContext, StepDrivers } from "./types.ts";

export type ToleranceDecisionInput = Omit<MarksContextToleranceDecision, "appliedFingerprint">;

export interface ToleranceStation {
  /** The series lists the context-tolerance station. */
  shown: boolean;
  /** The decision the author took at the station, when a proposal was offered. */
  decision: ToleranceDecisionInput | null;
  analysis: ContextToleranceState;
}

const RUN_ID = 0;

/**
 * What the preview runs: the IR parsed from the projected .kmn. The store's
 * working IR is never emitted into the artifact, so it can lag what the author
 * would see compiled.
 */
async function projectedIr(): Promise<KeyboardIR | null> {
  const projected = await projectWorkingCopyForOutput();
  if (projected === null) return null;
  const kmn = readVfsText(projected.vfs, `source/${projected.keyboardId}.kmn`);
  return kmn === undefined ? null : parseKmn(kmn, projected.keyboardId).ir;
}

/** Run the analysis the preview pipeline runs, and take the station's pick. */
export async function takeToleranceStation(ctx: DriverContext): Promise<ToleranceStation> {
  const ir = await projectedIr();
  if (ir !== null) await runContextToleranceAnalysis(ir, RUN_ID, () => true);

  const analysis = useWorkingCopyStore.getState().contextTolerance;
  if (analysis.status === "failed") {
    // The preview pipeline publishes a failed analysis and the series goes on without
    // the station (could-not-check, never clean); so does the author, and says so.
    ctx.report.addSkippedStep({ step: "marks.context_tolerance", reason: `analysis-failed: ${analysis.reason}` });
    return { shown: false, decision: null, analysis };
  }

  const proposal = toleranceProposalFor(analysis);
  const shown = toleranceStationShown(analysis, proposal);
  if (proposal === null || analysis.status !== "ready") return { shown, decision: null, analysis };

  const step = chooseByPolicy<ToleranceDecisionInput>({
    decisionId: "marks.context_tolerance",
    // The station pre-accepts every site: confirming it unchanged is its default.
    suggestions: [decisionFromProposal(proposal, analysis.fingerprint)],
    proposalSource: "toleranceProposalFor",
  });
  ctx.report.addStep(step);
  return { shown, decision: step.value, analysis };
}

/** Apply a recorded accept/partial decision, as the apply effect does once the value is on record. */
export async function applyToleranceStation(station: ToleranceStation): Promise<void> {
  const { decision, analysis } = station;
  if (decision === null || decision.decision === "decline" || analysis.status !== "ready") return;
  await applyToleranceDecision(decision, analysis);
}

export const toleranceDrivers: StepDrivers = {};
