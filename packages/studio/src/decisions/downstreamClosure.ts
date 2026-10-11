// Downstream closure (spec 093 FR-002, research §2).
//
// Reverse reachability over the ONE dependency graph — the provides/requires
// declarations that `orderByDependencies` sorts by (constitution Article IX:
// no second graph). Given a set of changed decisions, the closure is every
// decision that transitively depends on one of them: the set a recalculation
// must revisit when the changed decisions move.
//
// Pure: no stores, no I/O — same discipline as orderDecisions.ts, whose
// node-adapter pattern this mirrors (items + a DependencyNode view of them,
// so wizard steps, which already ARE DependencyNodes, and question modules
// share one implementation).

import type { QuestionModule } from "../survey/types.ts";
import type { DecisionId } from "./decisionTypes.ts";
import { indexProviders, type DependencyNode } from "./orderDecisions.ts";

/**
 * The strictly-downstream decisions of `changed`: every decision reachable
 * from the changed set by following dependent edges (decision → the decisions
 * whose providers require it), over one or more edges.
 *
 * - The changed set itself is NOT included, except where a changed decision
 *   is genuinely downstream of another changed decision (a dependency cycle
 *   or a self-requirement) — reachability is computed honestly, not masked.
 * - A changed decision with no provider among `items` still contributes its
 *   dependents: an item that requires it is downstream of it whether or not
 *   its provider is in this item set.
 * - Routing (`routesTo`) plays no part: the closure is data dependency
 *   (whose inputs changed), not walk order.
 *
 * Throws the same fail-fast duplicate-provider error as
 * `orderDecisions.indexProviders` — two providers of one decision would make
 * the dependent edges ambiguous.
 */
export function downstreamClosure<T>(
  items: readonly T[],
  node: (item: T) => DependencyNode,
  changed: ReadonlySet<DecisionId>,
): Set<DecisionId> {
  // Provider index (decision → the item providing it), fail-fast on
  // duplicates with the same message as orderDecisions' indexProvidersBy.
  const providerOf = new Map<DecisionId, T>();
  for (const item of items) {
    const n = node(item);
    for (const p of n.provides ?? []) {
      const existing = providerOf.get(p);
      if (existing !== undefined) {
        throw new Error(
          `duplicate provider for decision "${p}": ` +
            `${node(existing).id}, ${n.id}`,
        );
      }
      providerOf.set(p, item);
    }
  }

  // Dependent edges: decision → the decisions provided by items requiring it.
  const dependents = new Map<DecisionId, Set<DecisionId>>();
  for (const item of items) {
    const n = node(item);
    for (const req of n.requires ?? []) {
      for (const p of n.provides ?? []) {
        let set = dependents.get(req);
        if (set === undefined) dependents.set(req, (set = new Set()));
        set.add(p);
      }
    }
  }

  // Breadth-first from the changed set, following dependent edges. A decision
  // enters the result only when reached via an edge, so plain seeds stay out
  // while a seed re-reached through a cycle is honestly included.
  const result = new Set<DecisionId>();
  const queued: DecisionId[] = [...changed];
  const seen = new Set<DecisionId>(changed);
  for (let i = 0; i < queued.length; i++) {
    const current = queued[i];
    if (current === undefined) continue;
    for (const dep of dependents.get(current) ?? []) {
      result.add(dep);
      if (!seen.has(dep)) {
        seen.add(dep);
        queued.push(dep);
      }
    }
  }
  return result;
}

/**
 * The closure over the question registry's modules: providers indexed through
 * `orderDecisions.indexProviders` (the duplicate rule's one home), edges from
 * each module's declared `provides`/`requires`.
 */
export function decisionDownstreamClosure(
  modules: readonly QuestionModule[],
  changed: ReadonlySet<DecisionId>,
): Set<DecisionId> {
  // indexProviders is called for its fail-fast duplicate check; the closure
  // itself needs only the provides/requires edges.
  indexProviders(modules);
  return downstreamClosure(
    modules,
    (m) => ({ id: m.definition.id, provides: m.provides, requires: m.requires }),
    changed,
  );
}
