// deadkeyAdapter — wraps DeadkeySurface as an EditorStep (spec 083).
//
// Mirrors carveAdapter.tsx: this adapter bridges the EditorStepProps
// contract so the manifest can drive the surface as the "deadkeys" step
// beside carve. Lifecycle edits commit to the working copy immediately
// (like the mechanism gallery — every action saved immediately); the
// surface's Continue button fires onComplete to advance.

import type { EditorStepProps } from "../../steps/types.ts";
import { DeadkeySurface } from "../deadkey/DeadkeySurface.tsx";

/**
 * EditorStep adapter for the deadkey lifecycle surface (spec 083 —
 * the Deadkeys step beside the carve gallery).
 * Satisfies React.ComponentType<EditorStepProps>.
 */
export function DeadkeyAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <DeadkeySurface
      onComplete={() => onComplete(undefined)}
      {...(onBack !== undefined ? { onBack } : {})}
    />
  );
}
