// Displacement banner actions inside the mechanism step (displacementActions, the lifted confirm and decline); used by the mechanism driver.
//
// The author clicks the first action the banner offers (the default button):
// "Move it" for a convenience or incoming demotion, "Keep both" when both
// characters are core. Spec 107 FR-003: the top of the product's own list.

import type { DriverContext, StepDrivers } from "./types.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { selectDesktopAssignments } from "../../../lib/unimplementedInventory.ts";
import { displacementActions } from "../../../survey/slotOccupancy.ts";
import { displacementOutcomeFor } from "../../../editors/assignLoop/mechanismPlacement.ts";
import {
  declineDisplacementProposal,
  type DisplacementProposal,
} from "../../../editors/assignLoop/useDisplacementProposal.ts";

/** The mechanism step owns the banner; this module has no step of its own. */
export const displacementDrivers: StepDrivers = {};

/** Resolve a pending displacement proposal by its banner's first action, and report it. */
export function resolveDisplacement(ctx: DriverContext, proposal: DisplacementProposal): void {
  const choice = chooseByPolicy({
    decisionId: "displacement",
    suggestions: displacementActions(proposal.direction),
    proposalSource: "displacementActions",
  });
  const action = choice.value;
  ctx.report.addStep({
    decisionId: choice.decisionId,
    rule: choice.rule,
    value: { action, displaced: proposal.displacedChar, incoming: proposal.incomingChar, key: proposal.vkey },
    ...(choice.proposalSource !== undefined ? { proposalSource: choice.proposalSource } : {}),
  });

  const store = useWorkingCopyStore.getState();
  const assignments = selectDesktopAssignments(store.phaseResults);
  const workingIr = store.ir ?? store.startIr;
  const outcome = displacementOutcomeFor(action, proposal, assignments, workingIr);
  if (outcome.kind === "dismiss") declineDisplacementProposal(proposal);
  else if (outcome.next !== null) store.recordAssignments(outcome.next);
  ctx.report.addDisplacement({
    char: proposal.incomingChar,
    key: proposal.vkey,
    displaced: proposal.displacedChar,
    action,
  });
}
