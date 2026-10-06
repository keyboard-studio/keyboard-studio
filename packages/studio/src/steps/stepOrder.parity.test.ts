// stepOrder.parity.test.ts — the wizard's step order is DERIVED from step
// declarations (provides / requires / gatedBy), not hand-ordered (spec 087 Q3,
// SC-003). This file freezes the order the hand-maintained manifest had at the
// moment of the migration as LITERALS, and asserts the derivation reproduces it
// exactly: order, side-trail membership, join targets, lock order, and the
// Flow Map's spine/fork/join edges. The literals are the oracle; do not
// regenerate them from the code under test.

import { describe, expect, it } from "vitest";
import { manifest } from "./manifest.ts";
import { STEP_ORDER, STEP_TRAILS, deriveStepStructure, orderSteps } from "./stepOrder.ts";
import { stepDependencies } from "./stepDependencies.ts";
import { buildManifestStepGraph } from "../dashboard/buildStepGraph.ts";

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

  it("deriveStepStructure over the manifest agrees with the component-free table", () => {
    expect(deriveStepStructure(manifest)).toEqual(STEP_TRAILS);
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
