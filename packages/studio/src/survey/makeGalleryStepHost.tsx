// makeGalleryStepHost — factory for the effect-free gallery step hosts.
//
// Several manifest steps are nothing but a gallery-host wrapper: read the
// recorded decision, compose the live host deps, and hand the manifest
// step's navigation to the renderer. Those wrappers differ only in module,
// decision id, and step id, so they are built here instead of hand-copied.
//
// Placement: survey/, not steps/galleryHost.tsx — the steps layer may not
// import stores/ or lib/ (depcruise), and the wrapper needs both. Hosts
// with extras of their own stay hand-written: MarksStepHost (effects),
// CharactersStepHost (step-context extras).

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../steps/types.ts";
import { GalleryHost } from "../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import type { DecisionId } from "../decisions/decisionTypes.ts";
import type { GalleryModule } from "./types.ts";

/**
 * Build a manifest step component that hosts one gallery module.
 * The returned component is a stable module-level value in each caller,
 * exactly as the hand-written wrappers were.
 */
export function makeGalleryStepHost<V>(
  module: GalleryModule<V>,
  decisionId: DecisionId,
  stepId: string,
): ComponentType<EditorStepProps> {
  const Host: ComponentType<EditorStepProps> = ({
    onComplete,
    onBack,
  }: EditorStepProps) => {
    const record = useDecisionStore((s) => s.decisions[decisionId]);
    const deps = useMemo(buildGalleryHostDeps, []);
    return (
      <GalleryHost
        module={module}
        record={record}
        stepId={stepId}
        deps={deps}
        stepContext={{ onComplete, ...(onBack !== undefined && { onBack }) }}
      />
    );
  };
  return Host;
}
