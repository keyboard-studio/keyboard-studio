// addTouchAdapter — wraps TouchGallery as an EditorStep (P4a, T012).
//
// TouchGallery's onComplete receives TouchAssignment[] — the adapter wraps
// them in a TouchCompleteResult-shaped payload (assignments + baseIr + baseVfs)
// so the manifest reducer's TOUCH_STEP_ID case can call buildTouchLayoutJson.
//
// Declared but NOT yet wired into StudioShell. T014 repoints the imports;
// P4b introduces the manifest that actually uses these adapters.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { TouchGallery } from "../assignLoop/TouchGallery.tsx";
import type { TouchAssignment } from "@keyboard-studio/contracts";

/**
 * EditorStep adapter for the Touch Gallery (Phase E — touch key assignment
 * loop). Satisfies React.ComponentType<EditorStepProps>.
 *
 * Wraps TouchGallery's raw TouchAssignment[] in a TouchCompleteResult so the
 * manifest reducer's TOUCH_STEP_ID case receives assignments + baseIr + baseVfs
 * and can call buildTouchLayoutJson correctly (spec 028 Stage 5, Defect B fix).
 */
export function AddTouchAdapter({ onComplete, onBack }: EditorStepProps) {
  // Self-source baseIr and baseVfs from the working-copy store (FR-007).
  // These are the post-lockDesktop snapshots needed by buildTouchLayoutJson.
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);

  function handleComplete(assignments: TouchAssignment[]) {
    onComplete({ assignments, baseIr, baseVfs });
  }

  // TouchGallery requires onBack — the manifest must supply it for this step.
  // If absent (misconfigured manifest), fall back to a no-op so the UI doesn't crash.
  return <TouchGallery onComplete={handleComplete} onBack={onBack ?? (() => undefined)} />;
}
