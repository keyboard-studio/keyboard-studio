// Decision-spike ordering (km/decisions-spike).
//
// Derives the question walk order from modules' `provides`/`requires`
// declarations (topological sort) instead of hand-maintained YAML lists and
// spine flags. The same sort orders wizard steps (steps/stepOrder.ts). Pure:
// no React, no stores, no I/O.

import type { FlowQuestion, QuestionModule } from "../survey/types.ts";
import { evalConditionGrammar } from "../survey/conditionGrammar.ts";
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
  /** Routing successors (`definition.next` targets): each precedes its target. */
  readonly routesTo?: readonly RouteEdge[] | undefined;
}

/** One routing edge; `loopBack` marks a documented loop-back (may point upstream). */
export interface RouteEdge {
  readonly to: string;
  readonly loopBack: boolean;
}

/**
 * Routing edges of a module (plain, default and every conditional target); a rule
 * marked `loopBack: true` is a documented loop-back.
 */
function routeEdges(m: QuestionModule): RouteEdge[] {
  const next = m.definition.next;
  if (typeof next === "string") return [{ to: next, loopBack: false }];
  if (!Array.isArray(next)) return [];
  const edges: RouteEdge[] = [];
  for (const rule of next) {
    if (typeof rule.goto !== "string") continue;
    edges.push({ to: rule.goto, loopBack: rule.loopBack === true });
  }
  return edges;
}

const moduleNode = (m: QuestionModule): DependencyNode => ({
  id: m.definition.id,
  provides: m.provides,
  requires: m.requires,
  routesTo: routeEdges(m),
});

/**
 * Routing predecessors per node id, after dropping loop-backs. Back-edges are
 * found by DFS from the roots (nodes with no inbound route) in declaration
 * order; a back-edge that is not a documented loop-back is a named error.
 */
function routingPredecessors<T>(
  items: readonly T[],
  node: (item: T) => DependencyNode,
): Map<string, Set<string>> {
  const ids = items.map((i) => node(i).id);
  const idSet = new Set(ids);
  // Spec 091 note (Delta P5, REVERTED in phase 4): an earlier revision dropped
  // a routing edge u -> v whenever u transitively required a decision v
  // provides (requires = declared placement wins over a stale `next`). That
  // made injected routing faults SILENT — successCriteria.sc002's fault
  // injection requires every undocumented routing edge to surface as a named
  // error — so the drop was reverted and 087 semantics restored verbatim.
  // Consequence, recorded as an open delta for the lead: SC-001's one-edit
  // move (T009) trips the routing-cycle error when the moved question's
  // `next` points at a question whose decision it now transitively requires;
  // the seam works when the edit also re-points `next` (or the cycle does not
  // arise). See plan.md, Delta P5.
  const out = new Map<string, RouteEdge[]>();
  const hasInbound = new Set<string>();
  for (const item of items) {
    const n = node(item);
    const edges = (n.routesTo ?? []).filter((e) => idSet.has(e.to) && e.to !== n.id);
    out.set(n.id, edges);
    for (const e of edges) if (!e.loopBack) hasInbound.add(e.to);
  }
  const preds = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (u: string): void => {
    state.set(u, 1);
    stack.push(u);
    for (const e of out.get(u) ?? []) {
      if (state.get(e.to) === 1) {
        if (e.loopBack) continue;
        const cycle = [...stack.slice(stack.indexOf(e.to)), e.to];
        throw new Error(`routing cycle (not a documented loop-back): ${cycle.join(" -> ")}`);
      }
      if (e.loopBack) continue;
      preds.get(e.to)!.add(u);
      if (!state.has(e.to)) visit(e.to);
    }
    stack.pop();
    state.set(u, 2);
  };
  for (const id of ids) if (!hasInbound.has(id) && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  return preds;
}

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

  const routePreds = routingPredecessors(items, node);

  // Kahn's algorithm with a stable tie-break: after every emit the ready item
  // with the LOWEST input index goes next, so a later item never jumps ahead
  // of an earlier one that has become ready.
  const indexOfId = new Map<string, number[]>();
  items.forEach((item, i) => {
    const id = node(item).id;
    const list = indexOfId.get(id);
    if (list === undefined) indexOfId.set(id, [i]);
    else list.push(i);
  });
  const providerIndex = new Map<DecisionId, number>();
  items.forEach((item, i) => {
    for (const p of node(item).provides ?? []) providerIndex.set(p, i);
  });
  const waitingOn = items.map(() => new Set<number>());
  const dependents = items.map(() => [] as number[]);
  items.forEach((item, i) => {
    const n = node(item);
    const deps = waitingOn[i]!;
    for (const r of n.requires ?? []) deps.add(providerIndex.get(r)!);
    for (const p of routePreds.get(n.id) ?? []) {
      for (const j of indexOfId.get(p) ?? []) deps.add(j);
    }
    for (const j of deps) dependents[j]!.push(i);
  });
  const ready: number[] = [];
  waitingOn.forEach((deps, i) => {
    if (deps.size === 0) ready.push(i);
  });
  const ordered: T[] = [];
  while (ready.length > 0) {
    let best = 0;
    for (let k = 1; k < ready.length; k++) if (ready[k]! < ready[best]!) best = k;
    const i = ready[best]!;
    ready[best] = ready[ready.length - 1]!;
    ready.pop();
    ordered.push(items[i]!);
    for (const d of dependents[i]!) {
      const deps = waitingOn[d]!;
      deps.delete(i);
      if (deps.size === 0) ready.push(d);
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
 * A node's place in the flow, derived rather than flagged.
 *
 * spine: false  — the node is conditionally gated (a side trail).
 * joinTarget    — a side trail's next UNGATED successor in the derived order:
 *                 where it rejoins the main line. Absent on spine nodes, and
 *                 absent on a gated node with no ungated successor (a dead
 *                 end, which completeness check C3 reports).
 */
export interface StepTrail {
  readonly spine: boolean;
  readonly joinTarget?: string;
}

/**
 * Derive each node's trail from an already-ordered list: a node with a
 * `gatedBy` is a side trail and rejoins at the next node without one.
 *
 * Lives here, beside the sort (spec 091): steps/stepOrder.ts applies it to
 * steps and decisions/deriveScreens.ts applies it to derived screens, and
 * neither may import the other. stepOrder.ts re-exports it for its
 * existing consumers.
 */
export function deriveStepStructure(
  ordered: readonly {
    readonly id: string;
    readonly gatedBy?: ((decisions: DecisionSet) => boolean) | undefined;
  }[],
): ReadonlyMap<string, StepTrail> {
  const trails = new Map<string, StepTrail>();
  ordered.forEach((step, i) => {
    if (step.gatedBy === undefined) {
      trails.set(step.id, { spine: true });
      return;
    }
    const join = ordered.slice(i + 1).find((s) => s.gatedBy === undefined);
    trails.set(step.id, join === undefined ? { spine: false } : { spine: false, joinTarget: join.id });
  });
  return trails;
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
  // One routing index and one visibility pass for the whole module set.
  const index = buildRoutingIndex(modules);
  const visible = visibleIds(index, decisions);
  return modules.filter(
    (m) => !canHide(index, m.definition.id) || visible.has(m.definition.id),
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
  const index = buildRoutingIndex(modules);
  if (!index.byId.has(target.id) && !index.inbound.has(target.id)) return undefined;
  if (!canHide(index, target.id)) return undefined;
  return (decisions: DecisionSet) => {
    if (!index.byId.has(target.id)) return true;
    return visibleIds(index, decisions).has(target.id);
  };
}

interface RouteGateEdge {
  from: QuestionModule;
  to: string;
  positive: string | null;
  negatives: string[];
  /** A documented loop-back: still a route the runner can take, but never what makes a module a root. */
  loopBack: boolean;
}

/** Inbound/outbound routing edges of a module set, built once. */
interface RoutingIndex {
  readonly modules: readonly QuestionModule[];
  readonly byId: ReadonlyMap<string, QuestionModule>;
  readonly inbound: ReadonlyMap<string, readonly RouteGateEdge[]>;
  readonly outbound: ReadonlyMap<string, readonly RouteGateEdge[]>;
}

/**
 * Build the routing index. Loop-back edges stay in the index (the runner can
 * walk them, so they can make a module reachable) but do not count toward
 * "has an inbound edge" when picking roots: a back-edge to a flow's first
 * module must not make it look gated.
 */
function buildRoutingIndex(modules: readonly QuestionModule[]): RoutingIndex {
  const inbound = new Map<string, RouteGateEdge[]>();
  const outbound = new Map<string, RouteGateEdge[]>();
  const addEdge = (edge: RouteGateEdge): void => {
    const inList = inbound.get(edge.to);
    if (inList === undefined) inbound.set(edge.to, [edge]);
    else inList.push(edge);
    const fromId = edge.from.definition.id;
    const outList = outbound.get(fromId);
    if (outList === undefined) outbound.set(fromId, [edge]);
    else outList.push(edge);
  };

  for (const m of modules) {
    const next = m.definition.next;
    if (typeof next === "string") {
      if (next !== m.definition.id) {
        addEdge({ from: m, to: next, positive: null, negatives: [], loopBack: false });
      }
    } else if (Array.isArray(next)) {
      const seen: string[] = [];
      for (const rule of next) {
        if (rule.goto !== null && rule.goto !== m.definition.id) {
          addEdge({
            from: m,
            to: rule.goto,
            positive: rule.condition ?? null,
            negatives: [...seen],
            loopBack: rule.loopBack === true,
          });
        }
        if (rule.condition !== undefined) seen.push(rule.condition);
      }
    }
  }
  return {
    modules,
    byId: new Map(modules.map((m) => [m.definition.id, m] as const)),
    inbound,
    outbound,
  };
}

// An edge is "plain" when it never needs a decision to be evaluated: no
// conditions, an owner with no decision to read, or only conditions the
// DecisionSet cannot read (all fail open).
function isPlain(e: RouteGateEdge): boolean {
  if (e.positive === null && e.negatives.length === 0) return true;
  if (e.from.provides === undefined || e.from.provides.length === 0) return true;
  const conds = [...(e.positive !== null ? [e.positive] : []), ...e.negatives];
  return conds.every((c) => evalAgainstDecision(c, undefined) === undefined);
}

/** Static pass: can any edge on any path to `id` hide it? False = always visible. */
function canHide(index: RoutingIndex, id: string): boolean {
  const visited = new Set<string>();
  const walk = (cur: string): boolean => {
    if (visited.has(cur)) return false;
    visited.add(cur);
    for (const e of index.inbound.get(cur) ?? []) {
      if (!isPlain(e) || walk(e.from.definition.id)) return true;
    }
    return false;
  };
  return walk(id);
}

// Per-condition fail-open, mirroring the runner's top-to-bottom walk: an
// unmappable positive is "may be taken"; an unmappable earlier condition
// cannot be shown to have failed-or-held, so it excludes nothing. Mappable
// conditions are always enforced.
function holdsFor(e: RouteGateEdge, value: unknown): boolean {
  if (e.positive !== null && evalAgainstDecision(e.positive, value) === false) {
    return false;
  }
  for (const n of e.negatives) {
    if (evalAgainstDecision(n, value) === true) return false;
  }
  return true;
}

function edgeHolds(e: RouteGateEdge, decisions: DecisionSet): boolean {
  if (isPlain(e)) return true;
  for (const p of e.from.provides ?? []) {
    if (holdsFor(e, decisions[p]?.value)) return true;
  }
  return false;
}

/**
 * Least fixpoint: visible = reachable from the roots (modules with no inbound
 * edge) through holding edges. A single forward pass, so cycles need no
 * on-stack bookkeeping and the result cannot depend on order.
 */
function visibleIds(index: RoutingIndex, decisions: DecisionSet): Set<string> {
  const reached = new Set<string>();
  const queue: string[] = index.modules
    .map((m) => m.definition.id)
    .filter((id) => !(index.inbound.get(id) ?? []).some((e) => !e.loopBack));
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const e of index.outbound.get(id) ?? []) {
      if (edgeHolds(e, decisions)) queue.push(e.to);
    }
  }
  return reached;
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
 * Same grammar as `SurveyRunner.evalCondition` (shared evaluator), but `value` comes from a
 * DecisionSet entry instead of a live answer. Supports the same grammar
 * (`==` / `!=` against 'quoted' literals, `or` / `and`); `ctx.*` has no
 * DecisionSet equivalent and yields `undefined` (unmappable), as does any
 * unrecognized grammar.
 */
function evalAgainstDecision(
  condition: string,
  value: unknown,
): boolean | undefined {
  return evalConditionGrammar(
    condition,
    (lhs) => (lhs === "value" ? decisionValueString(value) : undefined),
    true,
  );
}
