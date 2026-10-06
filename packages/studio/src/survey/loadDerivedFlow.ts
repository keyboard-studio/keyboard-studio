// Derived flow loader.
//
// A flow's membership and order are not hand-maintained lists: membership is
// the module list registered for the flow (questions/registry.ts `flowModules`)
// and the order is derived from the modules' own `provides` / `requires`
// declarations via `orderDecisions`. Routing lives in each module's
// `definition.next`. loadDerivedFlowDef() turns that into a FlowDef that
// SurveyRunner can consume without modification.

import type { FlowDef, QuestionModule } from "./types.ts";
import { orderDecisions } from "../decisions/orderDecisions.ts";

/**
 * Build a FlowDef from the modules' own provides/requires declarations
 * (spec 085). The question order is `orderDecisions(modules)`. Throws on the
 * same malformed inputs orderDecisions rejects (unresolved / duplicate / cycle).
 *
 * `provenanceModules` (Phase A only) marks the subset of `modules` that
 * belongs in the supplemental `provenance_questions` list. ORDER still comes
 * from the single derivation over all `modules` (a provenance module may
 * require a main-list decision, e.g. the opt-in gate); membership alone is
 * declared, split afterwards, and both lists keep their derived relative order.
 */
export function loadDerivedFlowDef(
  flowId: string,
  phase: string,
  modules: readonly QuestionModule[],
  provenanceModules: readonly QuestionModule[] = [],
): FlowDef {
  const ordered = orderDecisions(modules);
  if (ordered.length === 0) {
    throw new Error("loadDerivedFlowDef: modules list must not be empty");
  }
  const provenance = new Set(provenanceModules);
  for (const m of provenance) {
    if (!modules.includes(m)) {
      throw new Error(
        `loadDerivedFlowDef: provenance module "${m.definition.id}" is not in modules`,
      );
    }
  }
  const main = ordered.filter((m) => !provenance.has(m));
  const prov = ordered.filter((m) => provenance.has(m));
  return {
    flow_id: flowId,
    phase,
    questions: main.map((m) => m.definition),
    ...(prov.length > 0 && { provenance_questions: prov.map((m) => m.definition) }),
  };
}
