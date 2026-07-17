// sequencesAdapter — wraps SequenceGallery as an EditorStep.
//
// SequenceGallery requires selectedBaseKeyboard from the working-copy store,
// same as addPhysicalAdapter (MechanismGallery). The adapter reads it
// directly from the store so the step contract stays (onComplete, onBack,
// ctx) and the manifest need not thread it through. Step id and manifest
// position are unchanged by this repoint — only the component behind the
// adapter changed. The writes contract is NOT unchanged: SequenceGallery
// records a real multi_char_sequence MechanismAssignment on Apply (routed
// through the same recordAssignments -> applyAssignmentsToVfs pipeline
// mechanismsStep uses), so sequencesStep declares
// writes: [...ADD_GALLERY_WRITES] in registerEditorSteps.ts, exactly like
// mechanismsStep — see that file's sequencesStep doc comment.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { SequenceGallery } from "../sequences/SequenceGallery.tsx";

/**
 * EditorStep adapter for the Sequence Gallery.
 * Satisfies React.ComponentType<EditorStepProps>.
 */
export function SequencesAdapter({ onComplete, onBack }: EditorStepProps) {
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  return (
    <SequenceGallery
      selectedBaseKeyboard={baseKeyboard}
      onComplete={() => onComplete(undefined)}
      {...(onBack ? { onBack } : {})}
    />
  );
}
