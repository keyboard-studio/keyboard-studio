// Decision-spike ordering (km/decisions-spike).
//
// Derives the question walk order from modules' `provides`/`requires`
// declarations (topological sort) instead of hand-maintained YAML lists and
// spine flags. Pure: no React, no stores, no I/O.

import type { QuestionModule } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";

/** First module (in input order) providing each decision wins. */
function indexProviders(
  modules: readonly QuestionModule[],
): Readonly<Map<DecisionId, QuestionModule>> {
  const providers = new Map<DecisionId, QuestionModule>();
  for (const m of modules) {
    if (m.provides !== undefined && !providers.has(m.provides)) {
      providers.set(m.provides, m);
    }
  }
  return providers;
}

/**
 * Find one dependency cycle among `modules` (for the error message).
 * Follows requires → provider edges depth-first; returns the cycle as module
 * ids, e.g. ["a", "b", "a"].
 */
function findCycle(
  modules: readonly QuestionModule[],
  providers: Readonly<Map<DecisionId, QuestionModule>>,
): string[] {
  const byId = new Map(modules.map((m) => [m.definition.id, m] as const));
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    if (stack.includes(id)) return [...stack.slice(stack.indexOf(id)), id];
    if (visited.has(id)) return null;
    visited.add(id);
    stack.push(id);
    const m = byId.get(id);
    for (const req of m?.requires ?? []) {
      const provider = providers.get(req);
      if (provider && byId.has(provider.definition.id)) {
        const cycle = visit(provider.definition.id);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    return null;
  }

  for (const m of modules) {
    const cycle = visit(m.definition.id);
    if (cycle) return cycle;
  }
  return modules.map((m) => m.definition.id);
}

/**
 * Topologically sort `modules` by `requires`/`provides`.
 *
 * Stable: among modules whose requirements are all satisfied, input order
 * wins — so a fully-annotated legacy playlist reproduces its YAML order
 * exactly (see orderParity.test.ts).
 *
 * Throws `unresolved decision: "<id>" required by "<module>"` when a
 * requirement has no provider, and `dependency cycle: <a> -> <b> -> <a>`
 * naming one cycle.
 */
export function orderDecisions(
  modules: readonly QuestionModule[],
): QuestionModule[] {
  const providers = indexProviders(modules);

  for (const m of modules) {
    for (const req of m.requires ?? []) {
      if (!providers.has(req)) {
        throw new Error(
          `unresolved decision: "${req}" required by "${m.definition.id}"`,
        );
      }
    }
  }

  // Kahn's algorithm, input-order stable.
  const provided = new Set<DecisionId>();
  const emitted = new Set<QuestionModule>();
  const ordered: QuestionModule[] = [];
  let progress = true;
  while (ordered.length < modules.length && progress) {
    progress = false;
    for (const m of modules) {
      if (emitted.has(m)) continue;
      const ready = (m.requires ?? []).every((r) => provided.has(r));
      if (!ready) continue;
      emitted.add(m);
      ordered.push(m);
      if (m.provides !== undefined) provided.add(m.provides);
      progress = true;
    }
  }

  if (ordered.length < modules.length) {
    throw new Error(`dependency cycle: ${findCycle(modules, providers).join(" -> ")}`);
  }
  return ordered;
}

/**
 * Drop modules whose `gatedBy` predicate rejects the decisions resolved so
 * far. Absent `gatedBy` = always include. This is what keeps conditional
 * routing (`definition.next` FlowGotoRule conditions) intact once ordering is
 * derived rather than declared.
 */
export function filterGated(
  modules: readonly QuestionModule[],
  decisions: DecisionSet,
): QuestionModule[] {
  return modules.filter((m) => m.gatedBy?.(decisions) ?? true);
}
