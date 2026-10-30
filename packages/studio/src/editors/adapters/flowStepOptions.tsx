// flowStepOptions.tsx — the factory-produced step components for the YAML-driven
// flows (spec 029 Stage 6, T005). The per-flow options records live in
// flowStepOptionRecords.ts (re-exported here, so existing imports are unchanged).
//
// registerEditorSteps.ts uses these directly (C4.1 "factory output directly");
// they render FlowStepHost internally.

import { makeFlowStepComponent } from "./makeFlowStepComponent.tsx";
import {
  trackOptions,
  attributionOptions,
  projectNameOptions,
  phaseFOptions,
} from "./flowStepOptionRecords.ts";

export * from "./flowStepOptionRecords.ts";

export const TrackStepFactoryComponent = makeFlowStepComponent(trackOptions);
export const AttributionStepFactoryComponent = makeFlowStepComponent(attributionOptions);
export const ProjectNameStepFactoryComponent = makeFlowStepComponent(projectNameOptions);
export const PhaseFStepFactoryComponent = makeFlowStepComponent(phaseFOptions);

