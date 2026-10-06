// Spec 022 — shared fixture: the demoted-Phase-A id list, derived ONCE from the
// phase_a_identity proposed flow (steps/flowSources.ts, order derived from the
// reserve modules' provides/requires — spec 085 US4) so the no-delete guardrail
// and the reserve-node assertion consume a single source of truth (not two
// hand-copied lists). The full non-identity Phase A = the flow's `questions`
// (15 identity) + `provenance_questions` (15 provenance_*) lists.
//
// Test-support module (imported only by *.test.ts); no runtime/app import.

import { flowSources, loadFlowSourceDef } from "../../steps/flowSources.ts";

const flow = loadFlowSourceDef(flowSources["phase_a_identity"]!);

/** The 15 identity ids (the flow's `questions`). */
export const DEMOTED_PHASE_A_IDENTITY: readonly string[] = flow.questions.map((q) => q.id);

/** The 15 provenance_* ids (the flow's `provenance_questions`). */
export const DEMOTED_PHASE_A_PROVENANCE: readonly string[] = (
  flow.provenance_questions ?? []
).map((q) => q.id);

/** The full demoted non-identity Phase A (30 ids: 15 identity + 15 provenance_*). */
export const DEMOTED_PHASE_A: readonly string[] = [
  ...DEMOTED_PHASE_A_IDENTITY,
  ...DEMOTED_PHASE_A_PROVENANCE,
];
