// addPhysicalAdapter — wraps MechanismGallery as an EditorStep (P4a, T011).
//
// MechanismGallery requires selectedBaseKeyboard from the working-copy store.
// The adapter reads it directly from the store so the step contract stays
// (onComplete, onBack, ctx) and the manifest (P4b) need not thread it through.
//
// Spec 090 T041: completing the step also records the `physical-layout`
// decision — the current assignment list (the gallery's own working
// set) as one value (the editor-step precedent: editor steps record
// their own decision; ratified by D-090-31) — and fires the step's
// completion effects (lockDesktop + repropagate, re-homed from the
// reducer's retired R1 hook to lib/assignLoopCompletion.ts,
// D-090-38). The decision module's renderer
// (survey/assignLoop/PhysicalLayoutDecisionRenderer) is the same
// gallery hosted by the decision host: it reports the value through
// onChange on completion instead of recording directly.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { usePlacementPriors } from "../../hooks/usePlacementPriors.ts";
import { currentPhysicalLayoutValue } from "../../survey/assignLoop/physicalLayoutValue.ts";
import { applyPhysicalCompletionEffects } from "../../lib/assignLoopCompletion.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { MechanismGallery } from "../assignLoop/MechanismGallery.tsx";

/**
 * EditorStep adapter for the Mechanism Gallery (Phase C — desktop key
 * assignment loop). Satisfies React.ComponentType<EditorStepProps>.
 *
 * T010 (spec 028 Stage 5): self-sources placementMap via usePlacementPriors()
 * so the host does not need to thread gallery-specific props (FR-007).
 */
export function AddPhysicalAdapter({ onComplete, onBack }: EditorStepProps) {
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  // FR-007: placement priors loaded here (moved from SurveyView.corpusPlacementMap).
  const placementMap = usePlacementPriors();
  // Spec 046: the marks-series exit state (session.marksWorklist) rides in as
  // the optional typed worklist prop — absent (series not run / pre-046
  // session) keeps the flat-inventory behavior.
  const marksWorklist = useWorkingCopyStore((s) => s.session.marksWorklist);

  function handleComplete() {
    useDecisionStore.getState().record({
      id: "physical-layout",
      value: currentPhysicalLayoutValue(),
      provenance: "asked",
    });
    applyPhysicalCompletionEffects();
    onComplete(undefined);
  }

  return (
    <MechanismGallery
      selectedBaseKeyboard={baseKeyboard}
      onComplete={handleComplete}
      {...(placementMap ? { placementMap } : {})}
      {...(marksWorklist !== undefined ? { worklist: marksWorklist } : {})}
      {...(onBack ? { onBack } : {})}
    />
  );
}
