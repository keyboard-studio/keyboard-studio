// carveAdapter — wraps CarveGalleryV2 as an EditorStep (P4a, T010).
//
// The gallery has no onComplete/onBack in its existing prop shape; those
// side effects are currently handled by StudioShell (SurveyStage transitions).
// This adapter bridges the EditorStepProps contract so the manifest (P4b) can
// drive the gallery as a step. The full reduction of inline side effects is
// out of scope for P4a (see plan.md §"Out of scope for P4a") and is reserved
// for P4b.
//
// Spec 090 T032: completing the step also records the `carved-layout`
// decision — the working copy's carve overlay as one value (the
// base-keyboard precedent: editor steps record their own decision;
// the record-from-working-copy precedent is ratified by D-090-31).
// The decision module's renderer
// (survey/carve/CarveDecisionRenderer) is the same gallery hosted by
// the decision host: it reports the value through onChange on
// completion instead of recording directly.

import type { EditorStepProps } from "../../steps/types.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { currentCarvedLayoutValue } from "../../survey/carve/carveValue.ts";
import { CarveGalleryV2 } from "../carve/CarveGalleryV2.tsx";

/**
 * EditorStep adapter for the Carve gallery (Phase D — keyboard-carving step).
 * Satisfies React.ComponentType<EditorStepProps>.
 */
export function CarveAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <CarveGalleryV2
      onComplete={() => {
        useDecisionStore.getState().record({
          id: "carved-layout",
          value: currentCarvedLayoutValue(),
          provenance: "asked",
        });
        onComplete(undefined);
      }}
      onBack={onBack}
    />
  );
}
