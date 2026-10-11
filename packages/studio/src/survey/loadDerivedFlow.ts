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
 * (spec 087). The question order is `orderDecisions(modules)`. Throws on the
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
  // Spec 091 FR-003 (Delta P3): a module may declare `requires` on a
  // decision settled OUTSIDE its flow — track_choice requires
  // "base-keyboard" (settled by the choose_base gallery module), and
  // project_display_name requires "authoring-track" (settled by the track
  // flow). Such an edge constrains the wizard-level derivation
  // (decisions/deriveScreens over the full module list), never this flow's
  // internal order: the provider is not a member here. Scope each module's
  // requires to the decisions this flow itself provides before sorting.
  // An unresolved requirement is still a fail-fast error in the full-list
  // derivation and the registry's provider index, so a typo cannot pass
  // silently — it just cannot be diagnosed from one flow alone.
  const providedHere = new Set(modules.flatMap((m) => m.provides ?? []));
  const scoped = modules.map((m) =>
    m.requires === undefined || m.requires.every((r) => providedHere.has(r))
      ? m
      : { ...m, requires: m.requires.filter((r) => providedHere.has(r)) },
  );
  const orderedScoped = orderDecisions(scoped);
  const byId = new Map(modules.map((m) => [m.definition.id, m] as const));
  const ordered = orderedScoped.map((m) => byId.get(m.definition.id)!);
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
