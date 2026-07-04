// survey/index.ts — public surface of the survey layer.
//
// spec 029 full convergence (Option A):
//   PhaseTrack, PhaseProjectName, PhaseF wrappers are DELETED (phaseWrappers.tsx
//   removed). The three flows are now live via factory components (flowStepOptions.tsx
//   → makeFlowStepComponent). The golden-walk mock seam moved to
//   survey/FlowStepHost.tsx (used directly by makeFlowStepComponent).
//
// Track type is declared here (not imported from phaseWrappers.tsx which is gone)
// so surveySessionStore.ts type-only import continues to resolve.

export { IdentityLite, extractIdentityLite } from "./IdentityLite.tsx";
export type { IdentityLiteProps, IdentityLiteResult } from "./IdentityLite.tsx";

export { Prefill, buildPrefillRows } from "./Prefill.tsx";
export type { PrefillProps, PrefillRow } from "./Prefill.tsx";

export { PhaseA } from "./PhaseA.tsx";
export type { PhaseAProps } from "./PhaseA.tsx";
export { extractIdentity, extractProvenance } from "./PhaseA.tsx";

export { PhaseB } from "./PhaseB.tsx";
export type { PhaseBProps } from "./PhaseB.tsx";

export { SurveyRunner } from "./SurveyRunner.tsx";
export type { SurveyRunnerProps } from "./SurveyRunner.tsx";

// ---------------------------------------------------------------------------
// FlowStepHost — generic pure host (spec 029 Stage 6, T002/T003).
// Mock seam for makeFlowStepComponent tests: vi.mock("../survey/FlowStepHost.tsx").
// ---------------------------------------------------------------------------

export { FlowStepHost } from "./FlowStepHost.tsx";
export type { FlowStepHostProps } from "./FlowStepHost.tsx";

// ---------------------------------------------------------------------------
// Track type — declared here (was in phaseWrappers.tsx/PhaseTrack.tsx).
// surveySessionStore.ts imports this type-only; the canonical definition is here.
// ---------------------------------------------------------------------------

/** The two authoring tracks (spec §8 v1.3.0). */
export type Track = "copy" | "adapt";
