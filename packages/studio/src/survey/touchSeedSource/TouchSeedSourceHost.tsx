// TouchSeedSourceHost — the manifest step component for the
// `touch_seed_source` step (spec 090 T012): the gallery-host wrapper
// around TouchSeedSourceRenderer.
//
// The step is a side trail (stepDependencies gatedBy): it is asked only
// while no `touch-seed-source` decision is recorded — that gating lives in
// the step declaration and is unchanged by the gallery migration. The
// wrapper hands the host the recorded decision and the step navigation
// (via GalleryStepContext — the renderer publishes its own Back/Confirm).

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import touchSeedSourceModule from "../questions/gallery/touchSeedSource.ts";

const TouchSeedSourceHost: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const record = useDecisionStore((s) => s.decisions["touch-seed-source"]);
  const deps = useMemo(buildGalleryHostDeps, []);
  return (
    <GalleryHost
      module={touchSeedSourceModule}
      record={record}
      stepId="touch_seed_source"
      deps={deps}
      stepContext={{ onComplete, ...(onBack !== undefined && { onBack }) }}
    />
  );
};

export { TouchSeedSourceHost };
