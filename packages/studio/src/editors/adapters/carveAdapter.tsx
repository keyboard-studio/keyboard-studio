// carveAdapter — wraps the carve gallery as an EditorStep.
//
// CarveGalleryV2 (the character-first carve gallery, #1399) is now the DEFAULT
// and the only carve gallery rendered — no flag required. The old rule/node
// Rail view (CarveGallery) is intentionally PRESERVED in the codebase (kept for
// a possible future rule-editor repurposing) but is no longer wired here — treat
// it as effectively commented out. To resurrect it, re-add the import below and
// branch on it here.

import type { EditorStepProps } from "../../steps/types.ts";
import { CarveGalleryV2 } from "../carve/CarveGalleryV2.tsx";
// Preserved for a future rule-editor; intentionally NOT wired (see note above):
// import { CarveGallery } from "../carve/CarveGallery.tsx";

/**
 * EditorStep adapter for the Carve gallery (Phase D — keyboard-carving step).
 * Renders the character-first CarveGalleryV2. Satisfies
 * React.ComponentType<EditorStepProps>.
 */
export function CarveAdapter({ onComplete, onBack }: EditorStepProps) {
  return (
    <CarveGalleryV2
      onComplete={() => onComplete(undefined)}
      onBack={onBack}
    />
  );
}
