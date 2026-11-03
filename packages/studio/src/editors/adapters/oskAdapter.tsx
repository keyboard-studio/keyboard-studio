// OskEditorAdapter — manifest host wrapper that records `osk-layout` on Continue.

import { OskEditor } from "../assignLoop/OskEditor.tsx";
import { completeOskStep } from "../../lib/oskStepCompletion.ts";
import type { EditorStepProps } from "../../steps/types.ts";

export function OskEditorAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <OskEditor
      onBack={onBack ?? (() => undefined)}
      onComplete={(result) => {
        completeOskStep(result);
        onComplete(result);
      }}
    />
  );
}
