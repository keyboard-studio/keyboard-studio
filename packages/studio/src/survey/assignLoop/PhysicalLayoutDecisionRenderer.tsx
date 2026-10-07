// PhysicalLayoutDecisionRenderer — the physical-layout module's
// renderer (spec 090 T041): the mechanism gallery under the decision
// host. The gallery edits the phase-C assignment list through
// recordAssignments (its own write path — editors/assignLoop,
// ratified record-from-working-copy precedent, D-090-31); on
// completion the current assignment list leaves through onChange as
// the decision value. Lives in the survey feature home because
// gallery modules may import only survey/** and packages (the
// CarveDecisionRenderer precedent).
//
// The store reads below mirror AddPhysicalAdapter's (the live
// manifest path): the gallery needs the selected base keyboard, the
// placement priors, and the marks worklist self-sourced (FR-007).

import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import type { PhysicalLayoutValue } from "./physicalLayoutValue.ts";
import { currentPhysicalLayoutValue } from "./physicalLayoutValue.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePlacementPriors } from "../../hooks/usePlacementPriors.ts";
import { MechanismGallery } from "../../editors/assignLoop/MechanismGallery.tsx";

export function PhysicalLayoutDecisionRenderer({
  onChange,
}: DecisionRendererProps<PhysicalLayoutValue>) {
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const placementMap = usePlacementPriors();
  const marksWorklist = useWorkingCopyStore((s) => s.session.marksWorklist);

  return (
    <MechanismGallery
      selectedBaseKeyboard={baseKeyboard}
      onComplete={() => onChange(currentPhysicalLayoutValue())}
      {...(placementMap ? { placementMap } : {})}
      {...(marksWorklist !== undefined ? { worklist: marksWorklist } : {})}
    />
  );
}
