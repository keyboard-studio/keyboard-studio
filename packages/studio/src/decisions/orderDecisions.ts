// Decision-spike ordering (km/decisions-spike).
//
// Derives the question walk order from modules' `provides`/`requires`
// declarations (topological sort) instead of hand-maintained YAML lists and
// spine flags. Pure: no React, no stores, no I/O.

import type { QuestionModule } from "../survey/types.ts";
import type { FlowQuestion } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";

/**
 * Index the providing module for each decision. Two modules providing the
 * same decision is a fail-fast error — first-wins-silent would drop one
 * provider without a trace at 50+ ids (km/decisions-spike fix 4).
 */
function indexProviders(
  modules: readonly QuestionModule[],
): Readonly<Map<DecisionId, QuestionModule>> {
  const providers = new Map<DecisionId, QuestionModule>();
  for (const m of modules) {
    if (m.provides === undefined) continue;
    const existing = providers.get(m.provides);
    if (existing !== undefined) {
      throw new Error(
        `duplicate provider for decision "${m.provides}": ` +
          `${existing.definition.id}, ${m.definition.id}`,
      );
    }
    providers.set(m.provides, m);
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
 * Drop modules whose gate rejects the decisions resolved so far. Absent gate
 * = always include. The gate is the hand-written `gatedBy` when present,
 * otherwise derived from conditional `next` routing (see `gatedByFromNext`) —
 * one source for conditional routing, never both by hand.
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
 * Derive a module's inclusion gate from the conditional `next` rules that
 * route TO it — the single source for conditional routing.
 *
 * For every rule (in any module's `definition.next`) with `goto === target.id`,
 * the module is reached when that rule's effective condition holds: the
 * rule's own condition, if any, AND the negation of every preceding
 * condition in the same list (a default branch is taken exactly when all
 * earlier conditions failed — mirroring `SurveyRunner.resolveNext`'s
 * top-to-bottom evaluation). The target's gate is the OR over all such
 * effective conditions.
 *
 * `value` in a condition refers to the owning module's answer, i.e. the
 * decision that module `provides`. `ctx.*` conditions have no DecisionSet
 * equivalent and make derivation impossible — as does a conditional owner
 * with no `provides`. In both cases this returns `undefined` (fail open:
 * the module stays ungated, exactly as before).
 *
 * Returns `undefined` when nothing routes to the target conditionally —
 * including plain-string `next` hops and terminal modules.
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
  interface Clause {
    provides: DecisionId;
    positive: string | null;
    negatives: string[];
  }
  const clauses: Clause[] = [];

  for (const m of modules) {
    const next = m.definition.next;
    if (!Array.isArray(next)) continue;
    const seen: string[] = [];
    for (const rule of next) {
      if (rule.goto === target.id) {
        // `value` in the condition is this module's answer — unmappable
        // without a provided decision id.
        if (m.provides === undefined) return undefined;
        clauses.push({
          provides: m.provides,
          positive: rule.condition ?? null,
          negatives: [...seen],
        });
      }
      if (rule.condition !== undefined) seen.push(rule.condition);
    }
  }

  if (clauses.length === 0) return undefined;
  if (clauses.every((c) => c.positive === null && c.negatives.length === 0)) {
    return undefined;
  }

  return (decisions: DecisionSet) => {
    for (const c of clauses) {
      const value = decisions[c.provides]?.value;
      let ok: boolean;
      if (c.positive !== null) {
        const r = evalAgainstDecision(c.positive, value);
        // Unmappable at runtime (validated at derivation, so defensive):
        // fail open — never silently drop a question the author should answer.
        if (r === undefined) return true;
        ok = r;
      } else {
        ok = true;
      }
      if (ok) {
        for (const n of c.negatives) {
          const r = evalAgainstDecision(n, value);
          if (r === undefined) return true;
          if (r) {
            ok = false;
            break;
          }
        }
      }
      if (ok) return true;
    }
    return false;
  };
}

/**
 * The gate actually used for a module: an explicit hand-written `gatedBy`
 * wins as an override; otherwise the gate is derived from conditional
 * `next` routing via `gatedByFromNext`.
 */
export function effectiveGatedBy(
  m: QuestionModule,
  modules: readonly QuestionModule[],
): ((decisions: DecisionSet) => boolean) | undefined {
  return m.gatedBy ?? gatedByFromNext(m.definition, modules);
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
