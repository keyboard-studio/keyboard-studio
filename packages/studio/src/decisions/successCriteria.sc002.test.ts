// SC-002 (spec 087): "Removing or reordering any single question never produces
// a silently wrong flow -- 100% of injected dependency violations surface as
// named errors (measured by fault injection across the registry)."
//
// Registry-wide fault-injection sweep over EVERY derived flow
// (steps/flowSources.ts) and the wizard screen layer (the derived screens
// of decisions/deriveScreens.ts, ordered via steps/stepOrder.ts). Faults
// per item/edge:
//   - removal       : drop a provider another item requires  -> unresolved decision
//   - duplicate     : a second provider of a provided decision -> duplicate provider
//   - requires-cycle: close a loop over an existing requires edge -> dependency cycle
//   - routing-cycle : add an undocumented back-edge to a real `next` edge -> routing cycle
// Plus permutation-class reorders (reverse, rotations), which must still be a
// valid topological order. The test counts injected faults and asserts 100% named.

import { describe, it, expect } from "vitest";
import type { QuestionModule, FlowGotoRule } from "../survey/types.ts";
import type { DecisionId } from "./decisionTypes.ts";
import { orderDecisions } from "./orderDecisions.ts";
import { flowSources } from "../steps/flowSources.ts";
import { orderSteps } from "../steps/stepOrder.ts";
import { decisionModules, declaredScreenGates } from "../survey/questions/registry.ts";
import { deriveScreens } from "./deriveScreens.ts";

interface Patch {
  id?: string;
  provides?: readonly DecisionId[];
  requires?: readonly DecisionId[];
  addRouteTo?: string;
  clearRoutes?: boolean;
}

interface Edge {
  to: string;
  loopBack: boolean;
}

interface Adapter<T> {
  id(t: T): string;
  provides(t: T): readonly DecisionId[];
  requires(t: T): readonly DecisionId[];
  edges(t: T): Edge[];
  patch(t: T, p: Patch): T;
  order(items: readonly T[]): T[];
}

const moduleAdapter: Adapter<QuestionModule> = {
  id: (m) => m.definition.id,
  provides: (m) => m.provides ?? [],
  requires: (m) => m.requires ?? [],
  edges: (m) => {
    const next = m.definition.next;
    if (typeof next === "string") return [{ to: next, loopBack: false }];
    if (!Array.isArray(next)) return [];
    return next
      .filter((r) => typeof r.goto === "string")
      .map((r) => ({ to: r.goto as string, loopBack: r.loopBack === true }));
  },
  patch: (m, p) => {
    let next = m.definition.next;
    if (p.clearRoutes === true) next = null;
    if (p.addRouteTo !== undefined) {
      const base: FlowGotoRule[] =
        typeof next === "string"
          ? [{ goto: next } as FlowGotoRule]
          : Array.isArray(next)
            ? [...next]
            : [];
      base.push({ goto: p.addRouteTo } as FlowGotoRule);
      next = base;
    }
    return {
      ...m,
      definition: { ...m.definition, id: p.id ?? m.definition.id, next },
      provides: p.provides ?? m.provides,
      requires: p.requires ?? m.requires,
    } as QuestionModule;
  },
  order: (items) => orderDecisions(items),
};

interface StepItem {
  id: string;
  provides: readonly DecisionId[];
  requires: readonly DecisionId[];
}

const stepAdapter: Adapter<StepItem> = {
  id: (s) => s.id,
  provides: (s) => s.provides,
  requires: (s) => s.requires,
  edges: () => [],
  patch: (s, p) => ({
    id: p.id ?? s.id,
    provides: p.provides ?? s.provides,
    requires: p.requires ?? s.requires,
  }),
  order: (items) => orderSteps(items),
};

function errorOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

interface Tally {
  injected: number;
  named: number;
  failures: string[];
}

const newTally = (): Tally => ({ injected: 0, named: 0, failures: [] });

function expectNamed(t: Tally, label: string, fn: () => unknown, pattern: RegExp): void {
  t.injected++;
  const msg = errorOf(fn);
  if (msg !== null && pattern.test(msg)) t.named++;
  else t.failures.push(`${label}: ${msg === null ? "NO ERROR (silent)" : `wrong error: ${msg}`}`);
}

function sweep<T>(setLabel: string, items: readonly T[], a: Adapter<T>) {
  const removal = newTally();
  const duplicate = newTally();
  const reqCycle = newTally();
  const routeCycle = newTally();
  const reorder = newTally();

  // Baseline must be healthy, or the faults below prove nothing.
  a.order(items);

  const providerOf = new Map<DecisionId, T>();
  for (const it of items) for (const d of a.provides(it)) providerOf.set(d, it);

  // 1. Removal: every item providing a decision another remaining item requires.
  for (const x of items) {
    const needed = a
      .provides(x)
      .some((d) => items.some((y) => y !== x && a.requires(y).includes(d)));
    if (!needed) continue;
    const rest = items.filter((y) => y !== x);
    expectNamed(removal, `${setLabel}: remove ${a.id(x)}`, () => a.order(rest), /unresolved decision/);
  }

  // 2. Duplicate provider: for every provided decision, add a second provider.
  for (const x of items) {
    for (const d of a.provides(x)) {
      const dup = a.patch(x, {
        id: `${a.id(x)}__dup`,
        provides: [d],
        requires: [],
        clearRoutes: true,
      });
      expectNamed(
        duplicate,
        `${setLabel}: duplicate provider of ${d}`,
        () => a.order([...items, dup]),
        /duplicate provider/,
      );
    }
  }

  // 3. Requires-cycle: for every requires edge Y -> X (X provides what Y needs),
  //    make X require a decision that Y provides (synthetic if Y provides none).
  for (const y of items) {
    for (const d of a.requires(y)) {
      const x = providerOf.get(d);
      if (x === undefined || x === y) continue;
      const synthetic = `__fault-${a.id(y)}` as DecisionId;
      const yProvided = a.provides(y)[0] ?? synthetic;
      const y2 = a.provides(y).length > 0 ? y : a.patch(y, { provides: [synthetic] });
      const x2 = a.patch(x, { requires: [...a.requires(x), yProvided] });
      const mutated = items.map((it) => (it === y ? y2 : it === x ? x2 : it));
      expectNamed(
        reqCycle,
        `${setLabel}: cycle ${a.id(y)} <-> ${a.id(x)}`,
        () => a.order(mutated),
        /dependency cycle/,
      );
    }
  }

  // 4. Undocumented routing cycle: for every real (non-loop-back) `next` edge
  //    u -> v, add v -> u without the loopBack marker.
  const idSet = new Set(items.map((i) => a.id(i)));
  for (const u of items) {
    for (const e of a.edges(u)) {
      if (e.loopBack || e.to === a.id(u) || !idSet.has(e.to)) continue;
      const v = items.find((i) => a.id(i) === e.to)!;
      const v2 = a.patch(v, { addRouteTo: a.id(u) });
      const mutated = items.map((it) => (it === v ? v2 : it));
      expectNamed(
        routeCycle,
        `${setLabel}: undocumented ${e.to} -> ${a.id(u)}`,
        () => a.order(mutated),
        /routing cycle/,
      );
    }
  }

  // 5. Reorders: reverse and every rotation (of forward and reversed input)
  //    must still be a valid topological order -- never a silently wrong one.
  const rev = [...items].reverse();
  const perms: T[][] = [rev];
  for (let k = 1; k < items.length; k++) {
    perms.push([...items.slice(k), ...items.slice(0, k)]);
    perms.push([...rev.slice(k), ...rev.slice(0, k)]);
  }
  for (const [pi, perm] of perms.entries()) {
    reorder.injected++;
    let problem: string | null = null;
    let out: T[] = [];
    const err = errorOf(() => {
      out = a.order(perm);
    });
    if (err !== null) problem = `threw: ${err}`;
    else {
      const pos = new Map(out.map((t, i) => [a.id(t), i] as const));
      if (out.length !== items.length || pos.size !== items.length) problem = "not a permutation";
      else {
        for (const t of out) {
          for (const r of a.requires(t)) {
            const p = providerOf.get(r);
            if (p !== undefined && pos.get(a.id(p))! >= pos.get(a.id(t))!) {
              problem = `${a.id(t)} precedes its provider ${a.id(p)} of ${r}`;
            }
          }
          for (const e of a.edges(t)) {
            if (e.loopBack || e.to === a.id(t) || !pos.has(e.to)) continue;
            if (pos.get(a.id(t))! >= pos.get(e.to)!) {
              problem = `${a.id(t)} not before its route target ${e.to}`;
            }
          }
        }
      }
    }
    if (problem === null) reorder.named++;
    else reorder.failures.push(`${setLabel}: permutation #${pi}: ${problem}`);
  }

  return { removal, duplicate, reqCycle, routeCycle, reorder };
}

type SweepResult = ReturnType<typeof sweep>;
const results: SweepResult[] = [];

describe("SC-002: registry-wide fault injection", () => {
  const flowEntries = Object.entries(flowSources).map(
    ([id, src]) => [id, src.derivedModules] as const,
  );

  it.each(flowEntries)("flow %s: every injected fault is a named error", (id, modules) => {
    const r = sweep(`flow ${id}`, modules, moduleAdapter);
    results.push(r);
    for (const t of Object.values(r)) expect(t.failures, t.failures.join("\n")).toEqual([]);
  });

  it("step layer: every injected fault is a named error", () => {
    // The step layer is the derived screens (spec 091): an item per
    // screen, provides = the screen's member decisions, requires = the
    // member modules' requires + screenRequires contracted to decisions
    // outside the screen (a screen requiring its own decision is a
    // self-edge, not an ordering fact). The terminal package screen is
    // the pre-091 table's entry carried as a literal: it settles nothing
    // and requires the help docs.
    const byModuleId = new Map(decisionModules.map((m) => [m.definition.id, m] as const));
    const steps: StepItem[] = deriveScreens(decisionModules, declaredScreenGates).map(
      (screen) => {
        const own = new Set<DecisionId>(screen.decisionIds);
        const requires = new Set<DecisionId>();
        for (const moduleId of screen.moduleIds) {
          const mod = byModuleId.get(moduleId);
          if (mod === undefined) continue;
          for (const r of [...(mod.requires ?? []), ...(mod.screenRequires ?? [])]) {
            if (!own.has(r)) requires.add(r);
          }
        }
        return { id: screen.id, provides: screen.decisionIds, requires: [...requires] };
      },
    );
    steps.push({ id: "package", provides: [], requires: ["help-docs"] });
    const r = sweep("steps", steps, stepAdapter);
    results.push(r);
    for (const t of Object.values(r)) expect(t.failures, t.failures.join("\n")).toEqual([]);
  });

  it("injects a meaningful number of faults, 100% named", () => {
    const sum = { removal: 0, duplicate: 0, reqCycle: 0, routeCycle: 0, reorder: 0 };
    let named = 0;
    let total = 0;
    for (const r of results) {
      for (const k of Object.keys(sum) as (keyof typeof sum)[]) {
        sum[k] += r[k].injected;
        total += r[k].injected;
        named += r[k].named;
      }
    }
    console.log(`SC-002 fault counts: ${JSON.stringify({ ...sum, total, named })}`);
    expect(named).toBe(total);
    // Guard against a vacuous sweep.
    expect(sum.removal).toBeGreaterThan(20);
    expect(sum.duplicate).toBeGreaterThan(20);
    expect(sum.reqCycle).toBeGreaterThan(20);
    expect(sum.routeCycle).toBeGreaterThan(5);
    expect(sum.reorder).toBeGreaterThan(50);
  });
});
