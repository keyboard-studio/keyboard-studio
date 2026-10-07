// Property test: the gates derived from `definition.next` (gatedByFromNext,
// as used by runDecisionFlow) select exactly the questions the survey runner
// reaches by walking `definition.next` (spec 087 FR-005, one routing source).
//
// For every derived screen (spec 091 T018 — the iteration is over
// decisions/deriveScreens.ts screens, not flowSources flows) and a set of
// answer combinations (every gate option enumerated; sampled when the
// product is large), the set of visible modules under the derived gates
// must equal the walked set.
//
// `ctx.*` conditions have no DecisionSet equivalent: the derivation fails open,
// so the walker treats such a rule as "may be taken" and also keeps following
// the later rules of that list. Mappable conditions use the runner's own
// evalCondition.

import { describe, it, expect } from "vitest";
import { evalCondition } from "../survey/SurveyRunner.tsx";
import type { QuestionModule } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  decisionModules,
  demotedPhaseFModules,
  reserveModules,
} from "../survey/questions/registry.ts";
import { deriveScreens } from "./deriveScreens.ts";
import { effectiveGatedBy } from "./orderDecisions.ts";

const MAX_COMBOS = 300;

function nextRules(m: QuestionModule) {
  const next = m.definition.next;
  if (typeof next === "string") return [{ goto: next, condition: undefined as string | undefined }];
  if (Array.isArray(next)) {
    return next.map((r) => ({ goto: r.goto, condition: r.condition }));
  }
  return [];
}

/** Literals compared against `value` in a module's own conditions. */
function candidateValues(m: QuestionModule): (string | undefined)[] {
  const out = new Set<string>(["__other__"]);
  for (const r of nextRules(m)) {
    if (r.condition === undefined || r.condition.includes("ctx.")) continue;
    for (const lit of r.condition.matchAll(/'([^']*)'/g)) out.add(lit[1] ?? "");
  }
  return [undefined, ...out];
}

function isBranching(m: QuestionModule): boolean {
  return (
    (m.provides?.length ?? 0) > 0 &&
    nextRules(m).some((r) => r.condition !== undefined && !r.condition.includes("ctx."))
  );
}

function walk(
  modules: readonly QuestionModule[],
  answers: ReadonlyMap<string, string | undefined>,
): Set<string> {
  const byId = new Map(modules.map((m) => [m.definition.id, m] as const));
  const hasInbound = new Set<string>();
  for (const m of modules) {
    for (const r of nextRules(m)) {
      if (r.goto !== m.definition.id) hasInbound.add(r.goto);
    }
  }
  const reached = new Set<string>();
  const stack = modules
    .filter((m) => !hasInbound.has(m.definition.id))
    .map((m) => m.definition.id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reached.has(id)) continue;
    const m = byId.get(id);
    if (m === undefined) continue;
    reached.add(id);
    const value = answers.get(id);
    for (const r of nextRules(m)) {
      if (r.condition === undefined) {
        stack.push(r.goto);
        break; // default / plain: taken when nothing earlier was
      }
      if (r.condition.includes("ctx.")) {
        stack.push(r.goto); // unknowable: may be taken, later rules may too
        continue;
      }
      if (evalCondition(r.condition, value, {})) {
        stack.push(r.goto);
        break;
      }
    }
  }
  return reached;
}

function visibleByGates(
  modules: readonly QuestionModule[],
  answers: ReadonlyMap<string, string | undefined>,
): Set<string> {
  const decisions: Partial<Record<DecisionId, { id: DecisionId; value: unknown; provenance: "asked" }>> = {};
  for (const m of modules) {
    const v = answers.get(m.definition.id);
    if (v === undefined) continue;
    for (const p of m.provides ?? []) decisions[p] = { id: p, value: v, provenance: "asked" };
  }
  const set = decisions as DecisionSet;
  const out = new Set<string>();
  for (const m of modules) {
    const gate = effectiveGatedBy(m, modules);
    if (gate === undefined || gate(set)) out.add(m.definition.id);
  }
  return out;
}

function combos(branching: readonly QuestionModule[]): Map<string, string | undefined>[] {
  const options = branching.map((m) => candidateValues(m));
  const total = options.reduce((n, o) => n * o.length, 1);
  const pick = (idx: number): Map<string, string | undefined> => {
    const a = new Map<string, string | undefined>();
    let rest = idx;
    branching.forEach((m, i) => {
      const o = options[i]!;
      a.set(m.definition.id, o[rest % o.length]);
      rest = Math.floor(rest / o.length);
    });
    return a;
  };
  if (total <= MAX_COMBOS) return Array.from({ length: total }, (_, i) => pick(i));
  // Deterministic sample (LCG) plus the all-first / all-last corners.
  const out = [pick(0), pick(total - 1)];
  let s = 12345;
  while (out.length < MAX_COMBOS) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push(pick(s % total));
  }
  return out;
}

/** Modules outside every derived screen that may still carry a `next` graph. */
const extraGroups: Record<string, readonly QuestionModule[]> = {
  demotedPhaseF: demotedPhaseFModules,
  reserve: reserveModules,
};

function checkParity(modules: readonly QuestionModule[]): void {
  const branching = modules.filter(isBranching);
  const all = combos(branching);
  // A collapse to one combination must fail: every branching module
  // contributes at least two candidate values.
  const total = branching
    .map((m) => candidateValues(m).length)
    .reduce((n, c) => n * c, 1);
  expect(all.length).toBeGreaterThanOrEqual(Math.min(total, 10));
  const sizes = new Set<number>();
  for (const answers of all) {
    const walked = walk(modules, answers);
    sizes.add(walked.size);
    const visible = visibleByGates(modules, answers);
    const diff = {
      onlyWalked: [...walked].filter((x) => !visible.has(x)),
      onlyVisible: [...visible].filter((x) => !walked.has(x)),
    };
    expect(diff, JSON.stringify([...answers])).toEqual({ onlyWalked: [], onlyVisible: [] });
  }
  // Guard against a vacuous pass: a flow with gates must actually vary.
  if (branching.length > 0) expect(sizes.size).toBeGreaterThan(1);
}

/** Member modules of each derived screen, by screen id (spec 091 T018). */
const screenGroups: Record<string, readonly QuestionModule[]> = ((): Record<
  string,
  readonly QuestionModule[]
> => {
  const byModuleId = new Map(decisionModules.map((m) => [m.definition.id, m] as const));
  const out: Record<string, readonly QuestionModule[]> = {};
  for (const s of deriveScreens(decisionModules)) {
    out[`screen:${s.id}`] = s.moduleIds
      .map((id) => byModuleId.get(id))
      .filter((m): m is QuestionModule => m !== undefined);
  }
  return out;
})();

describe("derived gates agree with walking definition.next", () => {
  for (const [screenId, modules] of Object.entries(screenGroups)) {
    it(`${screenId}: visible set equals walked set for every sampled answer combination`, () => {
      expect(modules.length).toBeGreaterThan(0);
      checkParity(modules);
    });
  }

  for (const [groupId, modules] of Object.entries(extraGroups)) {
    it(`${groupId} (outside derived screens): visible set equals walked set`, () => {
      expect(modules.length).toBeGreaterThan(0);
      checkParity(modules);
    });
  }
});
