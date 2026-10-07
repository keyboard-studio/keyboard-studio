// InvisiblesStepHost — the manifest step component for the
// `invisibles` step (spec 090 T022): the gallery-host wrapper around
// InvisiblesStep, the `invisibles-inventory` module's renderer.
//
// The wrapper owns nothing but the hosting: it reads the recorded
// decision, composes the live host deps, and hands the manifest step's
// navigation to the renderer through GalleryStepContext. The step's
// toggles flow through the shared inventory-draft surface
// (useInventoryDraft.ts) under this step's attribution.

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import invisiblesInventoryModule from "../questions/gallery/invisiblesInventory.ts";

const INVISIBLES_STEP_ID = "invisibles";

const InvisiblesStepHost: ComponentType<EditorStepProps> = ({
  onComplete,
  onBack,
}: EditorStepProps) => {
  const record = useDecisionStore((s) => s.decisions["invisibles-inventory"]);
  const deps = useMemo(buildGalleryHostDeps, []);
  return (
    <GalleryHost
      module={invisiblesInventoryModule}
      record={record}
      stepId={INVISIBLES_STEP_ID}
      deps={deps}
      stepContext={{ onComplete, ...(onBack !== undefined && { onBack }) }}
    />
  );
};

export { InvisiblesStepHost };
