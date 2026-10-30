// addPhysicalAdapter — wraps MechanismGallery as an EditorStep (P4a, T011).
//
// MechanismGallery requires selectedStartKeyboard from the working-copy store.
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
import { usePlacementPriors } from "../../hooks/usePlacementPriors.ts";
import { completePhysicalLayoutStep } from "../../lib/mechanismStepCompletion.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { MechanismGallery } from "../assignLoop/MechanismGallery.tsx";
import { FallbackPolicySection } from "../fallback/FallbackPolicySection.tsx";

/**
 * EditorStep adapter for the Mechanism Gallery (Phase C — desktop key
 * assignment loop). Satisfies React.ComponentType<EditorStepProps>.
 *
 * T010 (spec 028 Stage 5): self-sources placementMap via usePlacementPriors()
 * so the host does not need to thread gallery-specific props (FR-007).
 */
export function AddPhysicalAdapter({ onComplete, onBack }: EditorStepProps) {
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  // FR-007: placement priors loaded here (moved from SurveyView.corpusPlacementMap).
  const placementMap = usePlacementPriors();

  function handleComplete() {
    completePhysicalLayoutStep();
    onComplete(undefined);
  }

  // Interim host for the keyboard-wide fallback policy (the Behaviours step
  // that will own it has not landed): a collapsed section below the gallery.
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MechanismGallery
          selectedStartKeyboard={startKeyboard}
          onComplete={handleComplete}
          {...(placementMap ? { placementMap } : {})}
          {...(onBack ? { onBack } : {})}
        />
      </div>
      <FallbackPolicySection />
    </div>
  );
}
