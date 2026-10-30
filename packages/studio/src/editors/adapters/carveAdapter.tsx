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
//
// Spec 106 FR-042: while the removals are exactly the gallery's suggested
// default, Continue approves it and the decision is `default`-provenance;
// once the author has changed anything it is `asked`.

import type { EditorStepProps } from "../../steps/types.ts";
import { recordCarveDecision } from "../../survey/carve/carveContinue.ts";
import { CarveGalleryV2 } from "../carve/CarveGalleryV2.tsx";

/**
 * EditorStep adapter for the Carve gallery (Phase D — keyboard-carving step).
 * Satisfies React.ComponentType<EditorStepProps>.
 */
export function CarveAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <CarveGalleryV2
      onComplete={() => {
        recordCarveDecision();
        onComplete(undefined);
      }}
      onBack={onBack}
    />
  );
}
