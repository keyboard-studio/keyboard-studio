// stepOrder.parity.test.ts — the wizard's step order is DERIVED from step
// declarations (provides / requires / gatedBy), not hand-ordered (spec 087 Q3,
// SC-003). This file freezes the order the hand-maintained manifest had at the
// moment of the migration as LITERALS, and asserts the derivation reproduces it
// exactly: order, side-trail membership, join targets, lock order, and the
// Flow Map's spine/fork/join edges. The literals are the oracle; do not
// regenerate them from the code under test.

import { describe, expect, it } from "vitest";
import { manifest, screenTrails } from "./manifest.ts";
import { STEP_ORDER, STEP_TRAILS, orderSteps } from "./stepOrder.ts";
import { stepDependencies } from "./stepDependencies.ts";
import { buildManifestStepGraph } from "../dashboard/buildStepGraph.ts";
import { decisionModules, declaredScreenGates } from "../survey/questions/registry.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";

const FROZEN_ORDER = [
  "identity",
  "layout",
  "choose_base",
  "track",
  "project_name",
  "characters",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
  "carve",
  "deadkeys",
  "rules",
  "mechanisms",
  "touch_seed_source",
  "touch",
  "help",
  "package",
] as const;

/** Side-trail step -> the step it rejoins (the old spine:false + joinTarget). */
const FROZEN_SIDE_TRAILS: Readonly<Record<string, string>> = {
  project_name: "characters",
  touch_seed_source: "touch",
};

const FROZEN_LOCKS: ReadonlyArray<readonly [string, string]> = [
  ["mechanisms", "physical"],
  ["touch", "touch"],
];

const FROZEN_EDGES: ReadonlyArray<readonly [string, string, string]> = [
  ["identity", "layout", "spine"],
  ["layout", "choose_base", "spine"],
  ["choose_base", "track", "spine"],
  ["track", "characters", "spine"],
  ["track", "project_name", "fork"],
  ["project_name", "characters", "join"],
  ["characters", "marks", "spine"],
  ["marks", "punctuation", "spine"],
  ["punctuation", "invisibles", "spine"],
  ["invisibles", "convenience", "spine"],
  ["convenience", "carve", "spine"],
  ["carve", "deadkeys", "spine"],
  ["deadkeys", "rules", "spine"],
  ["rules", "mechanisms", "spine"],
  ["mechanisms", "touch", "spine"],
  ["mechanisms", "touch_seed_source", "fork"],
  ["touch_seed_source", "touch", "join"],
  ["touch", "help", "spine"],
  ["help", "package", "spine"],
];

describe("step order parity (frozen hand-ordered manifest vs derivation)", () => {
  it("derived STEP_ORDER equals the frozen order", () => {
    expect([...STEP_ORDER]).toEqual([...FROZEN_ORDER]);
  });

  it("the manifest array is the derived order", () => {
    expect(manifest.map((s) => s.id)).toEqual([...FROZEN_ORDER]);
  });

  it("derived side trails and join targets equal the frozen ones", () => {
    const sideTrails: Record<string, string> = {};
    for (const [id, trail] of STEP_TRAILS) {
      if (!trail.spine) {
        expect(trail.joinTarget, `side trail "${id}" must have a join target`).toBeDefined();
        sideTrails[id] = trail.joinTarget as string;
      } else {
        expect(trail.joinTarget, `spine step "${id}" has no join target`).toBeUndefined();
      }
    }
    expect(sideTrails).toEqual(FROZEN_SIDE_TRAILS);
  });

  it("the derived SCREEN trails (steps/manifest.ts screenTrails) agree with the component-free table", () => {
    // Spec 091 T014: steps no longer carry gatedBy, so the trail
    // derivation runs over the derived screens, published by manifest.ts.
    expect(screenTrails).toEqual(STEP_TRAILS);
  });

  it("lock placement order is unchanged (a validation on the derived order, not an input)", () => {
    const locks = manifest
      .filter((s) => s.lock !== undefined)
      .map((s) => [s.id, s.lock] as const);
    expect(locks).toEqual([...FROZEN_LOCKS]);
  });

  it("Flow Map step graph: nodes, spine flags, join targets and edges are unchanged", () => {
    const graph = buildManifestStepGraph();
    expect(graph.nodes.map((n) => n.id)).toEqual([...FROZEN_ORDER]);
    for (const n of graph.nodes) {
      expect(n.spine, `node "${n.id}" spine flag`).toBe(!(n.id in FROZEN_SIDE_TRAILS));
      expect(n.joinTarget, `node "${n.id}" joinTarget`).toBe(FROZEN_SIDE_TRAILS[n.id]);
    }
    expect(graph.edges.map((e) => [e.from, e.to, e.kind] as const)).toEqual([...FROZEN_EDGES]);
  });

  describe("the order is determined by declarations, not by declaration order", () => {
    type Id = (typeof FROZEN_ORDER)[number];
    const deps = (id: Id) => stepDependencies(id);

    /** a must precede b: b (transitively) requires a decision a provides. */
    function mustPrecede(a: Id, b: Id): boolean {
      const seen = new Set<Id>();
      const stack: Id[] = [b];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const req of deps(cur).requires) {
          for (const candidate of FROZEN_ORDER) {
            if (seen.has(candidate) || !deps(candidate).provides.includes(req)) continue;
            if (candidate === a) return true;
            seen.add(candidate);
            stack.push(candidate);
          }
        }
      }
      return false;
    }

    // Pairs no dependency chain orders: the declaration (table) order is their
    // documented stable tie-break, exactly as the question registry's key order
    // is for pure walk-order flows. Frozen: a new entry here is a decision to
    // review, not something to regenerate.
    //   - layout is pinned only to "after identity, before carve".
    //   - marks/punctuation/invisibles/convenience each read the alphabet and
    //     feed carve, but none reads another.
    const FROZEN_TIE_BREAK_PAIRS: ReadonlyArray<readonly [Id, Id]> = [
      ["layout", "choose_base"],
      ["layout", "track"],
      ["layout", "project_name"],
      ["layout", "characters"],
      ["layout", "marks"],
      ["layout", "punctuation"],
      ["layout", "invisibles"],
      ["layout", "convenience"],
      ["marks", "punctuation"],
      ["marks", "invisibles"],
      ["marks", "convenience"],
      ["punctuation", "invisibles"],
      ["punctuation", "convenience"],
      ["invisibles", "convenience"],
    ];

    it("every pair not fixed by a dependency chain is a frozen, documented tie-break", () => {
      const unordered: Array<readonly [Id, Id]> = [];
      for (let i = 0; i < FROZEN_ORDER.length; i++) {
        for (let j = i + 1; j < FROZEN_ORDER.length; j++) {
          const a = FROZEN_ORDER[i]!;
          const b = FROZEN_ORDER[j]!;
          if (!mustPrecede(a, b) && !mustPrecede(b, a)) unordered.push([a, b]);
        }
      }
      expect(unordered).toEqual([...FROZEN_TIE_BREAK_PAIRS]);
    });

    it("every dependency-ordered pair holds for adversarial input orders", () => {
      const inputs: Id[][] = [[...FROZEN_ORDER].reverse()];
      for (let rot = 1; rot < FROZEN_ORDER.length; rot += 4) {
        inputs.push([...FROZEN_ORDER.slice(rot), ...FROZEN_ORDER.slice(0, rot)]);
      }
      for (const input of inputs) {
        const derived = orderSteps(input.map((id) => ({ id, ...deps(id) }))).map((s) => s.id);
        for (let i = 0; i < FROZEN_ORDER.length; i++) {
          for (let j = i + 1; j < FROZEN_ORDER.length; j++) {
            const a = FROZEN_ORDER[i]!;
            const b = FROZEN_ORDER[j]!;
            if (!mustPrecede(a, b)) continue;
            expect(derived.indexOf(a), `${a} before ${b} for input ${input.join(",")}`).toBeLessThan(
              derived.indexOf(b),
            );
          }
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// FR-005 parity over the DERIVED SCREENS (spec 091 T017) — REPORT-ONLY
// while T016 (the stepDependencies.ts deletion) is held for spec 090's
// completion: the frozen-literal oracle above remains the landing gate
// until then. These assertions already run as real tests: the derived
// screens must equal the main@18e63aa4 baseline (the frozen literals
// above, plus stepDependencies' provides as baseline membership), and
// ANY difference must be explained by a `requires` edge in the current
// declarations — enumerated here, never silent. When T016 lands, this
// block replaces the oracle above and the stepDependencies-based
// membership baseline is carried over as literals.
// ---------------------------------------------------------------------------

describe("FR-005 parity over derived screens (spec 091 T017, report-only)", () => {
  const screens = deriveScreens(decisionModules, declaredScreenGates);
  const derivedOrder = [...screens.map((s) => s.id), "package"];
  const screenById = new Map(screens.map((s) => [s.id, s] as const));

  // Transitive requires-reachability between modules (module id -> the
  // provider module ids it transitively requires).
  const providerOf = new Map<string, string>();
  for (const m of decisionModules) {
    for (const p of m.provides ?? []) providerOf.set(p, m.definition.id);
  }
  const byModuleId = new Map(decisionModules.map((m) => [m.definition.id, m] as const));
  const reachCache = new Map<string, Set<string>>();
  const requiresReach = (start: string): Set<string> => {
    const cached = reachCache.get(start);
    if (cached !== undefined) return cached;
    const seen = new Set<string>();
    const walk = (id: string): void => {
      for (const r of byModuleId.get(id)?.requires ?? []) {
        const provider = providerOf.get(r);
        if (provider !== undefined && !seen.has(provider)) {
          seen.add(provider);
          walk(provider);
        }
      }
    };
    walk(start);
    reachCache.set(start, seen);
    return seen;
  };
  /** Screen `a` must precede screen `b` per a requires edge: some member
   *  of `b` transitively requires a decision a member of `a` provides. */
  const edgeExplains = (earlier: string, later: string): boolean => {
    const a = screenById.get(earlier);
    const b = screenById.get(later);
    if (a === undefined || b === undefined) return false;
    const aModules = new Set(a.moduleIds);
    return b.moduleIds.some((id) =>
      [...requiresReach(id)].some((provider) => aModules.has(provider)),
    );
  };

  it("screen order equals the frozen baseline, or every inversion is edge-explained", () => {
    const unexplained: string[] = [];
    for (let i = 0; i < FROZEN_ORDER.length; i++) {
      for (let j = i + 1; j < FROZEN_ORDER.length; j++) {
        const a = FROZEN_ORDER[i]!;
        const b = FROZEN_ORDER[j]!;
        if (derivedOrder.indexOf(a) < derivedOrder.indexOf(b)) continue;
        // Baseline a-before-b is inverted in the derivation: explained
        // iff a requires edge orders a after b.
        if (!edgeExplains(b, a)) unexplained.push(`${a} before ${b} (baseline) inverted, unexplained`);
      }
    }
    expect(unexplained).toEqual([]);
  });

  it("screen membership equals the baseline membership (stepDependencies provides)", () => {
    for (const id of FROZEN_ORDER) {
      if (id === "package") continue;
      const screen = screenById.get(id);
      expect(screen, id).toBeDefined();
      const baseline = [...stepDependencies(id).provides].sort();
      expect([...screen!.decisionIds].sort(), id).toEqual(baseline);
    }
  });

  it("screen trails equal the frozen side-trail baseline", () => {
    for (const s of screens) {
      const expectedJoin = FROZEN_SIDE_TRAILS[s.id];
      expect(s.joinTarget, s.id).toBe(expectedJoin);
      expect(s.spine, s.id).toBe(expectedJoin === undefined);
    }
  });
});
