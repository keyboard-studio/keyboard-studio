// Adaptation engine surfaces (spec 038-adaptation-questions).
//
// The studio's touchpoint for carrying a base keyboard's classified facet
// values (script, input strategies, device targets) forward as §3c editable
// confirmations — never silent defaults. All surfaces read the facet index
// (036/037) behind an INJECTED evidence seam (`AdaptationEvidence`) so the whole
// feature is authorable and unit-testable against a mocked index; the live
// consumption/ranking wiring is a follow-up feature (spec §"Out of scope").
//
// Barrel export. Surfaces are filled in as the phases land:
//   - evidence.ts            AdaptationEvidence seam + provider interface
//   - trustPolicy.ts         TrustPolicy + scope persistence
//   - confirmationEvents.ts  recordConfirmation (FR-007)
//   - catalog.ts             catalog loader (content/adaptation-questions/*.yaml)
//   - firing.ts              evaluateFiringConditions (pure)
//   - posture.ts             buildPosture / postureFor (pure)
//   - InheritancePostureStep.tsx  §3c confirmation step (US2)

export type {
  AdaptationEvidence,
  AdaptationEvidenceProvider,
} from "./evidence.ts";
export {
  TRUST_POLICY_DEFAULTS,
  resolveTrustPolicy,
  persistTrustPolicy,
  loadTrustPolicy,
  resetTrustPolicyStore,
  recordPolicyResolution,
} from "./trustPolicy.ts";
export type { TrustPolicy } from "./trustPolicy.ts";
export {
  recordConfirmation,
  readConfirmationEvents,
  resetConfirmationEvents,
} from "./confirmationEvents.ts";
export type { ConfirmationEvent } from "./confirmationEvents.ts";
export { loadAdaptationCatalog } from "./catalog.ts";
export type { QuestionRecord, QuestionFamily } from "./catalog.ts";
export { evaluateFiringConditions } from "./firing.ts";
export type { FiredQuestion } from "./firing.ts";
export { buildPosture, postureFor, reconcilePostureOnBaseSwitch } from "./posture.ts";
export type { InheritancePosture, PostureEntry, PostureFacet } from "./posture.ts";
export { classifyBaseScript } from "./firing.ts";
export type { ScriptClassification } from "./firing.ts";
export { InheritancePostureStep, governedEntries } from "./InheritancePostureStep.tsx";
export type { InheritancePostureStepProps } from "./InheritancePostureStep.tsx";
