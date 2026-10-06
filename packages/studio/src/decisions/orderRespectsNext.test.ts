// Order-vs-routing consistency guard (spec 087).
//
// A flow's question ORDER is derived (orderDecisions: provides/requires edges +
// declaration-order tie-break) while ROUTING lives in each module's
// definition.next. Adjacent pairs ordered only by declaration order could drift
// from `next` silently. This asserts the derived order is a valid topological
// order of the `next` graph restricted to the flow's own modules.

import { describe, it, expect } from "vitest";
import { flowSources, loadFlowSourceDef } from "../steps/flowSources.ts";
import type { FlowQuestion, QuestionModule } from "../survey/types.ts";
import { flowModules } from "../survey/questions/registry.ts";
import { orderDecisions } from "./orderDecisions.ts";

/** Every goto target of a question's `next` (string, default, conditional rules). */
function nextTargets(q: FlowQuestion): string[] {
  const n = q.next;
  if (n === undefined || n === null) return [];
  if (typeof n === "string") return [n];
  return n.flatMap((r) => (typeof r.goto === "string" ? [r.goto] : []));
}

/**
 * Documented loop-backs (genuine back-edges): pb_additional_methods offers
 * "loop back for text sample / linguist list / picker" (see its option notes).
 * Keyed "flowId:A->B"; excluded from ordering and acyclicity checks.
 */
const DOCUMENTED_BACK_EDGES: ReadonlySet<string> = new Set([
  "phase_b_characters:pb_additional_methods->pb_text_sample",
  "phase_b_characters:pb_additional_methods->pb_linguist_confirm",
  "phase_b_characters:pb_additional_methods->pb_picker_confirm",
]);

/** Edges A->B of `next` with both ends inside the flow (minus documented back-edges). */
function flowEdges(flowId: string, questions: readonly FlowQuestion[]): Array<[string, string]> {
  const ids = new Set(questions.map((q) => q.id));
  const edges: Array<[string, string]> = [];
  for (const q of questions) {
    for (const t of new Set(nextTargets(q))) {
      if (ids.has(t) && !DOCUMENTED_BACK_EDGES.has(`${flowId}:${q.id}->${t}`)) edges.push([q.id, t]);
    }
  }
  return edges;
}

/** Return one cycle (as an id path) in the edge set, or null. */
function findCycle(edges: ReadonlyArray<[string, string]>): string[] | null {
  const adj = new Map<string, string[]>();
  for (const [a, b] of edges) adj.set(a, [...(adj.get(a) ?? []), b]);
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (u: string): string[] | null => {
    state.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (state.get(v) === 1) return [...stack.slice(stack.indexOf(v)), v];
      if (!state.has(v)) {
        const c = visit(v);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(u, 2);
    return null;
  };
  for (const u of adj.keys()) {
    if (!state.has(u)) {
      const c = visit(u);
      if (c) return c;
    }
  }
  return null;
}

describe("derived order respects definition.next", () => {
  for (const [flowId, source] of Object.entries(flowSources)) {
    describe(flowId, () => {
      const def = loadFlowSourceDef(source);
      const questions: FlowQuestion[] = [
        ...def.questions,
        ...(def.provenance_questions ?? []),
      ];
      // Main list then provenance list: provenance modules follow in derived order.
      const index = new Map(questions.map((q, i) => [q.id, i]));
      const edges = flowEdges(flowId, questions);

      it("the next graph within the flow is acyclic (no documented loops)", () => {
        const cycle = findCycle(edges);
        expect(cycle, `flow ${flowId}: cycle in next graph: ${cycle?.join(" -> ")}`).toBeNull();
      });

      it("every in-flow next edge A->B has index(A) < index(B)", () => {
        const violations = edges
          .filter(([a, b]) => (index.get(a) as number) >= (index.get(b) as number))
          .map(
            ([a, b]) =>
              `flow ${flowId}: next edge ${a} -> ${b} but derived order has ${a}@${index.get(a)} >= ${b}@${index.get(b)}`,
          );
        expect(violations, violations.join("\n")).toEqual([]);
      });

      it(`checks edges (${edges.length})`, () => {
        // Non-trivial multi-question flows must expose at least one edge.
        if (questions.length > 1) expect(edges.length).toBeGreaterThan(0);
      });
    });
  }
});

// Independent of any frozen list and of declaration order: take the DERIVED
// order of each registry flow and require every `next` edge to point forward,
// except edges the module itself marks `loopBack: true`.
describe("derived order: every next edge goes forward except loopBack", () => {
  for (const [flowId, mods] of Object.entries(flowModules)) {
    it(flowId, () => {
      const derived = orderDecisions(mods as readonly QuestionModule[]);
      const pos = new Map(derived.map((m, i) => [m.definition.id, i]));
      const violations: string[] = [];
      for (const m of derived) {
        const next = m.definition.next;
        const rules =
          typeof next === "string"
            ? [{ goto: next, loopBack: false }]
            : Array.isArray(next)
              ? next.map((r) => ({ goto: r.goto, loopBack: r.loopBack === true }))
              : [];
        for (const r of rules) {
          if (typeof r.goto !== "string" || r.loopBack) continue;
          const from = pos.get(m.definition.id)!;
          const to = pos.get(r.goto);
          if (to !== undefined && to <= from) {
            violations.push(`${m.definition.id}@${from} -> ${r.goto}@${to}`);
          }
        }
      }
      expect(violations, violations.join("\n")).toEqual([]);
    });
  }

  it("the documented back-edges are marked loopBack in the modules", () => {
    const marked: string[] = [];
    for (const mods of Object.values(flowModules)) {
      for (const m of mods as readonly QuestionModule[]) {
        if (!Array.isArray(m.definition.next)) continue;
        for (const r of m.definition.next) {
          if (r.loopBack === true) marked.push(`phase_b_characters:${m.definition.id}->${r.goto}`);
        }
      }
    }
    expect(new Set(marked)).toEqual(DOCUMENTED_BACK_EDGES);
  });
});

describe("orderDecisions routing cycles", () => {
  const mod = (id: string, next: string | null): QuestionModule => ({
    definition: { id, prompt: id, type: "text", required: false, ...(next !== null && { next }) },
    fixtures: { valid: [], invalid: [] },
    inputs: [],
    writes: [],
  });

  it("reports an undocumented routing cycle by name", () => {
    expect(() => orderDecisions([mod("a", "b"), mod("b", "a")])).toThrow(
      /routing cycle.*a -> b -> a/,
    );
  });

  it("keeps the first question first and routes the join after its feeders", () => {
    const ids = orderDecisions([mod("a", "z"), mod("z", null), mod("b", "z")]).map(
      (m) => m.definition.id,
    );
    expect(ids).toEqual(["a", "b", "z"]);
  });
});
