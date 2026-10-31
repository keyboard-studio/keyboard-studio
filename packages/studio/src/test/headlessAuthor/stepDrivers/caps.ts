// Phase F (help): the phase_f_helpdocs flow, completed with the product's own
// options record (completeFlowStep), as PhaseFGate's factory component runs it.
//
// The packaging-metadata questions (pf_project_url, pf_provenance_basis, the
// troubleshooting text) are pre-filled by the product, not by this driver: the
// proposals in lib/phaseFSeeds.ts and lib/troubleshootingProposal.ts are
// computed by the live extraction pass and recorded as decision records, which
// the flow walk reads back as each question's pre-filled value. The walk policy
// accepts that value; a case override, if present, wins. A required question the
// product leaves empty and the case does not answer fails the walk.
//
// The validator findings are the ones the component hands the flow: the working
// copy's findings, projected per question.
//
// The coverage gate (the hard gate PhaseFGate shows) is not evaluated here: the
// loop's advance() reads it for this step and fails the case with
// `step-blocked` when characters are unimplemented.
//
// Caps handling: the spec 106 `caps-handling` decision has no step in this
// build, so nothing is written for it and the module default applies, as
// recordToDecisionSet assumes for records that predate it.

import { phaseFOptions } from "../../../editors/adapters/flowStepOptionRecords.ts";
import { buildFindingsByQuestionId } from "../../../lint/lintToQuestion.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { completeFlowStep } from "./flowStep.ts";
import type { StepDrivers } from "./types.ts";

/** Typed where the product offers nothing and the case supplies nothing for the required description. */
const PLACEHOLDER_TEXT = "zzq";

export const capsDrivers: StepDrivers = {
  help: (ctx) =>
    completeFlowStep(
      phaseFOptions,
      {
        placeholders: { pf_welcome_paragraph: () => PLACEHOLDER_TEXT },
        findingsByQuestionId: buildFindingsByQuestionId(useWorkingCopyStore.getState().validatorFindings),
      },
      ctx,
    ),
};
