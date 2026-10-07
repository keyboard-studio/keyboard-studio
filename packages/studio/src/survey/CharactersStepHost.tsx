// CharactersStepHost — the manifest step component for the `characters`
// step (spec 090 T021): the gallery-host wrapper around CharactersStep,
// the `character-inventory` module's renderer.
//
// The wrapper owns nothing but the hosting: it reads the recorded
// decision, composes the live host deps, and hands the manifest step's
// navigation to the renderer through GalleryStepContext (the renderer
// contract deliberately excludes step chrome). All draft edits flow
// through the shared inventory-draft surface (useInventoryDraft.ts).

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../steps/types.ts";
import { GalleryHost } from "../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import characterInventoryModule from "./questions/gallery/characterInventory.ts";

const CHARACTERS_STEP_ID = "characters";

const CharactersStepHost: ComponentType<EditorStepProps> = ({
  onComplete,
  onBack,
}: EditorStepProps) => {
  const record = useDecisionStore((s) => s.decisions["character-inventory"]);
  const deps = useMemo(buildGalleryHostDeps, []);
  return (
    <GalleryHost
      module={characterInventoryModule}
      record={record}
      stepId={CHARACTERS_STEP_ID}
      deps={deps}
      stepContext={{ onComplete, ...(onBack !== undefined && { onBack }) }}
    />
  );
};

export { CharactersStepHost };
