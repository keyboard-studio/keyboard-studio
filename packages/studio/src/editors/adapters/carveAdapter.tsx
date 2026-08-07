// carveAdapter — wraps CarveGalleryV2 as an EditorStep (P4a, T010).
//
// The gallery has no onComplete/onBack in its existing prop shape; those
// side effects are currently handled by StudioShell (SurveyStage transitions).
// This adapter bridges the EditorStepProps contract so the manifest (P4b) can
// drive the gallery as a step. The full reduction of inline side effects is
// out of scope for P4a (see plan.md §"Out of scope for P4a") and is reserved
// for P4b.
//
// Declared but NOT yet wired into StudioShell. T014 repoints the imports;
// P4b introduces the manifest that actually uses these adapters.
//
// The character-first carve gallery (v2, CarveGalleryV2.tsx) is now the
// live/default carve gallery, rendered unconditionally. The former rule/node
// "Rail" view (v1, CarveGallery.tsx) is retained for rollback but commented
// out below, along with the feature-flag ternary that used to gate between
// them.

import type { EditorStepProps } from "../../steps/types.ts";
// import { CarveGallery } from "../carve/CarveGallery.tsx"; // v1 — rule/node Rail view, retained for rollback, no longer rendered.
import { CarveGalleryV2 } from "../carve/CarveGalleryV2.tsx";
// import { readEnvFlag } from "../../lib/envFlag.ts"; // v1/v2 flag no longer needed — v2 is unconditional.

/**
 * EditorStep adapter for the Carve gallery (Phase D — keyboard-carving step).
 * Satisfies React.ComponentType<EditorStepProps>.
 *
 * Character-first carve gallery (v2) is now the live carve gallery.
 */
export function CarveAdapter({ onComplete, onBack }: EditorStepProps) {
  // const Gallery = readEnvFlag("VITE_CARVE_V2", "carvev2") ? CarveGalleryV2 : CarveGallery; // v1/v2 flag — v1 branch retained in comment for rollback.
  const Gallery = CarveGalleryV2;
  return (
    <Gallery
      onComplete={() => onComplete(undefined)}
      onBack={onBack}
    />
  );
}
