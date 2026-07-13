// sequencesAdapter — wraps SequencesPlaceholder as an EditorStep.
//
// Placeholder for the (not yet implemented) Sequence Gallery. S-03 multi-key
// sequences are being moved out of the Mechanism Gallery's method chooser
// into their own dedicated part of the flow, positioned after mechanisms and
// before the touch seed source / touch fork. This adapter satisfies the
// EditorStepProps contract; the real authoring UI replaces this component
// without changing the step id, manifest position, or writes contract.

import type { EditorStepProps } from "../../steps/types.ts";
import { SequencesPlaceholder } from "../sequences/SequencesPlaceholder.tsx";

/**
 * EditorStep adapter for the Sequence Gallery placeholder.
 * Satisfies React.ComponentType<EditorStepProps>.
 */
export function SequencesAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <SequencesPlaceholder
      onComplete={() => onComplete(undefined)}
      {...(onBack ? { onBack } : {})}
    />
  );
}
