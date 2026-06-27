// carveAdapter — wraps CarveGallery as an EditorStep (P4a, T010).
//
// The CarveGallery has no onComplete/onBack in its existing prop shape; those
// side effects are currently handled by StudioShell (SurveyStage transitions).
// This adapter bridges the EditorStepProps contract so the manifest (P4b) can
// drive CarveGallery as a step. The full reduction of inline side effects is
// out of scope for P4a (see plan.md §"Out of scope for P4a") and is reserved
// for P4b.
//
// Declared but NOT yet wired into StudioShell. T014 repoints the imports;
// P4b introduces the manifest that actually uses these adapters.

import type { EditorStepProps } from "../../steps/types.ts";
import { CarveGallery } from "../carve/CarveGallery.tsx";

/**
 * EditorStep adapter for the Carve gallery (Phase D — keyboard-carving step).
 * Satisfies React.ComponentType<EditorStepProps>.
 */
export function CarveAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <CarveGallery
      onComplete={() => onComplete(undefined)}
      onBack={onBack}
    />
  );
}
