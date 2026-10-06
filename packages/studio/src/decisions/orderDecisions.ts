// Decision-spike ordering (km/decisions-spike).
//
// Derives the question walk order from modules' `provides`/`requires`
// declarations (topological sort) instead of hand-maintained YAML lists and
// spine flags. The same sort orders wizard steps (steps/stepOrder.ts). Pure:
// no React, no stores, no I/O.

import type { QuestionModule } from "../survey/types.ts";
import type { FlowQuestion } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";

/**
 * The ordering-relevant view of anything that declares decisions: a question
 * module, or a wizard step. The one sort below is written against this shape,
 * so questions and steps share a single implementation (spec 087 Q3: the
 * registry is the single source of order for both).
 */
export interface DependencyNode {
  readonly id: string;
  readonly provides?: readonly DecisionId[] | undefined;
  readonly requires?: readonly DecisionId[] | undefined;
}

const moduleNode = (m: QuestionModule): DependencyNode => ({
  id: m.definition.id,
  provides: m.provides,
  requires: m.requires,
});

/**
 * Index the provider of each decision. Two providers of the same decision is a
 * fail-fast error — first-wins-silent would drop one provider without a trace
 * at 50+ ids (km/decisions-spike fix 4). The duplicate rule lives here only.
 */
function indexProvidersBy<T>(
  items: readonly T[],
  node: (item: T) => DependencyNode,
): Map<DecisionId, T> {
  const providers = new Map<DecisionId, T>();
  for (const item of items) {
    const n = node(item);
    for (const p of n.provides ?? []) {
      const existing = providers.get(p);
      if (existing !== undefined) {
        throw new Error(
          `duplicate provider for decision "${p}": ` +
            `${node(existing).id}, ${n.id}`,
        );
      }
      providers.set(p, item);
    }
  }
  return providers;
}

/**
 * Index the providing module for each decision (fail-fast on duplicates).
 *
 * Exported: registries build their decision-id indexes through this, so the
 * duplicate rule lives in exactly one place (spec 087 T012).
 */
export function indexProviders(
  modules: readonly QuestionModule[],
): Readonly<Map<DecisionId, QuestionModule>> {
  return indexProvidersBy(modules, moduleNode);
}

/**
 * Find one dependency cycle among `items` (for the error message).
 * Follows requires → provider edges depth-first; returns the cycle as ids,
 * e.g. ["a", "b", "a"].
 */
function findCycle<T>(
  items: readonly T[],
  node: (item: T) => DependencyNode,
  providers: Readonly<Map<DecisionId, T>>,
): string[] {
  const byId = new Map(items.map((m) => [node(m).id, m] as const));
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    if (stack.includes(id)) return [...stack.slice(stack.indexOf(id)), id];
    if (visited.has(id)) return null;
    visited.add(id);
    stack.push(id);
    const m = byId.get(id);
    for (const req of (m === undefined ? undefined : node(m).requires) ?? []) {
      const provider = providers.get(req);
      if (provider && byId.has(node(provider).id)) {
        const cycle = visit(node(provider).id);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    return null;
  }

  for (const m of items) {
    const cycle = visit(node(m).id);
    if (cycle) return cycle;
  }
  return items.map((m) => node(m).id);
}

/**
 * Topologically sort `items` by `requires`/`provides` — THE ordering
 * implementation; `orderDecisions` (questions) and `orderSteps` (wizard steps,
 * steps/stepOrder.ts) are thin adapters over it.
 *
 * Stable: among items whose requirements are all satisfied, input order wins —
 * the input order is the documented tie-break wherever the provides/requires
 * graph is silent (pure walk order).
 *
 * Throws `unresolved decision: "<id>" required by "<item>"` when a requirement
 * has no provider, and `dependency cycle: <a> -> <b> -> <a>` naming one cycle.
 */
export function orderByDependencies<T>(
  items: readonly T[],
  node: (item: T) => DependencyNode,
): T[] {
  const providers = indexProvidersBy(items, node);

  for (const item of items) {
    const n = node(item);
    for (const req of n.requires ?? []) {
      if (!providers.has(req)) {
        throw new Error(`unresolved decision: "${req}" required by "${n.id}"`);
      }
    }
  }

  // Kahn's algorithm, input-order stable.
  const provided = new Set<DecisionId>();
  const emitted = new Set<T>();
  const ordered: T[] = [];
  let progress = true;
  while (ordered.length < items.length && progress) {
    progress = false;
    for (const item of items) {
      if (emitted.has(item)) continue;
      const n = node(item);
      const ready = (n.requires ?? []).every((r) => provided.has(r));
      if (!ready) continue;
      emitted.add(item);
      ordered.push(item);
      for (const p of n.provides ?? []) provided.add(p);
      progress = true;
    }
  }

  if (ordered.length < items.length) {
    throw new Error(
      `dependency cycle: ${findCycle(items, node, providers).join(" -> ")}`,
    );
  }
  return ordered;
}

/**
 * Topologically sort question `modules` by `requires`/`provides`. Stable: a
 * fully-annotated legacy playlist reproduces its YAML order exactly (see
 * orderParity.test.ts).
 */
export function orderDecisions(
  modules: readonly QuestionModule[],
): QuestionModule[] {
  return orderByDependencies(modules, moduleNode);
}

/**
 * Drop modules whose gate rejects the decisions resolved so far. Absent gate
 * = always include. The gate is derived from conditional `next` routing (see
 * `gatedByFromNext`) — the one source for conditional routing.
 */
export function filterGated(
  modules: readonly QuestionModule[],
  decisions: DecisionSet,
): QuestionModule[] {
  return modules.filter(
    (m) => effectiveGatedBy(m, modules)?.(decisions) ?? true,
  );
}

// ---------------------------------------------------------------------------
// Derived conditional routing (km/decisions-spike fix 2)
// ---------------------------------------------------------------------------

/**
 * Derive a module's inclusion gate from the `next` graph — the single source
 * for conditional routing.
 *
 * A module is visible iff it has no inbound edge (a root), or at least one
 * VISIBLE predecessor routes to it: either by a plain-string / default-only
 * `next` (an unconditional edge — always taken once the predecessor is
 * visible) or by a conditional rule whose effective condition holds. A rule's
 * effective condition is its own condition, if any, AND the negation of every
 * preceding condition in the same list (a default branch is taken exactly when
 * all earlier conditions failed — mirroring `SurveyRunner.resolveNext`'s
 * top-to-bottom evaluation). Visibility is therefore the OR over inbound
 * edges, so a merge point (reachable both conditionally and unconditionally)
 * is never wrongly dropped.
 *
 * `value` in a condition refers to the owning module's answer, i.e. one of the
 * decisions that module `provides` — the edge holds when the condition matches
 * any of them. Fail-open is per condition: a `ctx.*` (or otherwise unmappable)
 * positive condition counts as "may be taken", and an unmappable earlier
 * condition excludes nothing, while every mappable condition on the same edge
 * is still enforced. A conditional owner with no provided decisions has no
 * decision to read, so its edges are treated as unconditional. Visibility is
 * the set reachable from the roots through holding edges (a forward fixpoint),
 * so cycles cannot make the result depend on evaluation order.
 *
 * Returns `undefined` when no edge on any path to the target can hide it — i.e.
 * the module is always visible.
 *
 * NOTE on the signature: a single FlowQuestion cannot see the inbound rules
 * that gate it, so the derivation necessarily takes the module set as well.
 * Callers that only have one definition (and no routing context) cannot
 * derive — by design, not by omission.
 */
export function gatedByFromNext(
  target: FlowQuestion,
  modules: readonly QuestionModule[],
): ((decisions: DecisionSet) => boolean) | undefined {
  interface Edge {
    from: QuestionModule;
    positive: string | null;
    negatives: string[];
  }
  const inbound = new Map<string, Edge[]>();
  const addEdge = (to: string, edge: Edge): void => {
    const list = inbound.get(to);
    if (list === undefined) inbound.set(to, [edge]);
    else list.push(edge);
  };

  for (const m of modules) {
    const next = m.definition.next;
    if (typeof next === "string") {
      if (next !== m.definition.id) {
        addEdge(next, { from: m, positive: null, negatives: [] });
      }
    } else if (Array.isArray(next)) {
      const seen: string[] = [];
      for (const rule of next) {
        if (rule.goto !== null && rule.goto !== m.definition.id) {
          addEdge(rule.goto, {
            from: m,
            positive: rule.condition ?? null,
            negatives: [...seen],
          });
        }
        if (rule.condition !== undefined) seen.push(rule.condition);
      }
    }
  }

  const byId = new Map(modules.map((m) => [m.definition.id, m] as const));
  const root = byId.get(target.id);

  // An edge is "plain" when it never needs a decision to be evaluated: no
  // conditions, an owner with no decision to read, or only conditions the
  // DecisionSet cannot read (all fail open).
  const isPlain = (e: Edge): boolean => {
    if (e.positive === null && e.negatives.length === 0) return true;
    if (e.from.provides === undefined || e.from.provides.length === 0) return true;
    const conds = [...(e.positive !== null ? [e.positive] : []), ...e.negatives];
    return conds.every((c) => evalAgainstDecision(c, undefined) === undefined);
  };

  // Static pass: if nothing on any path to the target can hide it, no gate.
  const visitedStatic = new Set<string>();
  const canHide = (id: string): boolean => {
    if (visitedStatic.has(id)) return false;
    visitedStatic.add(id);
    for (const e of inbound.get(id) ?? []) {
      if (!isPlain(e) || canHide(e.from.definition.id)) return true;
    }
    return false;
  };
  if (root === undefined && !inbound.has(target.id)) return undefined;
  if (!canHide(target.id)) return undefined;

  // Per-condition fail-open, mirroring the runner's top-to-bottom walk: an
  // unmappable positive is "may be taken"; an unmappable earlier condition
  // cannot be shown to have failed-or-held, so it excludes nothing. Mappable
  // conditions are always enforced.
  const holdsFor = (e: Edge, value: unknown): boolean => {
    if (e.positive !== null && evalAgainstDecision(e.positive, value) === false) {
      return false;
    }
    for (const n of e.negatives) {
      if (evalAgainstDecision(n, value) === true) return false;
    }
    return true;
  };
  const edgeHolds = (e: Edge, decisions: DecisionSet): boolean => {
    if (isPlain(e)) return true;
    for (const p of e.from.provides ?? []) {
      if (holdsFor(e, decisions[p]?.value)) return true;
    }
    return false;
  };

  return (decisions: DecisionSet) => {
    // Least fixpoint: visible = reachable from the roots (modules with no
    // inbound edge) through holding edges. A single forward pass, so cycles
    // need no on-stack bookkeeping and the result cannot depend on order.
    const outbound = new Map<string, Edge[]>();
    const toOf = new Map<Edge, string>();
    for (const [to, edges] of inbound) {
      for (const e of edges) {
        toOf.set(e, to);
        const list = outbound.get(e.from.definition.id);
        if (list === undefined) outbound.set(e.from.definition.id, [e]);
        else list.push(e);
      }
    }
    const reached = new Set<string>();
    const queue: string[] = modules
      .map((m) => m.definition.id)
      .filter((id) => (inbound.get(id)?.length ?? 0) === 0);
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);
      for (const e of outbound.get(id) ?? []) {
        if (edgeHolds(e, decisions)) queue.push(toOf.get(e)!);
      }
    }
    return root === undefined ? true : reached.has(root.definition.id);
  };
}

/**
 * The gate actually used for a module: derived from conditional `next`
 * routing via `gatedByFromNext` — the only source of conditional visibility
 * (FR-005); modules carry no hand-written gate.
 */
export function effectiveGatedBy(
  m: QuestionModule,
  modules: readonly QuestionModule[],
): ((decisions: DecisionSet) => boolean) | undefined {
  return gatedByFromNext(m.definition, modules);
}

/** Stringify a decision value the way SurveyRunner stringifies answers. */
function decisionValueString(value: unknown): string {
  return typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.join(",")
      : "";
}

/**
 * Mirror of `SurveyRunner.evalCondition`, but `value` comes from a
 * DecisionSet entry instead of a live answer. Supports the same grammar
 * (`==` / `!=` against 'quoted' literals, `or` / `and`); `ctx.*` has no
 * DecisionSet equivalent and yields `undefined` (unmappable), as does any
 * unrecognized grammar.
 */
function evalAgainstDecision(
  condition: string,
  value: unknown,
): boolean | undefined {
  const orClauses = condition.split(" or ");
  if (orClauses.length > 1) {
    const results = orClauses.map((c) => evalAgainstDecision(c.trim(), value));
    if (results.some((r) => r === undefined)) return undefined;
    return results.some((r) => r === true);
  }

  const andClauses = condition.split(" and ");
  if (andClauses.length > 1) {
    const results = andClauses.map((c) =>
      evalAgainstDecision(c.trim(), value),
    );
    if (results.some((r) => r === undefined)) return undefined;
    return results.every((r) => r === true);
  }

  const eq = condition.match(/^(value|ctx\.\w+)\s*==\s*'([^']*)'$/);
  if (eq !== null) {
    if (eq[1] !== "value") return undefined;
    return decisionValueString(value) === eq[2];
  }

  const ne = condition.match(/^(value|ctx\.\w+)\s*!=\s*'([^']*)'$/);
  if (ne !== null) {
    if (ne[1] !== "value") return undefined;
    return decisionValueString(value) !== ne[2];
  }

  return undefined;
}
