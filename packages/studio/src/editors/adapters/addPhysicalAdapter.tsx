// addPhysicalAdapter — wraps MechanismGallery as an EditorStep (P4a, T011).
//
// MechanismGallery requires selectedBaseKeyboard from the working-copy store.
// The adapter reads it directly from the store so the step contract stays
// (onComplete, onBack, ctx) and the manifest (P4b) need not thread it through.
//
// Inline side effects (lockDesktop(), buildTouchLayoutJson block) remain in
// StudioShell for P4a — they are reserved for P4b (plan.md §"Out of scope for
// P4a"). P4b will migrate them into the manifest reducer after onComplete fires.
//
// Declared but NOT yet wired into StudioShell. T014 repoints the imports;
// P4b introduces the manifest that actually uses these adapters.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { MechanismGallery } from "../assignLoop/MechanismGallery.tsx";

/**
 * EditorStep adapter for the Mechanism Gallery (Phase C — desktop key
 * assignment loop). Satisfies React.ComponentType<EditorStepProps>.
 */
export function AddPhysicalAdapter({ onComplete, onBack }: EditorStepProps) {
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  return (
    <MechanismGallery
      selectedBaseKeyboard={baseKeyboard}
      onComplete={() => onComplete(undefined)}
      onBack={onBack}
    />
  );
}
