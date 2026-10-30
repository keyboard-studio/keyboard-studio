// deadkeyAdapter — wraps DeadkeySurface as an EditorStep (spec 083).
//
// Mirrors carveAdapter.tsx: this adapter bridges the EditorStepProps
// contract so the manifest can drive the surface as the "deadkeys" step
// beside carve. Lifecycle edits commit to the working copy immediately
// (like the mechanism gallery — every action saved immediately); the
// surface's Continue button fires onComplete to advance.
//
// Spec 090 T033: completing the step also records the `deadkeys-defined`
// decision — the working copy's deadkey op log as one value (the
// base-keyboard precedent: editor steps record their own decision).
// The decision module's renderer (survey/deadkeys/DeadkeyDecisionRenderer) is
// the same surface hosted by the decision host: it reports the op log
// through onChange on completion instead of recording directly.

import type { EditorStepProps } from "../../steps/types.ts";
import { completeDeadkeysStep } from "../../lib/mechanismStepCompletion.ts";
import { DeadkeySurface } from "../deadkey/DeadkeySurface.tsx";

/**
 * EditorStep adapter for the deadkey lifecycle surface (spec 083 —
 * the Deadkeys step beside the carve gallery).
 * Satisfies React.ComponentType<EditorStepProps>.
 */
export function DeadkeyAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <DeadkeySurface
      onComplete={() => {
        completeDeadkeysStep();
        onComplete(undefined);
      }}
      {...(onBack !== undefined ? { onBack } : {})}
    />
  );
}
