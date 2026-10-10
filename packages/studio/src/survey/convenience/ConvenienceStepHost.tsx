// ConvenienceStepHost — the manifest step component for the `convenience`
// step (spec 090 T024): the gallery-host wrapper around
// ConvenienceCharsStep, the `retained-convenience-chars` module's
// renderer. The wrapper owns nothing but the hosting: it reads the
// recorded decision, composes the live host deps, and hands the manifest
// step's navigation to the renderer through GalleryStepContext.

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import retainedConvenienceCharsModule from "../questions/gallery/retainedConvenienceChars.ts";

const CONVENIENCE_STEP_ID = "convenience";

const ConvenienceStepHost: ComponentType<EditorStepProps> = ({
  onComplete,
  onBack,
}: EditorStepProps) => {
  const record = useDecisionStore((s) => s.decisions["retained-convenience-chars"]);
  const deps = useMemo(buildGalleryHostDeps, []);
  return (
    <GalleryHost
      module={retainedConvenienceCharsModule}
      record={record}
      stepId={CONVENIENCE_STEP_ID}
      deps={deps}
      stepContext={{ onComplete, ...(onBack !== undefined && { onBack }) }}
    />
  );
};

export { ConvenienceStepHost };
