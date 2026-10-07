// PunctuationStepHost — the manifest step component for the
// `punctuation` step (spec 090 T022): the gallery-host wrapper around
// PunctuationStep, the `punctuation-inventory` module's renderer.
//
// The wrapper owns nothing but the hosting: it reads the recorded
// decision, composes the live host deps, and hands the manifest step's
// navigation to the renderer through GalleryStepContext. The step's
// edits flow through the shared inventory-draft surface
// (useInventoryDraft.ts), which maintains this decision's value as a
// projection of the character-inventory value (D-090-10(d)).

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import punctuationInventoryModule from "../questions/gallery/punctuationInventory.ts";

const PUNCTUATION_STEP_ID = "punctuation";

const PunctuationStepHost: ComponentType<EditorStepProps> = ({
  onComplete,
  onBack,
}: EditorStepProps) => {
  const record = useDecisionStore((s) => s.decisions["punctuation-inventory"]);
  const deps = useMemo(buildGalleryHostDeps, []);
  return (
    <GalleryHost
      module={punctuationInventoryModule}
      record={record}
      stepId={PUNCTUATION_STEP_ID}
      deps={deps}
      stepContext={{ onComplete, ...(onBack !== undefined && { onBack }) }}
    />
  );
};

export { PunctuationStepHost };
